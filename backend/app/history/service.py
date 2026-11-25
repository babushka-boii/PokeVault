"""Lazy daily records of a user's collection value.

A record is made the first time the day's history is read, only when the valuation is
complete (nothing pending) and the collection is not empty. It is never rewritten that
day. Rates are used only to store both converted totals; they are never returned.
"""

import logging
from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.db.models import CollectionValueDay, InventoryCopy, User
from app.history.schemas import BASELINE_DAYS, RANGE_DAYS, History, ValuePoint
from app.prices.api_schemas import TargetCurrency
from app.prices.service import CopyRef, PriceService

logger = logging.getLogger(__name__)


def local_day(now: datetime, zone: str) -> date:
    return now.astimezone(ZoneInfo(zone)).date()


def _money(currency: str, value: Decimal) -> str:
    return f"{value:.0f}" if currency == "CLP" else f"{value:.2f}"


async def ensure_today(service: PriceService, factory, user: User, today: date) -> None:
    """Record today's value if it is missing and can be recorded completely."""
    with factory.begin() as session:
        if session.get(CollectionValueDay, (user.id, today)) is not None:
            return
        rows = session.execute(
            select(InventoryCopy.id, InventoryCopy.card_id, InventoryCopy.variant)
            .where(InventoryCopy.user_id == user.id)
            .order_by(InventoryCopy.created_at, InventoryCopy.id)
        ).all()
    refs = [CopyRef(copy_id, card_id, variant) for copy_id, card_id, variant in rows]
    if not refs:
        return
    clp = await service.value(factory, refs, "CLP", top=0)
    usd = await service.value(factory, refs, "USD", top=0)
    # A provider outage or a price still loading would make the total look lower than
    # it is: a made-up point. Store nothing; the next load tries again.
    transient = {"pending", "source_unavailable"}
    if transient & set(clp.unpriced_by_reason) or transient & set(
        usd.unpriced_by_reason
    ):
        return
    rates = (await service.rates(factory)).rates
    converted = clp.total is not None and usd.total is not None and rates is not None
    originals = clp.original_totals
    record = CollectionValueDay(
        user_id=user.id,
        day=today,
        eur_total=Decimal(originals.get("EUR", "0")),
        usd_original_total=Decimal(originals.get("USD", "0")),
        clp_total=Decimal(clp.total) if converted else None,
        usd_total=Decimal(usd.total) if converted else None,
        usd_clp=rates.usd_clp if converted else None,
        eur_per_usd=rates.eur_per_usd if converted else None,
        copy_count=clp.copy_count,
        priced_count=clp.priced_count,
    )
    try:
        with factory.begin() as session:
            session.add(record)
    except IntegrityError:
        pass  # another request recorded the same day first
    except SQLAlchemyError:
        logger.warning("Could not store the daily collection value")


def read_history(
    session, user: User, today: date, currency: TargetCurrency, span: str
) -> History:
    column = (
        CollectionValueDay.clp_total
        if currency == "CLP"
        else CollectionValueDay.usd_total
    )
    owner = CollectionValueDay.user_id == user.id
    from datetime import timedelta

    since = today - timedelta(days=RANGE_DAYS[span])
    rows = session.execute(
        select(CollectionValueDay.day, column)
        .where(owner, CollectionValueDay.day >= since, column.is_not(None))
        .order_by(CollectionValueDay.day)
    ).all()
    base = session.execute(
        select(CollectionValueDay.day, column)
        .where(
            owner,
            CollectionValueDay.day <= today - timedelta(days=BASELINE_DAYS),
            column.is_not(None),
        )
        .order_by(CollectionValueDay.day.desc())
        .limit(1)
    ).first()
    started = session.scalar(select(func.min(CollectionValueDay.day)).where(owner))
    return History(
        currency=currency,
        range=span,
        started_on=started,
        points=[
            ValuePoint(day=day, total=_money(currency, total)) for day, total in rows
        ],
        baseline=None
        if base is None
        else ValuePoint(day=base[0], total=_money(currency, base[1])),
    )
