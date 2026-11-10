"""Offline contracts for canonical set membership and physical catalog scope."""

import asyncio
from collections import Counter
from copy import deepcopy

import httpx2 as httpx
import pytest

from app.cards.provider import CardProvider, CardsUnavailable


def set_payload(set_id="sv03.5", *, total=3, official=2, serie="sv"):
    return {
        "id": set_id,
        "name": f"English {set_id}",
        "releaseDate": "2023-09-22",
        "serie": {"id": serie, "name": serie.upper()},
        "cardCount": {"total": total, "official": official},
        "logo": f"https://assets.tcgdex.net/en/{serie}/{set_id}/logo",
        "symbol": None,
        "cards": [
            {
                "id": f"{set_id}-{number:03}",
                "localId": f"{number:03}",
                "name": f"Card {number}",
                "image": f"https://assets.tcgdex.net/en/{serie}/{set_id}/{number:03}",
            }
            for number in range(1, (total or 3) + 1)
        ],
    }


def provider_for(rows=None, *, alter=None, clock=None, wrap=None):
    rows = rows or [set_payload()]
    requests = []

    def handle(request):
        requests.append(request)
        if alter is not None:
            response = alter(request)
            if response is not None:
                return response
        path = request.url.path
        if path == "/v2/graphql":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "sets": [
                            {key: value for key, value in row.items() if key != "cards"}
                            for row in rows
                        ]
                    }
                },
            )
        if path in ("/v2/en/sets", "/v2/es/sets"):
            return httpx.Response(
                200,
                json=[
                    {
                        key: (
                            f"Español {row['id']}"
                            if key == "name" and "/es/" in path
                            else value
                        )
                        for key, value in row.items()
                        if key not in ("cards", "serie", "releaseDate")
                    }
                    for row in rows
                ],
            )
        if path == "/v2/es/series":
            return httpx.Response(200, json=[])
        language = path.split("/")[2]
        set_id = path.rsplit("/", 1)[-1]
        row = next((deepcopy(row) for row in rows if row["id"] == set_id), None)
        if row is None:
            return httpx.Response(404)
        if language == "es":
            row["name"] = f"Español {set_id}"
            for card in row["cards"]:
                card["name"] = f"Español {card['localId']}"
        return httpx.Response(200, json=row)

    provider = CardProvider(
        transport=httpx.MockTransport(wrap(handle) if wrap else handle),
        **({"clock": clock} if clock is not None else {}),
    )
    return provider, requests


def test_complete_embedded_membership_uses_total_count_and_punctuated_identity():
    provider, requests = provider_for()
    result = asyncio.run(provider.get_set_checklist("sv03.5", "en"))
    assert result.metadata.id == "sv03.5"
    assert result.metadata.official_count == 2
    assert result.metadata.provider_total == 3
    assert result.metadata.checklist_status == "verified"
    assert result.metadata.checklist_size == 3
    assert len(result.metadata.checklist_revision) == 64
    assert [row.id for row in result.cards] == [
        "sv03.5-001",
        "sv03.5-002",
        "sv03.5-003",
    ]
    assert result.cards[0].local_id == "001"
    assert result.cards[0].thumbnail_url.endswith("/001/low.webp")
    assert not any("/cards/" in request.url.path for request in requests)


@pytest.mark.parametrize("spanish", ["404", "empty", "partial"])
def test_translation_never_changes_canonical_ids_or_revision(spanish):
    def alter(request):
        if request.url.path == "/v2/es/sets/sv03.5":
            if spanish == "404":
                return httpx.Response(404)
            row = set_payload()
            row["cards"] = row["cards"][:1] if spanish == "partial" else []
            if row["cards"]:
                row["cards"][0]["name"] = "Traducida"
                row["cards"][0]["image"] = None
            return httpx.Response(200, json=row)

    provider, _ = provider_for(alter=alter)

    async def compare():
        english = await provider.get_set_checklist("sv03.5", "en")
        spanish_result = await provider.get_set_checklist("sv03.5", "es")
        assert [row.id for row in spanish_result.cards] == [
            row.id for row in english.cards
        ]
        assert (
            spanish_result.metadata.checklist_revision
            == english.metadata.checklist_revision
        )
        assert spanish_result.metadata.checklist_status == "verified"
        assert spanish_result.cards[-1].language == "en"
        if spanish == "partial":
            assert spanish_result.cards[0].name == "Traducida"
            assert spanish_result.cards[0].language == "es"
            assert spanish_result.cards[0].image_language == "en"

    asyncio.run(compare())


