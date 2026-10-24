from typing import Literal

from pydantic import BaseModel, Field

from app.pokemon.schemas import Pokemon

DetailLanguage = Literal["es", "en"]


class PokemonAbility(BaseModel):
    name: str = Field(min_length=1)
    is_hidden: bool
    language: DetailLanguage | None


class PokemonDetails(Pokemon):
    name_language: DetailLanguage | None
    height_m: float = Field(gt=0, allow_inf_nan=False)
    weight_kg: float = Field(gt=0, allow_inf_nan=False)
    abilities: list[PokemonAbility] = Field(min_length=1, max_length=3)
    description: str | None
    description_language: DetailLanguage | None
