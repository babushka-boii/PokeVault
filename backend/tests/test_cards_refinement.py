"""Regression checks for verified artwork, set metadata and global date ordering."""

import warnings
from collections import Counter

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from test_cards import card_payload
from test_health import settings

from app.cards.provider import CardProvider
from app.main import create_app


def set_row(set_id, date, *, logo=True):
    return {
        "id": set_id,
        "name": f"English {set_id}",
        "releaseDate": date,
        "logo": f"https://assets.tcgdex.net/en/sv/{set_id}/logo" if logo else None,
        "symbol": f"https://assets.tcgdex.net/univ/sv/{set_id}/symbol",
        "serie": {"id": "sv", "name": "Scarlet & Violet"},
    }


def refined_client(rows, sets, *, alter=None, clock=None):
    requests = []

    def handle(request):
        requests.append(request)
        path = request.url.path
        if path == "/v2/graphql":
            assert request.method == "POST"
            assert "releaseDate" in request.content.decode()
            assert "cards {" not in request.content.decode()
            return httpx.Response(200, json={"data": {"sets": sets}})
        if path == "/v2/es/sets":
            return httpx.Response(
                200,
                json=[
                    {
                        "id": row["id"],
                        "name": f"Español {row['id']}",
                        "symbol": row.get("symbol"),
                    }
                    for row in sets
                ],
            )
        if path == "/v2/es/series":
            return httpx.Response(
                200, json=[{"id": "sv", "name": "Escarlata y Púrpura"}]
            )
        if path == "/v2/en/cards":
            assert request.url.params["dexId"] == "eq:25"
            page = int(request.url.params["pagination:page"])
            size = int(request.url.params["pagination:itemsPerPage"])
            return httpx.Response(200, json=rows[(page - 1) * size : page * size])
        language = path.split("/")[2]
        card_id = path.rsplit("/", 1)[1]
        data = card_payload(card_id, language)
        if alter is not None:
            outcome = alter(data, language)
            if isinstance(outcome, httpx.Response):
                return outcome
        return httpx.Response(200, json=data)

    app = create_app(settings())
    app.state.card_provider = CardProvider(
        transport=httpx.MockTransport(handle),
        **({"clock": clock} if clock is not None else {}),
    )
    return TestClient(app), requests


def brief(card_id):
    return {"id": card_id, "localId": card_id.rsplit("-", 1)[1], "name": "Pikachu"}


def test_spanish_text_with_null_art_uses_verified_english_printing_art():
    def alter(data, language):
        if language == "es":
            data["image"] = None
        data["weaknesses"] = [{"type": "Water", "value": "×2"}]
        data["resistances"] = [{"type": "Metal", "value": -20}]
        data["retreat"] = 0
        data["regulationMark"] = "G"

    client, _ = refined_client([], [set_row("sm9", "2019-02-01")], alter=alter)
    with client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 200
    data = response.json()
    assert data["language"] == "es"
    assert data["image_language"] == "en"
    assert data["image_sources"] == [
        {"base_url": "https://assets.tcgdex.net/en/sm/sm9/33", "language": "en"}
    ]
    assert data["thumbnail_url"].endswith("/en/sm/sm9/33/low.webp")
    assert data["weaknesses"] == [{"type": "Water", "value": "×2"}]
    assert data["resistances"] == [{"type": "Metal", "value": "-20"}]
    assert data["retreat"] == 0
    assert data["regulation_mark"] == "G"
    assert data["set"]["name"] == "Español sm9"
    assert data["set"]["name_language"] == "es"
    assert data["set"]["logo_sources"] == [
        {"url": "https://assets.tcgdex.net/en/sv/sm9/logo.png", "language": "en"}
    ]
    assert data["set"]["serie"]["name"] == "Escarlata y Púrpura"


def test_english_text_preserves_verified_spanish_image_alternative():
    client, _ = refined_client([], [set_row("sm9", "2019-02-01")])
    with client:
        data = client.get("/api/v1/cards/sm9-33?language=en").json()
    assert data["image_language"] == "en"
    assert [source["language"] for source in data["image_sources"]] == ["en", "es"]
    assert data["available_languages"] == ["en", "es"]


