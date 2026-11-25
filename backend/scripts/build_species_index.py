"""Generate ``app/pokemon/data/species_index.json`` (by hand, never at runtime).

Sources (PokéAPI, https://pokeapi.co/api/v2/):
  * ``pokemon-species/{n}/`` for n = 1..1025: ``names`` gives the localized name.
    The Spanish name (language ``es``) is used, falling back to the English one
    (``en``); the English name is the ``en`` entry. The run prints how many Spanish
    names fell back.
  * ``type/{name}/`` for the 18 types: each ``pokemon`` entry gives ``(slot, id)``.
    Only ids up to 1025 are species; alternate forms (ids above 10000) are ignored.
    A species' types are its entries ordered by slot (1, then 2).

It validates the result with the same validator the API uses and writes the file
only if the whole run succeeded (a partial or invalid result never replaces the
old file).

To regenerate for a new generation: raise ``NATIONAL_DEX_TOTAL`` in
``app/pokemon/schemas.py`` (and the frontend constants), then from ``backend/``::

    .venv/bin/python scripts/build_species_index.py

Review ``git diff`` of the JSON and the fallback count, update the generation
ranges and the tests that mention 1025, and commit. PokéAPI asks for a fair-use
pace: at most 5 requests at a time, a User-Agent naming the project, and retries
with a pause.
"""

import asyncio
import json
import re
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import httpx2 as httpx

if __package__ in (None, ""):  # run as a script: make `app` importable
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pokemon.catalog import (  # noqa: E402
    DATA_FILE,
    POKEMON_TYPES,
    SpeciesIndexInvalid,
    validate_species,
)
from app.pokemon.schemas import NATIONAL_DEX_TOTAL  # noqa: E402

BASE_URL = "https://pokeapi.co/api/v2/"
SOURCE = "PokéAPI https://pokeapi.co/api/v2/ (pokemon-species names es/en; type lists)"
USER_AGENT = "pokevault-species-index/1.0 (student project; pokemon-species-bot)"
_POKEMON_URL = re.compile(r"/pokemon/(\d+)/?$")


class BuildError(Exception):
    """The index could not be built completely."""


@dataclass(frozen=True)
class Report:
    species: int
    fallbacks: int
    path: Path


def _clean(value: str) -> str:
    return " ".join(value.split())


def choose_names(payload: dict) -> tuple[str, str, bool]:
    """(English name, Spanish name, whether Spanish fell back to English)."""
    by_language = {
        entry["language"]["name"]: _clean(entry["name"])
        for entry in payload.get("names", [])
        if _clean(entry.get("name", ""))
    }
    english = by_language.get("en")
    if not english:
        raise BuildError(f"Species {payload.get('id')} has no English name")
    spanish = by_language.get("es")
    return english, spanish or english, spanish is None


def types_by_number(type_payloads: dict[str, dict]) -> dict[int, list[str]]:
    slots: dict[int, dict[int, str]] = {}
    for kind, payload in type_payloads.items():
        for entry in payload["pokemon"]:
            match = _POKEMON_URL.search(entry["pokemon"]["url"])
            if not match or int(match[1]) > NATIONAL_DEX_TOTAL:
                continue  # alternate forms live above 10000
            by_slot = slots.setdefault(int(match[1]), {})
            if entry["slot"] in by_slot:
                raise BuildError(
                    f"Species {match[1]} has two types in slot {entry['slot']}"
                )
            by_slot[entry["slot"]] = kind
    result = {}
    for number, by_slot in slots.items():
        if sorted(by_slot) not in ([1], [1, 2]):
            raise BuildError(
                f"Species {number} has unexpected type slots {sorted(by_slot)}"
            )
        result[number] = [by_slot[slot] for slot in sorted(by_slot)]
    return result


async def _get_json(
    client: httpx.AsyncClient, path: str, retries: int, pause: float
) -> dict:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            response = await client.get(path)
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            last = error
            if attempt + 1 < retries:
                await asyncio.sleep(pause * (attempt + 1))
    raise BuildError(f"Could not fetch {path}") from last


async def run(
    out: Path = DATA_FILE,
    *,
    transport: httpx.AsyncBaseTransport | None = None,
    today: str | None = None,
    retries: int = 3,
    pause: float = 1.0,
) -> Report:
    semaphore = asyncio.Semaphore(5)
    async with httpx.AsyncClient(
        base_url=BASE_URL, timeout=15, transport=transport,
        headers={"User-Agent": USER_AGENT}, follow_redirects=False,
    ) as client:  # fmt: skip

        async def fetch(path: str) -> dict:
            async with semaphore:
                return await _get_json(client, path, retries, pause)

        try:
            async with asyncio.TaskGroup() as group:
                kinds = {
                    kind: group.create_task(fetch(f"type/{kind}/"))
                    for kind in POKEMON_TYPES
                }
                species = [
                    group.create_task(fetch(f"pokemon-species/{number}/"))
                    for number in range(1, NATIONAL_DEX_TOTAL + 1)
                ]
        except ExceptionGroup as error:
            raise BuildError("PokéAPI did not answer completely") from error
    types = types_by_number({kind: task.result() for kind, task in kinds.items()})
    rows, fallbacks = [], 0
    for number, task in enumerate(species, 1):
        payload = task.result()
        if payload.get("id") != number:
            raise BuildError(f"Unexpected species identity at {number}")
        english, spanish, fell_back = choose_names(payload)
        fallbacks += fell_back
        if number not in types:
            raise BuildError(f"Species {number} has no types")
        rows.append(
            {
                "number": number,
                "name_en": english,
                "name_es": spanish,
                "types": types[number],
            }
        )
    try:
        validate_species(rows)
    except SpeciesIndexInvalid as error:
        raise BuildError("The built index does not validate") from error
    document = {
        "source": SOURCE,
        "generated_on": today or date.today().isoformat(),
        "species": rows,
    }
    text = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
    out.parent.mkdir(parents=True, exist_ok=True)
    temporary = out.with_suffix(".tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(out)
    return Report(len(rows), fallbacks, out)


def main() -> None:
    report = asyncio.run(run())
    print(f"Wrote {report.species} species to {report.path}")
    print(f"Spanish names that fell back to English: {report.fallbacks}")


if __name__ == "__main__":
    main()
