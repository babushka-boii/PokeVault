import asyncio
from collections import Counter

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from test_health import settings

from app.main import create_app
from app.pokemon.provider import PokemonProvider


def resource(kind, number, name):
    return {
        "name": name,
        "url": f"https://pokeapi.co/api/v2/{kind}/{number}/",
    }


def localized(name, language):
    return {"name": name, "language": {"name": language}}


def pokemon_payload(number=25):
    return {
        "id": number,
        "name": "pikachu",
        "height": 4,
        "weight": 60,
        "species": resource("pokemon-species", number, "pikachu"),
        "types": [{"slot": 1, "type": {"name": "electric"}}],
        "sprites": {"front_default": "https://example.org/pikachu.png"},
        "abilities": [
            {
                "ability": resource("ability", 31, "lightning-rod"),
                "is_hidden": True,
                "slot": 3,
            },
            {
                "ability": resource("ability", 9, "static"),
                "is_hidden": False,
                "slot": 1,
            },
        ],
    }


def species_payload(number=25):
    return {
        "id": number,
        "name": "pikachu",
        "names": [localized("Pikachu", "en"), localized("Pikachu", "es")],
        "flavor_text_entries": [
            {"flavor_text": "An electric Pokémon.", "language": {"name": "en"}},
            {
                "flavor_text": "  Almacena\n electricidad\f en sus mejillas.  ",
                "language": {"name": "es"},
            },
            {"flavor_text": "Otra versión.", "language": {"name": "es"}},
        ],
    }


def ability_payload(number):
    return {
        "id": number,
        "name": "static" if number == 9 else "lightning-rod",
        "names": [
            localized("Static" if number == 9 else "Lightning Rod", "en"),
            localized("Elec. Estática" if number == 9 else "Pararrayos", "es"),
        ],
    }


def upstream_payload(request):
    kind, number = request.url.path.rstrip("/").split("/")[-2:]
    number = int(number)
    if kind == "pokemon":
        return pokemon_payload(number)
    if kind == "pokemon-species":
        return species_payload(number)
    assert kind == "ability"
    return ability_payload(number)


def client_for(handler, **provider_options):
    app = create_app(settings())
    app.state.pokemon_provider = PokemonProvider(
        transport=httpx.MockTransport(handler), **provider_options
    )
    return TestClient(app)


def test_selected_details_convert_units_localize_and_keep_hidden_abilities():
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=upstream_payload(request))

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25")
    assert response.status_code == 200
    assert response.json() == {
        "national_dex_number": 25,
        "name": "Pikachu",
        "name_language": "es",
        "types": ["electric"],
        "sprite_url": "https://example.org/pikachu.png",
        "height_m": 0.4,
        "weight_kg": 6.0,
        "abilities": [
            {"name": "Elec. Estática", "is_hidden": False, "language": "es"},
            {"name": "Pararrayos", "is_hidden": True, "language": "es"},
        ],
        "description": "Almacena electricidad en sus mejillas.",
        "description_language": "es",
    }
    assert Counter(request.url.path for request in requests) == {
        "/api/v2/pokemon/25/": 1,
        "/api/v2/pokemon-species/25/": 1,
        "/api/v2/ability/9/": 1,
        "/api/v2/ability/31/": 1,
    }
    assert all(request.url.host == "pokeapi.co" for request in requests)
    assert all(request.extensions["timeout"]["read"] == 5 for request in requests)


@pytest.mark.parametrize("fallback", ["en", "canonical"])
def test_missing_localization_has_explicit_english_or_canonical_fallback(fallback):
    def handle(request):
        data = upstream_payload(request)
        if "names" in data:
            data["names"] = (
                [entry for entry in data["names"] if entry["language"]["name"] == "en"]
                if fallback == "en"
                else []
            )
        if "flavor_text_entries" in data:
            data["flavor_text_entries"] = (
                [{"flavor_text": "English\f entry.", "language": {"name": "en"}}]
                if fallback == "en"
                else [{"flavor_text": "日本語", "language": {"name": "ja"}}]
            )
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25?language=es")
    assert response.status_code == 200
    result = response.json()
    if fallback == "en":
        assert (result["name"], result["name_language"]) == ("Pikachu", "en")
        assert result["abilities"][0] == {
            "name": "Static",
            "is_hidden": False,
            "language": "en",
        }
        assert (result["description"], result["description_language"]) == (
            "English entry.",
            "en",
        )
    else:
        assert (result["name"], result["name_language"]) == ("pikachu", None)
        assert result["abilities"][0] == {
            "name": "static",
            "is_hidden": False,
            "language": None,
        }
        assert result["description"] is None
        assert result["description_language"] is None


def test_missing_description_and_hidden_ability_remain_missing():
    def handle(request):
        data = upstream_payload(request)
        if "flavor_text_entries" in data:
            del data["flavor_text_entries"]
        if "abilities" in data:
            data["abilities"] = [data["abilities"][1]]
            data["sprites"]["front_default"] = None
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25?language=en")
    assert response.status_code == 200
    result = response.json()
    assert result["abilities"] == [
        {"name": "Static", "is_hidden": False, "language": "en"}
    ]
    assert result["description"] is None
    assert result["description_language"] is None
    assert result["sprite_url"] is None


