"""Pure variant -> price selection. Never falls back to another variant."""

from decimal import Decimal

from app.prices.schemas import (
    Currency,
    Metric,
    NoPrice,
    PriceQuote,
    PriceSnapshot,
    Source,
)


def _cardmarket(snapshot: PriceSnapshot, amount: Decimal | None) -> PriceQuote | None:
    return _quote(amount, "EUR", "cardmarket", "trend", snapshot.cm_updated)


def _tcgplayer(snapshot: PriceSnapshot, amount: Decimal | None) -> PriceQuote | None:
    return _quote(amount, "USD", "tcgplayer", "marketPrice", snapshot.tp_updated)


def _quote(
    amount: Decimal | None,
    currency: Currency,
    source: Source,
    metric: Metric,
    updated_at,
) -> PriceQuote | None:
    if amount is None:
        return None
    return PriceQuote(amount, currency, source, metric, updated_at)


def select_price(snapshot: PriceSnapshot, variant: str) -> PriceQuote | NoPrice:
    if variant == "unknown":
        return NoPrice("variant_unknown")
    if variant not in {"normal", "reverse", "holo"}:
        return NoPrice("variant_unpriced")

    exists = {
        "normal": snapshot.has_normal,
        "reverse": snapshot.has_reverse,
        "holo": snapshot.has_holo,
    }[variant]
    if exists is False:
        return NoPrice("variant_not_in_catalog")

    # Cardmarket is trusted only when the catalog confirms what its fields describe.
    if variant == "normal":
        cardmarket = snapshot.cm_trend if exists is True else None
        finish = snapshot.tp_normal
    elif variant == "reverse":
        cardmarket = snapshot.cm_trend_reverse if exists is True else None
        finish = snapshot.tp_reverse
    else:  # Cardmarket's base fields describe holo only on holo-only cards.
        holo_only = exists is True and snapshot.has_normal is False
        cardmarket = snapshot.cm_trend if holo_only else None
        finish = snapshot.tp_holofoil

    return (
        _cardmarket(snapshot, cardmarket)
        or _tcgplayer(snapshot, finish)
        or NoPrice("no_market_data")
    )
