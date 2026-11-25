"""Migration 0012 (cover materials, stickers, stored pages) on real PostgreSQL."""

from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import DataError, IntegrityError

from . import test_auth_postgres
from .test_binders_postgres import insert_pocket, seed_owner

custom_database = test_auth_postgres.auth_database


def columns(factory, table):
    with factory() as session:
        return {c["name"] for c in inspect(session.get_bind()).get_columns(table)}


def sticker(session, owner, binder, order, **changes):
    values = {
        "id": uuid4(),
        "user_id": owner["user_id"], "binder_id": binder, "kind": "pixel",
        "species_id": None, "pixel_key": "star", "x": 50, "y": 50, "rotation": 0,
        "scale": 1, "display_order": order, **changes,
    }  # fmt: skip
    session.execute(
        text(
            "INSERT INTO binder_stickers (id, user_id, binder_id, kind, species_id,"
            " pixel_key, x, y, rotation, scale, display_order) VALUES (:id, :user_id,"
            " :binder_id, :kind, :species_id, :pixel_key, :x, :y, :rotation, :scale,"
            " :display_order)"
        ),
        values,
    )


def test_existing_binders_get_their_used_pages_plus_a_spare_and_nothing_else_changes(
    custom_database,
):
    factory, config = custom_database
    command.downgrade(config, "0011")
    assert "page_count" not in columns(factory, "binders")
    owner = seed_owner(factory, copies=3, binders=2)
    with factory.begin() as session:
        insert_pocket(
            session,
            owner,
            binder=owner["binders"][0],
            copy=owner["copies"][0],
            page=1,
            pocket=1,
        )
        insert_pocket(
            session,
            owner,
            binder=owner["binders"][0],
            copy=owner["copies"][1],
            page=5,
            pocket=2,
        )
    command.upgrade(config, "head")
    with factory() as session:
        pages = dict(session.execute(text("SELECT id, page_count FROM binders")).all())
        assert pages[owner["binders"][0]] == 6  # page 5 + a spare, rounded to even
        assert pages[owner["binders"][1]] == 2  # empty binder
        assert (
            session.execute(text("SELECT count(*) FROM binder_pockets")).scalar() == 2
        )
        assert (
            session.execute(text("SELECT count(*) FROM inventory_copies")).scalar() == 3
        )
        assert {r[0] for r in session.execute(text("SELECT cover FROM binders"))} == {
            "noir"
        }


def test_database_bounds_hold_even_for_raw_sql(custom_database):
    factory, _ = custom_database
    owner = seed_owner(factory, copies=1, binders=2)
    one, two = owner["binders"]
    for bad in (
        {"kind": "pokemon", "species_id": 1026, "pixel_key": None},
        {"kind": "pokemon", "species_id": 25},                      # a pixel key too
        {"kind": "pixel", "pixel_key": "dragon"},
        {"kind": "pixel", "species_id": 25},
        {"kind": "image"},
        {"x": 101}, {"y": -1}, {"rotation": 181}, {"scale": 0.4}, {"scale": 2.1},
        {"display_order": 24},
    ):  # fmt: skip
        with pytest.raises((IntegrityError, DataError)), factory.begin() as session:
            sticker(session, owner, one, 0, **bad)
    with factory.begin() as session:
        sticker(session, owner, one, 0)
    with pytest.raises(IntegrityError), factory.begin() as session:
        sticker(
            session, owner, one, 0, id="00000000-0000-4000-8000-0000000000aa"
        )  # same order
    with factory.begin() as session:
        sticker(session, owner, two, 0)  # the order is per binder
    for pages in (1, 3, 42, 0):
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.execute(
                text("UPDATE binders SET page_count = :p WHERE id = :id"),
                {"p": pages, "id": one},
            )
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.execute(
            text("UPDATE binders SET cover = 'gold' WHERE id = :id"), {"id": one}
        )
    for cover in ("brown_leather", "metallic", "holographic", "white"):
        with factory.begin() as session:
            session.execute(
                text("UPDATE binders SET cover = :c WHERE id = :id"),
                {"c": cover, "id": one},
            )


def test_stickers_cannot_point_at_another_owners_binder_and_cascade(custom_database):
    factory, _ = custom_database
    ash = seed_owner(factory, copies=1, binders=1)
    misty = seed_owner(factory, copies=1, binders=1)
    with pytest.raises(IntegrityError), factory.begin() as session:
        sticker(
            session, ash, misty["binders"][0], 0
        )  # ash's user id with misty's binder
    with factory.begin() as session:
        sticker(session, ash, ash["binders"][0], 0)
        session.execute(
            text("DELETE FROM binders WHERE id = :id"), {"id": ash["binders"][0]}
        )
    with factory() as session:
        assert (
            session.execute(text("SELECT count(*) FROM binder_stickers")).scalar() == 0
        )


def test_downgrade_loses_only_the_personalization(custom_database):
    factory, config = custom_database
    owner = seed_owner(factory, copies=2, binders=1)
    one = owner["binders"][0]
    with factory.begin() as session:
        insert_pocket(
            session, owner, binder=one, copy=owner["copies"][0], page=3, pocket=4
        )
        session.execute(
            text("UPDATE binders SET cover = 'holographic' WHERE id = :id"), {"id": one}
        )
        sticker(session, owner, one, 0)
    command.downgrade(config, "0011")
    assert "binder_stickers" not in inspect(factory().get_bind()).get_table_names()
    assert "page_count" not in columns(factory, "binders")
    with factory() as session:
        assert session.execute(text("SELECT cover FROM binders")).scalar() == "noir"
        assert (
            session.execute(text("SELECT count(*) FROM binder_pockets")).scalar() == 1
        )
        assert (
            session.execute(text("SELECT count(*) FROM inventory_copies")).scalar() == 2
        )
    with (
        pytest.raises(IntegrityError),
        factory.begin() as session,
    ):  # the noir-only check is back
        session.execute(text("UPDATE binders SET cover = 'white'"))
    command.upgrade(config, "head")
    assert "page_count" in columns(factory, "binders")
