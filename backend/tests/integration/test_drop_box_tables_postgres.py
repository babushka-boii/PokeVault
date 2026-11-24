"""Migration 0008: drop the frozen box tables; downgrade rebuilds boxes from binders."""

from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from . import test_auth_postgres
from .test_binders_postgres import insert_binder, insert_pocket, seed_owner

drop_database = test_auth_postgres.auth_database


def table(factory, name):
    with factory() as session:
        return session.execute(text(f"SELECT * FROM {name}")).mappings().all()


def names(factory):
    with factory() as session:
        return set(inspect(session.get_bind()).get_table_names())


def flat(index):
    """(page, pocket) of a zero-based flat pocket index."""
    return index // 9 + 1, index % 9 + 1


def seed_binder(factory, owner, name, indexes, order=None, binder_id=None):
    """Raw binder holding the owner's next free copies at the given flat indexes."""
    binder_id = binder_id or uuid4()
    with factory.begin() as session:
        insert_binder(
            session,
            binder_id,
            owner["user_id"],
            name=name,
            display_order=len(owner.setdefault("seeded", []))
            if order is None
            else order,
        )
        owner["seeded"].append(binder_id)
        for index in indexes:
            copy = owner["spare"].pop(0)
            page, pocket = flat(index)
            insert_pocket(
                session, owner, binder=binder_id, copy=copy, page=page, pocket=pocket
            )
    return binder_id


def owner_with_spare(factory, copies):
    owner = seed_owner(factory, copies=copies, binders=0)
    owner["spare"] = list(owner["copies"])
    return owner


def boxes_by_name(factory, owner):
    return {
        row["name"]: row
        for row in table(factory, "personal_boxes")
        if row["user_id"] == owner["user_id"]
    }


def positions(factory, box_id):
    return sorted(
        row["position"]
        for row in table(factory, "box_memberships")
        if row["box_id"] == box_id
    )


def test_0008_follows_0007_and_is_the_head(drop_database):
    _, config = drop_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0008"
    assert scripts.get_revision("0008").down_revision == "0007"


def test_upgrade_drops_only_the_box_tables_and_keeps_inventory_and_binders(
    drop_database,
):
    factory, config = drop_database
    command.downgrade(config, "0007")
    assert {"personal_boxes", "box_memberships"} <= names(factory)
    owner = owner_with_spare(factory, 6)
    seed_binder(factory, owner, "Kanto", [0, 8, 9, 29])
    before = {
        name: table(factory, name)
        for name in ("inventory_copies", "binders", "binder_pockets", "users")
    }
    assert len(before["binder_pockets"]) == 4

    command.upgrade(config, "head")
    assert not {"personal_boxes", "box_memberships"} & names(factory)
    assert {"binders", "binder_pockets", "inventory_copies"} <= names(factory)
    for name, rows in before.items():
        assert table(factory, name) == rows
    with factory() as session:
        inspector = inspect(session.get_bind())
        assert ["user_id", "id"] in [
            k["column_names"]
            for k in inspector.get_unique_constraints("inventory_copies")
        ]
        assert "uq_inventory_owner_id" in {
            k["name"] for k in inspector.get_unique_constraints("inventory_copies")
        }
    # The binder foreign key to inventory still works and still rejects forged owners.
    with factory.begin() as session:
        insert_pocket(
            session,
            owner,
            binder=owner["seeded"][0],
            copy=owner["spare"][0],
            page=3,
            pocket=3,
        )
    other = owner_with_spare(factory, 1)
    with (
        pytest.raises(Exception, match="fk_binder_pocket_owned_copy"),
        factory.begin() as session,
    ):
        insert_pocket(
            session,
            owner,
            binder=owner["seeded"][0],
            copy=other["spare"][0],
            page=3,
            pocket=4,
        )


def test_downgrade_rebuilds_boxes_of_thirty_pockets_from_each_binder(drop_database):
    factory, config = drop_database
    owner = owner_with_spare(factory, 7)
    # Flat indexes 0 and 29 fill box 1; 30 starts box 2; 359 (page 40, pocket 9) is box
    # 12; 100 lands in box 4.
    first = seed_binder(factory, owner, "Kanto", [0, 29, 30, 359, 100])
    empty = seed_binder(factory, owner, "Vacía", [])
    command.downgrade(config, "0007")
    boxes = boxes_by_name(factory, owner)
    assert set(boxes) == {"Kanto", "Kanto (2)", "Kanto (4)", "Kanto (12)", "Vacía"}
    assert boxes["Kanto"]["id"] == first  # the first box keeps the binder id
    assert boxes["Vacía"]["id"] == empty
    assert positions(factory, boxes["Kanto"]["id"]) == [0, 29]
    assert positions(factory, boxes["Kanto (2)"]["id"]) == [0]
    assert positions(factory, boxes["Kanto (4)"]["id"]) == [
        10
    ]  # index 100 → box 3, position 10
    assert positions(factory, boxes["Kanto (12)"]["id"]) == [29]
    assert positions(factory, boxes["Vacía"]["id"]) == []
    assert {row["wallpaper"] for row in boxes.values()} == {"noir"}
    # Sequential, unique per-owner order: binder order first, then box number.
    ordered = sorted(boxes.values(), key=lambda row: row["display_order"])
    assert [row["display_order"] for row in ordered] == list(range(5))
    assert [row["name"] for row in ordered] == [
        "Kanto",
        "Kanto (2)",
        "Kanto (4)",
        "Kanto (12)",
        "Vacía",
    ]
    # Every copy is in exactly one box; binders remain (0007 has not been reverted).
    assert {row["copy_id"] for row in table(factory, "box_memberships")} == set(
        owner["copies"][:5]
    )
    assert len(table(factory, "box_memberships")) == 5
    assert {"binders", "binder_pockets"} <= names(factory)


