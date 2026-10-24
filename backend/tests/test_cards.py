import asyncio
import json
from collections import Counter

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from test_health import settings

from app.main import create_app


def card_payload(card_id="sm9-33", language="en", dex_ids=None):
    set_id, local_id = card_id.rsplit("-", 1)
    return {
        "id": card_id,
        "localId": local_id,
        "name": "Pikachu & Zekrom GX" if language == "en" else "Pikachu y Zekrom GX",
        "category": "Pokemon" if language == "en" else "Pokémon",
        "dexId": [25, 644] if dex_ids is None else dex_ids,
        "image": f"https://assets.tcgdex.net/{language}/sm/{set_id}/{local_id}",
        "set": {
            "id": set_id,
            "name": "Team Up" if language == "en" else "Unión de Aliados",
        },
        "rarity": "Ultra Rare" if language == "en" else "Ultra Rara",
        "illustrator": "Mitsuhiro Arita",
        "hp": 240,
        "types": ["Lightning" if language == "en" else "Rayo"],
        "stage": "Basic" if language == "en" else "Básico",
        "attacks": [{"name": "Full Blitz", "cost": ["Lightning"], "damage": 150}],
        "abilities": [
            {"name": "Example", "type": "Ability", "effect": "Provider text"}
        ],
        "variants_detailed": [
            {
                "variantId": "observed-id",
                "type": "normal",
                "subtype": "unlimited",
                "stamp": ["1st-edition"],
            }
        ],
    }


def client_for(handler, **options):
    from app.cards.provider import CardProvider

    def with_metadata(request):
        if request.url.path == "/v2/graphql":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "sets": [
                            {
                                "id": set_id,
                                "name": "Team Up",
                                "releaseDate": "2019-02-01",
                            }
                            for set_id in ["sm9", "sv03.5", "2012bw"]
                        ]
                    }
                },
            )
        if request.url.path == "/v2/es/sets":
            return httpx.Response(
                200,
                json=[
                    {"id": set_id, "name": "Unión de Aliados"}
                    for set_id in ["sm9", "sv03.5", "2012bw"]
                ],
            )
        if request.url.path == "/v2/es/series":
            return httpx.Response(200, json=[])
        return handler(request)

    app = create_app(settings())
    app.state.card_provider = CardProvider(
        transport=httpx.MockTransport(with_metadata), **options
    )
    return TestClient(app)


def test_card_route_exists():
    # Input validation is local and does not contact a provider.
    app = create_app(settings())
    assert TestClient(app).get("/api/v1/cards/sm9-33?language=fr").status_code == 422


def test_card_details_normalize_real_fields_and_preserve_multi_species():
    paths = []

    def handle(request):
        paths.append(request.url.path)
        return httpx.Response(
            200, json=card_payload(language=request.url.path.split("/")[2])
        )

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 200
    assert response.json() == {
        "id": "sm9-33",
        "name": "Pikachu y Zekrom GX",
        "dex_ids": [25, 644],
        "image_url": "https://assets.tcgdex.net/es/sm/sm9/33/high.webp",
        "thumbnail_url": "https://assets.tcgdex.net/es/sm/sm9/33/low.webp",
        "image_sources": [
            {"base_url": "https://assets.tcgdex.net/es/sm/sm9/33", "language": "es"},
            {"base_url": "https://assets.tcgdex.net/en/sm/sm9/33", "language": "en"},
        ],
        "image_language": "es",
        "set": {
            "id": "sm9",
            "name": "Unión de Aliados",
            "logo_url": None,
            "symbol_url": None,
            "logo_sources": [],
            "name_language": "es",
            "serie": None,
            "release_date": "2019-02-01",
        },
        "local_id": "33",
        "rarity": "Ultra Rara",
        "category": "Pokemon",
        "language": "es",
        "available_languages": ["en", "es"],
        "illustrator": "Mitsuhiro Arita",
        "hp": 240,
        "types": ["Rayo"],
        "stage": "Básico",
        "evolve_from": None,
        "attacks": [
            {"name": "Full Blitz", "cost": ["Lightning"], "damage": 150, "effect": None}
        ],
        "abilities": [
            {"name": "Example", "type": "Ability", "effect": "Provider text"}
        ],
        "variants": [
            {
                "id": "observed-id",
                "type": "normal",
                "subtype": "unlimited",
                "stamps": ["1st-edition"],
            }
        ],
        "weaknesses": [],
        "resistances": [],
        "retreat": None,
        "regulation_mark": None,
    }
    assert paths == ["/v2/en/cards/sm9-33", "/v2/es/cards/sm9-33"]


