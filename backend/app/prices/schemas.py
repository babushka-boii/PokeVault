"""Internal price records. API response models are added with the service layer."""

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Literal

Currency = Literal["EUR", "USD"]
TargetCurrency = Literal["CLP", "USD"]
Source = Literal["cardmarket", "tcgplayer"]
Metric = Literal["trend", "marketPrice"]
SnapshotStatus = Literal["ok", "no_data"]
NoPriceReason = Literal[
    "variant_unknown",
    "variant_unpriced",
    "variant_not_in_catalog",
    "no_market_data",
    "source_unavailable",
    "pending",
]


@dataclass(frozen=True)
class PriceSnapshot:
    """Only values that can be selected; highPrice and invalid numbers never appear."""

    status: SnapshotStatus
    cm_trend: Decimal | None = None
    cm_trend_reverse: Decimal | None = None
    cm_updated: datetime | None = None
    tp_normal: Decimal | None = None
    tp_holofoil: Decimal | None = None
    tp_reverse: Decimal | None = None
    tp_updated: datetime | None = None
    has_normal: bool | None = None
    has_holo: bool | None = None
    has_reverse: bool | None = None


@dataclass(frozen=True)
class PriceQuote:
    amount: Decimal
    currency: Currency
    source: Source
    metric: Metric
    updated_at: datetime | None


@dataclass(frozen=True)
class NoPrice:
    reason: NoPriceReason


@dataclass(frozen=True)
class ExchangeRates:
    """usd_clp: CLP per USD; eur_per_usd: EUR per USD (1 EUR = clp / eur)."""

    usd_clp: Decimal
    eur_per_usd: Decimal
    updated_at: datetime