def test_downgrade_truncates_long_names_to_fit_the_suffix_without_a_trailing_space(
    drop_database,
):
    factory, config = drop_database
    owner = owner_with_spare(factory, 3)
    # 80 characters with a space right where the " (2)" cut falls.
    long_name = "A" * 75 + " " + "BBBB"
    assert len(long_name) == 80
    seed_binder(factory, owner, long_name, [0, 30, 359])
    command.downgrade(config, "0007")
    assert set(boxes_by_name(factory, owner)) == {
        long_name,
        "A" * 75 + " (2)",  # cut at 76 characters, trailing space removed
        "A" * 75 + " (12)",  # a longer suffix cuts at 75 characters
    }
    assert all(
        len(name) <= 80 and name == name.strip()
        for name in boxes_by_name(factory, owner)
    )


def test_owners_stay_isolated_when_rebuilding(drop_database):
    factory, config = drop_database
    ash = owner_with_spare(factory, 3)
    misty = owner_with_spare(factory, 3)
    seed_binder(factory, ash, "Mía", [0, 1])
    seed_binder(factory, misty, "Tuya", [0, 31])
    command.downgrade(config, "0007")
    for owner, expected in ((ash, {"Mía"}), (misty, {"Tuya", "Tuya (2)"})):
        mine = boxes_by_name(factory, owner)
        assert set(mine) == expected
        assert sorted(row["display_order"] for row in mine.values()) == list(
            range(len(expected))
        )
        placed = {
            row["copy_id"]
            for row in table(factory, "box_memberships")
            if row["user_id"] == owner["user_id"]
        }
        assert placed <= set(owner["copies"])
    assert not {
        row["copy_id"]
        for row in table(factory, "box_memberships")
        if row["user_id"] == ash["user_id"]
    } & set(misty["copies"])


def test_upgrade_downgrade_upgrade_leaves_binders_identical(drop_database):
    factory, config = drop_database
    owner = owner_with_spare(factory, 5)
    seed_binder(factory, owner, "Kanto", [0, 9, 40])
    seed_binder(factory, owner, "Johto", [3])
    binders = table(factory, "binders")
    pockets = sorted(
        table(factory, "binder_pockets"),
        key=lambda row: (row["binder_id"], row["page"], row["pocket"]),
    )
    command.downgrade(config, "0007")
    command.upgrade(config, "head")
    assert table(factory, "binders") == binders
    assert (
        sorted(
            table(factory, "binder_pockets"),
            key=lambda row: (row["binder_id"], row["page"], row["pocket"]),
        )
        == pockets
    )
    assert not {"personal_boxes", "box_memberships"} & names(factory)


def test_going_back_to_0006_and_forward_keeps_every_copy(drop_database):
    factory, config = drop_database
    owner = owner_with_spare(factory, 6)
    # A binder within its first 30 pockets returns to exactly the same pockets.
    small = seed_binder(factory, owner, "Pequeña", [0, 8, 9, 29])
    # A larger binder is split into boxes; its copies come back as separate binders.
    large = seed_binder(factory, owner, "Grande", [1, 31])
    placed = {
        row["copy_id"]: (row["page"], row["pocket"])
        for row in table(factory, "binder_pockets")
    }
    command.downgrade(config, "0006")
    assert not {"binders", "binder_pockets"} & names(factory)
    command.upgrade(config, "head")
    after = table(factory, "binder_pockets")
    assert {row["copy_id"] for row in after} == set(placed)
    small_pockets = {
        row["copy_id"]: (row["page"], row["pocket"])
        for row in after
        if row["binder_id"] == small
    }
    assert (
        small_pockets
        == {copy: place for copy, place in placed.items() if copy in small_pockets}
        and len(small_pockets) == 4
    )
    names_after = {row["name"] for row in table(factory, "binders")}
    assert {"Pequeña", "Grande", "Grande (2)"} == names_after
    assert large in {row["id"] for row in table(factory, "binders")}
