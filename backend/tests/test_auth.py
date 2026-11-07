"""Offline endpoint tests: real SQL transactions and signed OIDC ID tokens."""

import hashlib
import time
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import httpx2
import pytest
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import RSAKey
from sqlalchemy import create_engine, select, update
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import Settings
from app.db import models
from app.db.base import Base
from app.main import create_app

ORIGIN = "http://localhost:5173"
CALLBACK = "/api/v1/auth/google/callback"


@pytest.fixture(scope="module")
def signing_key():
    return RSAKey.generate_key(parameters={"kid": "local-google-key"})


@pytest.fixture
def auth_app(signing_key):
    settings = Settings(
        APP_ENV="test",
        DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test",
        GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET="test-secret",
        _env_file=None,
    )
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = create_app(settings)
    app.state.session_factory = factory
    app.state.test_claim_changes = {}
    app.state.test_token_failure = False
    app.state.test_signing_key = signing_key
    app.state.test_nonce = ""
    app.state.test_code_verifier = ""

    def google(request):
        if request.url.path.endswith("/certs"):
            return httpx2.Response(200, json={"keys": [signing_key.as_dict()]})
        if app.state.test_token_failure:
            return httpx2.Response(503, text="secret-provider-error")
        body = parse_qs(request.content.decode())
        app.state.test_code_verifier = body.get("code_verifier", [""])[0]
        now = int(time.time())
        claims = {
            "iss": "https://accounts.google.com",
            "aud": "test-client.apps.googleusercontent.com",
            "sub": "google-subject-123",
            "iat": now,
            "exp": now + 300,
            "nonce": app.state.test_nonce,
            "name": "Trainer Oak",
            "email": "oak@example.test",
            "email_verified": True,
            "picture": "https://lh3.googleusercontent.com/oak",
        }
        claims.update(app.state.test_claim_changes)
        token = jwt.encode(
            {"alg": "RS256", "kid": "local-google-key"},
            claims,
            app.state.test_signing_key,
        )
        return httpx2.Response(
            200,
            json={
                "access_token": "server-only-google-token",
                "token_type": "Bearer",
                "expires_in": 3600,
                "id_token": token,
            },
        )

    # Only the external network boundary is replaced; OAuth and JWT validation run.
    app.state.test_transport = httpx2.MockTransport(google)
    yield app, factory
    engine.dispose()


def client_for(app):
    from app.auth.google import GoogleOIDCClient

    app.state.google_provider = GoogleOIDCClient(
        app.state.settings, transport=app.state.test_transport
    )
    return TestClient(app, follow_redirects=False)


def start(client, app):
    response = client.get(
        "/api/v1/auth/google/login", headers={"Accept": "application/json"}
    )
    assert response.status_code == 200
    query = parse_qs(urlparse(response.json()["authorization_url"]).query)
    app.state.test_nonce = query["nonce"][0]
    return query


def complete(client, app):
    query = start(client, app)
    response = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert response.status_code == 303
    assert response.headers["location"] == ORIGIN + "/profile"
    return response


def test_missing_configuration_fails_safely_without_database():
    app = create_app(
        Settings(
            DATABASE_URL="postgresql+psycopg://unused:secret@localhost/test",
            _env_file=None,
        )
    )
    response = TestClient(app).get(
        "/api/v1/auth/google/login", headers={"Accept": "application/json"}
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "configuration"}
    assert response.headers["cache-control"] == "no-store"


