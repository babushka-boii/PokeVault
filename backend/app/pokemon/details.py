import asyncio
import re
from collections import OrderedDict
from collections.abc import Callable
from time import monotonic

import httpx2 as httpx
from pydantic import BaseModel, Field, HttpUrl, ValidationError

from app.pokemon.detail_schemas import DetailLanguage, PokemonAbility, PokemonDetails


class DetailsUnavailable(Exception):
    """The provider could not supply valid details for the selected species."""


class _Name(BaseModel):
    name: str


class _Resource(BaseModel):
    name: str = Field(pattern=r"^[a-z0-9-]+$")
    url: str


class _LocalizedName(BaseModel):
    name: str
    language: _Name


class _FlavorText(BaseModel):
    flavor_text: str
    language: _Name


class _TypeSlot(BaseModel):
    slot: int = Field(ge=1, le=2, strict=True)
    type: _Name


class _AbilitySlot(BaseModel):
    slot: int = Field(ge=1, le=3, strict=True)
    is_hidden: bool = Field(strict=True)
    ability: _Resource


class _Sprites(BaseModel):
    front_default: HttpUrl | None


class _PokemonPayload(BaseModel):
    id: int = Field(ge=1, strict=True)
    name: str = Field(pattern=r"^[a-z0-9-]+$")
    species: _Resource
    height: int = Field(gt=0, strict=True)
    weight: int = Field(gt=0, strict=True)
    types: list[_TypeSlot] = Field(min_length=1, max_length=2)
    sprites: _Sprites
    abilities: list[_AbilitySlot] = Field(min_length=1, max_length=3)


class _SpeciesPayload(BaseModel):
    id: int = Field(ge=1, strict=True)
    name: str = Field(pattern=r"^[a-z0-9-]+$")
    names: list[_LocalizedName] = Field(default_factory=list)
    flavor_text_entries: list[_FlavorText] = Field(default_factory=list)


class _AbilityPayload(BaseModel):
    id: int = Field(ge=1, strict=True)
    name: str = Field(pattern=r"^[a-z0-9-]+$")
    names: list[_LocalizedName] = Field(default_factory=list)


def _localized_name(
    names: list[_LocalizedName], language: DetailLanguage, canonical: str
) -> tuple[str, DetailLanguage | None]:
    for candidate in dict.fromkeys((language, "en")):
        for entry in names:
            value = " ".join(entry.name.split())
            if entry.language.name == candidate and value:
                return value, candidate
    return canonical, None


def _description(
    entries: list[_FlavorText], language: DetailLanguage
) -> tuple[str | None, DetailLanguage | None]:
    # Keep the first nonempty provider-order entry in the requested language,
    # then English. Version order is preserved; no "latest game" is inferred.
    # split/join normalizes line breaks, form feeds and repeated whitespace.
    for candidate in dict.fromkeys((language, "en")):
        for entry in entries:
            value = " ".join(entry.flavor_text.split())
            if entry.language.name == candidate and value:
                return value, candidate
    return None, None


