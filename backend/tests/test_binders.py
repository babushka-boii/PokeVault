"""Binders keep private, identifiable physical copies in 9-pocket pages."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.sessions import csrf_token, token_digest
from app.binders.placement import next_free, visible_pages
from app.core.config import Settings
from app.db.base import Base
from app.db.models import AuthSession, BinderPocket, InventoryCopy, User
from app.main import create_app

PATH = "/api/v1/binders"
ORIGIN = "http://localhost:5173"


@pytest.fixture
def binders():
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
        raise AssertionError("Binder operations must not contact the public provider")

    app.state.card_provider.get_card = offline_provider
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, factory
    engine.dispose()


def identity(client, name="ash"):
    client.cookies.clear()
    if name:
        client.cookies.set("pokevault_session", name)
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(name or "")}


def create_binder(client, headers, name="Kanto", **kwargs):
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


def place(client, headers, binder_id, page, pocket, copy_id):
    return client.put(
        f"{PATH}/{binder_id}/pockets/{page}/{pocket}",
        json={"copy_id": str(copy_id)},
        headers=headers,
    )


def store(client, headers, binder_id, copy_id):
    return client.post(
        f"{PATH}/{binder_id}/pockets", json={"copy_id": str(copy_id)}, headers=headers
    )


def remove(client, headers, binder_id, page, pocket, copy_id):
    return client.delete(
        f"{PATH}/{binder_id}/pockets/{page}/{pocket}",
        params={"copy_id": str(copy_id)},
        headers=headers,
    )


def test_visible_pages_always_show_a_spare_page_in_whole_spreads():
    assert [visible_pages(page) for page in (None, 1, 2, 3, 4, 39, 40)] == [
        2,
        2,
        4,
        4,
        6,
        40,
        40,
    ]


def test_next_free_is_the_lowest_gap_and_none_when_full():
    assert next_free(set()) == (1, 1)
    assert next_free({(1, 1), (1, 2), (1, 4)}) == (1, 3)
    assert next_free({(1, pocket) for pocket in range(1, 10)}) == (2, 1)
    full = {(page, pocket) for page in range(1, 41) for pocket in range(1, 10)}
    assert next_free(full) is None


def test_crud_order_and_private_summary(binders):
    client, _ = binders
    headers = identity(client)
    empty = client.get(PATH)
    assert empty.status_code == 200
    assert empty.json() == {"results": [], "total": 0}
    assert empty.headers["cache-control"] == "no-store"
    first = create_binder(client, headers, "  Favorite cards  ")
    assert first["name"] == "Favorite cards"
    assert first["display_order"] == 0
    assert first["cover"] == "noir"
    assert (first["copy_count"], first["page_count"], first["last_placed_at"]) == (
        0,
        2,
        None,
    )
    assert set(first) == {
        "id",
        "name",
        "display_order",
        "cover",
        "copy_count",
        "page_count",
        "last_placed_at",
        "created_at",
        "updated_at",
    }
    second = create_binder(client, headers, "Second", cover="noir")
    third = create_binder(client, headers, "Third")
    renamed = client.put(
        f"{PATH}/{first['id']}", json={"name": "  Favorites  "}, headers=headers
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Favorites"
    reordered = client.put(
        f"{PATH}/order",
        json={"binder_ids": [third["id"], first["id"], second["id"]]},
        headers=headers,
    )
    assert reordered.status_code == 200
    assert [b["id"] for b in reordered.json()["results"]] == [
        third["id"],
        first["id"],
        second["id"],
    ]
    assert [b["display_order"] for b in reordered.json()["results"]] == [0, 1, 2]
    assert client.get(f"{PATH}/{first['id']}").json()["pockets"] == []
    assert client.delete(f"{PATH}/{second['id']}", headers=headers).status_code == 204
    assert client.get(f"{PATH}/{second['id']}").status_code == 404
    assert client.get(PATH).json()["total"] == 2


@pytest.mark.parametrize("name", [None, "expired"])
def test_requires_session_for_all_binders_views_and_locations(binders, name):
    client, _ = binders
    headers = identity(client, name)
    for path in (
        PATH,
        f"{PATH}/{uuid4()}",
        f"{PATH}/views/unassigned",
        f"{PATH}/views/recent",
        f"{PATH}/locations?copy_id={uuid4()}",
    ):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"
    assert client.post(PATH, json={"name": "B"}, headers=headers).status_code == 401


@pytest.mark.parametrize(
    "bad_headers",
    [{}, {"Origin": "https://evil.test"}, {"Origin": ORIGIN, "X-CSRF-Token": "bad"}],
)
def test_all_mutations_require_existing_csrf(binders, bad_headers):
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    copy_id = add_copy(factory)
    body = {"json": {"copy_id": str(copy_id)}}
    requests = [
        ("post", PATH, {"json": {"name": "No"}}),
        ("put", f"{PATH}/order", {"json": {"binder_ids": [binder["id"]]}}),
        ("put", f"{PATH}/{binder['id']}", {"json": {"name": "No"}}),
        ("delete", f"{PATH}/{binder['id']}", {}),
        ("post", f"{PATH}/{binder['id']}/pockets", body),
        ("put", f"{PATH}/{binder['id']}/pockets/1/1", body),
        ("delete", f"{PATH}/{binder['id']}/pockets/1/1?copy_id={copy_id}", {}),
    ]
    for method, path, options in requests:
        assert (
            getattr(client, method)(path, headers=bad_headers, **options).status_code
            == 403
        )
    assert client.get(PATH).json()["total"] == 1
    assert client.get(f"{PATH}/{binder['id']}").json()["pockets"] == []


def test_foreign_resources_are_indistinguishable_from_missing(binders):
    client, factory = binders
    ash = identity(client)
    owned = create_binder(client, ash)
    ash_copy = add_copy(factory)
    assert store(client, ash, owned["id"], ash_copy).status_code == 200
    misty = identity(client, "misty")
    foreign = create_binder(client, misty)
    foreign_copy = add_copy(factory, "misty")
    assert client.get(PATH).json()["total"] == 1
    for binder_id in (owned["id"], str(uuid4())):
        for method, options, suffix in (
            ("get", {}, ""),
            ("put", {"json": {"name": "No"}}, ""),
            ("delete", {}, ""),
            ("post", {"json": {"copy_id": str(foreign_copy)}}, "/pockets"),
            ("put", {"json": {"copy_id": str(foreign_copy)}}, "/pockets/1/1"),
            ("delete", {}, f"/pockets/1/1?copy_id={ash_copy}"),
        ):
            assert (
                getattr(client, method)(
                    f"{PATH}/{binder_id}{suffix}", headers=misty, **options
                ).status_code
                == 404
            )
    for copy_id in (ash_copy, uuid4()):
        assert place(client, misty, foreign["id"], 1, 1, copy_id).status_code == 404
        assert store(client, misty, foreign["id"], copy_id).status_code == 404
    # Another owner's copy never appears in locations, views or counts.
    located = client.get(f"{PATH}/locations", params={"copy_id": [str(ash_copy)]})
    assert located.json() == {"results": []}
    assert client.get(f"{PATH}/views/owned").json()["total"] == 1
    identity(client)
    assert client.get(f"{PATH}/{owned['id']}").json()["copy_count"] == 1


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": ""},
        {"name": "  "},
        {"name": "x" * 81},
        {"name": None},
        {"name": 1},
        {"name": "B", "cover": "sepia"},
        {"name": "B", "cover": None},
        {"name": "B", "user_id": str(uuid4())},
        {"name": "B", "display_order": 0},
    ],
)
def test_create_validation_rejects_invalid_data(binders, payload):
    client, _ = binders
    headers = identity(client)
    assert client.post(PATH, json=payload, headers=headers).status_code == 422
    assert client.get(PATH).json()["total"] == 0


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"name": None},
        {"cover": None},
        {"name": " "},
        {"name": "x" * 81},
        {"cover": "classic"},
        {"display_order": 3},
        {"user_id": str(uuid4())},
    ],
)
def test_update_validation_keeps_existing_binder(binders, payload):
    client, _ = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    response = client.put(f"{PATH}/{binder['id']}", json=payload, headers=headers)
    assert response.status_code == 422
    assert client.get(f"{PATH}/{binder['id']}").json()["name"] == "Kanto"


def test_reorder_requires_exact_owned_permutation(binders):
    client, _ = binders
    headers = identity(client)
    first = create_binder(client, headers)
    second = create_binder(client, headers, "Second")
    other = create_binder(client, identity(client, "misty"))
    headers = identity(client)
    for ids in (
        [],
        [first["id"]],
        [first["id"], first["id"]],
        [first["id"], str(uuid4())],
        [first["id"], other["id"]],
        ["bad"],
    ):
        response = client.put(
            f"{PATH}/order", json={"binder_ids": ids}, headers=headers
        )
        assert response.status_code == 422
    assert [b["id"] for b in client.get(PATH).json()["results"]] == [
        first["id"],
        second["id"],
    ]


def test_binder_limit_is_enforced_without_losing_existing_binders(binders):
    client, _ = binders
    headers = identity(client)
    for number in range(100):
        create_binder(client, headers, f"Binder {number}")
    response = client.post(PATH, json={"name": "Too many"}, headers=headers)
    assert response.status_code == 409
    assert response.json()["detail"] == "binder_limit_reached"
    assert client.get(PATH).json()["total"] == 100


def test_store_uses_the_lowest_free_pocket_and_reports_where_it_came_from(binders):
    client, factory = binders
    headers = identity(client)
    tesoros = create_binder(client, headers, "Tesoros")
    repetidas = create_binder(client, headers, "Repetidas")
    copies = [add_copy(factory) for _ in range(4)]
    assert place(client, headers, tesoros["id"], 1, 1, copies[0]).status_code == 200
    assert place(client, headers, tesoros["id"], 1, 3, copies[1]).status_code == 200
    from_tray = store(client, headers, tesoros["id"], copies[2])
    assert from_tray.status_code == 200
    body = from_tray.json()
    assert (body["page"], body["pocket"], body["moved_from"]) == (1, 2, None)
    assert body["binder"]["copy_count"] == 3
    assert place(client, headers, repetidas["id"], 3, 7, copies[3]).status_code == 200
    moved = store(client, headers, tesoros["id"], copies[3]).json()
    assert (moved["page"], moved["pocket"]) == (1, 4)
    assert moved["moved_from"] == {
        "binder_id": repetidas["id"],
        "binder_name": "Repetidas",
        "page": 3,
        "pocket": 7,
    }
    assert client.get(f"{PATH}/{repetidas['id']}").json()["copy_count"] == 0
    # Storing a copy already in this binder keeps it where it is.
    again = store(client, headers, tesoros["id"], copies[3]).json()
    assert (again["page"], again["pocket"], again["moved_from"]) == (1, 4, None)
    summary = client.get(f"{PATH}/{tesoros['id']}").json()
    assert summary["last_placed_at"] is not None
    assert [(p["page"], p["pocket"]) for p in summary["pockets"]] == [
        (1, 1),
        (1, 2),
        (1, 3),
        (1, 4),
    ]


def test_store_reports_a_full_binder_without_moving_the_copy(binders):
    client, factory = binders
    headers = identity(client)
    full = create_binder(client, headers, "Full")
    spare = create_binder(client, headers, "Spare")
    user_id_copies = [add_copy(factory) for _ in range(361)]
    with factory.begin() as session:
        user_id = session.scalar(select(User.id).where(User.google_sub == "ash"))
        session.add_all(
            BinderPocket(
                user_id=user_id,
                binder_id=UUID(full["id"]),
                page=index // 9 + 1,
                pocket=index % 9 + 1,
                copy_id=copy_id,
            )
            for index, copy_id in enumerate(user_id_copies[:360])
        )
    last = user_id_copies[360]
    assert place(client, headers, spare["id"], 1, 1, last).status_code == 200
    response = store(client, headers, full["id"], last)
    assert response.status_code == 409
    assert response.json()["detail"] == "binder_full"
    assert client.get(f"{PATH}/{spare['id']}").json()["copy_count"] == 1
    listing = {b["id"]: b for b in client.get(PATH).json()["results"]}
    assert (listing[full["id"]]["copy_count"], listing[full["id"]]["page_count"]) == (
        360,
        40,
    )


def test_move_collision_idempotence_and_stale_removal_preserve_copy_identity(binders):
    client, factory = binders
    headers = identity(client)
    first = create_binder(client, headers)
    second = create_binder(client, headers, "Second")
    original = add_copy(factory, notes="Original", acquired_on=date(2026, 10, 1))
    duplicate = add_copy(factory, notes="Duplicate", language="es", condition="played")
    response = place(client, headers, first["id"], 40, 9, original)
    assert response.status_code == 200
    assert response.json()["moved_from"] is None
    same = place(client, headers, first["id"], 40, 9, original).json()
    assert same["moved_from"] is None
    assert same["binder"]["copy_count"] == 1
    assert same["binder"]["pockets"][0]["copy"]["notes"] == "Original"
    assert place(client, headers, second["id"], 1, 1, duplicate).status_code == 200
    occupied = place(client, headers, second["id"], 1, 1, original)
    assert occupied.status_code == 409
    assert occupied.json()["detail"] == "pocket_occupied"
    assert client.get(f"{PATH}/{first['id']}").json()["pockets"][0]["copy"][
        "id"
    ] == str(original)
    moved = place(client, headers, second["id"], 1, 2, original).json()
    assert moved["moved_from"] == {
        "binder_id": first["id"],
        "binder_name": "Kanto",
        "page": 40,
        "pocket": 9,
    }
    assert [(p["page"], p["pocket"]) for p in moved["binder"]["pockets"]] == [
        (1, 1),
        (1, 2),
    ]
    within = place(client, headers, second["id"], 2, 5, original).json()
    assert within["moved_from"]["binder_id"] == second["id"]
    assert client.get(f"{PATH}/{first['id']}").json()["copy_count"] == 0
    stale = remove(client, headers, second["id"], 1, 1, original)
    assert stale.status_code == 409
    assert stale.json()["detail"] == "pocket_changed"
    assert remove(client, headers, second["id"], 1, 1, duplicate).status_code == 204
    assert remove(client, headers, second["id"], 1, 1, duplicate).status_code == 204
    assert client.delete(f"{PATH}/{second['id']}", headers=headers).status_code == 204
    copies = client.get("/api/v1/inventory").json()["results"]
    assert {record["id"] for record in copies} == {str(original), str(duplicate)}
    assert {record["notes"] for record in copies} == {"Original", "Duplicate"}
    assert client.get(f"{PATH}/views/unassigned").json()["total"] == 2


@pytest.mark.parametrize(("page", "pocket"), [(0, 1), (41, 1), (1, 0), (1, 10)])
def test_pocket_bounds_and_removal_expected_copy_are_required(binders, page, pocket):
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    copy_id = add_copy(factory)
    assert (
        place(client, headers, binder["id"], page, pocket, copy_id).status_code == 422
    )
    assert (
        remove(client, headers, binder["id"], page, pocket, copy_id).status_code == 422
    )
    assert (
        client.delete(f"{PATH}/{binder['id']}/pockets/1/1", headers=headers).status_code
        == 422
    )
    for path in (
        f"{PATH}/{binder['id']}/pockets/1/1",
        f"{PATH}/{binder['id']}/pockets",
    ):
        assert (
            client.request(
                "PUT" if path.endswith("/1") else "POST",
                path,
                json={"copy_id": str(copy_id), "user_id": str(uuid4())},
                headers=headers,
            ).status_code
            == 422
        )


def test_inventory_deletion_frees_the_pocket_without_deleting_the_binder(binders):
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    copy_id = add_copy(factory)
    assert store(client, headers, binder["id"], copy_id).status_code == 200
    response = client.delete(f"/api/v1/inventory/{copy_id}", headers=headers)
    assert response.status_code == 204
    assert client.get(f"{PATH}/{binder['id']}").json()["pockets"] == []
    assert client.get(PATH).json()["results"][0]["copy_count"] == 0


def test_views_are_owned_paginated_stable_and_use_acquisition_date(binders):
    client, factory = binders
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
    binder = create_binder(client, headers)
    assert store(client, headers, binder["id"], early_acquired).status_code == 200
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
    for params in ({"offset": -1}, {"limit": 0}, {"limit": 101}, {"offset": 1000001}):
        assert client.get(f"{PATH}/views/owned", params=params).status_code == 422
    assert client.get(f"{PATH}/views/unknown").status_code == 422


def test_locations_name_the_binder_page_and_pocket_of_owned_copies(binders):
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers, "Tesoros")
    placed = add_copy(factory)
    loose = add_copy(factory)
    assert place(client, headers, binder["id"], 3, 5, placed).status_code == 200
    response = client.get(
        f"{PATH}/locations",
        params={"copy_id": [str(placed), str(loose), str(uuid4())]},
    )
    assert response.status_code == 200
    assert response.json() == {
        "results": [
            {
                "copy_id": str(placed),
                "binder_id": binder["id"],
                "binder_name": "Tesoros",
                "page": 3,
                "pocket": 5,
            }
        ]
    }
    ids = [str(uuid4()) for _ in range(101)]
    for params in ({}, {"copy_id": ids}, {"copy_id": [str(placed), str(placed)]}):
        assert client.get(f"{PATH}/locations", params=params).status_code == 422


@pytest.mark.parametrize("error_type", [OperationalError, IntegrityError])
def test_database_failures_are_sanitized_and_private(binders, error_type):
    client, factory = binders
    headers = identity(client)

    def broken():
        raise error_type("private-query", {}, Exception("private-password"))

    original = factory.begin
    factory.begin = broken
    response = client.post(PATH, json={"name": "Binder"}, headers=headers)
    factory.begin = original
    assert response.status_code == (409 if error_type is IntegrityError else 503)
    assert "private" not in response.text
    assert response.headers["cache-control"] == "no-store"