@pytest.mark.parametrize(
    "issue", ["count", "missing_total", "empty", "official_exceeds_total"]
)
def test_incomplete_english_data_never_advertises_verified_revision(issue):
    row = set_payload()
    if issue == "count":
        row["cards"].pop()
    elif issue == "missing_total":
        del row["cardCount"]["total"]
    elif issue == "empty":
        row["cards"] = []
    else:
        row["cardCount"]["official"] = 5
    provider, _ = provider_for([row])
    result = asyncio.run(provider.get_set_checklist("sv03.5", "en"))
    assert result.metadata.checklist_status == "incomplete"
    assert result.metadata.checklist_revision is None


def test_empty_provider_zero_is_explicit_and_has_no_percentage_baseline():
    row = set_payload(total=0, official=0)
    row["cards"] = []
    provider, _ = provider_for([row])
    result = asyncio.run(provider.get_set_checklist("sv03.5", "en"))
    assert result.metadata.checklist_status == "empty"
    assert result.metadata.checklist_size == 0
    assert result.metadata.checklist_revision is None


@pytest.mark.parametrize(
    "issue",
    ["duplicate", "identity", "asset", "oversize", "missing_cards", "negative_total"],
)
def test_malformed_membership_is_unavailable_and_retry_can_recover(issue):
    bad = set_payload()
    if issue == "duplicate":
        bad["cards"][1] = bad["cards"][0]
    elif issue == "identity":
        bad["id"] = "wrong"
    elif issue == "asset":
        bad["cards"][0]["image"] = "https://untrusted.example/image"
    elif issue == "oversize":
        bad = set_payload(total=2001)
    elif issue == "missing_cards":
        del bad["cards"]
    else:
        bad["cardCount"]["total"] = -1
    failing = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5" and failing[0]:
            return httpx.Response(200, json=bad)

    provider, _ = provider_for(alter=alter)

    async def retry():
        with pytest.raises(CardsUnavailable):
            await provider.get_set_checklist("sv03.5", "en")
        failing[0] = False
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_status == "verified"

    asyncio.run(retry())


@pytest.mark.parametrize("issue", ["unknown_id", "wrong_local", "wrong_serie", "asset"])
def test_conflicting_translation_is_not_accepted_as_canonical_data(issue):
    def alter(request):
        if request.url.path == "/v2/es/sets/sv03.5":
            row = set_payload()
            if issue == "unknown_id":
                row["cards"][0]["id"] = "other-999"
            elif issue == "wrong_local":
                row["cards"][0]["localId"] = "999"
            elif issue == "wrong_serie":
                row["serie"]["id"] = "tcgp"
            else:
                row["cards"][0]["image"] = "http://assets.tcgdex.net/image"
            return httpx.Response(200, json=row)

    provider, _ = provider_for(alter=alter)
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.get_set_checklist("sv03.5", "es"))


def test_embedded_membership_does_not_infer_a_set_from_card_id_prefix():
    row = set_payload()
    row["cards"][0]["id"] = "official-with-special-prefix-001"
    provider, _ = provider_for([row])
    result = asyncio.run(provider.get_set_checklist("sv03.5", "en"))
    assert result.metadata.checklist_status == "verified"
    assert result.cards[0].id == "official-with-special-prefix-001"


