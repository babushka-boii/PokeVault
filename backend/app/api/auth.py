"""Google sign-in, persistent identities, and server-owned application sessions."""

import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, HttpUrl
from sqlalchemy import delete, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import SQLAlchemyError

from app.auth.google import InvalidIdentity, ProviderUnavailable
from app.auth.sessions import (
    FLOW_COOKIE,
    SESSION_COOKIE,
    csrf_token,
    require_csrf,
    require_current_user,
    token_digest,
    utc,
)
from app.db.models import AuthSession, OAuthTransaction, User, UserSettings

router = APIRouter(prefix="/api/v1/auth", tags=["authentication"])
SESSION_PATH = "/api/v1"
FLOW_PATH = "/api/v1/auth"


class PublicUser(BaseModel):
    id: UUID
    display_name: str
    email: str | None
    email_verified: bool
    picture_url: str | None


class CurrentUserResponse(BaseModel):
    user: PublicUser
    csrf_token: str


def set_cookie(response: Response, name: str, value: str, ttl: int, request: Request):
    response.set_cookie(
        name,
        value,
        max_age=ttl,
        httponly=True,
        secure=request.app.state.settings.auth_cookie_secure,
        samesite="lax",
        path=SESSION_PATH if name == SESSION_COOKIE else FLOW_PATH,
    )


def clear_cookie(response: Response, name: str, request: Request):
    response.delete_cookie(
        name,
        path=SESSION_PATH if name == SESSION_COOKIE else FLOW_PATH,
        secure=request.app.state.settings.auth_cookie_secure,
        httponly=True,
        samesite="lax",
    )


def callback_error(request: Request, code: str) -> RedirectResponse:
    response = RedirectResponse(
        request.app.state.settings.frontend_origin + "/login?error=" + code,
        status_code=303,
    )
    clear_cookie(response, FLOW_COOKIE, request)
    return response


def login_error(request: Request, code: str) -> Response:
    if "application/json" in request.headers.get("accept", ""):
        return JSONResponse(status_code=503, content={"detail": code})
    return callback_error(request, code)


@router.get("/google/login")
def google_login(request: Request) -> Response:
    settings = request.app.state.settings
    if not settings.google_configured:
        return login_error(request, "configuration")
    state = secrets.token_urlsafe(32)
    browser = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    now = datetime.now(UTC)
    try:
        with request.app.state.session_factory.begin() as session:
            session.execute(
                delete(OAuthTransaction).where(OAuthTransaction.expires_at <= now)
            )
            # A browser starts one active flow; repeated clicks replace it safely.
            previous_browser = request.cookies.get(FLOW_COOKIE)
            if previous_browser:
                session.execute(
                    delete(OAuthTransaction).where(
                        OAuthTransaction.browser_digest
                        == token_digest(previous_browser)
                    )
                )
            session.add(
                OAuthTransaction(
                    state_digest=token_digest(state),
                    browser_digest=token_digest(browser),
                    nonce=nonce,
                    code_verifier=verifier,
                    expires_at=now
                    + timedelta(seconds=settings.auth_transaction_ttl_seconds),
                )
            )
    except SQLAlchemyError:
        return login_error(request, "database_unavailable")
    url = request.app.state.google_provider.authorization_url(state, nonce, verifier)
    if "application/json" in request.headers.get("accept", ""):
        response = JSONResponse({"authorization_url": url})
    else:
        response = RedirectResponse(url, status_code=303)
    set_cookie(
        response, FLOW_COOKIE, browser, settings.auth_transaction_ttl_seconds, request
    )
    return response


def clean_profile(claims: dict) -> dict:
    def text(name: str, limit: int) -> str | None:
        value = claims.get(name)
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > limit:
            raise InvalidIdentity
        return value

    verified = claims.get("email_verified", False)
    if not isinstance(verified, bool):
        raise InvalidIdentity
    picture = text("picture", 2048)
    if picture:
        try:
            parsed = HttpUrl(picture)
            if (
                parsed.scheme != "https"
                or parsed.username is not None
                or parsed.password is not None
            ):
                picture = None
            else:
                picture = str(parsed)
        except ValueError:
            picture = None
    return {
        "google_sub": claims["sub"],
        "display_name": text("name", 255) or "",
        "email": text("email", 320),
        "email_verified": verified,
        "picture_url": picture,
    }


