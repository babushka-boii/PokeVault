"""Personal boxes preserve private, independently identifiable physical copies."""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.sessions import csrf_token, token_digest
from app.core.config import Settings
from app.db.base import Base
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app

PATH = "/api/v1/boxes"
ORIGIN = "http://localhost:5173"


@pytest.fixture
def boxes():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

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

    async def offline_provider(*_):
        raise AssertionError("Box operations must not contact the public provider")

    app.state.card_provider.get_card = offline_provider
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, factory
    engine.dispose()


def identity(client, name="ash"):
    client.cookies.clear()
    if name:
        client.cookies.set("pokevault_session", name)
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(name or "")}


def create_box(client, headers, name="Box 1", **kwargs):
    response = client.post(PATH, json={"name": name, **kwargs}, headers=headers)
    assert response.status_code == 201
    return response.json()


def add_copy(factory, owner="ash", **changes):
    with factory.begin() as session:
        user_id = session.scalar(select(User.id).where(User.google_sub == owner))
        record = InventoryCopy(
            user_id=user_id,
            **(
                {
                    "card_id": "base1-4",
                    "condition": "near_mint",
                    "language": "ja",
                    "variant": "holo",
                    "notes": "A physical copy",
                    "acquired_on": None,
                }
                | changes
            ),
        )
        session.add(record)
        session.flush()
        return record.id


def place(client, headers, box_id, position, copy_id):
    return client.put(
        f"{PATH}/{box_id}/slots/{position}",
        json={"copy_id": str(copy_id)},
        headers=headers,
    )


def test_crud_order_and_private_summary(boxes):
    client, _ = boxes
    headers = identity(client)
    empty = client.get(PATH)
    assert empty.status_code == 200
    assert empty.json() == {"results": [], "total": 0}
    assert empty.headers["cache-control"] == "no-store"
    first = create_box(client, headers, "  Favorite cards  ")
    assert first["name"] == "Favorite cards"
    assert first["display_order"] == 0
    assert first["wallpaper"] == "classic"
    assert first["copy_count"] == 0
    assert set(first) == {
        "id",
        "name",
        "display_order",
        "wallpaper",
        "copy_count",
        "created_at",
        "updated_at",
    }
    second = create_box(client, headers, "Second", wallpaper="forest")
    third = create_box(client, headers, "Third", wallpaper="ocean")
    renamed = client.put(
        f"{PATH}/{first['id']}",
        json={"name": "  Favorites  ", "wallpaper": "night"},
        headers=headers,
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Favorites"
    assert renamed.json()["wallpaper"] == "night"
    reordered = client.put(
        f"{PATH}/order",
        json={"box_ids": [third["id"], first["id"], second["id"]]},
        headers=headers,
    )
    assert reordered.status_code == 200
    assert [b["id"] for b in reordered.json()["results"]] == [
        third["id"],
        first["id"],
        second["id"],
    ]
    assert [b["display_order"] for b in reordered.json()["results"]] == [0, 1, 2]
    assert client.get(f"{PATH}/{first['id']}").json()["slots"] == []
    assert client.delete(f"{PATH}/{second['id']}", headers=headers).status_code == 204
    assert client.get(f"{PATH}/{second['id']}").status_code == 404
    assert client.get(PATH).json()["total"] == 2


@pytest.mark.parametrize("name", [None, "expired"])
def test_requires_session_for_all_boxes_and_views(boxes, name):
    client, _ = boxes
    headers = identity(client, name)
    for path in (PATH, f"{PATH}/{uuid4()}", f"{PATH}/views/owned"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    assert client.post(PATH, json={"name": "Box"}, headers=headers).status_code == 401


@pytest.mark.parametrize(
    "bad_headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": ORIGIN, "X-CSRF-Token": "bad"}],
)
def test_all_mutations_require_existing_csrf(boxes, bad_headers):
    client, factory = boxes
    headers = identity(client)
    box = create_box(client, headers)
    copy_id = add_copy(factory)
    requests = [
        ("post", PATH, {"json": {"name": "No"}}),
        ("put", f"{PATH}/order", {"json": {"box_ids": [box["id"]]}}),
        ("put", f"{PATH}/{box['id']}", {"json": {"name": "No"}}),
        ("delete", f"{PATH}/{box['id']}", {}),
        ("put", f"{PATH}/{box['id']}/slots/0", {"json": {"copy_id": str(copy_id)}}),
        ("delete", f"{PATH}/{box['id']}/slots/0?copy_id={copy_id}", {}),
    ]
    for method, path, options in requests:
        assert (
            getattr(client, method)(path, headers=bad_headers, **options).status_code
            == 403
        )
    assert client.get(PATH).json()["total"] == 1
    assert client.get(f"{PATH}/{box['id']}").json()["slots"] == []


