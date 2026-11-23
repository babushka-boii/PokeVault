"""Pure normalization of TCGdex ``pricing``/``variants`` into a PriceSnapshot."""

from datetime import UTC, datetime
from decimal import Decimal

from app.prices.schemas import PriceSnapshot

# Real cards can exceed 10 000 and highPrice is never read, so this bound only stops
# broken values (e.g. a misplaced decimal), not expensive cards.
MAX_UNIT_PRICE = Decimal("1000000")


def _price(value: object) -> Decimal | None:
    """Positive, finite, bounded numbers only. 0/null/negative mean "no price"."""
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    try:
        number = Decimal(str(value))
    except ArithmeticError:
        return None
    if not number.is_finite() or number <= 0 or number > MAX_UNIT_PRICE:
        return None
    return number


def _timestamp(value: object) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _section(raw: dict, name: str, unit: str) -> dict:
    section = raw.get(name)
    if not isinstance(section, dict) or section.get("unit") != unit:
        return {}
    return section


def _market(section: dict, finish: str) -> Decimal | None:
    entry = section.get(finish)
    # Only marketPrice is read: highPrice and the other fields are never consulted.
    return _price(entry.get("marketPrice")) if isinstance(entry, dict) else None


def _flag(variants: object, name: str) -> bool | None:
    if not isinstance(variants, dict):
        return None
    value = variants.get(name)
    return value if isinstance(value, bool) else None


def normalize_pricing(raw: object, variants: object) -> PriceSnapshot:
    pricing = raw if isinstance(raw, dict) else {}
    cardmarket = _section(pricing, "cardmarket", "EUR")
    tcgplayer = _section(pricing, "tcgplayer", "USD")
    values = {
        "cm_trend": _price(cardmarket.get("trend")),
        "cm_trend_reverse": _price(cardmarket.get("trend-holo")),
        "tp_normal": _market(tcgplayer, "normal"),
        "tp_holofoil": _market(tcgplayer, "holofoil"),
        "tp_reverse": _market(tcgplayer, "reverse-holofoil"),
    }
    return PriceSnapshot(
        status="ok" if any(v is not None for v in values.values()) else "no_data",
        cm_updated=_timestamp(cardmarket.get("updated")),
        tp_updated=_timestamp(tcgplayer.get("updated")),
        has_normal=_flag(variants, "normal"),
        has_holo=_flag(variants, "holo"),
        has_reverse=_flag(variants, "reverse"),
        **values,
    )
