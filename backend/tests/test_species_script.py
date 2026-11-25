"""The species JSON generator: its pure parts and a full run on a fake PokéAPI."""

import asyncio
import json

import httpx2 as httpx
import pytest

from app.pokemon.catalog import POKEMON_TYPES, SpeciesIndexInvalid, validate_species
from scripts import build_species_index as build


def species_payload(number, es=True, en=True):
    names = []
    if es:
        names.append({"name": f"Especie {number}", "language": {"name": "es"}})
    if en:
        names.append({"name": f"Species {number}", "language": {"name": "en"}})
    names.append({"name": "x", "language": {"name": "fr"}})
    return {"id": number, "name": f"species-{number}", "names": names}


def type_payloads():
    """Every species is normal, odd ones also fire; forms above 10000 are noise."""
    payloads = {}
    for kind in POKEMON_TYPES:
        entries = []
        if kind == "normal":
            entries = [
                {
                    "slot": 1,
                    "pokemon": {
                        "name": f"p{n}",
                        "url": f"https://pokeapi.co/api/v2/pokemon/{n}/",
                    },
                }
                for n in range(1, 1026)
            ]
        if kind == "fire":
            entries = [
                {
                    "slot": 2,
                    "pokemon": {
                        "name": f"p{n}",
                        "url": f"https://pokeapi.co/api/v2/pokemon/{n}/",
                    },
                }
                for n in range(1, 1026, 2)
            ]
            entries.append(
                {
                    "slot": 1,
                    "pokemon": {
                        "name": "mega",
                        "url": "https://pokeapi.co/api/v2/pokemon/10033/",
                    },
                }
            )
        payloads[kind] = {"pokemon": entries}
    return payloads


def test_the_spanish_name_is_used_and_the_english_one_is_the_fallback():
    assert build.choose_names(species_payload(5)) == ("Species 5", "Especie 5", False)
    assert build.choose_names(species_payload(5, es=False)) == (
        "Species 5",
        "Species 5",
        True,
    )
    with pytest.raises(build.BuildError):
        build.choose_names(species_payload(5, es=False, en=False))
    messy = {
        "id": 1,
        "name": "x",
        "names": [{"name": "  Mr.   Mime ", "language": {"name": "en"}}],
    }
    assert build.choose_names(messy)[0] == "Mr. Mime"


def test_types_follow_their_slots_and_forms_above_the_national_range_are_ignored():
    types = build.types_by_number(type_payloads())
    assert types[1] == ["normal", "fire"] and types[2] == ["normal"]
    assert 10033 not in types and len(types) == 1025


def test_a_species_without_a_type_or_with_a_gap_in_slots_fails():
    payloads = type_payloads()
    payloads["normal"]["pokemon"] = payloads["normal"]["pokemon"][1:]  # #1 loses slot 1
    with pytest.raises(build.BuildError):
        build.types_by_number(payloads)
    payloads = type_payloads()
    payloads["water"]["pokemon"].append(
        {
            "slot": 1,
            "pokemon": {"name": "p2", "url": "https://pokeapi.co/api/v2/pokemon/2/"},
        }
    )  # two slot-1 types
    with pytest.raises(build.BuildError):
        build.types_by_number(payloads)


def test_a_full_run_builds_a_valid_sorted_file_and_reports_the_fallbacks(tmp_path):
    seen = []

    def handle(request: httpx.Request):
        seen.append(request.url.path)
        assert "pokemon-species-bot" in request.headers["user-agent"]
        path = request.url.path.rstrip("/").split("/")
        if path[-2] == "pokemon-species":
            number = int(path[-1])
            return httpx.Response(
                200, json=species_payload(number, es=number % 100 != 0)
            )
        if path[-2] == "type":
            return httpx.Response(200, json=type_payloads()[path[-1]])
        return httpx.Response(404)

    out = tmp_path / "species.json"
    report = asyncio.run(
        build.run(out, transport=httpx.MockTransport(handle), today="2026-11-25")
    )
    assert report.fallbacks == 10  # 100, 200 … 1000
    assert len(seen) == 1025 + 18
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["generated_on"] == "2026-11-25" and "pokeapi.co" in data["source"]
    assert len(validate_species(data["species"])) == 1025
    assert data["species"][99]["name_es"] == "Species 100"  # the fallback
    assert out.read_text(encoding="utf-8").endswith("}\n")


def test_a_failure_writes_nothing(tmp_path):
    out = tmp_path / "species.json"
    out.write_text("previous")

    def handle(request: httpx.Request):
        if request.url.path.rstrip("/").endswith("/pokemon-species/500"):
            return httpx.Response(500)
        path = request.url.path.rstrip("/").split("/")
        if path[-2] == "pokemon-species":
            return httpx.Response(200, json=species_payload(int(path[-1])))
        return httpx.Response(200, json=type_payloads()[path[-1]])

    with pytest.raises(build.BuildError):
        asyncio.run(
            build.run(
                out,
                transport=httpx.MockTransport(handle),
                today="2026-11-25",
                retries=1,
                pause=0,
            )
        )
    assert out.read_text() == "previous"


def test_a_file_that_fails_validation_is_never_written(tmp_path):
    out = tmp_path / "species.json"

    def handle(request: httpx.Request):
        path = request.url.path.rstrip("/").split("/")
        if path[-2] == "pokemon-species":
            return httpx.Response(200, json=species_payload(int(path[-1])))
        payloads = type_payloads()
        payloads["normal"]["pokemon"] = []  # nobody is normal: species lose their types
        return httpx.Response(200, json=payloads[path[-1]])

    with pytest.raises((build.BuildError, SpeciesIndexInvalid)):
        asyncio.run(
            build.run(
                out, transport=httpx.MockTransport(handle), today="2026-11-25", pause=0
            )
        )
    assert not out.exists()
