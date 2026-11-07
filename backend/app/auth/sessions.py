"""Opaque cookie identity; future private APIs depend on require_current_user."""

import hashlib
import hmac
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.db.models import AuthSession, User

SESSION_COOKIE = "pokevault_session"
FLOW_COOKIE = "pokevault_oauth"


def token_digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_token(token: str) -> str:
    return hmac.new(token.encode(), b"pokevault.csrf.v1", hashlib.sha256).hexdigest()


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def require_current_user(request: Request) -> User:
    """Derive ownership from the session; never accept a request's user ID."""
    token = request.cookies.get(SESSION_COOKIE, "")
    if not token or len(token) > 128:
        raise HTTPException(status_code=401, detail="unauthenticated")
    try:
        with request.app.state.session_factory() as session:
            record = session.get(AuthSession, token_digest(token))
            if record is None or utc(record.expires_at) <= datetime.now(UTC):
                raise HTTPException(status_code=401, detail="unauthenticated")
            user = session.scalar(select(User).where(User.id == record.user_id))
            if user is None:
                raise HTTPException(status_code=401, detail="unauthenticated")
            return user
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="database_unavailable") from None


def require_csrf(request: Request, user: User = Depends(require_current_user)) -> User:
    if request.headers.get("origin") not in request.app.state.settings.cors_origins:
        raise HTTPException(status_code=403, detail="invalid_csrf")
    provided = request.headers.get("x-csrf-token", "")
    expected = csrf_token(request.cookies[SESSION_COOKIE])
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="invalid_csrf")
    return user