def test_full_species_set_options_and_global_chronology_precede_pagination():
    rows = [
        brief(card_id)
        for card_id in ["old-2", "new-2", "same-1", "old-1", "none-1", "new-1"]
    ]
    sets = [
        set_row("old", "1999-01-09"),
        set_row("new", "2025-09-26"),
        set_row("same", "2025-09-26"),
        set_row("none", None, logo=False),
    ]
    client, requests = refined_client(rows, sets)
    with client:
        pages = [
            client.get(
                f"/api/v1/pokemon/25/cards?language=es&sort=newest&page_size=2&page={page}"
            )
            for page in [1, 2, 3]
        ]
        assert all(page.status_code == 200 for page in pages)
        ids = [card["id"] for page in pages for card in page.json()["results"]]
        assert ids == ["new-1", "new-2", "same-1", "old-1", "old-2", "none-1"]
        assert [page.json()["has_more"] for page in pages] == [True, True, False]
        for page in pages:
            assert page.json()["sets_complete"] is True
            assert {row["id"] for row in page.json()["sets"]} == {
                "old",
                "new",
                "same",
                "none",
            }
        oldest = client.get(
            "/api/v1/pokemon/25/cards?language=en&sort=oldest&page_size=2"
        )
        assert [card["id"] for card in oldest.json()["results"]] == ["old-1", "old-2"]
        filtered = client.get(
            "/api/v1/pokemon/25/cards?language=en&sort=newest&set_id=old&page_size=2"
        )
        assert [card["id"] for card in filtered.json()["results"]] == ["old-1", "old-2"]
        assert len(filtered.json()["sets"]) == 4
    assert Counter(request.url.path for request in requests)["/v2/en/cards"] == 2
    assert Counter(request.url.path for request in requests)["/v2/graphql"] == 1
    assert Counter(request.url.path for request in requests)["/v2/es/sets"] == 1
    detail_paths = [
        request.url.path for request in requests if "/cards/" in request.url.path
    ]
    assert (
        len(detail_paths) == 12
    )  # each of six requested cards in both verified languages


def test_newest_loads_only_current_page_card_details():
    rows = [brief(f"sm9-{number}") for number in range(1, 31)]
    client, requests = refined_client(rows, [set_row("sm9", "2019-02-01")])
    with client:
        response = client.get(
            "/api/v1/pokemon/25/cards?language=en&sort=newest&page_size=2"
        )
    assert response.status_code == 200
    details = [request for request in requests if "/cards/" in request.url.path]
    assert len(details) == 4
    assert len(response.json()["results"]) == 2
    assert response.json()["has_more"] is True


def test_overflowing_species_index_returns_error_instead_of_partial_order_or_options():
    rows = [brief(f"sm9-{number}") for number in range(1, 2002)]
    client, requests = refined_client(rows, [set_row("sm9", "2019-02-01")])
    with client:
        response = client.get("/api/v1/pokemon/25/cards?sort=newest")
    assert response.status_code == 503
    assert response.json() == {"detail": "Card catalog is unavailable"}
    assert not any("/cards/" in request.url.path for request in requests)


@pytest.mark.parametrize("field", ["logo", "symbol"])
def test_set_metadata_assets_reject_non_official_origin_and_ports(field):
    row = set_row("sm9", "2019-02-01")
    row[field] = "https://assets.tcgdex.net:8443/private-secret"
    client, _ = refined_client([], [row])
    with client:
        response = client.get("/api/v1/cards/sm9-33?language=en")
    assert response.status_code == 503
    assert "private-secret" not in response.text


def test_missing_or_unparseable_release_date_remains_unknown():
    sets = [set_row("new", "2025-09-26"), set_row("bad", "not-a-date")]
    client, _ = refined_client([brief("bad-1"), brief("new-1")], sets)
    with client:
        response = client.get("/api/v1/pokemon/25/cards?language=en&sort=newest")
    assert response.status_code == 200
    data = response.json()
    assert [card["id"] for card in data["results"]] == ["new-1", "bad-1"]
    assert (
        next(row for row in data["sets"] if row["id"] == "bad")["release_date"] is None
    )


