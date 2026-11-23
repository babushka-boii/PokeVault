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
from app.db.models import BoxMembership, InventoryCopy, PersonalBox, User, UserSettings
from app.prices.api_schemas import CardPrices, CopyPrices, TargetCurrency, Valuation
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


@router.get("/boxes/{box_id}/value", response_model=Valuation)
async def box_value(
    request: Request,
    box_id: UUID,
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> Valuation:
    def load(session):
        owned = session.scalar(
            select(PersonalBox.id).where(
                PersonalBox.id == box_id, PersonalBox.user_id == user.id
            )
        )
        if owned is None:
            raise HTTPException(404, detail="Box not found")
        rows = session.execute(
            select(*_COPY_COLUMNS)
            .join(BoxMembership, BoxMembership.copy_id == InventoryCopy.id)
            .where(
                BoxMembership.box_id == box_id,
                BoxMembership.user_id == user.id,
                InventoryCopy.user_id == user.id,
            )
            .order_by(BoxMembership.position)
        ).all()
        return _refs(rows), currency or user_currency(session, user)

    refs, chosen = _read(request, load)
    result = await _priced(service.value(_factory(request), refs, chosen, top=0))
    _still_signed_in(request, user)
    return result
