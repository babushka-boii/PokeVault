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


class SpeciesMatch(BaseModel):
    national_dex_number: int = Field(ge=1, le=NATIONAL_DEX_TOTAL)
    name: str = Field(min_length=1, max_length=100)


class SpeciesMatches(BaseModel):
    results: list[SpeciesMatch]
