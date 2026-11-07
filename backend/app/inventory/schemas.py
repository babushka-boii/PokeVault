"""Physical copy attributes, independent of catalog translations."""

import re
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.cards.schemas import Identifier

Condition = Literal[
    "mint", "near_mint", "excellent", "good", "played", "poor", "unknown"
]
PhysicalLanguage = Literal[
    "es", "en", "ja", "fr", "de", "it", "pt", "ko", "zh", "id", "th", "other"
]
Variant = Literal["normal", "holo", "reverse", "first_edition", "other", "unknown"]


class CopyAttributes(BaseModel):
    model_config = ConfigDict(extra="forbid")

    condition: Condition = "unknown"
    language: PhysicalLanguage = "en"
    variant: Variant = "unknown"
    acquired_on: date | None = None
    notes: str = Field(default="", max_length=2000)

    @field_validator("acquired_on", mode="before")
    @classmethod
    def calendar_date(cls, value):
        if value is not None and (
            not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value)
        ):
            raise ValueError("Use a calendar date in YYYY-MM-DD format")
        return value


class CreateCopy(CopyAttributes):
    card_id: Identifier


class InventoryCopy(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    card_id: str
    condition: Condition
    language: PhysicalLanguage
    variant: Variant
    acquired_on: date | None
    notes: str
    created_at: datetime
    updated_at: datetime


class InventoryPage(BaseModel):
    results: list[InventoryCopy]
    total: int
    quantities: dict[str, int]
    offset: int
    limit: int
