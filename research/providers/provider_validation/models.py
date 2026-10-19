from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Mapping


class CardCategory(str, Enum):
    POKEMON = "pokemon"
    TRAINER = "trainer"
    ENERGY = "energy"


@dataclass(frozen=True)
class ValidationCase:
    name: str
    provider: str
    resource_kind: str
    language: str | None
    url: str
    expected: Mapping[str, object]


class ManifestError(ValueError):
    """Raised when the local validation manifest is malformed."""


class ProviderDataError(ValueError):
    """Raised when essential provider data is absent or malformed."""


@dataclass(frozen=True)
class PriceObservation:
    source: str
    currency: str
    updated_at: str | None
    finish: str | None
    metrics: tuple[tuple[str, Decimal | None], ...]


@dataclass(frozen=True)
class VariantRecord:
    provider_id: str | None
    finish: str
    subtype: str | None
    stamps: tuple[str, ...]
    prices: tuple[PriceObservation, ...]


@dataclass(frozen=True)
class CardRecord:
    external_id: str
    local_id: str
    name: str
    category: CardCategory
    set_external_id: str
    dex_ids: tuple[int, ...]
    image_url: str | None
    variants: tuple[VariantRecord, ...]
    prices: tuple[PriceObservation, ...]


@dataclass(frozen=True)
class SetRecord:
    external_id: str
    name: str
    official_count: int
    total_count: int
