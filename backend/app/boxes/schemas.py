"""Private box payloads; ownership and inventory attributes are never writable here."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)

from app.inventory.schemas import InventoryCopy

Wallpaper = Literal["classic", "forest", "ocean", "night"]
BoxName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]


class CreateBox(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BoxName
    wallpaper: Wallpaper = "classic"


class UpdateBox(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: BoxName | None = None
    wallpaper: Wallpaper | None = None

    @model_validator(mode="after")
    def nonempty_changes(self):
        if not self.model_fields_set or any(
            getattr(self, field) is None for field in self.model_fields_set
        ):
            raise ValueError("Supply at least one non-null box attribute")
        return self


class OrderBoxes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    box_ids: list[UUID] = Field(max_length=100)


class PlaceCopy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    copy_id: UUID


class BoxSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    display_order: int
    wallpaper: Wallpaper
    created_at: datetime
    updated_at: datetime
    copy_count: int = 0


class BoxesPage(BaseModel):
    results: list[BoxSummary]
    total: int


class BoxSlot(BaseModel):
    position: int
    inventory_copy: InventoryCopy = Field(alias="copy")


class BoxDetail(BoxSummary):
    slots: list[BoxSlot]


class CopyViewPage(BaseModel):
    results: list[InventoryCopy]
    total: int
    offset: int
    limit: int