def test_foreign_resources_are_indistinguishable_from_missing(boxes):
    client, factory = boxes
    ash = identity(client)
    owned = create_box(client, ash)
    ash_copy = add_copy(factory)
    misty = identity(client, "misty")
    foreign = create_box(client, misty)
    foreign_copy = add_copy(factory, "misty")
    assert client.get(PATH).json()["total"] == 1
    for box_id in (owned["id"], str(uuid4())):
        for method, options, suffix in (
            ("get", {}, ""),
            ("put", {"json": {"name": "No"}}, ""),
            ("delete", {}, ""),
            ("put", {"json": {"copy_id": str(foreign_copy)}}, "/slots/0"),
            ("delete", {}, f"/slots/0?copy_id={foreign_copy}"),
        ):
            assert (
                getattr(client, method)(
                    f"{PATH}/{box_id}{suffix}", headers=misty, **options
                ).status_code
                == 404
            )
    for copy_id in (ash_copy, uuid4()):
        assert place(client, misty, foreign["id"], 0, copy_id).status_code == 404
    assert client.get(f"{PATH}/views/owned").json()["total"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": ""},
        {"name": "  "},
        {"name": "x" * 81},
        {"name": None},
        {"name": 1},
        {"name": "Box", "wallpaper": "fake"},
        {"name": "Box", "wallpaper": None},
        {"name": "Box", "user_id": str(uuid4())},
        {"name": "Box", "display_order": 0},
    ],
)
def test_create_validation_rejects_invalid_data(boxes, payload):
    client, _ = boxes
    headers = identity(client)
    assert client.post(PATH, json=payload, headers=headers).status_code == 422
    assert client.get(PATH).json()["total"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": None},
        {"wallpaper": None},
        {"name": " "},
        {"name": "x" * 81},
        {"wallpaper": "fake"},
        {"display_order": 3},
        {"user_id": str(uuid4())},
    ],
)
def test_update_validation_keeps_existing_box(boxes, payload):
    client, _ = boxes
    headers = identity(client)
    box = create_box(client, headers)
    assert (
        client.put(f"{PATH}/{box['id']}", json=payload, headers=headers).status_code
        == 422
    )
    assert client.get(f"{PATH}/{box['id']}").json()["name"] == "Box 1"


def test_reorder_requires_exact_owned_permutation(boxes):
    client, _ = boxes
    headers = identity(client)
    first = create_box(client, headers)
    second = create_box(client, headers, "Second")
    identity(client, "misty")
    other = create_box(client, identity(client, "misty"))
    headers = identity(client)
    for ids in (
        [],
        [first["id"]],
        [first["id"], first["id"]],
        [first["id"], str(uuid4())],
        [first["id"], other["id"]],
    ):
        response = client.put(f"{PATH}/order", json={"box_ids": ids}, headers=headers)
        assert response.status_code == 422
    assert [b["id"] for b in client.get(PATH).json()["results"]] == [
        first["id"],
        second["id"],
    ]
    assert (
        client.put(
            f"{PATH}/order", json={"box_ids": ["bad"]}, headers=headers
        ).status_code
        == 422
    )


def test_box_limit_is_enforced_without_losing_existing_boxes(boxes):
    client, _ = boxes
    headers = identity(client)
    for number in range(100):
        create_box(client, headers, f"Box {number}")
    assert (
        client.post(PATH, json={"name": "Too many"}, headers=headers).status_code == 409
    )
    assert client.get(PATH).json()["total"] == 100


def test_move_collision_idempotence_and_stale_removal_preserve_copy_identity(boxes):
    client, factory = boxes
    headers = identity(client)
    first = create_box(client, headers)
    second = create_box(client, headers, "Second")
    original = add_copy(factory, notes="Original", acquired_on=date(2026, 10, 1))
    duplicate = add_copy(factory, notes="Duplicate", language="es", condition="played")
    assert place(client, headers, first["id"], 29, original).status_code == 200
    response = place(client, headers, first["id"], 29, original)
    assert response.json()["copy_count"] == 1
    assert response.json()["slots"][0]["copy"]["notes"] == "Original"
    assert place(client, headers, second["id"], 0, duplicate).status_code == 200
    assert place(client, headers, second["id"], 0, original).status_code == 409
    assert client.get(f"{PATH}/{first['id']}").json()["slots"][0]["copy"]["id"] == str(
        original
    )
    moved = place(client, headers, second["id"], 1, original)
    assert moved.status_code == 200
    assert [slot["position"] for slot in moved.json()["slots"]] == [0, 1]
    assert client.get(f"{PATH}/{first['id']}").json()["copy_count"] == 0
    slot = f"{PATH}/{second['id']}/slots/0"
    assert (
        client.delete(
            slot, params={"copy_id": str(original)}, headers=headers
        ).status_code
        == 409
    )
    assert (
        client.delete(
            slot, params={"copy_id": str(duplicate)}, headers=headers
        ).status_code
        == 204
    )
    assert (
        client.delete(
            slot, params={"copy_id": str(duplicate)}, headers=headers
        ).status_code
        == 204
    )
    assert client.delete(f"{PATH}/{second['id']}", headers=headers).status_code == 204
    copies = client.get("/api/v1/inventory").json()["results"]
    assert {record["id"] for record in copies} == {str(original), str(duplicate)}
    assert {record["notes"] for record in copies} == {"Original", "Duplicate"}
    assert client.get(f"{PATH}/views/unassigned").json()["total"] == 2