@pytest.mark.parametrize("missing_language", ["es", "en", "both"])
def test_detail_falls_back_only_on_404_in_either_direction(missing_language):
    def handle(request):
        language = request.url.path.split("/")[2]
        if missing_language in [language, "both"]:
            return httpx.Response(404, json={})
        return httpx.Response(200, json=card_payload(language=language))

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    if missing_language == "both":
        assert response.status_code == 404
        assert response.json() == {"detail": "Card not found"}
    else:
        assert response.status_code == 200
        expected_language = "en" if missing_language == "es" else "es"
        assert response.json()["language"] == expected_language
        assert response.json()["available_languages"] == [expected_language]


def test_optional_fields_and_omitted_spanish_attack_names_are_explicit():
    def handle(request):
        language = request.url.path.split("/")[2]
        data = card_payload(language=language)
        for key in [
            "image",
            "rarity",
            "illustrator",
            "hp",
            "types",
            "stage",
            "abilities",
            "variants_detailed",
        ]:
            del data[key]
        data["attacks"] = [{"damage": 10}]
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
    assert response.status_code == 200
    result = response.json()
    for field in [
        "image_url",
        "thumbnail_url",
        "rarity",
        "illustrator",
        "hp",
        "stage",
        "evolve_from",
    ]:
        assert result[field] is None
    assert result["types"] == []
    assert result["abilities"] == []
    assert result["variants"] == []
    assert result["attacks"] == [
        {"name": None, "cost": [], "damage": 10, "effect": None}
    ]


def test_spanish_missing_species_link_uses_verified_english_identity():
    def handle(request):
        language = request.url.path.split("/")[2]
        data = card_payload(language=language)
        if language == "es":
            del data["dexId"]
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        result = client.get("/api/v1/cards/sm9-33?language=es")
    assert result.status_code == 200
    assert result.json()["dex_ids"] == [25, 644]
    assert result.json()["language"] == "es"


@pytest.mark.parametrize(
    "failure",
    [
        "timeout",
        "http",
        "json",
        "schema",
        "id",
        "set",
        "local",
        "category",
        "dex",
        "image",
        "image_port",
    ],
)
def test_translation_failures_are_sanitized_and_not_treated_as_missing(failure):
    failing = True

    def handle(request):
        language = request.url.path.split("/")[2]
        data = card_payload(language=language)
        if failing and language == "es":
            if failure == "timeout":
                raise httpx.ReadTimeout("private-secret", request=request)
            if failure == "http":
                return httpx.Response(503, text="private-secret")
            if failure == "json":
                return httpx.Response(200, text="private-secret")
            if failure == "schema":
                del data["name"]
            if failure == "id":
                data["id"] = "sm9-34"
            if failure == "set":
                data["set"]["id"] = "other"
            if failure == "local":
                data["localId"] = "other"
            if failure == "category":
                data["category"] = "Trainer"
            if failure == "dex":
                data["dexId"] = [1]
            if failure == "image":
                data["image"] = "https://private-secret/card"
            if failure == "image_port":
                data["image"] = "https://assets.tcgdex.net:8443/card"
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=es")
        assert response.status_code == 503
        assert response.json() == {"detail": "Card catalog is unavailable"}
        assert "private-secret" not in response.text
        failing = False
        assert client.get("/api/v1/cards/sm9-33?language=es").status_code == 200


def paginated_handler(request, paths, *, bad_kind=None):
    paths.append(request)
    if request.url.path.endswith("/cards"):
        assert request.url.path == "/v2/en/cards"
        assert request.url.params["dexId"] == "eq:25"
        page = int(request.url.params["pagination:page"])
        size = int(request.url.params["pagination:itemsPerPage"])
        rows = [
            {"id": f"sm9-{number}", "name": "Pikachu", "localId": str(number)}
            for number in [1, 2, 3, 4, 5]
        ]
        return httpx.Response(200, json=rows[(page - 1) * size : page * size])
    language = request.url.path.split("/")[2]
    card_id = request.url.path.rsplit("/", 1)[1]
    data = card_payload(card_id, language)
    if bad_kind == "Trainer":
        data["category"] = "Trainer"
        data.pop("dexId")
    if bad_kind == "missing":
        data.pop("dexId")
    if bad_kind == "substring":
        data["dexId"] = [252]
    if bad_kind == "set":
        data["set"]["id"] = "wrong"
    return httpx.Response(200, json=data)


