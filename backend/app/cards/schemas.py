from typing import Annotated, Literal

from pydantic import BaseModel, Field, FiniteFloat, HttpUrl, StringConstraints

Language = Literal["es", "en"]
CardSort = Literal["name", "id", "newest", "oldest"]
Category = Literal["Pokemon", "Trainer", "Energy"]
Damage = str | int | FiniteFloat | None
IDENTIFIER_PATTERN = r"^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$"
Identifier = Annotated[
    str, StringConstraints(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100)
]


class CardSerie(BaseModel):
    id: Identifier
    name: str = Field(min_length=1)


class CardImageSource(BaseModel):
    base_url: HttpUrl
    language: Language


class SetLogoSource(BaseModel):
    url: HttpUrl
    language: Language


class CardSet(CardSerie):
    logo_url: HttpUrl | None = None
    symbol_url: HttpUrl | None = None
    logo_sources: list[SetLogoSource] = Field(default_factory=list)
    name_language: Language = "en"
    serie: CardSerie | None = None
    release_date: str | None = None


class CardModifier(BaseModel):
    type: str
    value: str | None = None


class CardAttack(BaseModel):
    name: str | None = None
    cost: list[str] = Field(default_factory=list)
    damage: Damage = None
    effect: str | None = None


class CardAbility(BaseModel):
    name: str | None = None
    type: str | None = None
    effect: str | None = None


class CardVariant(BaseModel):
    id: str | None = None
    type: str = Field(min_length=1)
    subtype: str | None = None
    stamps: list[str] = Field(default_factory=list)


class Card(BaseModel):
    id: Identifier
    name: str = Field(min_length=1)
    dex_ids: list[int]
    image_url: HttpUrl | None
    thumbnail_url: HttpUrl | None
    image_sources: list[CardImageSource] = Field(default_factory=list)
    image_language: Language | None = None
    set: CardSet
    local_id: str = Field(min_length=1)
    rarity: str | None
    category: Category
    language: Language
    available_languages: list[Language]
    illustrator: str | None
    hp: int | None
    types: list[str]
    stage: str | None
    evolve_from: str | None
    attacks: list[CardAttack]
    abilities: list[CardAbility]
    variants: list[CardVariant]
    weaknesses: list[CardModifier] = Field(default_factory=list)
    resistances: list[CardModifier] = Field(default_factory=list)
    retreat: int | None = None
    regulation_mark: str | None = None


class CardPage(BaseModel):
    results: list[Card]
    page: int
    page_size: int
    has_more: bool
    coverage: Literal["english_catalog"] = "english_catalog"
    sets: list[CardSet] = Field(default_factory=list)
    sets_complete: Literal[True] = True