def test_login_requests_minimum_scopes_pkce_and_bound_cookie(auth_app):
    app, factory = auth_app
    client = client_for(app)
    query = start(client, app)
    assert query["scope"] == ["openid email profile"]
    assert query["response_type"] == ["code"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["redirect_uri"] == ["http://localhost:8000" + CALLBACK]
    flow_cookie = client.cookies["pokevault_oauth"]
    with factory() as session:
        transaction = session.scalar(select(models.OAuthTransaction))
        assert transaction.state_digest != query["state"][0]
        assert transaction.browser_digest != flow_cookie
        assert transaction.nonce == query["nonce"][0]
        assert transaction.code_verifier
    response = client.get("/api/v1/auth/google/login")
    assert response.status_code == 303
    assert response.headers["location"].startswith("https://accounts.google.com/")
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert "secure" not in cookie


def test_callback_persists_profile_session_and_restores_me(auth_app):
    app, factory = auth_app
    client = client_for(app)
    response = complete(client, app)
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert response.headers["cache-control"] == "no-store"
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 200
    profile = me.json()
    assert profile["user"] == {
        "id": profile["user"]["id"],
        "display_name": "Trainer Oak",
        "email": "oak@example.test",
        "email_verified": True,
        "picture_url": "https://lh3.googleusercontent.com/oak",
    }
    assert profile["csrf_token"]
    assert "google-subject" not in me.text
    assert "server-only-google-token" not in me.text
    token = client.cookies["pokevault_session"]
    with factory() as session:
        user = session.scalar(select(models.User))
        record = session.scalar(select(models.AuthSession))
        assert user.google_sub == "google-subject-123"
        assert record.token_digest == hashlib.sha256(token.encode()).hexdigest()
        assert session.get(models.UserSettings, user.id).preferred_language == "es"
        assert session.scalar(select(models.OAuthTransaction)) is None
    assert app.state.test_code_verifier


@pytest.mark.parametrize(
    "changes",
    [
        {"nonce": "wrong"},
        {"iss": "https://evil.example"},
        {"aud": "another-client"},
        {"exp": 1},
        {"iat": int(time.time()) + 3600},
        {"sub": ""},
        {"azp": "another-client"},
    ],
)
def test_invalid_signed_claims_never_persist_identity(auth_app, changes):
    app, factory = auth_app
    app.state.test_claim_changes = changes
    client = client_for(app)
    query = start(client, app)
    response = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert response.headers["location"] == ORIGIN + "/login?error=invalid_token"
    with factory() as session:
        assert session.scalar(select(models.User)) is None
        assert session.scalar(select(models.AuthSession)) is None
        assert session.scalar(select(models.OAuthTransaction)) is None


def test_invalid_signature_never_persists_identity(auth_app):
    app, factory = auth_app
    app.state.test_signing_key = RSAKey.generate_key(
        parameters={"kid": "local-google-key"}
    )
    client = client_for(app)
    query = start(client, app)
    response = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert response.headers["location"] == ORIGIN + "/login?error=invalid_token"
    with factory() as session:
        assert session.scalar(select(models.User)) is None


def test_captured_state_cannot_authenticate_a_different_browser(auth_app):
    app, factory = auth_app
    first = client_for(app)
    query = start(first, app)
    attacker = client_for(app)
    response = attacker.get(
        CALLBACK, params={"state": query["state"][0], "code": "code"}
    )
    assert response.headers["location"] == ORIGIN + "/login?error=invalid_state"
    with factory() as session:
        assert session.scalar(select(models.User)) is None
    legitimate = first.get(
        CALLBACK, params={"state": query["state"][0], "code": "code"}
    )
    assert legitimate.headers["location"] == ORIGIN + "/profile"


@pytest.mark.parametrize(
    "failure", ["cancelled", "provider", "missing_code", "expired"]
)
def test_failures_consume_transaction_and_block_replay(auth_app, failure):
    app, factory = auth_app
    client = client_for(app)
    query = start(client, app)
    params = {"state": query["state"][0], "code": "code"}
    expected = "provider_unavailable"
    if failure == "cancelled":
        params = {"state": query["state"][0], "error": "access_denied"}
        expected = "cancelled"
    elif failure == "missing_code":
        params.pop("code")
        expected = "invalid_state"
    elif failure == "expired":
        with factory.begin() as session:
            session.execute(
                update(models.OAuthTransaction).values(
                    expires_at=datetime.now(UTC) - timedelta(seconds=1)
                )
            )
        expected = "invalid_state"
    else:
        app.state.test_token_failure = True
    response = client.get(CALLBACK, params=params)
    assert response.headers["location"] == ORIGIN + "/login?error=" + expected
    replay = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert replay.headers["location"] == ORIGIN + "/login?error=invalid_state"
    with factory() as session:
        assert session.scalar(select(models.OAuthTransaction)) is None
        assert session.scalar(select(models.User)) is None


def test_returning_subject_keeps_id_updates_email_and_rotates_session(auth_app):
    app, factory = auth_app
    client = client_for(app)
    complete(client, app)
    old_token = client.cookies["pokevault_session"]
    original_id = client.get("/api/v1/auth/me").json()["user"]["id"]
    app.state.test_claim_changes = {"email": "changed@example.test", "name": "New name"}
    complete(client, app)
    assert client.cookies["pokevault_session"] != old_token
    me = client.get("/api/v1/auth/me").json()
    assert me["user"]["id"] == original_id
    assert me["user"]["email"] == "changed@example.test"
    with factory() as session:
        assert len(session.scalars(select(models.User)).all()) == 1
        assert len(session.scalars(select(models.AuthSession)).all()) == 1
    stale = client_for(app)
    stale.cookies.set("pokevault_session", old_token)
    assert stale.get("/api/v1/auth/me").status_code == 401


def test_expired_session_is_unauthorized(auth_app):
    app, factory = auth_app
    client = client_for(app)
    complete(client, app)
    with factory.begin() as session:
        session.execute(
            update(models.AuthSession).values(
                expires_at=datetime.now(UTC) - timedelta(seconds=1)
            )
        )
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json() == {"detail": "unauthenticated"}
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "origin,token",
    [
        (None, "valid"),
        ("https://evil.example", "valid"),
        (ORIGIN, None),
        (ORIGIN, "wrong"),
    ],
)
def test_logout_requires_origin_and_session_csrf(auth_app, origin, token):
    app, _ = auth_app
    client = client_for(app)
    complete(client, app)
    csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
    headers = {}
    if origin:
        headers["Origin"] = origin
    if token:
        headers["X-CSRF-Token"] = csrf if token == "valid" else token
    response = client.post("/api/v1/auth/logout", headers=headers)
    assert response.status_code == 403
    assert client.get("/api/v1/auth/me").status_code == 200