def test_species_pages_have_no_skips_and_fetch_only_current_page_details():
    paths = []

    def handle(request):
        return paginated_handler(request, paths)

    with client_for(handle) as client:
        first = client.get("/api/v1/pokemon/25/cards?language=en&page_size=2&sort=id")
        assert first.status_code == 200
        assert [card["id"] for card in first.json()["results"]] == ["sm9-1", "sm9-2"]
        assert first.json()["has_more"] is True
        assert first.json()["coverage"] == "english_catalog"
        assert "total" not in first.json()
        assert Counter(request.url.path for request in paths) == {
            "/v2/en/cards": 2,
            "/v2/en/cards/sm9-1": 1,
            "/v2/en/cards/sm9-2": 1,
            "/v2/es/cards/sm9-1": 1,
            "/v2/es/cards/sm9-2": 1,
        }
        second = client.get(
            "/api/v1/pokemon/25/cards?language=en&page_size=2&page=2&sort=id"
        )
        third = client.get(
            "/api/v1/pokemon/25/cards?language=en&page_size=2&page=3&sort=id"
        )
        assert [card["id"] for card in second.json()["results"]] == ["sm9-3", "sm9-4"]
        assert second.json()["has_more"] is True
        assert [card["id"] for card in third.json()["results"]] == ["sm9-5"]
        assert third.json()["has_more"] is False
        before = len(paths)
        assert (
            client.get(
                "/api/v1/pokemon/25/cards?language=en&page_size=2&page=2&sort=id"
            ).json()
            == second.json()
        )
        assert len(paths) == before


@pytest.mark.parametrize("number", [25, 644])
def test_species_membership_accepts_multi_pokemon_card_for_either_species(number):
    def handle(request):
        if request.url.path.endswith("/cards"):
            assert request.url.params["dexId"] == f"eq:{number}"
            return httpx.Response(
                200,
                json=(
                    [{"id": "sm9-33", "localId": "33", "name": "Pikachu & Zekrom GX"}]
                    if request.url.params["pagination:page"] == "1"
                    else []
                ),
            )
        return httpx.Response(200, json=card_payload())

    with client_for(handle) as client:
        response = client.get(f"/api/v1/pokemon/{number}/cards?language=en")
    assert response.status_code == 200
    assert response.json()["results"][0]["dex_ids"] == [25, 644]


@pytest.mark.parametrize("bad_kind", ["Trainer", "missing", "substring", "set"])
def test_species_list_rejects_unverified_upstream_membership(bad_kind):
    def handle(request):
        return paginated_handler(request, [], bad_kind=bad_kind)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25/cards?language=en")
    assert response.status_code == 503


def test_species_membership_failure_can_retry_with_corrected_provider_data():
    failing = True

    def handle(request):
        return paginated_handler(request, [], bad_kind="substring" if failing else None)

    with client_for(handle) as client:
        assert client.get("/api/v1/pokemon/25/cards?language=en").status_code == 503
        failing = False
        assert client.get("/api/v1/pokemon/25/cards?language=en").status_code == 200


def test_discovered_english_card_404_is_retryable_after_upstream_recovers():
    failing = True
    paths = []

    def handle(request):
        if failing and request.url.path == "/v2/en/cards/sm9-1":
            paths.append(request)
            return httpx.Response(404, json={})
        return paginated_handler(request, paths)

    with client_for(handle) as client:
        assert client.get("/api/v1/pokemon/25/cards?language=en").status_code == 503
        failing = False
        assert client.get("/api/v1/pokemon/25/cards?language=en").status_code == 200
    assert Counter(request.url.path for request in paths)["/v2/en/cards/sm9-1"] == 2


@pytest.mark.parametrize("category", ["Trainer", "Energy"])
def test_non_pokemon_details_never_expose_species_associations(category):
    def handle(request):
        data = card_payload()
        data["category"] = category
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=en")
    assert response.status_code == 200
    assert response.json()["category"] == category
    assert response.json()["dex_ids"] == []


