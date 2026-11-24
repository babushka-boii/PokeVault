"""Reference prices. Private totals use only the session owner's copies.

Database work happens in short transactions around (never during) provider calls.
Provider failures degrade per copy; only an unavailable database answers 503.
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.auth.sessions import SESSION_COOKIE, require_current_user
from app.cards.schemas import IDENTIFIER_PATTERN
from app.db.models import Binder, BinderPocket, InventoryCopy, User, UserSettings
from app.prices.api_schemas import (
    BinderValue,
    BinderValues,
    CardPrices,
    CopyPrices,
    TargetCurrency,
    Valuation,
)
from app.prices.service import CopyRef, PriceService

router = APIRouter(prefix="/api/v1", tags=["prices"])
TOP_COPIES = 5
CurrencyParam = Annotated[TargetCurrency | None, Query()]


def get_price_service(request: Request) -> PriceService:
    return request.app.state.price_service


def _factory(request: Request):
    return request.app.state.session_factory


def _read[T](request: Request, load: Callable[..., T]) -> T:
    try:
        with _factory(request).begin() as session:
            return load(session)
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


async def _priced(coroutine):
    try:
        return await coroutine
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


def user_currency(session, user: User) -> TargetCurrency:
    value = session.scalar(
        select(UserSettings.preferred_currency).where(UserSettings.user_id == user.id)
    )
    return value or "CLP"


def _refs(rows) -> list[CopyRef]:
    return [CopyRef(copy_id, card_id, variant) for copy_id, card_id, variant in rows]


_COPY_COLUMNS = (InventoryCopy.id, InventoryCopy.card_id, InventoryCopy.variant)


def _still_signed_in(request: Request, user: User) -> None:
    # A logout or account switch during provider work must not receive the result.
    if require_current_user(request).id != user.id:
        raise HTTPException(401, detail="unauthenticated")


@router.get("/prices/cards/{card_id}", response_model=CardPrices)
async def card_prices(
    request: Request,
    card_id: str = Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100),
    currency: CurrencyParam = None,
    service: PriceService = Depends(get_price_service),
) -> CardPrices:
    if currency is None:
        currency = "CLP"
        if request.cookies.get(SESSION_COOKIE):
            try:
                user = require_current_user(request)
            except HTTPException as error:
                if error.status_code != 401:
                    raise
            else:
                currency = _read(request, lambda session: user_currency(session, user))
    return await _priced(service.card_prices(_factory(request), card_id, currency))


@router.get("/prices/copies", response_model=CopyPrices)
async def copy_prices(
    request: Request,
    copy_id: Annotated[list[UUID], Query(min_length=1, max_length=100)],
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> CopyPrices:
    def load(session):
        rows = session.execute(
            select(*_COPY_COLUMNS).where(
                InventoryCopy.user_id == user.id, InventoryCopy.id.in_(set(copy_id))
            )
        ).all()
        found = {row[0]: row for row in rows}
        ordered = [found[i] for i in dict.fromkeys(copy_id) if i in found]
        return _refs(ordered), currency or user_currency(session, user)

    refs, chosen = _read(request, load)
    result = await _priced(service.copy_prices(_factory(request), refs, chosen))
    _still_signed_in(request, user)
    return result


@router.get("/prices/collection", response_model=Valuation)
async def collection_value(
    request: Request,
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> Valuation:
    def load(session):
        rows = session.execute(
            select(*_COPY_COLUMNS)
            .where(InventoryCopy.user_id == user.id)
            .order_by(InventoryCopy.created_at, InventoryCopy.id)
        ).all()
        return _refs(rows), currency or user_currency(session, user)

    refs, chosen = _read(request, load)
    result = await _priced(
        service.value(_factory(request), refs, chosen, top=TOP_COPIES)
    )
    _still_signed_in(request, user)
    return result


@router.get("/binders/{binder_id}/value", response_model=Valuation)
async def binder_value(
    request: Request,
    binder_id: UUID,
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> Valuation:
    def load(session):
        owned = session.scalar(
            select(Binder.id).where(Binder.id == binder_id, Binder.user_id == user.id)
        )
        if owned is None:
            raise HTTPException(404, detail="Binder not found")
        rows = session.execute(
            select(*_COPY_COLUMNS)
            .join(BinderPocket, BinderPocket.copy_id == InventoryCopy.id)
            .where(
                BinderPocket.binder_id == binder_id,
                BinderPocket.user_id == user.id,
                InventoryCopy.user_id == user.id,
            )
            .order_by(BinderPocket.page, BinderPocket.pocket)
        ).all()
        return _refs(rows), currency or user_currency(session, user)

    refs, chosen = _read(request, load)
    result = await _priced(service.value(_factory(request), refs, chosen, top=0))
    _still_signed_in(request, user)
    return result


@router.get("/prices/binders", response_model=BinderValues)
async def binder_values(
    request: Request,
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> BinderValues:
    """Every owned binder's value from one evaluation (the shelf makes one request)."""

    def load(session):
        binders = session.scalars(
            select(Binder.id)
            .where(Binder.user_id == user.id)
            .order_by(Binder.display_order, Binder.id)
        ).all()
        rows = session.execute(
            select(BinderPocket.binder_id, *_COPY_COLUMNS)
            .join(InventoryCopy, InventoryCopy.id == BinderPocket.copy_id)
            .where(BinderPocket.user_id == user.id, InventoryCopy.user_id == user.id)
            .order_by(BinderPocket.binder_id, BinderPocket.page, BinderPocket.pocket)
        ).all()
        groups = {binder_id: [] for binder_id in binders}
        for binder_id, *copy in rows:
            groups[binder_id].extend(_refs([copy]))
        return groups, currency or user_currency(session, user)

    groups, chosen = _read(request, load)
    values, rates = await _priced(
        service.values_by_group(_factory(request), groups, chosen)
    )
    _still_signed_in(request, user)
    return BinderValues(
        currency=chosen,
        results=[
            BinderValue(
                binder_id=binder_id,
                **value.model_dump(
                    include={
                        "total",
                        "original_totals",
                        "copy_count",
                        "priced_count",
                        "pending_count",
                        "stale_count",
                    }
                ),
            )
            for binder_id, value in values.items()
        ],
        rates=rates.info(),
    )
