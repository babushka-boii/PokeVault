"""Migration 0009 (favourites, daily value records, guide state) on real PostgreSQL."""

from datetime import date

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from . import test_auth_postgres
from .test_binders_postgres import insert_pocket, seed_owner

home_database = test_auth_postgres.auth_database


def tables(factory):
    with factory() as session:
        return set(inspect(session.get_bind()).get_table_names())


def columns(factory, table):
    with factory() as session:
        return {c["name"] for c in inspect(session.get_bind()).get_columns(table)}


def count(factory, table):
    with factory() as session:
        return session.execute(text(f"SELECT count(*) FROM {table}")).scalar()


def test_upgrade_adds_the_home_tables_and_downgrade_removes_only_them(home_database):
    factory, config = home_database
    assert {"card_favorites", "collection_value_days"} <= tables(factory)
    assert "home_guide_dismissed_at" in columns(factory, "user_settings")
    owner = seed_owner(factory, copies=3, binders=1)
    with factory.begin() as session:
        insert_pocket(session, owner, page=1, pocket=1)
        session.execute(
            text(
                "INSERT INTO card_favorites (user_id, card_id) VALUES (:u, 'base1-4')"
            ),
            {"u": owner["user_id"]},
        )
    command.downgrade(config, "0008")
    assert not {"card_favorites", "collection_value_days"} & tables(factory)
    assert "home_guide_dismissed_at" not in columns(factory, "user_settings")
    # Inventory, binders and pockets survive the round trip untouched.
    assert count(factory, "inventory_copies") == 3
    assert count(factory, "binders") == 1
    assert count(factory, "binder_pockets") == 1
    command.upgrade(config, "head")
    assert {"card_favorites", "collection_value_days"} <= tables(factory)
    assert count(factory, "card_favorites") == 0  # the downgrade documented this loss
    assert count(factory, "binder_pockets") == 1


def test_constraints_and_cascades_hold_on_postgres(home_database):
    factory, _ = home_database
    ash = seed_owner(factory, copies=1, binders=0)
    misty = seed_owner(factory, copies=1, binders=0)
    record = {
        "eur": "10.00",
        "usd": "2.50",
        "clp": 12000,
        "usdt": "13.00",
        "rate": "920.5",
        "eurusd": "0.92",
        "day": date(2026, 11, 25),
    }
    insert = text(
        "INSERT INTO collection_value_days (user_id, day, eur_total, "
        "usd_original_total, clp_total, usd_total, usd_clp, eur_per_usd, "
        "copy_count, priced_count) "
        "VALUES (:u, :day, :eur, :usd, :clp, :usdt, :rate, :eurusd, 3, 3)"
    )
    with factory.begin() as session:
        for owner in (ash, misty):
            session.execute(insert, {"u": owner["user_id"], **record})
    with (
        pytest.raises(IntegrityError),
        factory.begin() as session,
    ):  # one per user and day
        session.execute(insert, {"u": ash["user_id"], **record})
    with pytest.raises(IntegrityError), factory.begin() as session:  # all or none
        session.execute(
            insert,
            {"u": ash["user_id"], **record, "day": date(2026, 11, 26), "clp": None},
        )
    with pytest.raises(IntegrityError), factory.begin() as session:  # priced <= copies
        session.execute(
            text(str(insert).replace("3, 3)", "3, 4)")),
            {"u": ash["user_id"], **record, "day": date(2026, 11, 27)},
        )
    with factory.begin() as session:
        session.execute(text("DELETE FROM users WHERE id = :u"), {"u": ash["user_id"]})
    assert count(factory, "collection_value_days") == 1  # only Misty's record is left