def test_physical_scope_and_global_search_sort_precede_pagination():
    rows = [
        set_payload(key, serie=serie)
        for key, serie in [
            ("old", "base"),
            ("new-b", "sv"),
            ("new-a", "sv"),
            ("nodate", "ex"),
            ("A1", "tcgp"),
            ("unknown", "future"),
        ]
    ]
    rows[0]["releaseDate"] = "1999-01-09"
    rows[3]["releaseDate"] = "bad"
    provider, requests = provider_for(rows)

    async def browse():
        page = await provider.list_sets("en", page_size=1)
        assert page.total == 4
        assert [row.id for row in page.results] == ["new-a"]
        assert page.excluded_pocket == 1
        assert page.excluded_unknown_series == 1
        assert {row.id for row in page.series} == {"base", "sv", "ex"}
        second = await provider.list_sets("en", page=2, page_size=1)
        assert [row.id for row in second.results] == ["new-b"]
        oldest = await provider.list_sets("en", page_size=4, sort="oldest")
        assert [row.id for row in oldest.results] == ["old", "new-a", "new-b", "nodate"]
        found = await provider.list_sets("en", q="OLD", page_size=1)
        assert found.total == 1
        assert found.results[0].id == "old"
        filtered = await provider.list_sets("en", series_id="sv", page_size=12)
        assert filtered.total == 2

    asyncio.run(browse())
    paths = Counter(request.url.path for request in requests)
    assert paths["/v2/graphql"] == paths["/v2/en/sets"] == 1
    assert not any("/sets/" in request.url.path for request in requests)


@pytest.mark.parametrize("set_id", ["missing", "A1", "unknown"])
def test_missing_pocket_and_unknown_series_sets_are_not_physical(set_id):
    from app.cards.provider import SetNotFound

    provider, _ = provider_for(
        [set_payload("A1", serie="tcgp"), set_payload("unknown", serie="future")]
    )
    with pytest.raises(SetNotFound):
        asyncio.run(provider.get_set_checklist(set_id, "en"))


@pytest.mark.parametrize("outcome", [404, 500, "timeout", "malformed"])
def test_known_set_remote_failure_is_unavailable(outcome):
    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5":
            if outcome == "timeout":
                raise httpx.ReadTimeout("private provider failure", request=request)
            if outcome == "malformed":
                return httpx.Response(200, text="{")
            return httpx.Response(outcome)

    provider, _ = provider_for(alter=alter)
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.get_set_checklist("sv03.5", "en"))


def test_checklist_refreshes_coalesce_and_cached_views_are_not_mutable():
    provider, requests = provider_for()

    async def concurrent():
        results = await asyncio.gather(
            *[provider.get_set_checklist("sv03.5", "es") for _ in range(10)]
        )
        assert all(result.metadata.checklist_size == 3 for result in results)
        results[0].cards.clear()
        assert len((await provider.get_set_checklist("sv03.5", "es")).cards) == 3

    asyncio.run(concurrent())
    paths = Counter(request.url.path for request in requests)
    assert paths["/v2/en/sets/sv03.5"] == paths["/v2/es/sets/sv03.5"] == 1


def test_incomplete_membership_is_not_cached_as_a_success():
    partial = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5" and partial[0]:
            row = set_payload()
            row["cards"].pop()
            return httpx.Response(200, json=row)

    provider, _ = provider_for(alter=alter)

    async def retry():
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_status == "incomplete"
        partial[0] = False
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_status == "verified"

    asyncio.run(retry())


def test_large_checklist_is_complete_without_card_detail_enrichment():
    provider, requests = provider_for([set_payload(total=2000, official=189)])
    result = asyncio.run(provider.get_set_checklist("sv03.5", "en"))
    assert result.metadata.checklist_status == "verified"
    assert result.metadata.checklist_size == 2000
    assert result.cards[-1].id == "sv03.5-2000"
    assert len(requests) == 3


