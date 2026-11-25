"""Collection value over time and the new-user guide (Home)."""

import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.api.favorites import database
from app.api.prices import (
    CurrencyParam,
    _factory,
    _read,
    _still_signed_in,
    get_price_service,
    user_currency,
)
from app.auth.sessions import require_csrf, require_current_user
from app.db.models import (
    BinderPocket,
    CardFavorite,
    InventoryCopy,
    User,
    UserSettings,
)
from app.history.schemas import GuideClose, GuideState, History, HistoryRange
from app.history.service import ensure_today, local_day, read_history
from app.prices.service import PriceService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["home"])


@router.get("/collection/history", response_model=History)
async def collection_history(
    request: Request,
    range: HistoryRange = "30d",  # noqa: A002 - the public query name
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> History:
    factory = _factory(request)
    today = local_day(service.now(), request.app.state.settings.home_timezone)
    try:
        await ensure_today(service, factory, user, today)
    except SQLAlchemyError:
        logger.warning("Could not record today's collection value")
    except Exception:  # noqa: BLE001 - a pricing hiccup never hides recorded history
        logger.warning("Could not value the collection for today's record")
    _still_signed_in(request, user)

    def load(session):
        chosen = currency or user_currency(session, user)
        return read_history(session, user, today, chosen, range)

    return _read(request, load)


def _guide(session, user: User) -> GuideState:
    def exists(query) -> bool:
        return session.scalar(select(query.exists())) is True

    state = {
        "has_copy": exists(
            select(InventoryCopy.id).where(InventoryCopy.user_id == user.id)
        ),
        "has_stored": exists(
            select(BinderPocket.copy_id).where(BinderPocket.user_id == user.id)
        ),
        "has_favorite": exists(
            select(CardFavorite.card_id).where(CardFavorite.user_id == user.id)
        ),
    }
    record = session.get(UserSettings, user.id)
    dismissed = record is not None and record.home_guide_dismissed_at is not None
    if not dismissed and all(state.values()):
        record = _settings(session, user)
        record.home_guide_dismissed_at = _now(session)
        dismissed = True
    return GuideState(**state, dismissed=dismissed)


def _settings(session, user: User) -> UserSettings:
    record = session.get(UserSettings, user.id)
    if record is None:
        record = UserSettings(user_id=user.id)
        session.add(record)
    return record


def _now(session):
    from datetime import UTC, datetime

    return datetime.now(UTC)


@router.get("/home/guide", response_model=GuideState)
def read_guide(
    user: User = Depends(require_current_user), session=Depends(database)
) -> GuideState:
    return _guide(session, user)


@router.put("/home/guide", response_model=GuideState)
def close_guide(
    _: GuideClose,
    user: User = Depends(require_csrf),
    session=Depends(database),
) -> GuideState:
    record = _settings(session, user)
    if record.home_guide_dismissed_at is None:
        record.home_guide_dismissed_at = _now(session)
    session.flush()
    return _guide(session, user)
