from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

PokemonType = Literal[
    "normal",
    "fire",
    "water",
    "electric",
    "grass",
    "ice",
    "fighting",
    "poison",
    "ground",
    "flying",
    "psychic",
    "bug",
    "rock",
    "ghost",
    "dragon",
    "dark",
    "steel",
    "fairy",
]


class Pokemon(BaseModel):
    national_dex_number: int = Field(ge=1, le=1025)
    name: str = Field(min_length=1)
    types: list[PokemonType] = Field(min_length=1, max_length=2)
    sprite_url: HttpUrl | None


class PokemonList(BaseModel):
    results: list[Pokemon]


NATIONAL_DEX_TOTAL = 1025


SPRITE_HOST = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon"


def sprite_url(number: int) -> str:
    """The static sprite, built only from a validated national number."""
    if not 1 <= number <= NATIONAL_DEX_TOTAL:
        raise ValueError("Unknown national dex number")
    return f"{SPRITE_HOST}/{number}.png"


class SpeciesMatch(BaseModel):
    national_dex_number: int = Field(ge=1, le=NATIONAL_DEX_TOTAL)
    name: str = Field(min_length=1, max_length=100)  # the English name, as before
    name_es: str = Field(min_length=1, max_length=100)
    types: list[PokemonType] = Field(min_length=1, max_length=2)
    sprite_url: HttpUrl


class SpeciesMatches(BaseModel):
    results: list[SpeciesMatch]


class IndexEntry(BaseModel):
    national_dex_number: int = Field(ge=1, le=NATIONAL_DEX_TOTAL)
    name_en: str
    name_es: str
    types: list[PokemonType] = Field(min_length=1, max_length=2)


class SpeciesIndexResponse(BaseModel):
    results: list[IndexEntry]
