"""Persistence and freshness of price snapshots and exchange rates.

Functions never commit: the caller owns the transaction. Prices are shared catalog
data; nothing here is user-scoped.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CardPriceSnapshot, ExchangeRate
from app.prices.schemas import ExchangeRates, PriceSnapshot

SNAPSHOT_TTL = timedelta(hours=24)
RATES_TTL = timedelta(hours=24)
# A 429 blocks the provider client for 20 minutes: never retry sooner.
RATES_RETRY_GAP = timedelta(minutes=20)
RATES_SOURCE = "exchangerate-api"
_CHUNK = 500
_FIELDS = (
    "status",
    "cm_trend",
    "cm_trend_reverse",
    "cm_updated",
    "tp_normal",
    "tp_holofoil",
    "tp_reverse",
    "tp_updated",
    "has_normal",
    "has_holo",
    "has_reverse",
)


@dataclass(frozen=True)
class StoredSnapshot:
    snapshot: PriceSnapshot
    fetched_at: datetime


@dataclass(frozen=True)
class StoredRates:
    """``rates``/``fetched_at`` are None until a first successful fetch."""

    rates: ExchangeRates | None
    fetched_at: datetime | None
    last_attempt_at: datetime


def _aware(value: datetime | None) -> datetime | None:
    # SQLite drops time zones; PostgreSQL keeps them. Everything stored is UTC.
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def is_fresh(fetched_at: datetime, now: datetime, ttl: timedelta) -> bool:
    """Fresh strictly before ``ttl`` has elapsed (exactly 24 h old is stale)."""
    return now - fetched_at < ttl


def get_snapshots(
    session: Session, card_ids: Sequence[str]
) -> dict[str, StoredSnapshot]:
    unique = list(dict.fromkeys(card_ids))
    found: dict[str, StoredSnapshot] = {}
    for start in range(0, len(unique), _CHUNK):
        rows = session.scalars(
            select(CardPriceSnapshot).where(
                CardPriceSnapshot.card_id.in_(unique[start : start + _CHUNK])
            )
        )
        for row in rows:
            values = {name: getattr(row, name) for name in _FIELDS}
            values["cm_updated"] = _aware(values["cm_updated"])
            values["tp_updated"] = _aware(values["tp_updated"])
            found[row.card_id] = StoredSnapshot(
                PriceSnapshot(**values), _aware(row.fetched_at)
            )
    return found


def save_snapshot(
    session: Session, card_id: str, snapshot: PriceSnapshot, now: datetime
) -> None:
    values = {name: getattr(snapshot, name) for name in _FIELDS}
    row = session.get(CardPriceSnapshot, card_id)
    if row is None:
        session.add(CardPriceSnapshot(card_id=card_id, fetched_at=now, **values))
    else:
        for name, value in {**values, "fetched_at": now}.items():
            setattr(row, name, value)
    session.flush()


def get_rates(session: Session) -> StoredRates | None:
    row = session.get(ExchangeRate, RATES_SOURCE)
    if row is None:
        return None
    rates = None
    if row.usd_clp is not None:
        rates = ExchangeRates(
            usd_clp=row.usd_clp,
            eur_per_usd=row.eur_per_usd,
            updated_at=_aware(row.rates_updated_at),
        )
    return StoredRates(rates, _aware(row.fetched_at), _aware(row.last_attempt_at))


def save_rates(session: Session, rates: ExchangeRates, now: datetime) -> None:
    row = session.get(ExchangeRate, RATES_SOURCE) or ExchangeRate(source=RATES_SOURCE)
    row.usd_clp = rates.usd_clp
    row.eur_per_usd = rates.eur_per_usd
    row.rates_updated_at = rates.updated_at
    row.fetched_at = now
    row.last_attempt_at = now
    session.add(row)
    session.flush()


def record_rates_failure(session: Session, now: datetime) -> None:
    """Keep any previous rates; remember the attempt so we back off for 20 minutes."""
    row = session.get(ExchangeRate, RATES_SOURCE) or ExchangeRate(source=RATES_SOURCE)
    row.last_attempt_at = now
    session.add(row)
    session.flush()


def rates_refresh_allowed(stored: StoredRates | None, now: datetime) -> bool:
    if stored is None:
        return True
    if stored.fetched_at is not None and is_fresh(stored.fetched_at, now, RATES_TTL):
        return False
    return now - stored.last_attempt_at >= RATES_RETRY_GAP
