import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from test_health import settings

from app.main import create_app
from app.pokemon.provider import PokemonProvider


def index_payload():
    return {
        "results": [
            {
                "name": "scraggy" if number == 559 else f"pokemon-{number}",
                "url": f"https://pokeapi.co/api/v2/pokemon-species/{number}/",
            }
            for number in range(1, 1026)
        ]
    }


def test_search_full_index_by_name_partial_case_and_number():
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json=index_payload())

    app = create_app(settings())
    app.state.pokemon_provider = PokemonProvider(transport=httpx.MockTransport(handle))
    with TestClient(app) as client:
        for query in ["scraggy", "SCRAGGY", "scrag", "559", "#559", "  Scraggy  "]:
            response = client.get("/api/v1/pokemon/search", params={"q": query})
            assert response.status_code == 200
            assert response.json() == {
                "results": [{"national_dex_number": 559, "name": "scraggy"}]
            }
        assert client.get("/api/v1/pokemon/search?q=not-a-pokemon").json() == {
            "results": []
        }
        assert client.get("/api/v1/pokemon/search?q=1026").json() == {"results": []}
        assert (
            len(client.get("/api/v1/pokemon/search?q=pokemon").json()["results"]) == 8
        )
        for params in [{"q": ""}, {"q": "a" * 41}, {"q": "a", "limit": 9}]:
            assert (
                client.get("/api/v1/pokemon/search", params=params).status_code == 422
            )
    assert len(requests) == 1
    assert requests[0].url.path == "/api/v2/pokemon-species/"
    assert requests[0].url.params["limit"] == "1025"


@pytest.mark.parametrize("failure", ["timeout", "json", "schema"])
def test_search_errors_sanitized_and_retryable(failure):
    failing = True

    def handle(request):
        if failing:
            if failure == "timeout":
                raise httpx.ReadTimeout("private", request=request)
            return (
                httpx.Response(200, text="private")
                if failure == "json"
                else httpx.Response(200, json={})
            )
        return httpx.Response(200, json=index_payload())

    app = create_app(settings())
    app.state.pokemon_provider = PokemonProvider(transport=httpx.MockTransport(handle))
    with TestClient(app) as client:
        response = client.get("/api/v1/pokemon/search?q=scraggy")
        assert response.status_code == 503
        assert "private" not in response.text
        failing = False
        assert (
            client.get("/api/v1/pokemon/search?q=scraggy").json()["results"][0][
                "national_dex_number"
            ]
            == 559
        )
