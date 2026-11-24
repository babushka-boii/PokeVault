"""Migration 0007: personal boxes become binders; the box tables stay frozen.

Each test pins revision 0007 explicitly: 0008 later drops the box tables.
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from . import test_auth_postgres

binders_database = test_auth_postgres.auth_database
CREATED = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)
UPDATED = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)


def seed_boxes(factory):
    """Raw SQL at 0006: two owners, slots 0/8/9/29, an empty box, an unplaced copy."""
    seeded = {}
    with factory.begin() as session:
        for owner in ("ash", "misty"):
            user_id = uuid4()
            session.execute(
                text(
                    "INSERT INTO users (id, google_sub, display_name, email_verified)"
                    " VALUES (:id, :sub, :name, false)"
                ),
                {"id": user_id, "sub": owner, "name": owner},
            )
            copies = []
            for _ in range(5):
                copy_id = uuid4()
                session.execute(
                    text(
                        "INSERT INTO inventory_copies (id, user_id, card_id,"
                        " condition, language, variant, notes)"
                        " VALUES (:id, :user_id, 'base1-4', 'mint', 'en', 'holo', '')"
                    ),
                    {"id": copy_id, "user_id": user_id},
                )
                copies.append(copy_id)
            full, empty = uuid4(), uuid4()
            for box_id, name, order in ((full, f"{owner} box", 0), (empty, "Empty", 3)):
                session.execute(
                    text(
                        "INSERT INTO personal_boxes (id, user_id, name, display_order,"
                        " wallpaper, created_at, updated_at) VALUES (:id, :user_id,"
                        " :name, :order, 'forest', :created, :updated)"
                    ),
                    {
                        "id": box_id,
                        "user_id": user_id,
                        "name": name,
                        "order": order,
                        "created": CREATED,
                        "updated": UPDATED,
                    },
                )
            for position, copy_id in zip((0, 8, 9, 29), copies, strict=False):
                session.execute(
                    text(
                        "INSERT INTO box_memberships (user_id, box_id, position,"
                        " copy_id) VALUES (:user_id, :box_id, :position, :copy_id)"
                    ),
                    {
                        "user_id": user_id,
                        "box_id": full,
                        "position": position,
                        "copy_id": copy_id,
                    },
                )
            seeded[owner] = {
                "user": user_id,
                "full": full,
                "empty": empty,
                "copies": copies,
            }
    return seeded


def rows(factory, sql):
    with factory() as session:
        return session.execute(text(sql)).all()


def snapshot_boxes(factory):
    return (
        sorted(rows(factory, "SELECT * FROM personal_boxes")),
        sorted(rows(factory, "SELECT * FROM box_memberships")),
    )


def test_0007_follows_0006(binders_database):
    factory, config = binders_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_revision("0007").down_revision == "0006"
    # The box tables are frozen at 0007 (0008 later drops them).
    command.downgrade(config, "0007")
    tables = set(inspect(factory().get_bind()).get_table_names())
    assert {"binders", "binder_pockets", "personal_boxes", "box_memberships"} <= tables


def test_upgrade_maps_every_box_and_slot_and_downgrade_restores_0006(
    binders_database,
):
    factory, config = binders_database
    command.downgrade(config, "0006")
    seeded = seed_boxes(factory)
    before = snapshot_boxes(factory)

    command.upgrade(config, "0007")
    binders = {
        row.id: row
        for row in rows(
            factory,
            "SELECT id, user_id, name, display_order, cover, created_at, updated_at"
            " FROM binders",
        )
    }
    assert len(binders) == 4
    for owner, data in seeded.items():
        full = binders[data["full"]]
        assert (full.user_id, full.name, full.display_order, full.cover) == (
            data["user"],
            f"{owner} box",
            0,
            "noir",
        )
        assert (full.created_at, full.updated_at) == (CREATED, UPDATED)
        assert binders[data["empty"]].name == "Empty"
        assert binders[data["empty"]].display_order == 3
        pockets = rows(
            factory,
            "SELECT page, pocket, copy_id, user_id FROM binder_pockets"
            f" WHERE binder_id = '{data['full']}' ORDER BY page, pocket",
        )
        # Positions 1, 9, 10 and 30 (zero-based 0, 8, 9, 29).
        assert [(p.page, p.pocket) for p in pockets] == [(1, 1), (1, 9), (2, 1), (4, 3)]
        assert [p.copy_id for p in pockets] == data["copies"][:4]
        assert {p.user_id for p in pockets} == {data["user"]}
    assert rows(factory, "SELECT count(*) FROM binder_pockets")[0][0] == 8
    # The box tables are frozen, not rewritten.
    assert snapshot_boxes(factory) == before

    command.downgrade(config, "0006")
    assert snapshot_boxes(factory) == before
    tables = set(inspect(factory().get_bind()).get_table_names())
    assert not {"binders", "binder_pockets"} & tables
    with factory() as session:
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "0006"

    # A second full cycle is clean and maps the same data again.
    command.upgrade(config, "0007")
    assert rows(factory, "SELECT count(*) FROM binder_pockets")[0][0] == 8
    command.downgrade(config, "0006")
    command.upgrade(config, "0007")


@pytest.mark.parametrize(
    "statement",
    [
        "INSERT INTO binders (id, user_id, name, display_order)"
        " VALUES (gen_random_uuid(), :user, ' padded ', 9)",
        "INSERT INTO binders (id, user_id, name, display_order)"
        " VALUES (gen_random_uuid(), :user, 'Negative', -1)",
        "INSERT INTO binders (id, user_id, name, display_order, cover)"
        " VALUES (gen_random_uuid(), :user, 'Sepia', 9, 'sepia')",
        "INSERT INTO binders (id, user_id, name, display_order)"
        " VALUES (gen_random_uuid(), :user, 'Same order', 0)",
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 0, 1, :spare)",
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 41, 1, :spare)",
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 1, 0, :spare)",
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 1, 10, :spare)",
        # Pocket already occupied (primary key).
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 1, 1, :spare)",
        # The same copy in a second pocket (one binder per copy).
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 5, 1, :placed)",
        # A copy of another owner (composite foreign key).
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :binder, 5, 2, :foreign)",
        # Another owner's binder (composite foreign key).
        "INSERT INTO binder_pockets (user_id, binder_id, page, pocket, copy_id)"
        " VALUES (:user, :foreign_binder, 5, 3, :spare)",
    ],
)
def test_postgres_enforces_binder_constraints(binders_database, statement):
    factory, config = binders_database
    command.downgrade(config, "0006")
    seeded = seed_boxes(factory)
    command.upgrade(config, "0007")
    ash, misty = seeded["ash"], seeded["misty"]
    params = {
        "user": ash["user"],
        "binder": ash["full"],
        "spare": ash["copies"][4],
        "placed": ash["copies"][0],
        "foreign": misty["copies"][4],
        "foreign_binder": misty["full"],
    }
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.execute(text(statement), params)


def test_new_binders_default_to_the_noir_cover_and_cascade_only_pockets(
    binders_database,
):
    factory, config = binders_database
    command.downgrade(config, "0006")
    seeded = seed_boxes(factory)
    command.upgrade(config, "0007")
    ash = seeded["ash"]
    with factory.begin() as session:
        session.execute(
            text(
                "INSERT INTO binders (id, user_id, name, display_order)"
                " VALUES (gen_random_uuid(), :user, 'Fresh', 7)"
            ),
            {"user": ash["user"]},
        )
    assert (
        rows(factory, "SELECT cover FROM binders WHERE name = 'Fresh'")[0][0] == "noir"
    )
    with factory.begin() as session:
        session.execute(text("DELETE FROM binders WHERE id = :id"), {"id": ash["full"]})
    # Deleting a binder keeps every copy; deleting a copy frees only its pocket.
    copies = {row[0] for row in rows(factory, "SELECT id FROM inventory_copies")}
    assert set(ash["copies"]) <= copies
    misty = seeded["misty"]
    with factory.begin() as session:
        session.execute(
            text("DELETE FROM inventory_copies WHERE id = :id"),
            {"id": misty["copies"][0]},
        )
    remaining = rows(
        factory,
        f"SELECT page, pocket FROM binder_pockets WHERE binder_id = '{misty['full']}'"
        " ORDER BY page, pocket",
    )
    assert [(r.page, r.pocket) for r in remaining] == [(1, 9), (2, 1), (4, 3)]
