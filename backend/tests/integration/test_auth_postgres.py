"""Exercise real migrations and identity constraints in an isolated test schema."""

import hashlib
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from pathlib import Path
from threading import Barrier
from urllib.parse import parse_qs, urlsplit

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError

from app.core.config import Settings, get_settings
from app.db.base import create_session_factory
from app.db.models import AuthSession, User, UserSettings
from app.main import create_app

from .test_postgres import integration_url


@pytest.fixture
def auth_database(monkeypatch):
    database_url = integration_url()
    schema = f"auth_test_{uuid.uuid4().hex}"
    engine = create_engine(database_url)
    with engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    scoped_url = (
        make_url(database_url)
        .update_query_dict({"options": f"-csearch_path={schema}"})
        .render_as_string(hide_password=False)
    )
    monkeypatch.setenv("DATABASE_URL", scoped_url)
    get_settings.cache_clear()
    config = Config(Path(__file__).parents[2] / "alembic.ini")
    config.set_main_option(
        "script_location", str(Path(__file__).parents[2] / "migrations")
    )
    factory = create_session_factory(scoped_url)
    try:
        command.upgrade(config, "head")
        yield factory, config
    finally:
        factory.kw["bind"].dispose()
        get_settings.cache_clear()
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        engine.dispose()


def test_auth_migration_is_reversible_without_removing_metadata(auth_database):
    factory, config = auth_database
    with factory() as session:
        tables = inspect(session.get_bind()).get_table_names()
        assert {
            "app_metadata",
            "users",
            "user_settings",
            "auth_sessions",
            "oauth_transactions",
        }.issubset(tables)
    command.downgrade(config, "0001")
    with factory() as session:
        tables = inspect(session.get_bind()).get_table_names()
        assert "app_metadata" in tables
        assert "users" not in tables
    command.upgrade(config, "head")
    with factory() as session:
        assert "users" in inspect(session.get_bind()).get_table_names()


def test_identity_persists_and_email_changes_keep_internal_id(auth_database):
    factory, _ = auth_database
    with factory.begin() as session:
        user = User(
            google_sub="stable-google-sub",
            display_name="Trainer",
            email="old@example.test",
            email_verified=True,
        )
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(UserSettings(user_id=user_id))
    with factory.begin() as session:
        user = session.scalar(
            select(User).where(User.google_sub == "stable-google-sub")
        )
        assert user is not None
        assert user.id == user_id
        user.email = "new@example.test"
    with factory() as session:
        user = session.get(User, user_id)
        assert user.email == "new@example.test"
        assert user.created_at.tzinfo is not None
        assert session.get(UserSettings, user_id).preferred_language == "es"


def test_subject_uniqueness_and_settings_foreign_key_enforced(auth_database):
    factory, _ = auth_database
    with factory.begin() as session:
        session.add(User(google_sub="unique-sub", display_name="Original"))
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(User(google_sub="unique-sub", display_name="Duplicate"))
        session.flush()
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(UserSettings(user_id=uuid.uuid4()))
        session.flush()
    with factory() as session:
        assert len(session.scalars(select(User)).all()) == 1


def test_session_records_use_digests_and_cascade_with_user(auth_database):
    factory, _ = auth_database
    digest = "a" * 64
    with factory.begin() as session:
        user = User(google_sub="session-sub", display_name="Trainer")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(
            AuthSession(
                token_digest=digest,
                user_id=user_id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
    with factory() as session:
        record = session.get(AuthSession, digest)
        assert record is not None
        assert record.user_id == user_id
        assert record.expires_at.tzinfo is not None
        columns = {
            column["name"]
            for column in inspect(session.get_bind()).get_columns("auth_sessions")
        }
        assert "token_digest" in columns
        assert not {"token", "access_token", "refresh_token"} & columns
    with factory.begin() as session:
        session.delete(session.get(User, user_id))
    with factory() as session:
        assert session.get(AuthSession, digest) is None


def test_concurrent_callbacks_create_one_session_and_returning_login_keeps_id(
    auth_database, monkeypatch
):
    """Exercise real PostgreSQL callbacks; mock only verified Google identity."""
    factory, _ = auth_database
    settings = Settings(
        DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
        GOOGLE_CLIENT_ID="integration-client",
        GOOGLE_CLIENT_SECRET="integration-placeholder",
        _env_file=None,
    )
    app = create_app(settings)
    app.state.session_factory.kw["bind"].dispose()
    app.state.session_factory = factory
    profile = {
        "sub": "concurrent-stable-sub",
        "name": "Real database test",
        "email": "first@example.test",
        "email_verified": True,
    }
    exchanges = []

    async def identity(code, nonce, verifier):
        exchanges.append(code)
        assert nonce and verifier
        return dict(profile)

    monkeypatch.setattr(app.state.google_provider, "identity", identity)
    with TestClient(
        app, base_url="http://localhost:8000", follow_redirects=False
    ) as client:
        login = client.get(
            "/api/v1/auth/google/login", headers={"Accept": "application/json"}
        )
        state = parse_qs(urlsplit(login.json()["authorization_url"]).query)["state"][0]
        browser = client.cookies["pokevault_oauth"]
    barrier = Barrier(2)

    def callback(_):
        with TestClient(
            app,
            base_url="http://localhost:8000",
            cookies={"pokevault_oauth": browser},
            follow_redirects=False,
        ) as client:
            barrier.wait(timeout=10)
            return client.get(
                "/api/v1/auth/google/callback", params={"state": state, "code": "once"}
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(callback, range(2)))
    locations = sorted(response.headers["location"] for response in responses)
    assert locations == [
        "http://localhost:5173/login?error=invalid_state",
        "http://localhost:5173/profile",
    ]
    assert exchanges == ["once"]
    winner = next(
        response
        for response in responses
        if response.headers["location"].endswith("/profile")
    )
    old_token = winner.cookies["pokevault_session"]
    with TestClient(
        app,
        base_url="http://localhost:8000",
        follow_redirects=False,
    ) as client:
        client.cookies.update(winner.cookies)
        first_id = client.get("/api/v1/auth/me").json()["user"]["id"]
        profile["email"] = "changed@example.test"
        login = client.get(
            "/api/v1/auth/google/login", headers={"Accept": "application/json"}
        )
        state = parse_qs(urlsplit(login.json()["authorization_url"]).query)["state"][0]
        callback_response = client.get(
            "/api/v1/auth/google/callback", params={"state": state, "code": "return"}
        )
        assert callback_response.headers["location"].endswith("/profile")
        me = client.get("/api/v1/auth/me")
        assert me.json()["user"]["id"] == first_id
        assert me.json()["user"]["email"] == "changed@example.test"
        with factory() as session:
            assert (
                session.get(AuthSession, hashlib.sha256(old_token.encode()).hexdigest())
                is None
            )
        logout = client.post(
            "/api/v1/auth/logout",
            headers={
                "Origin": "http://localhost:5173",
                "X-CSRF-Token": me.json()["csrf_token"],
            },
        )
        assert logout.status_code == 204
        assert client.get("/api/v1/auth/me").status_code == 401
    with factory() as session:
        assert len(session.scalars(select(User)).all()) == 1
        assert len(session.scalars(select(UserSettings)).all()) == 1
        assert not session.scalars(select(AuthSession)).all()