def test_checklist_cache_expires_and_reloads_after_five_minutes():
    now = [0]
    provider, requests = provider_for(clock=lambda: now[0])

    async def advance():
        first = await provider.get_set_checklist("sv03.5", "en")
        now[0] = 299
        assert await provider.get_set_checklist("sv03.5", "en") == first
        now[0] = 301
        assert await provider.get_set_checklist("sv03.5", "en") == first

    asyncio.run(advance())
    paths = Counter(request.url.path for request in requests)
    assert paths["/v2/en/sets/sv03.5"] == 2
    assert paths["/v2/graphql"] == paths["/v2/en/sets"] == 2


def test_large_number_of_sets_evicts_old_membership_and_refetches_safely():
    provider, requests = provider_for(
        [set_payload(f"set{index}") for index in range(65)]
    )

    async def traverse():
        for index in range(65):
            await provider.get_set_checklist(f"set{index}", "en")
        result = await provider.get_set_checklist("set0", "en")
        assert result.metadata.checklist_status == "verified"
        assert result.metadata.checklist_size == 3

    asyncio.run(traverse())
    paths = Counter(request.url.path for request in requests)
    assert paths["/v2/en/sets/set0"] == 2
    assert paths["/v2/graphql"] == 1


def test_different_sets_fetch_concurrently_with_shared_five_request_budget():
    active = maximum = 0

    def wrap(handle):
        async def delayed(request):
            nonlocal active, maximum
            active += 1
            maximum = max(active, maximum)
            try:
                await asyncio.sleep(0.002)
                return handle(request)
            finally:
                active -= 1

        return delayed

    provider, _ = provider_for(
        [set_payload(f"set{index}") for index in range(14)], wrap=wrap
    )

    async def batch():
        results = await asyncio.gather(
            *[provider.get_set_checklist(f"set{index}", "en") for index in range(14)]
        )
        assert all(result.metadata.checklist_status == "verified" for result in results)

    asyncio.run(batch())
    assert maximum == 5


@pytest.mark.parametrize("resource", ["counts", "metadata"])
@pytest.mark.parametrize(
    "issue", ["duplicate", "empty", "overflow", "asset", "malformed"]
)
def test_invalid_set_catalog_cannot_be_returned_as_complete(resource, issue):
    def alter(request):
        path = "/v2/en/sets" if resource == "counts" else "/v2/graphql"
        if request.url.path != path:
            return None
        if issue == "malformed":
            return httpx.Response(200, json={"wrong": []})
        row = set_payload()
        rows = [row]
        if issue == "duplicate":
            rows *= 2
        elif issue == "empty":
            rows = []
        elif issue == "overflow":
            rows = [set_payload(f"set{index}") for index in range(513)]
        else:
            row["logo"] = "https://untrusted.example/logo"
        return httpx.Response(
            200, json=rows if resource == "counts" else {"data": {"sets": rows}}
        )

    provider, _ = provider_for(alter=alter)
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.list_sets("en"))


def test_new_set_missing_from_one_metadata_source_requires_refresh_then_recovers():
    stale = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets" and stale[0]:
            return httpx.Response(200, json=[set_payload(), set_payload("new")])

    provider, _ = provider_for(alter=alter)

    async def retry():
        with pytest.raises(CardsUnavailable):
            await provider.list_sets("en")
        stale[0] = False
        result = await provider.list_sets("en")
        assert result.total == 1
        assert result.results[0].id == "sv03.5"

    asyncio.run(retry())


def test_absent_series_is_explicitly_excluded_from_physical_catalog():
    row = set_payload()
    del row["serie"]
    provider, _ = provider_for([row])
    result = asyncio.run(provider.list_sets("en"))
    assert result.total == 0
    assert result.results == []
    assert result.excluded_unknown_series == 1


def test_spanish_name_fallback_keeps_verified_english_identity():
    def alter(request):
        if request.url.path == "/v2/es/sets":
            return httpx.Response(200, json=[])
        if request.url.path == "/v2/es/sets/sv03.5":
            return httpx.Response(404)

    provider, _ = provider_for(alter=alter)

    async def browse():
        page = await provider.list_sets("es", q="English")
        assert page.total == 1
        assert page.results[0].name_language == "en"
        result = await provider.get_set_checklist("sv03.5", "es")
        assert result.metadata.name_language == "en"
        assert result.cards[0].language == "en"
        assert result.metadata.checklist_size == 3

    asyncio.run(browse())


