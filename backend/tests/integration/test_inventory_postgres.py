"""Real migration, persistence, constraints and user deletion behavior."""

from datetime import date

import pytest
from alembic import command
from sqlalchemy import inspect, select
from sqlalchemy.exc import IntegrityError

from app.db.models import InventoryCopy, User

from . import test_auth_postgres

inventory_database = test_auth_postgres.auth_database


def test_inventory_migration_persistence_constraints_and_rollback(inventory_database):
    factory, config = inventory_database
    with factory.begin() as session:
        user = User(google_sub="inventory-owner", display_name="Trainer")
        session.add(user)
        session.flush()
        user_id = user.id
        first = InventoryCopy(
            user_id=user_id,
            card_id="base1-4",
            condition="mint",
            language="ja",
            variant="holo",
            acquired_on=date(2026, 10, 1),
            notes="Keep",
        )
        second = InventoryCopy(
            user_id=user_id,
            card_id="base1-4",
            condition="played",
            language="en",
            variant="normal",
            notes="Trade later",
        )
        session.add_all([first, second])
        session.flush()
        first_id = first.id
    with factory() as session:
        assert len(session.scalars(select(InventoryCopy)).all()) == 2
        record = session.get(InventoryCopy, first_id)
        assert record.notes == "Keep"
        assert record.acquired_on == date(2026, 10, 1)
        assert record.created_at.tzinfo is not None
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            InventoryCopy(
                user_id=user_id,
                card_id="base1-4",
                condition="fake",
                language="en",
                variant="normal",
                notes="",
            )
        )
        session.flush()
    with factory.begin() as session:
        session.delete(session.get(User, user_id))
    with factory() as session:
        assert not session.scalars(select(InventoryCopy)).all()
    command.downgrade(config, "0002")
    with factory() as session:
        tables = inspect(session.get_bind()).get_table_names()
        assert "inventory_copies" not in tables
        assert "users" in tables and "auth_sessions" in tables
    command.upgrade(config, "head")
    with factory() as session:
        assert "inventory_copies" in inspect(session.get_bind()).get_table_names()


def test_inventory_page_is_consistent_during_concurrent_insert(inventory_database):
    from datetime import UTC, datetime, timedelta

    from fastapi.testclient import TestClient
    from sqlalchemy import event

    from app.auth.sessions import token_digest
    from app.core.config import Settings
    from app.db.models import AuthSession
    from app.main import create_app

    factory, _ = inventory_database
    with factory.begin() as session:
        user = User(google_sub="snapshot-owner", display_name="Trainer")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(
            AuthSession(
                token_digest=token_digest("snapshot"),
                user_id=user_id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
    app = create_app(
        Settings(
            DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
            _env_file=None,
        )
    )
    app.state.session_factory.kw["bind"].dispose()
    app.state.session_factory = factory
    inserted = False

    def insert_between_queries(
        connection, cursor, statement, parameters, context, executemany
    ):
        nonlocal inserted
        if "GROUP BY inventory_copies.card_id" not in statement or inserted:
            return
        inserted = True
        with factory.begin() as other:
            other.add(
                InventoryCopy(
                    user_id=user_id,
                    card_id="base1-4",
                    condition="mint",
                    language="en",
                    variant="holo",
                    notes="Concurrent",
                )
            )

    engine = factory.kw["bind"]
    event.listen(engine, "after_cursor_execute", insert_between_queries)
    try:
        with TestClient(app) as client:
            client.cookies.set("pokevault_session", "snapshot")
            response = client.get("/api/v1/inventory")
            assert response.status_code == 200
            payload = response.json()
            # The inserted copy becomes visible only on the next consistent page.
            assert payload["total"] == 0
            assert payload["results"] == []
            assert client.get("/api/v1/inventory").json()["total"] == 1
    finally:
        event.remove(engine, "after_cursor_execute", insert_between_queries)


def test_inventory_survives_logout_relogin_and_application_restart(inventory_database):
    from urllib.parse import parse_qs, urlsplit

    from fastapi.testclient import TestClient

    from app.core.config import Settings
    from app.main import create_app

    factory, _ = inventory_database
    settings = Settings(
        DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
        GOOGLE_CLIENT_ID="local-test-client",
        GOOGLE_CLIENT_SECRET="local-placeholder",
        _env_file=None,
    )

    def application():
        app = create_app(settings)

        async def identity(code, nonce, verifier):
            return {"sub": "persistent-trainer", "name": "Collector"}

        async def get_card(card_id, language):
            return object()

        app.state.google_provider.identity = identity
        app.state.card_provider.get_card = get_card
        return app

    def login(client):
        response = client.get(
            "/api/v1/auth/google/login", headers={"Accept": "application/json"}
        )
        state = parse_qs(urlsplit(response.json()["authorization_url"]).query)["state"][
            0
        ]
        callback = client.get(
            "/api/v1/auth/google/callback",
            params={"state": state, "code": "local"},
            follow_redirects=False,
        )
        assert callback.status_code == 303
        return client.get("/api/v1/auth/me").json()

    app = application()
    with TestClient(app, base_url="http://localhost:8000") as client:
        me = login(client)
        headers = {"Origin": "http://localhost:5173", "X-CSRF-Token": me["csrf_token"]}
        response = client.post(
            "/api/v1/inventory",
            headers=headers,
            json={"card_id": "base1-4", "notes": "Persistent personal copy"},
        )
        assert response.status_code == 201
        copy_id = response.json()["id"]
        assert client.post("/api/v1/auth/logout", headers=headers).status_code == 204
        assert client.get("/api/v1/inventory").status_code == 401
    app.state.session_factory.kw["bind"].dispose()
    restarted = application()
    try:
        with TestClient(restarted, base_url="http://localhost:8000") as client:
            again = login(client)
            assert again["user"]["id"] == me["user"]["id"]
            records = client.get("/api/v1/inventory").json()
            assert records["total"] == 1
            assert records["results"][0]["id"] == copy_id
            assert records["results"][0]["notes"] == "Persistent personal copy"
    finally:
        restarted.state.session_factory.kw["bind"].dispose()
