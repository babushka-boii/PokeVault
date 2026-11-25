"""The fixed species index: the committed JSON, its validator, endpoint and search."""

import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from test_health import settings

from app.main import create_app
from app.pokemon.catalog import (
    DATA_FILE,
    POKEMON_TYPES,
    SpeciesIndexInvalid,
    load_catalog,
    normalize_name,
    validate_species,
)

PATH = "/api/v1/pokemon"


def committed():
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


def row(number, **changes):
    return {
        "number": number,
        "name_en": f"Species {number}",
        "name_es": f"Especie {number}",
        "types": ["normal"],
    } | changes


def full():
    return [row(number) for number in range(1, 1026)]


# --- the committed file ---


def test_the_committed_json_has_every_species_once_with_valid_types_and_names():
    data = committed()
    species = data["species"]
    assert len(species) == 1025
    assert [item["number"] for item in species] == list(range(1, 1026))
    for item in species:
        assert 1 <= len(item["types"]) <= 2
        assert len(set(item["types"])) == len(item["types"])
        assert all(kind in POKEMON_TYPES for kind in item["types"])
        assert item["name_en"].strip() and item["name_es"].strip()
    assert data["generated_on"] and data["source"]
    assert len(POKEMON_TYPES) == 18


def test_known_species_are_what_they_should_be():
    by_number = {item["number"]: item for item in committed()["species"]}
    assert by_number[1]["name_en"] == "Bulbasaur" and by_number[1]["types"] == [
        "grass",
        "poison",
    ]
    assert by_number[25]["name_es"] == "Pikachu" and by_number[25]["types"] == [
        "electric"
    ]
    assert by_number[559]["name_en"] == "Scraggy" and by_number[559]["types"] == [
        "dark",
        "fighting",
    ]
    assert by_number[122]["name_en"] == "Mr. Mime" and by_number[122]["types"] == [
        "psychic",
        "fairy",
    ]
    assert by_number[1025]["types"]
    assert by_number[6]["name_es"] == "Charizard" and by_number[6]["types"] == [
        "fire",
        "flying",
    ]


def test_the_committed_json_loads_and_is_stable():
    catalog = load_catalog()
    assert len(catalog.rows) == 1025
    assert load_catalog().etag == catalog.etag
    assert catalog.etag.startswith('"') and catalog.etag.endswith('"')
    text = DATA_FILE.read_text(encoding="utf-8")
    assert text.endswith("\n") and not text.endswith("\n\n")
    assert (
        json.dumps(committed(), ensure_ascii=False, indent=2) + "\n" == text
    )  # deterministic format


# --- the validator ---


def test_a_complete_list_validates():
    assert len(validate_species(full())) == 1025


@pytest.mark.parametrize(
    "break_it",
    [
        lambda rows: rows.pop(),  # 1024 entries
        lambda rows: rows.append(row(1026)),  # 1026 entries
        lambda rows: rows.__setitem__(5, row(6, types=[])),  # no types
        lambda rows: rows.__setitem__(5, row(6, types=["normal", "fire", "water"])),
        lambda rows: rows.__setitem__(5, row(6, types=["fire", "fire"])),
        lambda rows: rows.__setitem__(5, row(6, types=["shadow"])),
        lambda rows: rows.__setitem__(5, row(6, name_en="  ")),
        lambda rows: rows.__setitem__(5, row(6, name_es="")),
        lambda rows: rows.__setitem__(5, row(6, name_en="Bad\nName")),
        lambda rows: rows.__setitem__(5, row(6) | {"number": 7}),  # 7 twice, 6 missing
        lambda rows: rows.__setitem__(5, row(0)),
        lambda rows: rows.__setitem__(5, row(6) | {"number": "6"}),
        lambda rows: rows.__setitem__(5, {"number": 6, "name_en": "x", "name_es": "y"}),
        lambda rows: rows.__setitem__(5, row(6, extra=1)),
        lambda rows: rows.reverse(),  # numbers not in order
    ],
)
def test_every_kind_of_corruption_is_rejected(break_it):
    rows = deepcopy(full())
    break_it(rows)
    with pytest.raises(SpeciesIndexInvalid):
        validate_species(rows)


