"""Price API responses. Amounts are plain decimal strings; no rates are exposed.

ExchangeRate-API terms forbid redistributing its data, so responses carry only
converted amounts, the rate date and the attribution link — never the rates.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.prices.schemas import Metric, NoPriceReason, Source

TargetCurrency = Literal["CLP", "USD"]
ATTRIBUTION_URL = "https://www.exchangerate-api.com"


class RatesInfo(BaseModel):
    available: bool
    stale: bool = False
    updated_at: datetime | None = None
    provider: Literal["exchangerate-api"] = "exchangerate-api"
    attribution_url: str = ATTRIBUTION_URL


class Quote(BaseModel):
    amount: str | None  # converted and rounded; None when no rates are available
    currency: TargetCurrency
    original_amount: str
    original_currency: Literal["EUR", "USD"]
    source: Source
    metric: Metric
    updated_at: datetime | None
    stale: bool


class CopyPrice(BaseModel):
    copy_id: UUID
    card_id: str
    variant: str
    price: Quote | None = None
    reason: NoPriceReason | None = None


class CopyPrices(BaseModel):
    currency: TargetCurrency
    results: list[CopyPrice]
    rates: RatesInfo


class VariantPrice(BaseModel):
    variant: Literal["normal", "reverse", "holo"]
    price: Quote | None = None
    reason: NoPriceReason | None = None


class CardPrices(BaseModel):
    card_id: str
    currency: TargetCurrency
    # Market references for the printing: equal for Spanish and English cards.
    language_independent: bool = True
    variants: list[VariantPrice]
    rates: RatesInfo


class Valuation(BaseModel):
    currency: TargetCurrency
    total: str | None
    original_totals: dict[str, str]
    copy_count: int
    priced_count: int
    unpriced_count: int
    unpriced_by_reason: dict[str, int]
    pending_count: int
    stale_count: int
    # The age of the least fresh price used: the oldest fetch time among priced copies.
    prices_updated_at: datetime | None = None
    sources: dict[str, int]
    top: list[CopyPrice]
    rates: RatesInfo
    items: list[CopyPrice] = Field(default_factory=list, exclude=True)


class CurrencySettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    preferred_currency: TargetCurrency


class BinderValue(BaseModel):
    binder_id: UUID
    total: str | None
    original_totals: dict[str, str]
    copy_count: int
    priced_count: int
    pending_count: int
    stale_count: int


class BinderValues(BaseModel):
    currency: TargetCurrency
    results: list[BinderValue]
    rates: RatesInfo


class SetValue(BaseModel):
    set_id: str
    total: str | None
    original_totals: dict[str, str]
    copy_count: int
    priced_count: int
    pending_count: int
    stale_count: int


class SetValues(BaseModel):
    currency: TargetCurrency
    results: list[SetValue]
    rates: RatesInfo