def test_null_art_in_both_languages_is_explicit_without_substituted_printing():
    def alter(data, language):
        data.pop("image")

    client, _ = refined_client([], [set_row("sm9", "2019-02-01")], alter=alter)
    with client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "sm9-33"
    assert data["image_sources"] == []
    assert data["image_language"] is None
    assert data["image_url"] is None
    assert data["thumbnail_url"] is None


def test_no_alternative_art_is_returned_for_conflicting_species_identity():
    def alter(data, language):
        if language == "es":
            data["dexId"] = [26]
            data["image"] = None

    client, _ = refined_client([], [set_row("sm9", "2019-02-01")], alter=alter)
    with client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 503
    assert "image_sources" not in response.json()


def test_filtering_out_all_cards_preserves_complete_species_expansion_choices():
    client, _ = refined_client([brief("sm9-33")], [set_row("sm9", "2019-02-01")])
    with client:
        response = client.get("/api/v1/pokemon/25/cards?set_id=unknown&sort=oldest")
    assert response.status_code == 200
    data = response.json()
    assert data["results"] == []
    assert data["has_more"] is False
    assert [row["id"] for row in data["sets"]] == ["sm9"]
    assert data["sets_complete"] is True


def test_species_index_terminal_probe_rejects_silently_truncated_brief_page():
    requests = []

    def handle(request):
        requests.append(request)
        # Simulate an undocumented provider limit that ignored itemsPerPage=1000.
        assert request.url.path == "/v2/en/cards"
        page = int(request.url.params["pagination:page"])
        return httpx.Response(200, json=[brief("sm9-1" if page == 1 else "sm9-2")])

    app = create_app(settings())
    app.state.card_provider = CardProvider(transport=httpx.MockTransport(handle))
    with TestClient(app) as client:
        response = client.get("/api/v1/pokemon/25/cards?sort=newest")
    assert response.status_code == 503
    assert len(requests) == 2


def test_art_language_follows_explicit_asset_language_even_when_text_is_spanish():
    def alter(data, language):
        if language == "es":
            data["image"] = "https://assets.tcgdex.net/en/sm/sm9/33"

    client, _ = refined_client([], [set_row("sm9", "2019-02-01")], alter=alter)
    with client:
        data = client.get("/api/v1/cards/sm9-33?language=es").json()
    assert data["language"] == "es"
    assert data["image_language"] == "en"
    assert data["image_sources"] == [
        {"base_url": "https://assets.tcgdex.net/en/sm/sm9/33", "language": "en"}
    ]


def test_provider_quality_variant_is_normalized_back_to_one_official_image_base():
    def alter(data, language):
        data["image"] += "/high.png"

    client, _ = refined_client([], [set_row("sm9", "2019-02-01")], alter=alter)
    with client:
        data = client.get("/api/v1/cards/sm9-33?language=es").json()
    assert data["thumbnail_url"] == "https://assets.tcgdex.net/es/sm/sm9/33/low.webp"
    assert (
        data["image_sources"][0]["base_url"] == "https://assets.tcgdex.net/es/sm/sm9/33"
    )


def test_new_species_set_evicts_stale_metadata_so_retry_can_recover():
    rows = [brief("sm9-33")]
    sets = [set_row("sm9", "2019-02-01")]
    client, requests = refined_client(rows, sets)
    with client:
        assert client.get("/api/v1/cards/sm9-33?language=en").status_code == 200
        rows.append(brief("new-1"))
        sets.append(set_row("new", "2025-09-26"))
        assert (
            client.get("/api/v1/pokemon/25/cards?sort=newest&language=en").status_code
            == 503
        )
        response = client.get("/api/v1/pokemon/25/cards?sort=newest&language=en")
    assert response.status_code == 200
    assert {row["id"] for row in response.json()["sets"]} == {"sm9", "new"}
    assert Counter(request.url.path for request in requests)["/v2/graphql"] == 2


def test_localized_symbol_urls_serialize_without_type_warnings():
    client, _ = refined_client([], [set_row("sm9", "2019-02-01")])
    with warnings.catch_warnings(record=True) as observed, client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 200
    assert response.json()["set"]["symbol_url"].endswith("/sm9/symbol.png")
    assert not observed
