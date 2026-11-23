"""Offline scanner discovery contracts at the real TCGdex HTTP boundary."""

import asyncio
from copy import deepcopy

import httpx2 as httpx
import pytest

from app.cards.provider import CardProvider, CardsUnavailable


def card_row(identifier, number, name):
    return {"id": identifier, "localId": number, "name": name, "image": None}


def scanner_set(identifier="sv03.5", cards=None, *, official=165, serie="sv"):
    cards = (
        cards
        if cards is not None
        else [
            card_row(f"{identifier}-025", "025", "Pikachu"),
            card_row(f"{identifier}-026", "026", "Raichu"),
        ]
    )
    return {
        "id": identifier,
        "name": f"English {identifier}",
        "releaseDate": "2023-09-22",
        "serie": {"id": serie, "name": serie.upper()},
        "cardCount": {"total": len(cards), "official": min(official, len(cards))},
        "cards": cards,
    }


def scanner_provider(
    rows=None, *, discoveries=None, translations=None, alter=None, wrap=None, clock=None
):
    rows = rows if rows is not None else [scanner_set()]
    requests = []
    discoveries = discoveries or {}
    translations = translations or {}

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
                            {
                                k: v
                                for k, v in row.items()
                                if k not in ("cards", "cardCount")
                            }
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
                        k: v
                        for k, v in row.items()
                        if k not in ("cards", "serie", "releaseDate")
                    }
                    for row in rows
                ],
            )
        if path == "/v2/es/series":
            return httpx.Response(200, json=[])
        if path in ("/v2/en/cards", "/v2/es/cards"):
            language = path.split("/")[2]
            return httpx.Response(200, json=discoveries.get(language, []))
        for row in rows:
            if path == f"/v2/en/sets/{row['id']}":
                return httpx.Response(200, json=deepcopy(row))
            if path == f"/v2/es/sets/{row['id']}":
                translated = deepcopy(row)
                for card in translated["cards"]:
                    card["name"] = translations.get(card["id"], card["name"])
                return httpx.Response(200, json=translated)
        raise AssertionError(f"Unexpected catalog request: {request.method} {path}")

    return CardProvider(
        transport=httpx.MockTransport(wrap(handle) if wrap else handle),
        **({"clock": clock} if clock else {}),
    ), requests


def test_scanner_catalog_excludes_pocket_and_unknown_series():
    provider, requests = scanner_provider(
        [
            scanner_set(),
            scanner_set("A1", serie="tcgp"),
            scanner_set("future", serie="unknown"),
        ]
    )
    result = asyncio.run(provider.scanner_catalog("en"))
    assert [row.id for row in result] == ["sv03.5"]
    assert not any("/cards" in request.url.path for request in requests)


def test_name_discovery_uses_bounded_literal_like_filter_and_physical_metadata():
    brief = card_row("sv03.5-025", "025", "Pikachu")
    provider, requests = scanner_provider(
        [scanner_set(), scanner_set("A1", serie="tcgp")],
        discoveries={"en": [brief, card_row("A1-025", "025", "Pikachu")]},
    )
    result = asyncio.run(provider.scanner_name_discovery("Pikachu", "en"))
    assert result.set_ids == ["sv03.5"]
    assert result.limited is True
    query = next(r.url.params for r in requests if r.url.path == "/v2/en/cards")
    assert query["name"] == "like:Pikachu"
    assert query["sort:field"] == "id"
    assert query["sort:order"] == "ASC"
    assert query["pagination:page"] == "1"
    assert int(query["pagination:itemsPerPage"]) <= 64
    assert not any("/cards/" in r.url.path for r in requests)


@pytest.mark.parametrize("name", ["eq:Pikachu|Furret", "*", "not:foo", "a\nPikachu"])
def test_query_operators_are_rejected_before_catalog_requests(name):
    provider, requests = scanner_provider()
    with pytest.raises(ValueError):
        asyncio.run(provider.scanner_name_discovery(name, "en"))
    assert requests == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        [card_row("sv03.5-025", "025", "Pikachu")] * 2,
        [card_row("../bad", "025", "Pikachu")],
        [card_row("sv03.5-025", "025", "")],
        [card_row(f"sv03.5-{n}", str(n), "Pikachu") for n in range(65)],
    ],
)
def test_malformed_or_oversized_name_pages_fail_safely(body):
    provider, _ = scanner_provider(discoveries={"en": body})
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.scanner_name_discovery("Pikachu", "en"))


def test_discovery_cache_is_bounded_by_language_and_expires():
    clock = [0.0]
    provider, requests = scanner_provider(
        discoveries={"en": [card_row("sv03.5-025", "025", "Pikachu")]},
        clock=lambda: clock[0],
    )

    async def run():
        first = await provider.scanner_name_discovery("Pikachu", "en")
        first.set_ids.clear()
        assert (await provider.scanner_name_discovery("Pikachu", "en")).set_ids == [
            "sv03.5"
        ]
        await provider.scanner_name_discovery("Pikachu", "es")
        clock[0] = 301
        await provider.scanner_name_discovery("Pikachu", "en")

    asyncio.run(run())
    assert sum(r.url.path == "/v2/en/cards" for r in requests) == 2
    # Missing Spanish name performs one bounded token fallback.
    assert sum(r.url.path == "/v2/es/cards" for r in requests) == 2


def test_timeout_is_sanitized_but_cancellation_propagates():
    def alter(request):
        if request.url.path == "/v2/en/cards":
            raise httpx.ReadTimeout("private upstream context", request=request)

    provider, _ = scanner_provider(alter=alter)
    with pytest.raises(CardsUnavailable):
        asyncio.run(provider.scanner_name_discovery("Pikachu", "en"))

    entered = asyncio.Event()

    def wrap(handle):
        async def delayed(request):
            if request.url.path == "/v2/en/cards":
                entered.set()
                await asyncio.Event().wait()
            return handle(request)

        return delayed

    provider, _ = scanner_provider(wrap=wrap)

    async def cancel():
        task = asyncio.create_task(provider.scanner_name_discovery("Pikachu", "en"))
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert await provider.scanner_catalog("en")

    asyncio.run(cancel())