@router.get("/google/callback")
async def google_callback(request: Request) -> Response:
    settings = request.app.state.settings
    state = request.query_params.get("state", "")
    browser = request.cookies.get(FLOW_COOKIE, "")
    if not state or not browser or len(state) > 128 or len(browser) > 128:
        return callback_error(request, "invalid_state")
    try:
        # DELETE RETURNING is atomic on PostgreSQL. Commit before any network call:
        # concurrent callbacks and failures cannot reuse this authorization grant.
        with request.app.state.session_factory.begin() as session:
            transaction = session.scalar(
                delete(OAuthTransaction)
                .where(
                    OAuthTransaction.state_digest == token_digest(state),
                    OAuthTransaction.browser_digest == token_digest(browser),
                )
                .returning(OAuthTransaction)
            )
    except SQLAlchemyError:
        return callback_error(request, "database_unavailable")
    if transaction is None or utc(transaction.expires_at) <= datetime.now(UTC):
        return callback_error(request, "invalid_state")
    if not settings.google_configured:
        return callback_error(request, "configuration")
    if request.query_params.get("error"):
        code = (
            "cancelled"
            if request.query_params["error"] == "access_denied"
            else "provider_unavailable"
        )
        return callback_error(request, code)
    code = request.query_params.get("code")
    if not code or len(code) > 4096:
        return callback_error(request, "invalid_state")
    try:
        claims = await request.app.state.google_provider.identity(
            code, transaction.nonce, transaction.code_verifier
        )
        profile = clean_profile(claims)
    except InvalidIdentity:
        return callback_error(request, "invalid_token")
    except ProviderUnavailable:
        return callback_error(request, "provider_unavailable")
    token = secrets.token_urlsafe(32)
    now = datetime.now(UTC)
    try:
        with request.app.state.session_factory.begin() as session:
            # DB uniqueness serializes simultaneous first logins of the same sub.
            statement = insert(User).values(id=uuid4(), **profile)
            user = session.scalar(
                statement.on_conflict_do_update(
                    index_elements=[User.google_sub],
                    set_={
                        key: value
                        for key, value in profile.items()
                        if key != "google_sub"
                    }
                    | {"updated_at": func.now()},
                ).returning(User)
            )
            session.execute(
                insert(UserSettings)
                .values(user_id=user.id, preferred_language="es")
                .on_conflict_do_nothing(index_elements=[UserSettings.user_id])
            )
            old_token = request.cookies.get(SESSION_COOKIE)
            if old_token:
                session.execute(
                    delete(AuthSession).where(
                        AuthSession.token_digest == token_digest(old_token)
                    )
                )
            session.execute(delete(AuthSession).where(AuthSession.expires_at <= now))
            session.add(
                AuthSession(
                    token_digest=token_digest(token),
                    user_id=user.id,
                    expires_at=now
                    + timedelta(seconds=settings.auth_session_ttl_seconds),
                )
            )
    except SQLAlchemyError:
        return callback_error(request, "database_unavailable")
    response = RedirectResponse(settings.frontend_origin + "/profile", status_code=303)
    clear_cookie(response, FLOW_COOKIE, request)
    set_cookie(
        response, SESSION_COOKIE, token, settings.auth_session_ttl_seconds, request
    )
    return response


@router.get("/me", response_model=CurrentUserResponse)
def me(
    request: Request, user: User = Depends(require_current_user)
) -> CurrentUserResponse:
    return CurrentUserResponse(
        user=PublicUser(
            id=user.id,
            display_name=user.display_name,
            email=user.email,
            email_verified=user.email_verified,
            picture_url=user.picture_url,
        ),
        csrf_token=csrf_token(request.cookies[SESSION_COOKIE]),
    )


@router.post("/logout", status_code=204)
def logout(request: Request, user: User = Depends(require_csrf)) -> Response:
    try:
        with request.app.state.session_factory.begin() as session:
            session.execute(
                delete(AuthSession).where(
                    AuthSession.token_digest
                    == token_digest(request.cookies[SESSION_COOKIE])
                )
            )
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="database_unavailable") from None
    response = Response(status_code=204)
    clear_cookie(response, SESSION_COOKIE, request)
    return response
