from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.prices.api_schemas import TargetCurrency

HistoryRange = Literal["7d", "30d", "1y"]
RANGE_DAYS: dict[str, int] = {"7d": 7, "30d": 30, "1y": 365}
BASELINE_DAYS = 7


class ValuePoint(BaseModel):
    day: date
    total: str


class History(BaseModel):
    currency: TargetCurrency
    range: HistoryRange
    # The user's first recorded day (any currency), or None before any record exists.
    started_on: date | None
    # Only recorded days: nothing is interpolated or carried forward.
    points: list[ValuePoint]
    # The latest record at least seven days old, for the "change in 7 days" line.
    baseline: ValuePoint | None


class GuideState(BaseModel):
    has_copy: bool
    has_stored: bool
    has_favorite: bool
    dismissed: bool


class GuideClose(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dismissed: Literal[True]
