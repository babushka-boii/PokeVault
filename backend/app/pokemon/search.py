import asyncio
import re
import unicodedata
from time import monotonic

import httpx2 as httpx

from app.pokemon.schemas import NATIONAL_DEX_TOTAL, SpeciesMatch, SpeciesMatches


class IndexUnavailable(Exception):
    """The complete species name index is temporarily unavailable."""


def normalize_name(value: str) -> str:
    value = value.lower().replace("♀", "f").replace("♂", "m")
    return "".join(
        char
        for char in unicodedata.normalize("NFKD", value)
        if char.isalnum() and not unicodedata.combining(char)
    )


class SpeciesIndex:
    """One bounded name-only index; no per-species calls while typing."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport
        self._entries: list[SpeciesMatch] = []
        self._expires = 0.0
        self._lock = asyncio.Lock()

    async def search(self, query: str, limit: int) -> SpeciesMatches:
        query = query.strip()
        numeric = query.removeprefix("#")
        if numeric.isascii() and numeric.isdigit():
            number = int(numeric)
            if not 1 <= number <= NATIONAL_DEX_TOTAL:
                return SpeciesMatches(results=[])
        else:
            number = None
        normalized = normalize_name(query)
        if not normalized:
            return SpeciesMatches(results=[])
        entries = await self._load()
        matches = [
            entry
            for entry in entries
            if (
                entry.national_dex_number == number
                if number is not None
                else normalized in normalize_name(entry.name)
            )
        ]
        matches.sort(
            key=lambda entry: (
                normalize_name(entry.name) != normalized,
                entry.national_dex_number,
            )
        )
        return SpeciesMatches(results=matches[:limit])

    async def _load(self) -> list[SpeciesMatch]:
        async with self._lock:
            if self._entries and monotonic() < self._expires:
                return self._entries
            try:
                async with (
                    asyncio.timeout(10),
                    httpx.AsyncClient(
                        base_url="https://pokeapi.co/api/v2/",
                        timeout=5,
                        transport=self._transport,
                        follow_redirects=False,
                    ) as client,
                ):
                    response = await client.get(
                        "pokemon-species/", params={"limit": NATIONAL_DEX_TOTAL}
                    )
                    response.raise_for_status()
                    rows = response.json()["results"]
                if not isinstance(rows, list) or len(rows) != NATIONAL_DEX_TOTAL:
                    raise ValueError("Incomplete species index")
                entries = []
                for number, row in enumerate(rows, 1):
                    # Validate identity without following upstream URLs.
                    if row["url"] != (
                        f"https://pokeapi.co/api/v2/pokemon-species/{number}/"
                    ) or not re.fullmatch(r"[a-z0-9-]+", row["name"]):
                        raise ValueError("Invalid species index")
                    entries.append(
                        SpeciesMatch(national_dex_number=number, name=row["name"])
                    )
            except (
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                KeyError,
                TypeError,
            ) as error:
                raise IndexUnavailable from error
            self._entries = entries
            self._expires = monotonic() + 3600
            return entries