def test_card_associations_stay_within_the_supported_national_dex():
    def handle(request):
        return httpx.Response(200, json=card_payload(dex_ids=[1026]))

    with client_for(handle) as client:
        assert client.get("/api/v1/cards/sm9-33?language=en").status_code == 503


def test_nonfinite_attack_damage_returns_sanitized_provider_error():
    def handle(request):
        data = card_payload()
        body = json.dumps(data).replace('"damage": 150', '"damage": 1e999')
        return httpx.Response(200, text=body)

    with client_for(handle) as client:
        response = client.get("/api/v1/cards/sm9-33?language=en")
    assert response.status_code == 503
    assert response.json() == {"detail": "Card catalog is unavailable"}


def test_set_filter_and_name_sort_keep_species_discovery_complete():
    requests = []

    def handle(request):
        requests.append(request)
        assert request.url.path == "/v2/en/cards"
        assert "set.id" not in request.url.params
        assert request.url.params["sort:field"] == "id"
        assert request.url.params["sort:order"] == "ASC"
        return httpx.Response(200, json=[])

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/1/cards?set_id=sv03.5&sort=name")
    assert response.status_code == 200
    assert response.json()["results"] == []
    assert response.json()["has_more"] is False
    assert len(requests) == 2


def test_request_validation_and_safe_card_identifiers():
    def handle(request):
        card_id = request.url.path.rsplit("/", 1)[1]
        return httpx.Response(200, json=card_payload(card_id))

    with client_for(handle) as client:
        for suffix in [
            "0/cards",
            "1026/cards",
            "25/cards?page=0",
            "25/cards?page=501",
            "25/cards?page_size=25",
            "25/cards?sort=releaseDate",
            "25/cards?language=fr",
            "25/cards?set_id=a..b",
        ]:
            assert client.get("/api/v1/pokemon/" + suffix).status_code == 422
        for card_id in ["a..b", "a%20b", "a%3Fb"]:
            assert client.get("/api/v1/cards/" + card_id).status_code == 422
        for card_id in ["sv03.5-001", "2012bw-10"]:
            assert (
                client.get("/api/v1/cards/" + card_id + "?language=en").status_code
                == 200
            )


def test_cache_shares_card_resources_expires_and_limits_concurrency():
    from app.cards.provider import CardProvider

    clock = [0.0]
    paths = Counter()
    active = 0
    peak = 0

    async def handle(request):
        nonlocal active, peak
        paths[request.url.path] += 1
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        if request.url.path == "/v2/graphql":
            return httpx.Response(
                200,
                json={"data": {"sets": [{"id": "sm9", "name": "Team Up"}]}},
            )
        if request.url.path == "/v2/es/sets":
            return httpx.Response(200, json=[{"id": "sm9", "name": "Unión de Aliados"}])
        if request.url.path == "/v2/es/series":
            return httpx.Response(200, json=[])
        if request.url.path.endswith("/cards"):
            page = int(request.url.params["pagination:page"])
            size = int(request.url.params["pagination:itemsPerPage"])
            rows = [
                {"id": f"sm9-{number}", "localId": str(number), "name": "Pikachu"}
                for number in range(1, 13)
            ]
            return httpx.Response(
                200,
                json=rows[(page - 1) * size : page * size],
            )
        language = request.url.path.split("/")[2]
        return httpx.Response(
            200, json=card_payload(request.url.path.rsplit("/", 1)[1], language)
        )

    async def run():
        provider = CardProvider(
            transport=httpx.MockTransport(handle), clock=lambda: clock[0]
        )
        first, second = await asyncio.gather(
            provider.get_card("sm9-33", "es"), provider.get_card("sm9-33", "es")
        )
        first.types.append("mutated")
        assert second.types == ["Rayo"]
        assert sum(paths.values()) == 5
        await provider.get_card("sm9-33", "en")
        assert sum(paths.values()) == 5
        await provider.list_for_pokemon(25, "es", 1, 24, None, "name")
        assert 1 < peak <= 5
        clock[0] = 301
        await provider.get_card("sm9-33", "es")
        assert paths["/v2/en/cards/sm9-33"] == 2
        assert paths["/v2/es/cards/sm9-33"] == 2

    asyncio.run(run())
