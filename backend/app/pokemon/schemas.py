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
    national_dex_number: int = Field(ge=1, le=20)
    name: str = Field(min_length=1)
    types: list[PokemonType] = Field(min_length=1, max_length=2)
    sprite_url: HttpUrl | None


class PokemonList(BaseModel):
    results: list[Pokemon]
