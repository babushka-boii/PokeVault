"""Frozen personal-box tables (0004/0006) keep their constraints until a later drop.

The boxes API was retired in 8C (binders replace it; see test_binders_postgres.py).
These raw-SQL tests prove the frozen tables still enforce ownership and integrity.
Real constraints run in disposable PostgreSQL schemas.

The existing auth fixture guards the configured test database and creates a fresh
schema for every test. No test migrates or writes the populated application schema.
"""

from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.auth.sessions import csrf_token, token_digest
from app.core.config import Settings
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app

from . import test_auth_postgres

boxes_database = test_auth_postgres.auth_database
ORIGIN = "http://localhost:5173"


def seed_owner(factory, subject=None, copies=2, boxes=2):
    """Give duplicate printings different physical metadata and UUID identities."""
    token = uuid4().hex
    with factory.begin() as session:
        user = User(google_sub=subject or uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(
            AuthSession(
                token_digest=token_digest(token),
                user_id=user_id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        physical = [
            InventoryCopy(
                user_id=user_id,
                card_id="base1-4",
                condition="mint" if index % 2 == 0 else "played",
                language="ja" if index % 2 == 0 else "en",
                variant="holo" if index % 2 == 0 else "normal",
                acquired_on=date(2026, 10, 1),
                notes=f"Physical copy {index}",
            )
            for index in range(copies)
        ]
        session.add_all(physical)
        session.flush()
        copy_ids = [copy.id for copy in physical]
        box_ids = [uuid4() for _ in range(boxes)]
        for index, box_id in enumerate(box_ids):
            insert_box(session, box_id, user_id, display_order=index)
    return {
        "user_id": user_id,
        "token": token,
        "copies": copy_ids,
        "boxes": box_ids,
    }


def insert_box(session, box_id, user_id, **changes):
    values = {
        "id": box_id,
        "user_id": user_id,
        "name": "Classic box",
        "display_order": 0,
        "wallpaper": "classic",
        **changes,
    }
    session.execute(
        text(
            "INSERT INTO personal_boxes "
            "(id,user_id,name,display_order,wallpaper) "
            "VALUES (:id,:user_id,:name,:display_order,:wallpaper)"
        ),
        values,
    )


def insert_placement(session, owner, box=None, copy=None, position=0, user_id=None):
    session.execute(
        text(
            "INSERT INTO box_memberships (user_id,box_id,position,copy_id) "
            "VALUES (:user_id,:box_id,:position,:copy_id)"
        ),
        {
            "user_id": user_id or owner["user_id"],
            "box_id": box or owner["boxes"][0],
            "copy_id": copy or owner["copies"][0],
            "position": position,
        },
    )


def rows(factory, table):
    assert table in {"personal_boxes", "box_memberships", "inventory_copies"}
    with factory() as session:
        return session.execute(text(f"SELECT * FROM {table}")).mappings().all()


def application(factory, google=False):
    settings = Settings(
        DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
        GOOGLE_CLIENT_ID="local-test-client" if google else "",
        GOOGLE_CLIENT_SECRET="local-placeholder" if google else "",
        _env_file=None,
    )
    app = create_app(settings)
    # Each application creates its own engine, allowing restart tests to exercise
    # actual persistence without sharing an ORM session or an identity map.
    return app


def headers(owner):
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(owner["token"])}


def client_for(app, owner):
    return TestClient(
        app,
        base_url="http://localhost:8000",
        cookies={"pokevault_session": owner["token"]},
    )


def test_migration_has_owner_foreign_keys_and_exact_unique_keys(boxes_database):
    factory, config = boxes_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0007"
    assert scripts.get_revision("0004").down_revision == "0003"
    with factory() as session:
        inspector = inspect(session.get_bind())
        assert {"personal_boxes", "box_memberships"}.issubset(
            inspector.get_table_names()
        )
        assert inspector.get_pk_constraint("box_memberships")[
            "constrained_columns"
        ] == ["box_id", "position"]
        foreign_keys = inspector.get_foreign_keys("box_memberships")
        assert {
            (
                tuple(key["constrained_columns"]),
                key["referred_table"],
                tuple(key["referred_columns"]),
                key["options"].get("ondelete"),
            )
            for key in foreign_keys
        } == {
            (("user_id", "box_id"), "personal_boxes", ("user_id", "id"), "CASCADE"),
            (("user_id", "copy_id"), "inventory_copies", ("user_id", "id"), "CASCADE"),
        }
        for table, columns in (
            ("box_memberships", ["copy_id"]),
            ("personal_boxes", ["user_id", "display_order"]),
            ("personal_boxes", ["user_id", "id"]),
            ("inventory_copies", ["user_id", "id"]),
        ):
            assert columns in [
                key["column_names"] for key in inspector.get_unique_constraints(table)
            ]


@pytest.mark.parametrize(
    ("changes", "sqlstates"),
    [
        ({"name": ""}, {"23514"}),
        ({"name": "   "}, {"23514"}),
        ({"name": " padded "}, {"23514"}),
        ({"name": "x" * 81}, {"23514", "22001"}),
        ({"wallpaper": "external"}, {"23514"}),
        ({"display_order": -1}, {"23514"}),
    ],
)
def test_raw_box_checks_reject_invalid_values(boxes_database, changes, sqlstates):
    factory, _ = boxes_database
    owner = seed_owner(factory, boxes=0, copies=0)
    with pytest.raises(DBAPIError) as error, factory.begin() as session:
        insert_box(session, uuid4(), owner["user_id"], **changes)
    assert error.value.orig.sqlstate in sqlstates
    assert rows(factory, "personal_boxes") == []


def test_display_order_is_unique_per_owner_and_not_global(boxes_database):
    factory, _ = boxes_database
    first = seed_owner(factory, boxes=1)
    second = seed_owner(factory, boxes=1)
    assert len(rows(factory, "personal_boxes")) == 2
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_box(session, uuid4(), first["user_id"], display_order=0)
    assert error.value.orig.sqlstate == "23505"
    assert {row["user_id"] for row in rows(factory, "personal_boxes")} == {
        first["user_id"],
        second["user_id"],
    }


@pytest.mark.parametrize(
    "foreign", ["box", "copy", "both", "missing_box", "missing_copy"]
)
def test_composite_ownership_foreign_keys_reject_forged_placements(
    boxes_database, foreign
):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    other = seed_owner(factory)
    box = other["boxes"][0] if foreign in {"box", "both"} else owner["boxes"][0]
    copy = other["copies"][0] if foreign in {"copy", "both"} else owner["copies"][0]
    if foreign == "missing_box":
        box = uuid4()
    if foreign == "missing_copy":
        copy = uuid4()
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_placement(session, owner, box=box, copy=copy)
    assert error.value.orig.sqlstate == "23503"
    assert rows(factory, "box_memberships") == []
    assert len(rows(factory, "inventory_copies")) == 4


@pytest.mark.parametrize("position", [-1, 30])
def test_raw_position_is_limited_to_thirty_slots(boxes_database, position):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_placement(session, owner, position=position)
    assert error.value.orig.sqlstate == "23514"
    assert rows(factory, "box_memberships") == []


@pytest.mark.parametrize("conflict", ["copy", "slot"])
def test_physical_copy_and_slot_are_independently_unique(boxes_database, conflict):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    with factory.begin() as session:
        insert_placement(session, owner, position=0)
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        if conflict == "copy":
            insert_placement(session, owner, box=owner["boxes"][1], position=29)
        else:
            insert_placement(session, owner, copy=owner["copies"][1], position=0)
    assert error.value.orig.sqlstate == "23505"
    placements = rows(factory, "box_memberships")
    assert len(placements) == 1
    assert placements[0]["copy_id"] == owner["copies"][0]


@pytest.mark.parametrize("deleted", ["box", "copy", "user"])
def test_cascades_remove_only_appropriate_owner_records(boxes_database, deleted):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    other = seed_owner(factory, copies=1, boxes=1)
    with factory.begin() as session:
        insert_placement(session, owner)
        insert_placement(session, other)
    original_copies = {
        row["id"]: dict(row) for row in rows(factory, "inventory_copies")
    }
    with factory.begin() as session:
        if deleted == "box":
            session.execute(
                text("DELETE FROM personal_boxes WHERE id=:id"),
                {"id": owner["boxes"][0]},
            )
        elif deleted == "copy":
            session.delete(session.get(InventoryCopy, owner["copies"][0]))
        else:
            session.delete(session.get(User, owner["user_id"]))
    placements = rows(factory, "box_memberships")
    assert len(placements) == 1
    assert placements[0]["user_id"] == other["user_id"]
    remaining = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    expected = set(original_copies)
    if deleted == "copy":
        expected.remove(owner["copies"][0])
    elif deleted == "user":
        expected.difference_update(owner["copies"])
    assert set(remaining) == expected
    assert all(remaining[key] == original_copies[key] for key in remaining)
    remaining_boxes = rows(factory, "personal_boxes")
    assert len(remaining_boxes) == {"box": 2, "copy": 3, "user": 1}[deleted]


def test_upgrade_and_downgrade_preserve_existing_0003_inventory(boxes_database):
    factory, config = boxes_database
    # Both migrations run only in the auth fixture's fresh disposable schema.
    command.downgrade(config, "0003")
    owner = seed_owner(factory, boxes=0)
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    assert len(before) == 2
    command.upgrade(config, "0004")
    with factory.begin() as session:
        box = uuid4()
        insert_box(session, box, owner["user_id"])
        insert_placement(session, owner, box=box)
    command.downgrade(config, "0003")
    with factory() as session:
        inspector = inspect(session.get_bind())
        assert not {"personal_boxes", "box_memberships"} & set(
            inspector.get_table_names()
        )
        assert {"users", "auth_sessions", "inventory_copies"}.issubset(
            inspector.get_table_names()
        )
        assert (
            session.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == "0003"
        )
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before
    command.upgrade(config, "head")
    assert rows(factory, "box_memberships") == []
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before