def test_logout_invalidates_database_record_and_cookie(auth_app):
    app, factory = auth_app
    client = client_for(app)
    complete(client, app)
    token = client.cookies["pokevault_session"]
    csrf = client.get("/api/v1/auth/me").json()["csrf_token"]
    response = client.post(
        "/api/v1/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
    )
    assert response.status_code == 204
    assert not response.content
    assert "pokevault_session" not in client.cookies
    with factory() as session:
        assert session.scalar(select(models.AuthSession)) is None
    client.cookies.set("pokevault_session", token)
    assert client.get("/api/v1/auth/me").status_code == 401


def test_cors_credentials_require_exact_trusted_origin(auth_app):
    app, _ = auth_app
    client = client_for(app)
    response = client.options(
        "/api/v1/auth/logout",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "X-CSRF-Token",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-credentials"] == "true"
    assert response.headers["access-control-allow-origin"] == ORIGIN
    rejected = client.options(
        "/api/v1/auth/logout",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert rejected.status_code == 400


def test_successful_callback_is_single_use(auth_app):
    app, factory = auth_app
    client = client_for(app)
    query = start(client, app)
    params = {"state": query["state"][0], "code": "one-use-code"}
    first = client.get(CALLBACK, params=params)
    assert first.headers["location"] == ORIGIN + "/profile"
    second = client.get(CALLBACK, params=params)
    assert second.headers["location"] == ORIGIN + "/login?error=invalid_state"
    with factory() as session:
        assert len(session.scalars(select(models.AuthSession)).all()) == 1


def test_authorization_exchange_uses_matching_pkce_verifier(auth_app):
    import base64

    app, _ = auth_app
    client = client_for(app)
    query = start(client, app)
    response = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert response.headers["location"] == ORIGIN + "/profile"
    actual_challenge = (
        base64.urlsafe_b64encode(
            hashlib.sha256(app.state.test_code_verifier.encode()).digest()
        )
        .rstrip(b"=")
        .decode()
    )
    assert actual_challenge == query["code_challenge"][0]


def test_cross_session_csrf_token_is_rejected(auth_app):
    app, _ = auth_app
    first = client_for(app)
    complete(first, app)
    other_csrf = first.get("/api/v1/auth/me").json()["csrf_token"]
    second = client_for(app)
    complete(second, app)
    response = second.post(
        "/api/v1/auth/logout",
        headers={"Origin": ORIGIN, "X-CSRF-Token": other_csrf},
    )
    assert response.status_code == 403
    assert second.get("/api/v1/auth/me").status_code == 200


@pytest.mark.parametrize("endpoint", ["login", "callback", "me", "logout"])
def test_database_errors_are_sanitized(auth_app, endpoint):
    from sqlalchemy.exc import OperationalError

    app, _ = auth_app
    client = client_for(app)
    if endpoint in {"me", "logout"}:
        complete(client, app)
    elif endpoint == "callback":
        query = start(client, app)

    class UnavailableDatabase:
        def __call__(self):
            raise OperationalError("secret-sql", {}, Exception("secret-db-password"))

        def begin(self):
            return self()

    app.state.session_factory = UnavailableDatabase()
    if endpoint == "login":
        response = client.get(
            "/api/v1/auth/google/login", headers={"Accept": "application/json"}
        )
    elif endpoint == "callback":
        response = client.get(
            CALLBACK, params={"state": query["state"][0], "code": "code"}
        )
    elif endpoint == "logout":
        response = client.post("/api/v1/auth/logout", headers={"Origin": ORIGIN})
    else:
        response = client.get("/api/v1/auth/me")
    if endpoint == "callback":
        assert (
            response.headers["location"] == ORIGIN + "/login?error=database_unavailable"
        )
    else:
        assert response.status_code == 503
        assert response.json() == {"detail": "database_unavailable"}
    assert "secret-" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_production_cookies_are_secure_and_redirects_fixed(auth_app):
    app, _ = auth_app
    app.state.settings = Settings(
        APP_ENV="production",
        DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test",
        GOOGLE_CLIENT_ID="test-client.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET="test-secret",
        FRONTEND_ORIGIN="https://app.example",
        GOOGLE_REDIRECT_URI="https://api.example" + CALLBACK,
        CORS_ORIGINS=("https://app.example",),
        _env_file=None,
    )
    from app.auth.google import GoogleOIDCClient

    app.state.google_provider = GoogleOIDCClient(
        app.state.settings, transport=app.state.test_transport
    )
    client = TestClient(app, base_url="https://api.example", follow_redirects=False)
    response = client.get(
        "/api/v1/auth/google/login",
        params={"redirect_uri": "https://evil.example", "next": "https://evil.example"},
        headers={"Accept": "application/json"},
    )
    assert "Secure" in response.headers["set-cookie"]
    query = parse_qs(urlparse(response.json()["authorization_url"]).query)
    assert query["redirect_uri"] == ["https://api.example" + CALLBACK]
    app.state.test_nonce = query["nonce"][0]
    response = client.get(
        CALLBACK,
        params={
            "state": query["state"][0],
            "code": "code",
            "next": "https://evil.example",
        },
    )
    assert response.headers["location"] == "https://app.example/profile"
    assert all("Secure" in cookie for cookie in response.headers.get_list("set-cookie"))
    assert "Path=/api/v1;" in response.headers["set-cookie"]
    assert client.get("/api/v1/auth/me").status_code == 200


def test_callback_query_is_redacted_before_server_access_logging(auth_app):
    import asyncio

    app, _ = auth_app
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "GET",
        "scheme": "http",
        "path": CALLBACK,
        "raw_path": CALLBACK.encode(),
        "root_path": "",
        "query_string": b"code=private-code&state=private-state",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("localhost", 8000),
    }
    events = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        if message["type"] == "http.response.start":
            # Uvicorn logs at this same boundary.
            assert scope["query_string"] == b""
        events.append(message)

    asyncio.run(app(scope, receive, send))
    headers = dict(events[0]["headers"])
    assert headers[b"referrer-policy"] == b"no-referrer"
    assert headers[b"cache-control"] == b"no-store"


def test_non_ascii_csrf_header_is_safely_rejected(auth_app):
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.auth.sessions import require_csrf

    app, _ = auth_app
    scope = {
        "type": "http",
        "app": app,
        "headers": [
            (b"origin", ORIGIN.encode()),
            (b"x-csrf-token", b"\xff"),
            (b"cookie", b"pokevault_session=opaque-token"),
        ],
    }
    request = Request(scope)
    with pytest.raises(HTTPException) as captured:
        require_csrf(request, models.User())
    assert captured.value.status_code == 403


@pytest.mark.parametrize(
    "picture",
    [
        "https://[broken",
        "https://example.test:notaport/pic",
        "https://:password@example.test/pic",
        "https://bad host/pic",
    ],
)
def test_malformed_optional_picture_does_not_break_authentication(auth_app, picture):
    app, _ = auth_app
    app.state.test_claim_changes = {"picture": picture}
    client = client_for(app)
    complete(client, app)
    profile = client.get("/api/v1/auth/me").json()["user"]
    assert profile["picture_url"] is None


@pytest.mark.parametrize(
    "token_payload,key_payload,expected",
    [
        ([], None, "provider_unavailable"),
        (None, None, "provider_unavailable"),
        (
            {"error": "invalid_grant", "error_description": "secret"},
            None,
            "provider_unavailable",
        ),
        (
            {"access_token": "only-access", "token_type": "Bearer"},
            "valid",
            "invalid_token",
        ),
        ("signed", [], "invalid_token"),
        ("signed", None, "provider_unavailable"),
    ],
)
def test_malformed_provider_responses_are_sanitized(
    auth_app, token_payload, key_payload, expected
):
    app, factory = auth_app
    client = client_for(app)
    normal_transport = app.state.test_transport

    async def malformed(request):
        if request.url.path.endswith("/certs"):
            if key_payload == "valid":
                return await normal_transport.handle_async_request(request)
            return httpx2.Response(200, json=key_payload)
        if token_payload == "signed":
            return await normal_transport.handle_async_request(request)
        return httpx2.Response(200, json=token_payload)

    from app.auth.google import GoogleOIDCClient

    app.state.google_provider = GoogleOIDCClient(
        app.state.settings, transport=httpx2.MockTransport(malformed)
    )
    query = start(client, app)
    response = client.get(CALLBACK, params={"state": query["state"][0], "code": "code"})
    assert response.headers["location"] == ORIGIN + "/login?error=" + expected
    assert response.headers["cache-control"] == "no-store"
    with factory() as session:
        assert session.scalar(select(models.User)) is None
        assert session.scalar(select(models.AuthSession)) is None


def test_callback_query_is_redacted_when_route_raises():
    import asyncio

    from app.auth.middleware import AuthenticationPrivacyMiddleware

    scope = {
        "type": "http",
        "path": CALLBACK,
        "query_string": b"code=secret&state=secret",
    }

    async def broken_app(scope, receive, send):
        raise RuntimeError("internal")

    async def receive():
        return {"type": "http.request"}

    async def send(message):
        pass

    with pytest.raises(RuntimeError):
        asyncio.run(AuthenticationPrivacyMiddleware(broken_app)(scope, receive, send))
    assert scope["query_string"] == b""
