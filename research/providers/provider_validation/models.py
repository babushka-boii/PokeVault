from dataclasses import dataclass
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
