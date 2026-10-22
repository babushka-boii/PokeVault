import asyncio
from collections.abc import Callable
from time import monotonic

import httpx2 as httpx
from pydantic import ValidationError

from app.pokemon.schemas import Pokemon, PokemonList


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
        self._transport = transport
        self._clock = clock
        self._cache: PokemonList | None = None
        self._expires = 0.0
        self._lock = asyncio.Lock()

    async def list_pokemon(self) -> PokemonList:
        async with self._lock:
            if self._cache is not None and self._clock() < self._expires:
                return self._cache.model_copy(deep=True)
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
                            for number in range(1, 21)
                        ]
                    catalog = PokemonList(results=[task.result() for task in tasks])
            except (ExceptionGroup, httpx.HTTPError, TimeoutError) as error:
                raise PokemonUnavailable from error
            self._cache = catalog
            self._expires = self._clock() + 300
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
