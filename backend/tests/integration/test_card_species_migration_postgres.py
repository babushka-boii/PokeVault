"""Migration 0010 (card species cache) on real PostgreSQL."""

from datetime import UTC, datetime

import pytest
from alembic import command
from sqlalchemy import inspect, text
from sqlalchemy.exc import DataError, IntegrityError

from . import test_auth_postgres
from .test_binders_postgres import insert_pocket, seed_owner

species_database = test_auth_postgres.auth_database
NOW = datetime(2026, 11, 25, tzinfo=UTC)


def tables(factory):
    with factory() as session:
        return set(inspect(session.get_bind()).get_table_names())


def count(factory, table):
    with factory() as session:
        return session.execute(text(f"SELECT count(*) FROM {table}")).scalar()


def test_upgrade_adds_the_cache_and_downgrade_removes_only_it(species_database):
    factory, config = species_database
    assert "card_species" in tables(factory)
    owner = seed_owner(factory, copies=3, binders=1)
    with factory.begin() as session:
        insert_pocket(session, owner, page=1, pocket=1)
        session.execute(
            text(
                "INSERT INTO card_favorites (user_id, card_id) VALUES (:u, 'base1-4')"
            ),
            {"u": owner["user_id"]},
        )
        session.execute(
            text(
                "INSERT INTO card_species (card_id, dex_ids, status, fetched_at) "
                "VALUES ('base1-4', '[6]', 'ok', :t)"
            ),
            {"t": NOW},
        )
    command.downgrade(config, "0009")
    assert "card_species" not in tables(factory)
    # Inventory, binders, pockets, favourites (0009) and every other table survive.
    assert count(factory, "inventory_copies") == 3
    assert count(factory, "binders") == 1 and count(factory, "binder_pockets") == 1
    assert count(factory, "card_favorites") == 1
    assert {"collection_value_days", "card_price_snapshots"} <= tables(factory)
    command.upgrade(config, "head")
    assert "card_species" in tables(factory)
    assert (
        count(factory, "card_species") == 0
    )  # a cache: the downgrade documented this loss


def test_constraints_hold_on_postgres(species_database):
    factory, _ = species_database
    insert = text(
        "INSERT INTO card_species (card_id, dex_ids, status, fetched_at) "
        "VALUES (:c, '[]', :s, :t)"
    )
    with factory.begin() as session:
        session.execute(insert, {"c": "a-1", "s": "ok", "t": NOW})
    for card, status in (
        ("a-1", "ok"),
        ("", "ok"),
        ("x" * 101, "ok"),
        ("b-2", "maybe"),
    ):
        with pytest.raises((IntegrityError, DataError)), factory.begin() as session:
            session.execute(insert, {"c": card, "s": status, "t": NOW})