class PokemonDetailsService:
    """Selected-only details: 128 five-minute entries and 256 hourly abilities.

    Names prefer the requested language, then English, then the canonical slug;
    metadata always identifies the actual chosen language (null for a slug).
    Complete details are cached per number/language. Valid ability resources are
    cached independently so they can be reused across species and languages.
    A lock coalesces refreshes and a semaphore bounds upstream concurrency.
    """

    def __init__(
        self,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._transport = transport
        self._clock = clock
        self._cache: OrderedDict[
            tuple[int, DetailLanguage], tuple[float, PokemonDetails]
        ] = OrderedDict()
        self._abilities: OrderedDict[int, tuple[float, _AbilityPayload]] = OrderedDict()
        self._lock = asyncio.Lock()
        self._semaphore = asyncio.Semaphore(5)

    async def get_pokemon(
        self, number: int, language: DetailLanguage = "es"
    ) -> PokemonDetails:
        async with self._lock:
            key = (number, language)
            cached = self._cache.get(key)
            if cached is not None and self._clock() < cached[0]:
                self._cache.move_to_end(key)
                return cached[1].model_copy(deep=True)
            try:
                async with (
                    asyncio.timeout(15),
                    httpx.AsyncClient(
                        base_url="https://pokeapi.co/api/v2/",
                        timeout=5,
                        transport=self._transport,
                        follow_redirects=False,
                    ) as client,
                ):
                    async with asyncio.TaskGroup() as group:
                        pokemon_task = group.create_task(
                            self._get_json(client, f"pokemon/{number}/")
                        )
                        species_task = group.create_task(
                            self._get_json(client, f"pokemon-species/{number}/")
                        )
                    pokemon = _PokemonPayload.model_validate(pokemon_task.result())
                    species = _SpeciesPayload.model_validate(species_task.result())
                    if (
                        pokemon.id != number
                        or species.id != number
                        or pokemon.species.name != species.name
                        or pokemon.species.url
                        != f"https://pokeapi.co/api/v2/pokemon-species/{number}/"
                    ):
                        raise ValueError("Unexpected species identity")
                    references = {}
                    for slot in pokemon.abilities:
                        match = re.fullmatch(
                            r"https://pokeapi\.co/api/v2/ability/([1-9][0-9]*)/",
                            slot.ability.url,
                        )
                        if match is None:
                            raise ValueError("Invalid ability reference")
                        reference = (int(match[1]), slot.ability.name)
                        if (
                            slot.ability.url in references
                            and references[slot.ability.url] != reference
                        ):
                            raise ValueError("Conflicting ability references")
                        references[slot.ability.url] = reference
                    async with asyncio.TaskGroup() as group:
                        tasks = {
                            url: group.create_task(
                                self._ability(client, ability_id, expected_name)
                            )
                            for url, (ability_id, expected_name) in references.items()
                        }
                    abilities = []
                    for slot in sorted(pokemon.abilities, key=lambda item: item.slot):
                        ability = tasks[slot.ability.url].result()
                        name, name_language = _localized_name(
                            ability.names, language, ability.name
                        )
                        abilities.append(
                            PokemonAbility(
                                name=name,
                                is_hidden=slot.is_hidden,
                                language=name_language,
                            )
                        )
                    name, name_language = _localized_name(
                        species.names, language, species.name
                    )
                    description, description_language = _description(
                        species.flavor_text_entries, language
                    )
                    details = PokemonDetails(
                        national_dex_number=number,
                        name=name,
                        name_language=name_language,
                        types=[
                            entry.type.name
                            for entry in sorted(
                                pokemon.types, key=lambda item: item.slot
                            )
                        ],
                        sprite_url=pokemon.sprites.front_default,
                        # PokéAPI height is dm; weight is hg. Both convert by /10.
                        height_m=pokemon.height / 10,
                        weight_kg=pokemon.weight / 10,
                        abilities=abilities,
                        description=description,
                        description_language=description_language,
                    )
            except (
                ExceptionGroup,
                httpx.HTTPError,
                TimeoutError,
                ValueError,
                TypeError,
                ValidationError,
            ) as error:
                raise DetailsUnavailable from error
            self._cache[key] = (self._clock() + 300, details)
            self._cache.move_to_end(key)
            while len(self._cache) > 128:
                self._cache.popitem(last=False)
            return details.model_copy(deep=True)

    async def _get_json(self, client: httpx.AsyncClient, path: str) -> object:
        async with self._semaphore:
            response = await client.get(path)
            response.raise_for_status()
            return response.json()

    async def _ability(
        self, client: httpx.AsyncClient, number: int, expected_name: str
    ) -> _AbilityPayload:
        cached = self._abilities.get(number)
        if cached is not None and self._clock() < cached[0]:
            if cached[1].name != expected_name:
                raise ValueError("Unexpected cached ability identity")
            self._abilities.move_to_end(number)
            return cached[1]
        ability = _AbilityPayload.model_validate(
            await self._get_json(client, f"ability/{number}/")
        )
        if ability.id != number or ability.name != expected_name:
            raise ValueError("Unexpected ability identity")
        self._abilities[number] = (self._clock() + 3600, ability)
        self._abilities.move_to_end(number)
        while len(self._abilities) > 256:
            self._abilities.popitem(last=False)
        return ability
