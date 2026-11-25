"""Private binder payloads; ownership and inventory attributes are never writable."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.inventory.schemas import InventoryCopy

# Only the "Unova Noir" cover exists in 8C; 8D adds more (and stickers).
Cover = Literal["noir"]
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