def test_a_bad_file_is_an_error_not_a_partial_index(tmp_path):
    bad = tmp_path / "species.json"
    bad.write_text(
        json.dumps(
            {"source": "x", "generated_on": "2026-11-25", "species": full()[:10]}
        )
    )
    with pytest.raises(SpeciesIndexInvalid):
        load_catalog(bad)
    bad.write_text("not json")
    with pytest.raises(SpeciesIndexInvalid):
        load_catalog(bad)
    with pytest.raises(SpeciesIndexInvalid):
        load_catalog(tmp_path / "missing.json")


def test_names_are_normalized_without_accents_case_or_punctuation():
    assert normalize_name("Mr. Mime") == "mrmime"
    assert normalize_name("Nidoran♀") == "nidoranf"
    assert normalize_name("Flabébé") == "flabebe"
    assert normalize_name("  Ho-Oh ") == "hooh"


# --- the endpoint ---


@pytest.fixture
def client():
    app = create_app(settings())
    with TestClient(app) as test_client:
        yield test_client


def test_the_index_endpoint_serves_all_species_with_a_long_cache_and_an_etag(client):
    response = client.get(f"{PATH}/index")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "public, max-age=604800"
    etag = response.headers["etag"]
    assert etag == load_catalog().etag
    body = response.json()
    assert len(body["results"]) == 1025
    assert body["results"][558] == {
        "national_dex_number": 559,
        "name_en": "Scraggy",
        "name_es": "Scraggy",
        "types": ["dark", "fighting"],
    }
    assert set(body) == {"results"}
    again = client.get(f"{PATH}/index", headers={"If-None-Match": etag})
    assert again.status_code == 304 and again.content == b""
    assert again.headers["etag"] == etag
    assert (
        client.get(f"{PATH}/index", headers={"If-None-Match": '"other"'}).status_code
        == 200
    )
    # It is public data: no session needed, no private cache headers.
    assert "no-store" not in response.headers["cache-control"]


def test_the_index_never_calls_pokeapi(client):
    # The provider would use the real network if asked: it must not be asked.
    called = []
    provider = client.app.state.pokemon_provider
    provider.search_index._load = lambda *a, **k: called.append(1)  # type: ignore[assignment]
    assert client.get(f"{PATH}/index").status_code == 200
    assert client.get(f"{PATH}/search?q=pikachu").status_code == 200
    assert called == []


# --- search over the fixed index ---


def test_search_matches_both_languages_numbers_and_ignores_accents_and_case(client):
    def numbers(query, **params):
        return [
            m["national_dex_number"]
            for m in client.get(f"{PATH}/search", params={"q": query, **params}).json()[
                "results"
            ]
        ]

    assert numbers("scraggy") == [559]
    assert numbers("SCRAGG") == [559]
    assert (
        numbers("559") == [559]
        and numbers("#559") == [559]
        and numbers("  Scraggy  ") == [559]
    )
    assert numbers("1026") == [] and numbers("0") == []
    assert numbers("not-a-pokemon") == []
    # Spanish names that differ from English ones.
    assert numbers("Bulbasaur")[0] == 1
    assert numbers("charizard")[0] == 6
    assert numbers("mr mime") == [122] and numbers("mrmime") == [122]
    assert numbers("nidoran") == [29, 32]
    # Exact matches first, then number order; the limit applies.
    assert numbers("char", limit=2) == [4, 5]
    assert len(numbers("a")) == 8


def test_search_results_carry_names_types_and_the_sprite(client):
    match = client.get(f"{PATH}/search?q=pikachu").json()["results"][0]
    assert match == {
        "national_dex_number": 25,
        "name": "Pikachu",
        "name_es": "Pikachu",
        "types": ["electric"],
        "sprite_url": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png",
    }
    for params in ({"q": ""}, {"q": "a" * 41}, {"q": "a", "limit": 9}, {"q": "   "}):
        assert client.get(f"{PATH}/search", params=params).status_code == 422


def test_search_has_no_upstream_failure_mode(client):
    # Nothing to retry: the data is in the repo.
    for _ in range(3):
        assert client.get(f"{PATH}/search?q=scraggy").status_code == 200
