"""Bounded scanner contracts, without raw OCR text or persisted photos."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.cards.schemas import Category, Identifier, Language
from app.cards.set_schemas import SetCard, SetSummary

MAX_UPLOAD_BYTES = 8 * 1024 * 1024
Corner = tuple[float, float]
EngineLanguage = Literal["eng", "spa"]
Evidence = Literal[
    "name_exact",
    "name_similar",
    "number_exact",
    "set_exact",
    "printed_total",
    "visual_features",
]


class ScanClues(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(default="", max_length=100)
    local_number: str = Field(default="", max_length=20)
    printed_total: int | None = Field(default=None, ge=1, le=2000, strict=True)
    set_id: Identifier | None = None
    set_hint: str = Field(default="", max_length=100)
    category: Category | None = None
    language: Language | None = None

    @field_validator("name", "local_number", "set_hint")
    @classmethod
    def no_control_characters(cls, value: str) -> str:
        if any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Invalid clue text")
        return value


class MatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    clues: ScanClues
    language: Language = "es"


class ScanCandidate(BaseModel):
    card: SetCard
    set: SetSummary
    quality: Literal["strong", "possible", "uncertain"]
    evidence: list[Evidence]


class MatchResult(BaseModel):
    clues: ScanClues
    candidates: list[ScanCandidate] = Field(default_factory=list, max_length=8)
    status: Literal["matches", "no_match", "insufficient_clues"]
    limited: bool = False
    warnings: list[str] = Field(default_factory=list, max_length=16)


def _unit_corners(value: list[Corner] | None) -> list[Corner] | None:
    if value is not None and not all(0 <= x <= 1 and 0 <= y <= 1 for x, y in value):
        raise ValueError("Corners are normalized to 0-1")
    return value


class OCRResult(BaseModel):
    clues: ScanClues
    engine_languages: list[EngineLanguage]
    warnings: list[str] = Field(default_factory=list, max_length=16)
    # Where the card was found, normalized 0-1: top-left, top-right, bottom-right,
    # bottom-left of the oriented photograph; null when no reliable outline was found.
    corners: list[Corner] | None = Field(default=None, min_length=4, max_length=4)

    _check_corners = field_validator("corners")(_unit_corners)


class RecognizeResult(MatchResult):
    engine_languages: list[EngineLanguage]
    corners: list[Corner] | None = Field(default=None, min_length=4, max_length=4)

    _check_corners = field_validator("corners")(_unit_corners)


class ScanCapabilities(BaseModel):
    available: bool
    languages: list[EngineLanguage]
    formats: list[
        Literal["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]
    ]
    max_upload_bytes: int = MAX_UPLOAD_BYTES