def test_locale_view_cannot_outlive_canonical_membership_or_keep_stale_ids():
    now = [0]
    changed = [False]

    def alter(request):
        if "/sets/sv03.5" in request.url.path and changed[0]:
            return httpx.Response(200, json=set_payload(total=4))

    provider, _ = provider_for(alter=alter, clock=lambda: now[0])

    async def refresh():
        first = await provider.get_set_checklist("sv03.5", "en")
        now[0] = 250
        spanish = await provider.get_set_checklist("sv03.5", "es")
        assert spanish.metadata.checklist_revision == first.metadata.checklist_revision
        now[0] = 310
        changed[0] = True
        refreshed = await provider.get_set_checklist("sv03.5", "en")
        spanish = await provider.get_set_checklist("sv03.5", "es")
        assert refreshed.metadata.checklist_size == 4
        assert spanish.metadata.checklist_size == 4
        assert (
            spanish.metadata.checklist_revision == refreshed.metadata.checklist_revision
        )

    asyncio.run(refresh())


@pytest.mark.parametrize("localized_count", [0, 1])
def test_concurrent_partial_translation_uses_one_fallback_view(localized_count):
    def alter(request):
        if request.url.path == "/v2/es/sets/sv03.5":
            row = set_payload()
            row["cards"] = row["cards"][:localized_count]
            return httpx.Response(200, json=row)

    provider, requests = provider_for(alter=alter)

    async def batch():
        results = await asyncio.gather(
            *[provider.get_set_checklist("sv03.5", "es") for _ in range(3)]
        )
        assert all(result.metadata.checklist_size == 3 for result in results)
        assert all(result.metadata.checklist_status == "verified" for result in results)

    asyncio.run(batch())
    paths = Counter(request.url.path for request in requests)
    assert paths["/v2/es/sets/sv03.5"] == 1


def test_physical_classification_refresh_applies_to_all_locale_lists_and_details():
    from app.cards.provider import SetNotFound

    now = [0]
    changed = [False]

    def alter(request):
        if request.url.path == "/v2/graphql" and changed[0]:
            return httpx.Response(
                200, json={"data": {"sets": [set_payload(serie="tcgp")]}}
            )

    provider, _ = provider_for(alter=alter, clock=lambda: now[0])

    async def refresh():
        assert (await provider.list_sets("en")).total == 1
        now[0] = 250
        assert (await provider.list_sets("es")).total == 1
        assert (
            await provider.get_set_checklist("sv03.5", "es")
        ).metadata.checklist_status == "verified"
        now[0] = 310
        changed[0] = True
        assert (await provider.list_sets("en")).total == 0
        assert (await provider.list_sets("es")).total == 0
        with pytest.raises(SetNotFound):
            await provider.get_set_checklist("sv03.5", "es")

    asyncio.run(refresh())


@pytest.mark.parametrize("callers", [3, 30])
def test_simultaneous_incomplete_english_refresh_is_shared_but_next_request_retries(
    callers,
):
    partial = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5" and partial[0]:
            row = set_payload()
            row["cards"].pop()
            return httpx.Response(200, json=row)

    provider, requests = provider_for(alter=alter)

    async def batch():
        results = await asyncio.gather(
            *[provider.get_set_checklist("sv03.5", "en") for _ in range(callers)]
        )
        assert all(
            result.metadata.checklist_status == "incomplete" for result in results
        )
        assert (
            Counter(request.url.path for request in requests)["/v2/en/sets/sv03.5"] == 1
        )
        partial[0] = False
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_status == "verified"
        assert (
            Counter(request.url.path for request in requests)["/v2/en/sets/sv03.5"] == 2
        )

    asyncio.run(batch())


