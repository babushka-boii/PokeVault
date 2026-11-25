"""Private binder payloads; ownership and inventory attributes are never writable."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.inventory.schemas import InventoryCopy

# Closed catalogues: a cover or sticker is one of these ids, never a URL.
Cover = Literal["noir", "brown_leather", "metallic", "holographic", "white"]
PixelKey = Literal["star", "bolt", "heart", "creature", "circle"]
MAX_STICKERS = 24
SPECIES_TOTAL = 1025
BinderName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]


class CreateBinder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BinderName
    cover: Cover = "noir"


class UpdateBinder(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BinderName | None = None
    cover: Cover | None = None

    @model_validator(mode="after")
    def nonempty_changes(self):
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Supply at least one non-null binder attribute")
        return self


def _decimals(places: int):
    def check(value: float) -> float:
        if round(value, places) != value:
            raise ValueError(f"At most {places} decimal places")
        return value

    return check


class Sticker(BaseModel):
    """One layer on the cover; its position in the list is its order (back to front)."""

    model_config = ConfigDict(extra="forbid", strict=True)

    kind: Literal["pokemon", "pixel"]
    species_id: int | None = Field(default=None, ge=1, le=SPECIES_TOTAL)
    pixel_key: PixelKey | None = None
    x: float = Field(ge=0, le=100, allow_inf_nan=False)
    y: float = Field(ge=0, le=100, allow_inf_nan=False)
    rotation: float = Field(default=0, ge=-180, le=180, allow_inf_nan=False)
    scale: float = Field(default=1, ge=0.5, le=2, allow_inf_nan=False)

    @field_validator("x", "y", "scale")
    @classmethod
    def two_decimals(cls, value: float) -> float:
        return _decimals(2)(value)

    @field_validator("rotation")
    @classmethod
    def one_decimal(cls, value: float) -> float:
        return _decimals(1)(value)

    @model_validator(mode="after")
    def reference_matches_kind(self):
        if self.kind == "pokemon" and (self.species_id is None or self.pixel_key):
            raise ValueError("A Pokémon sticker needs only a species")
        if self.kind == "pixel" and (self.pixel_key is None or self.species_id):
            raise ValueError("A pixel sticker needs only a pixel design")
        return self


class Appearance(BaseModel):
    """The whole look of a cover, saved as one snapshot."""

    model_config = ConfigDict(extra="forbid")

    cover: Cover
    stickers: list[Sticker] = Field(max_length=MAX_STICKERS)


class OrderBinders(BaseModel):
    model_config = ConfigDict(extra="forbid")

    binder_ids: list[UUID] = Field(max_length=100)


class PlaceCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    copy_id: UUID


class BinderSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    display_order: int
    cover: Cover
    stickers: list[Sticker] = Field(default_factory=list)
    copy_count: int = 0
    page_count: int = 2
    last_placed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class BindersPage(BaseModel):
    results: list[BinderSummary]
    total: int


class Pocket(BaseModel):
    page: int
    pocket: int
    inventory_copy: InventoryCopy = Field(alias="copy")
    placed_at: datetime


class BinderDetail(BinderSummary):
    pockets: list[Pocket]


class MovedFrom(BaseModel):
    binder_id: UUID
    binder_name: str
    page: int
    pocket: int


class StoreResult(BaseModel):
    page: int
    pocket: int
    moved_from: MovedFrom | None
    binder: BinderDetail


class CopyLocation(BaseModel):
    copy_id: UUID
    binder_id: UUID
    binder_name: str
    page: int
    pocket: int


class CopyLocations(BaseModel):
    results: list[CopyLocation]


class CopyViewPage(BaseModel):
    results: list[InventoryCopy]
    total: int
    offset: int
    limit: int


# "recent" orders by acquisition date (Expansiones); "added" by creation time.
View = Literal["owned", "unassigned", "recent", "added"]