def test_canonical_name_fallback_uses_species_instead_of_default_form_name():
    def handle(request):
        data = upstream_payload(request)
        if "/pokemon/" in request.url.path:
            data["name"] = "deoxys-normal"
            data["species"]["name"] = "deoxys"
        elif "/pokemon-species/" in request.url.path:
            data["name"] = "deoxys"
            data["names"] = []
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/386")
    assert response.status_code == 200
    assert response.json()["name"] == "deoxys"
    assert response.json()["name_language"] is None


@pytest.mark.parametrize("kind", ["pokemon", "pokemon-species", "ability"])
@pytest.mark.parametrize("failure", ["timeout", "http", "json", "schema", "identity"])
def test_detail_provider_failures_are_sanitized_retryable_and_not_cached(kind, failure):
    failing = True

    def handle(request):
        data = upstream_payload(request)
        if failing and f"/{kind}/" in request.url.path:
            if failure == "timeout":
                raise httpx.ReadTimeout("internal-secret", request=request)
            if failure == "http":
                return httpx.Response(500, text="internal-secret")
            if failure == "json":
                return httpx.Response(200, text="internal-secret")
            if failure == "schema":
                data = {"id": data["id"], "name": "internal-secret"}
            else:
                data["id"] = 99999
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25")
        assert response.status_code == 503
        assert response.json() == {"detail": "Pokemon details are unavailable"}
        assert "internal-secret" not in response.text
        failing = False
        assert client.get("/api/v1/pokemon/25").status_code == 200


def test_detail_route_validates_inputs_before_fetching():
    def handle(request):
        pytest.fail(f"Unexpected upstream request: {request.url}")

    with client_for(handle) as client:
        for path in ["0", "1026", "-1", "hello", "25?language=fr", "25?language=ES"]:
            assert client.get(f"/api/v1/pokemon/{path}").status_code == 422


def test_detail_cache_coalesces_refresh_copies_results_and_reuses_abilities():
    clock = [0.0]
    paths = Counter()

    async def handle(request):
        paths[request.url.path] += 1
        await asyncio.sleep(0)
        return httpx.Response(200, json=upstream_payload(request))

    async def run():
        provider = PokemonProvider(
            transport=httpx.MockTransport(handle), clock=lambda: clock[0]
        )
        first, second = await asyncio.gather(
            provider.details.get_pokemon(25, "es"),
            provider.details.get_pokemon(25, "es"),
        )
        assert first == second
        first.abilities[0].name = "mutated"
        assert second.abilities[0].name == "Elec. Estática"
        assert sum(paths.values()) == 4
        english = await provider.details.get_pokemon(25, "en")
        assert english.abilities[0].name == "Static"
        assert english.description == "An electric Pokémon."
        assert sum(paths.values()) == 6
        await provider.details.get_pokemon(26, "es")
        assert sum(paths.values()) == 8
        clock[0] = 301
        refreshed = await provider.details.get_pokemon(25, "es")
        assert refreshed.abilities[0].name == "Elec. Estática"
        assert sum(paths.values()) == 10
        clock[0] = 3601
        await provider.details.get_pokemon(25, "es")
        assert paths["/api/v2/ability/9/"] == 2
        assert paths["/api/v2/ability/31/"] == 2

    asyncio.run(run())


def test_duplicate_ability_references_fetch_one_resource():
    paths = Counter()

    def handle(request):
        paths[request.url.path] += 1
        data = upstream_payload(request)
        if "abilities" in data:
            data["abilities"][0]["ability"] = resource("ability", 9, "static")
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25")
    assert response.status_code == 200
    assert [entry["is_hidden"] for entry in response.json()["abilities"]] == [
        False,
        True,
    ]
    assert paths["/api/v2/ability/9/"] == 1
    assert paths["/api/v2/ability/31/"] == 0


@pytest.mark.parametrize("reference", ["species", "ability"])
def test_resource_references_cannot_substitute_a_different_identity_or_host(reference):
    paths = []

    def handle(request):
        paths.append(str(request.url))
        data = upstream_payload(request)
        if "abilities" in data:
            if reference == "species":
                data["species"]["url"] = "https://pokeapi.co/api/v2/pokemon-species/1/"
            else:
                data["abilities"][0]["ability"]["url"] = "https://private/ability/31/"
        return httpx.Response(200, json=data)

    with client_for(handle) as client:
        response = client.get("/api/v1/pokemon/25")
    assert response.status_code == 503
    assert all(url.startswith("https://pokeapi.co/api/v2/") for url in paths)


def test_detail_cache_evicts_least_recently_used_entry():
    paths = Counter()

    def handle(request):
        paths[request.url.path] += 1
        return httpx.Response(200, json=upstream_payload(request))

    async def run():
        provider = PokemonProvider(transport=httpx.MockTransport(handle))
        for number in range(1, 129):
            await provider.details.get_pokemon(number, "es")
        await provider.details.get_pokemon(1, "es")
        await provider.details.get_pokemon(129, "es")
        await provider.details.get_pokemon(1, "es")
        await provider.details.get_pokemon(2, "es")

    asyncio.run(run())
    assert paths["/api/v2/pokemon/1/"] == 1
    assert paths["/api/v2/pokemon/2/"] == 2
    assert paths["/api/v2/ability/9/"] == 1


def test_detail_requests_limit_upstream_concurrency():
    active = 0
    peak = 0

    async def handle(request):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return httpx.Response(200, json=upstream_payload(request))

    async def run():
        provider = PokemonProvider(transport=httpx.MockTransport(handle))
        await asyncio.gather(
            *(provider.details.get_pokemon(number, "es") for number in range(1, 11))
        )

    asyncio.run(run())
    assert 1 < peak <= 5
