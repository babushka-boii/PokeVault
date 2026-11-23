"""Per-account display preferences. The owner always comes from the session."""

from fastapi import APIRouter, Depends

from app.api.inventory import database
from app.api.prices import user_currency
from app.auth.sessions import require_csrf, require_current_user
from app.db.models import User, UserSettings
from app.prices.api_schemas import CurrencySettings

router = APIRouter(prefix="/api/v1/me", tags=["settings"])


@router.get("/settings", response_model=CurrencySettings)
def read_settings(
    user: User = Depends(require_current_user), session=Depends(database)
) -> CurrencySettings:
    return CurrencySettings(preferred_currency=user_currency(session, user))


@router.put("/settings", response_model=CurrencySettings)
def update_settings(
    payload: CurrencySettings,
    user: User = Depends(require_csrf),
    session=Depends(database),
) -> CurrencySettings:
    record = session.get(UserSettings, user.id)
    if record is None:  # sign-in normally creates it; tolerate older accounts
        record = UserSettings(user_id=user.id)
        session.add(record)
    record.preferred_currency = payload.preferred_currency
    session.commit()
    return CurrencySettings(preferred_currency=record.preferred_currency)