@pytest.mark.parametrize("position", [-1, 30, 100])
def test_slot_bounds_and_removal_expected_copy_are_required(boxes, position):
    client, factory = boxes
    headers = identity(client)
    box = create_box(client, headers)
    copy_id = add_copy(factory)
    assert place(client, headers, box["id"], position, copy_id).status_code == 422
    assert (
        client.delete(
            f"{PATH}/{box['id']}/slots/{position}",
            params={"copy_id": str(copy_id)},
            headers=headers,
        ).status_code
        == 422
    )
    assert (
        client.delete(f"{PATH}/{box['id']}/slots/0", headers=headers).status_code == 422
    )
    assert (
        client.put(
            f"{PATH}/{box['id']}/slots/0",
            json={"copy_id": str(copy_id), "user_id": str(uuid4())},
            headers=headers,
        ).status_code
        == 422
    )


def test_inventory_deletion_cascades_placement_without_deleting_box(boxes):
    client, factory = boxes
    headers = identity(client)
    box = create_box(client, headers)
    copy_id = add_copy(factory)
    assert place(client, headers, box["id"], 0, copy_id).status_code == 200
    assert (
        client.delete(f"/api/v1/inventory/{copy_id}", headers=headers).status_code
        == 204
    )
    assert client.get(f"{PATH}/{box['id']}").json()["slots"] == []
    assert client.get(PATH).json()["results"][0]["copy_count"] == 0


def test_views_are_owned_paginated_stable_and_use_acquisition_date(boxes):
    client, factory = boxes
    headers = identity(client)
    old_created = datetime(2026, 9, 1, tzinfo=UTC)
    same_created = datetime(2026, 10, 4, tzinfo=UTC)
    recent_acquired = add_copy(
        factory, acquired_on=date(2026, 11, 1), created_at=old_created
    )
    early_acquired = add_copy(
        factory, acquired_on=date(2026, 1, 1), created_at=same_created
    )
    added_recently = add_copy(factory, created_at=same_created)
    tied = add_copy(factory, created_at=same_created)
    add_copy(factory, "misty", acquired_on=date(2026, 12, 1))
    box = create_box(client, headers)
    assert place(client, headers, box["id"], 0, early_acquired).status_code == 200
    owned = client.get(f"{PATH}/views/owned").json()
    assert owned["total"] == 4
    assert owned["offset"] == 0 and owned["limit"] == 30
    expected_ties = sorted((str(added_recently), str(tied)), reverse=True)
    recent = client.get(f"{PATH}/views/recent").json()
    assert [r["id"] for r in recent["results"]] == [
        str(recent_acquired),
        *expected_ties,
        str(early_acquired),
    ]
    page = client.get(f"{PATH}/views/recent", params={"offset": 1, "limit": 1}).json()
    assert page["total"] == 4 and len(page["results"]) == 1
    assert page["results"][0]["id"] == expected_ties[0]
    unassigned = client.get(f"{PATH}/views/unassigned").json()
    assert unassigned["total"] == 3
    assert str(early_acquired) not in {record["id"] for record in unassigned["results"]}
    assert client.get("/api/v1/inventory").json()["total"] == 4
    for params in ({"offset": -1}, {"limit": 0}, {"limit": 101}, {"offset": 1000001}):
        assert client.get(f"{PATH}/views/owned", params=params).status_code == 422
    assert client.get(f"{PATH}/views/unknown").status_code == 422


@pytest.mark.parametrize("error_type", [OperationalError, IntegrityError])
def test_database_failures_are_sanitized_and_private(boxes, error_type):
    client, factory = boxes
    headers = identity(client)

    def broken():
        raise error_type("private-query", {}, Exception("private-password"))

    original = factory.begin
    factory.begin = broken
    response = client.post(PATH, json={"name": "Box"}, headers=headers)
    factory.begin = original
    assert response.status_code == (409 if error_type is IntegrityError else 503)
    assert "private" not in response.text
    assert response.headers["cache-control"] == "no-store"
