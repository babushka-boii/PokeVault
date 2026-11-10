"""Set catalog and derived ownership contracts; no persistent progress records."""

from typing import Literal

from pydantic import BaseModel

from app.cards.schemas import CardImageSource, CardSerie, CardSet, Identifier, Language

SetSort = Literal["newest", "oldest"]
ChecklistSort = Literal["number", "name"]
OwnershipFilter = Literal["all", "owned", "missing"]
ChecklistStatus = Literal["verified", "incomplete", "empty"]


class SetSummary(CardSet):
    official_count: int | None = None
    provider_total: int | None = None


class SetDetail(SetSummary):
    checklist_status: ChecklistStatus
    checklist_size: int
    checklist_revision: str | None


class SetCard(BaseModel):
    id: Identifier
    name: str
    local_id: str
    language: Language
    image_url: str | None
    thumbnail_url: str | None
    image_sources: list[CardImageSource]
    image_language: Language | None


class SetChecklist(BaseModel):
    """Internal bounded full membership. API pagination never changes this baseline."""

    metadata: SetDetail
    cards: list[SetCard]


class SetPage(BaseModel):
    results: list[SetSummary]
    total: int
    page: int
    page_size: int
    series: list[CardSerie]
    coverage: Literal["english_physical_catalog"] = "english_physical_catalog"
    excluded_unknown_series: int = 0
    excluded_pocket: int = 0


class SetCardPage(BaseModel):
    set: SetDetail
    results: list[SetCard]
    total: int
    page: int
    page_size: int


class SetProgress(BaseModel):
    set_id: Identifier
    checklist_revision: str | None
    status: Literal["verified", "incomplete", "empty", "unavailable"]
    total: int | None
    owned: int | None
    missing: int | None
    physical_copies: int | None
    percentage: float | None


class SetCollectionPage(SetCardPage):
    progress: SetProgress
    quantities: dict[str, int]


class SetProgressBatch(BaseModel):
    results: list[SetProgress]
