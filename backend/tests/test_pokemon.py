import asyncio

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from test_health import settings

from app.main import create_app


def payload(number):
    return {
        "id": number,
        "name": "bulbasaur" if number == 1 else f"pokemon-{number}",
        "types": [
            {"slot": 2, "type": {"name": "poison"}},
            {"slot": 1, "type": {"name": "grass"}},
        ],
        "sprites": {"front_default": None},
    }


def test_endpoint_returns_first_twenty_in_order_and_caches():
    from app.pokemon.provider import PokemonProvider

    requests = []

    def handle(request):
        requests.append(request)
        number = int(request.url.path.rstrip("/").split("/")[-1])
        return httpx.Response(200, json=payload(number))

    provider = PokemonProvider(transport=httpx.MockTransport(handle))
    app = create_app(settings())
    app.state.pokemon_provider = provider
    with TestClient(app) as client:
        response = client.get("/api/v1/pokemon")
        assert response.status_code == 200
        items = response.json()["results"]
        assert [item["national_dex_number"] for item in items] == list(range(1, 21))
        assert items[0] == {
            "national_dex_number": 1,
            "name": "bulbasaur",
            "types": ["grass", "poison"],
            "sprite_url": None,
        }
        assert client.get("/api/v1/pokemon").json() == response.json()
    assert len(requests) == 20
    assert all(request.url.host == "pokeapi.co" for request in requests)
    assert all(request.extensions["timeout"]["read"] == 5 for request in requests)


@pytest.mark.parametrize("failure", ["timeout", "http", "json", "schema", "identity"])
def test_provider_failures_are_sanitized_and_not_cached(failure):
    from app.pokemon.provider import PokemonProvider

    failing = True

    def handle(request):
        if failing:
            if failure == "timeout":
                raise httpx.ReadTimeout("internal-secret", request=request)
            if failure == "http":
                return httpx.Response(500, text="internal-secret")
            if failure == "json":
                return httpx.Response(200, text="internal-secret")
            if failure == "identity":
                return httpx.Response(200, json=payload(99))
            return httpx.Response(200, json={"name": "internal-secret"})
        number = int(request.url.path.rstrip("/").split("/")[-1])
        return httpx.Response(200, json=payload(number))

    app = create_app(settings())
    app.state.pokemon_provider = PokemonProvider(transport=httpx.MockTransport(handle))
    with TestClient(app) as client:
        response = client.get("/api/v1/pokemon")
        assert response.status_code == 503
        assert response.json() == {"detail": "Pokemon catalog is unavailable"}
        assert "internal-secret" not in response.text
        failing = False
        assert client.get("/api/v1/pokemon").status_code == 200


def test_cache_expires_and_concurrent_requests_share_refresh():
    from app.pokemon.provider import PokemonProvider

    clock = [0.0]
    requests = []

    async def handle(request):
        requests.append(request)
        await asyncio.sleep(0)
        number = int(request.url.path.rstrip("/").split("/")[-1])
        data = payload(number)
        data["sprites"]["front_default"] = "https://example.org/sprite.png"
        return httpx.Response(200, json=data)

    async def run():
        provider = PokemonProvider(
            transport=httpx.MockTransport(handle), clock=lambda: clock[0]
        )
        first, second = await asyncio.gather(
            provider.list_pokemon(), provider.list_pokemon()
        )
        assert first == second
        assert str(first.results[0].sprite_url) == "https://example.org/sprite.png"
        assert len(requests) == 20
        clock[0] = 301
        await provider.list_pokemon()
        assert len(requests) == 40

    asyncio.run(run())


def test_pagination_and_final_partial_page():
    from app.pokemon.provider import PokemonProvider

    def handle(request):
        number = int(request.url.path.rstrip("/").split("/")[-1])
        return httpx.Response(200, json=payload(number))

    app = create_app(settings())
    app.state.pokemon_provider = PokemonProvider(transport=httpx.MockTransport(handle))
    with TestClient(app) as client:
        page = client.get("/api/v1/pokemon?offset=30&limit=30")
        assert page.status_code == 200
        assert [p["national_dex_number"] for p in page.json()["results"]] == list(
            range(31, 61)
        )
        assert (
            len(client.get("/api/v1/pokemon?offset=1020&limit=30").json()["results"])
            == 5
        )
        for query in ["limit=31", "limit=0", "offset=-1", "offset=1025"]:
            assert client.get("/api/v1/pokemon?" + query).status_code == 422
        assert len(client.get("/api/v1/pokemon").json()["results"]) == 20
