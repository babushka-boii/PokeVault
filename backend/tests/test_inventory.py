"""Inventory behavior through real sessions, transactions and HTTP routes."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.sessions import csrf_token, token_digest
from app.cards.provider import CardNotFound, CardsUnavailable
from app.core.config import Settings
from app.db.base import Base
from app.db.models import AuthSession, User
from app.main import create_app

PATH = "/api/v1/inventory"
ORIGIN = "http://localhost:5173"
COPY = {
    "card_id": "base1-4",
    "condition": "near_mint",
    "language": "ja",
    "variant": "holo",
    "acquired_on": "2026-10-01",
    "notes": "First copy",
}


@pytest.fixture
def inventory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = create_app(
        Settings(
            DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test",
            _env_file=None,
        )
    )
    app.state.session_factory.kw["bind"].dispose()
    app.state.session_factory = factory
    with factory.begin() as session:
        for name in ("ash", "misty", "expired"):
            user = User(google_sub=name, display_name=name)
            session.add(user)
            session.flush()
            session.add(
                AuthSession(
                    token_digest=token_digest(name),
                    user_id=user.id,
                    expires_at=datetime.now(UTC)
                    + timedelta(hours=-1 if name == "expired" else 1),
                )
            )

    async def get_card(card_id, language):
        if card_id == "missing-1":
            raise CardNotFound
        if card_id == "offline-1":
            raise CardsUnavailable
        return object()

    app.state.card_provider.get_card = get_card
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, factory
    engine.dispose()


def identity(client, name):
    client.cookies.clear()
    if name:
        client.cookies.set("pokevault_session", name)
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(name or "")}


def test_crud_duplicates_persistence_and_isolation(inventory):
    client, _ = inventory
    headers = identity(client, "ash")
    first = client.post(PATH, json=COPY, headers=headers)
    assert first.status_code == 201
    assert first.headers["cache-control"] == "no-store"
    record = first.json()
    assert "user_id" not in record
    assert record.items() >= COPY.items()
    second = client.post(PATH, json=COPY, headers=headers).json()
    assert second["id"] != record["id"]
    listing = client.get(PATH, params={"limit": 1}).json()
    assert listing["total"] == 2
    assert listing["quantities"] == {"base1-4": 2}
    assert len(listing["results"]) == 1
    assert (
        client.get(PATH, params={"offset": 1}).json()["results"][0]["id"]
        != listing["results"][0]["id"]
    )
    assert client.get(PATH, params={"language": "en"}).json()["total"] == 0
    assert client.get(PATH, params={"condition": "near_mint"}).json()["total"] == 2
    assert client.get(PATH, params={"card_id": "base1-4"}).json()["total"] == 2
    other_headers = identity(client, "misty")
    assert client.get(PATH).json()["results"] == []
    for method in ("get", "put", "delete"):
        options = (
            {"json": {k: v for k, v in COPY.items() if k != "card_id"}}
            if method == "put"
            else {}
        )
        response = getattr(client, method)(
            f"{PATH}/{record['id']}", headers=other_headers, **options
        )
        assert response.status_code == 404
    assert client.get(f"{PATH}/{uuid4()}").status_code == 404
    headers = identity(client, "ash")
    assert client.get(f"{PATH}/{record['id']}").json()["notes"] == "First copy"
    update = {k: v for k, v in COPY.items() if k != "card_id"}
    update.update(notes="Changed", acquired_on=None, condition="played")
    assert (
        client.put(f"{PATH}/{record['id']}", json=update, headers=headers).json()[
            "notes"
        ]
        == "Changed"
    )
    assert client.get(f"{PATH}/{record['id']}").json()["acquired_on"] is None
    assert client.delete(f"{PATH}/{record['id']}", headers=headers).status_code == 204
    assert client.get(f"{PATH}/{record['id']}").status_code == 404
    assert client.get(PATH).json()["total"] == 1


@pytest.mark.parametrize("name", [None, "expired"])
def test_requires_valid_session(inventory, name):
    client, _ = inventory
    headers = identity(client, name)
    assert client.get(PATH).status_code == 401
    assert client.post(PATH, json=COPY, headers=headers).status_code == 401


@pytest.mark.parametrize(
    "headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": ORIGIN, "X-CSRF-Token": "wrong"}],
)
def test_rejects_csrf_on_all_writes(inventory, headers):
    client, _ = inventory
    good = identity(client, "ash")
    record = client.post(PATH, json=COPY, headers=good).json()
    assert client.post(PATH, json=COPY, headers=headers).status_code == 403
    assert (
        client.put(f"{PATH}/{record['id']}", json={}, headers=headers).status_code
        == 403
    )
    assert client.delete(f"{PATH}/{record['id']}", headers=headers).status_code == 403
    assert client.get(PATH).json()["total"] == 1


@pytest.mark.parametrize(
    "change",
    [
        {"card_id": "../unsafe"},
        {"card_id": "a" * 101},
        {"user_id": str(uuid4())},
        {"condition": "fake"},
        {"condition": None},
        {"language": "fake"},
        {"variant": "fake"},
        {"notes": "a" * 2001},
        {"acquired_on": "2026-02-30"},
        {"acquired_on": "2026-01-01T00:00:00Z"},
    ],
)
def test_input_validation(inventory, change):
    client, _ = inventory
    headers = identity(client, "ash")
    assert client.post(PATH, json=COPY | change, headers=headers).status_code == 422
    assert client.get(PATH).json()["total"] == 0


def test_missing_provider_database_failures_and_cors(inventory):
    client, factory = inventory
    headers = identity(client, "ash")
    assert (
        client.post(
            PATH, json=COPY | {"card_id": "missing-1"}, headers=headers
        ).status_code
        == 404
    )
    assert (
        client.post(
            PATH, json=COPY | {"card_id": "offline-1"}, headers=headers
        ).status_code
        == 503
    )
    for params in ({"limit": 101}, {"offset": -1}, {"language": "fake"}):
        assert client.get(PATH, params=params).status_code == 422
    for method in ("PUT", "DELETE"):
        response = client.options(
            PATH,
            headers={
                "Origin": ORIGIN,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type,x-csrf-token",
            },
        )
        assert response.status_code == 200

    def broken():
        raise OperationalError("private-query", {}, Exception("private-password"))

    original = factory.begin
    factory.begin = broken
    response = client.post(PATH, json=COPY, headers=headers)
    factory.begin = original
    assert response.status_code == 503
    assert "private" not in response.text