@pytest.mark.parametrize("cancel_owner", [True, False])
def test_canceled_refresh_or_waiter_releases_its_group_and_allows_retry(cancel_owner):
    entered = asyncio.Event()
    release = asyncio.Event()

    def wrap(handle):
        async def delayed(request):
            if request.url.path == "/v2/en/sets/sv03.5":
                entered.set()
                await release.wait()
            return handle(request)

        return delayed

    provider, _ = provider_for(wrap=wrap)

    async def cancel():
        owner = asyncio.create_task(provider.get_set_checklist("sv03.5", "en"))
        await asyncio.wait_for(entered.wait(), 1)
        waiter = asyncio.create_task(provider.get_set_checklist("sv03.5", "en"))
        await asyncio.sleep(0)
        canceled, survivor = (owner, waiter) if cancel_owner else (waiter, owner)
        canceled.cancel()
        with pytest.raises(asyncio.CancelledError):
            await canceled
        release.set()
        result = await asyncio.wait_for(survivor, 1)
        assert result.metadata.checklist_status == "verified"
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_size == 3

    asyncio.run(cancel())


@pytest.mark.parametrize("outcome", [500, "malformed", "timeout"])
@pytest.mark.parametrize("languages", [("en", "en", "en"), ("en", "es", "en")])
def test_concurrent_english_failure_is_shared_and_next_request_retries(
    outcome, languages
):
    failing = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5" and failing[0]:
            if outcome == "timeout":
                raise httpx.ReadTimeout("provider timed out", request=request)
            if outcome == "malformed":
                return httpx.Response(200, text="{")
            return httpx.Response(outcome)

    def wrap(handle):
        async def delayed(request):
            if request.url.path == "/v2/en/sets/sv03.5":
                await asyncio.sleep(0.003)
            return handle(request)

        return delayed

    provider, requests = provider_for(alter=alter, wrap=wrap)

    async def retry():
        results = await asyncio.gather(
            *[provider.get_set_checklist("sv03.5", language) for language in languages],
            return_exceptions=True,
        )
        assert all(isinstance(result, CardsUnavailable) for result in results)
        assert (
            Counter(request.url.path for request in requests)["/v2/en/sets/sv03.5"] == 1
        )
        failing[0] = False
        result = await provider.get_set_checklist("sv03.5", "en")
        assert result.metadata.checklist_status == "verified"
        assert (
            Counter(request.url.path for request in requests)["/v2/en/sets/sv03.5"] == 2
        )

    asyncio.run(retry())


def test_cross_locale_incomplete_refresh_shares_canonical_membership_and_overlays():
    partial = [True]

    def alter(request):
        if request.url.path == "/v2/en/sets/sv03.5" and partial[0]:
            row = set_payload()
            row["cards"].pop()
            return httpx.Response(200, json=row)
        if request.url.path == "/v2/es/sets/sv03.5":
            row = set_payload()
            row["cards"] = row["cards"][:1]
            row["cards"][0]["name"] = "Traducida"
            return httpx.Response(200, json=row)

    provider, requests = provider_for(alter=alter)

    async def retry():
        results = await asyncio.gather(
            *[
                provider.get_set_checklist("sv03.5", language)
                for language in ("en", "es", "es", "en")
            ]
        )
        assert all(
            result.metadata.checklist_status == "incomplete" for result in results
        )
        assert all(result.metadata.checklist_size == 2 for result in results)
        assert results[1].cards[0].name == "Traducida"
        assert results[1].cards[0].language == "es"
        assert results[1].cards[1].language == "en"
        paths = Counter(request.url.path for request in requests)
        assert paths["/v2/en/sets/sv03.5"] == paths["/v2/es/sets/sv03.5"] == 1
        partial[0] = False
        assert (
            await provider.get_set_checklist("sv03.5", "en")
        ).metadata.checklist_size == 3
        assert (
            Counter(request.url.path for request in requests)["/v2/en/sets/sv03.5"] == 2
        )

    asyncio.run(retry())
