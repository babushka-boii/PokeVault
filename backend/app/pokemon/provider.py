import asyncio
from collections import OrderedDict
from collections.abc import Callable
from time import monotonic

import httpx2 as httpx
from pydantic import ValidationError

from app.pokemon.details import PokemonDetailsService
from app.pokemon.schemas import NATIONAL_DEX_TOTAL, Pokemon, PokemonList
from app.pokemon.search import SpeciesIndex


class PokemonUnavailable(Exception):
    """The provider could not supply a complete, valid catalog."""


class PokemonProvider:
    """Bounded PokéAPI adapter with a five-minute, per-process cache."""

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self.search_index = SpeciesIndex(transport)
        self.details = PokemonDetailsService(transport=transport, clock=clock)
        self._transport = transport
        self._clock = clock
        self._cache: OrderedDict[tuple[int, int], tuple[float, PokemonList]] = (
            OrderedDict()
        )
        self._lock = asyncio.Lock()

    async def list_pokemon(self, offset: int = 0, limit: int = 20) -> PokemonList:
        async with self._lock:
            key = (offset, limit)
            cached = self._cache.get(key)
            if cached is not None and self._clock() < cached[0]:
                self._cache.move_to_end(key)
                return cached[1].model_copy(deep=True)
            try:
                # A total deadline also bounds slow responses that keep sending bytes.
                async with (
                    asyncio.timeout(15),
                    httpx.AsyncClient(
                        base_url="https://pokeapi.co/api/v2/",
                        timeout=5.0,
                        transport=self._transport,
                        follow_redirects=False,
                    ) as client,
                ):
                    semaphore = asyncio.Semaphore(5)
                    async with asyncio.TaskGroup() as group:
                        tasks = [
                            group.create_task(self._fetch(client, semaphore, number))
                            for number in range(
                                offset + 1, min(offset + limit, NATIONAL_DEX_TOTAL) + 1
                            )
                        ]
                    catalog = PokemonList(results=[task.result() for task in tasks])
            except (ExceptionGroup, httpx.HTTPError, TimeoutError) as error:
                raise PokemonUnavailable from error
            self._cache[key] = (self._clock() + 300, catalog)
            self._cache.move_to_end(key)
            while len(self._cache) > 16:
                self._cache.popitem(last=False)
            return catalog.model_copy(deep=True)

    @staticmethod
    async def _fetch(
        client: httpx.AsyncClient, semaphore: asyncio.Semaphore, number: int
    ) -> Pokemon:
        async with semaphore:
            try:
                response = await client.get(f"pokemon/{number}/")
                response.raise_for_status()
                data = response.json()
                if data["id"] != number:
                    raise ValueError("Unexpected Pokemon identity")
                return Pokemon(
                    national_dex_number=number,
                    name=data["name"],
                    types=[
                        entry["type"]["name"]
                        for entry in sorted(
                            data["types"], key=lambda entry: entry["slot"]
                        )
                    ],
                    sprite_url=data["sprites"]["front_default"],
                )
            except (
                httpx.HTTPError,
                ValueError,
                KeyError,
                TypeError,
                ValidationError,
            ) as error:
                raise PokemonUnavailable from error
