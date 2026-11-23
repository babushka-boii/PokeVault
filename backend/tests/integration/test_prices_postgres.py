"""Migration 0005 and price storage on real PostgreSQL, in disposable schemas."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.db.models import InventoryCopy, User, UserSettings
from app.prices import store
from app.prices.schemas import ExchangeRates, PriceSnapshot

from . import test_auth_postgres

prices_database = test_auth_postgres.auth_database
NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def seed_user_with_copy(factory):
    """Raw settings insert: the ORM model already knows the 0005 column."""
    with factory.begin() as session:
        user = User(google_sub=uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        session.execute(
            text(
                "INSERT INTO user_settings (user_id, preferred_language)"
                " VALUES (:user_id, 'es')"
            ),
            {"user_id": user.id},
        )
        copy = InventoryCopy(
            user_id=user.id,
            card_id="me05-044",
            condition="mint",
            language="es",
            variant="reverse",
            notes="Kept across 0005",
        )
        session.add(copy)
        session.flush()
        return user.id, copy.id


def table_names(factory):
    with factory() as session:
        return set(inspect(session.get_bind()).get_table_names())


def test_0005_follows_0004_and_creates_the_price_tables(prices_database):
    factory, config = prices_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0005"
    assert scripts.get_revision("0005").down_revision == "0004"
    assert {"card_price_snapshots", "exchange_rates"} <= table_names(factory)
    with factory() as session:
        columns = {
            column["name"]: column
            for column in inspect(session.get_bind()).get_columns("user_settings")
        }
        assert columns["preferred_currency"]["nullable"] is False
        assert "card_price_snapshots" in inspect(session.get_bind()).get_table_names()


def test_downgrade_and_upgrade_keep_inventory_and_default_existing_users_to_clp(
    prices_database,
):
    factory, config = prices_database
    command.downgrade(config, "0004")
    user_id, copy_id = seed_user_with_copy(factory)
    assert not {"card_price_snapshots", "exchange_rates"} & table_names(factory)
    with factory() as session:
        columns = {
            column["name"]
            for column in inspect(session.get_bind()).get_columns("user_settings")
        }
        assert "preferred_currency" not in columns
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "0004"

    command.upgrade(config, "head")
    with factory() as session:
        assert session.get(UserSettings, user_id).preferred_currency == "CLP"
        copy = session.get(InventoryCopy, copy_id)
        assert (copy.card_id, copy.variant, copy.notes) == (
            "me05-044",
            "reverse",
            "Kept across 0005",
        )
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "0005"

    # A second full cycle is also clean (constraints are recreated by name).
    command.downgrade(config, "0004")
    command.upgrade(config, "head")
    assert {"card_price_snapshots", "exchange_rates"} <= table_names(factory)


def test_postgres_enforces_price_and_rate_constraints(prices_database):
    factory, _ = prices_database
    bad_statements = [
        "INSERT INTO card_price_snapshots (card_id, status, cm_trend)"
        " VALUES ('a-1', 'ok', 0)",
        "INSERT INTO card_price_snapshots (card_id, status, cm_trend)"
        " VALUES ('a-2', 'ok', -1)",
        "INSERT INTO card_price_snapshots (card_id, status, tp_normal)"
        " VALUES ('a-3', 'ok', 1000000.01)",
        "INSERT INTO card_price_snapshots (card_id, status, cm_trend)"
        " VALUES ('a-4', 'no_data', 1)",
        "INSERT INTO card_price_snapshots (card_id, status) VALUES ('a-5', 'ok')",
        "INSERT INTO card_price_snapshots (card_id, status) VALUES ('a-6', 'other')",
        "INSERT INTO exchange_rates (source, usd_clp, eur_per_usd, rates_updated_at,"
        " fetched_at) VALUES ('x', 0, 0.9, now(), now())",
        "INSERT INTO exchange_rates (source, usd_clp) VALUES ('x', 1000)",
        "INSERT INTO exchange_rates (source, usd_clp, eur_per_usd, rates_updated_at)"
        " VALUES ('x', 1000, 0.9, now())",
    ]
    for statement in bad_statements:
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.execute(text(statement))
    user_id, _ = seed_user_with_copy(factory)
    for currency in ("EUR", "clp", ""):
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.execute(
                text("UPDATE user_settings SET preferred_currency = :c"),
                {"c": currency},
            )
    with factory() as session:
        assert session.get(UserSettings, user_id).preferred_currency == "CLP"


def test_snapshot_and_rates_persist_across_sessions_with_exact_decimals(
    prices_database,
):
    factory, _ = prices_database
    snapshot = PriceSnapshot(
        status="ok",
        cm_trend=Decimal("25000.50"),
        cm_trend_reverse=Decimal("0.07"),
        cm_updated=datetime(2026, 11, 22, 22, 16, 19, tzinfo=UTC),
        tp_holofoil=Decimal("0.66"),
        tp_updated=datetime(2026, 11, 22, 22, 16, 35, tzinfo=UTC),
        has_normal=True,
        has_holo=True,
        has_reverse=False,
    )
    rates = ExchangeRates(
        usd_clp=Decimal("1016.589577"),
        eur_per_usd=Decimal("0.911134"),
        updated_at=datetime(2026, 11, 23, 0, 2, 32, tzinfo=UTC),
    )
    with factory.begin() as session:
        store.save_snapshot(session, "me05-044", snapshot, NOW)
        store.save_rates(session, rates, NOW)
    with factory() as session:
        found = store.get_snapshots(session, ["me05-044"])["me05-044"]
        stored = store.get_rates(session)
    assert found.snapshot == snapshot
    assert found.fetched_at == NOW
    assert stored.rates == rates
    assert (stored.fetched_at, stored.last_attempt_at) == (NOW, NOW)


def test_sub_cent_prices_are_stored_and_read_back_without_losing_precision(
    prices_database,
):
    factory, _ = prices_database
    tiny = PriceSnapshot(
        status="ok",
        cm_trend=Decimal("0.004"),
        cm_trend_reverse=Decimal("0.0001"),
        tp_normal=Decimal("0.0035"),
    )
    with factory.begin() as session:
        store.save_snapshot(session, "tiny-1", tiny, NOW)
    with factory() as session:
        found = store.get_snapshots(session, ["tiny-1"])["tiny-1"].snapshot
        raw = session.execute(
            text(
                "SELECT cm_trend, cm_trend_reverse, tp_normal FROM card_price_snapshots"
            )
        ).one()
    assert found == tiny
    assert raw == (Decimal("0.0040"), Decimal("0.0001"), Decimal("0.0035"))
    # A value that cannot be represented is rejected, never silently stored as 0.
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.execute(
            text(
                "INSERT INTO card_price_snapshots (card_id, status, cm_trend)"
                " VALUES ('tiny-2', 'ok', 0.00004)"
            )
        )


def test_upsert_replaces_the_row_and_failures_keep_old_rates(prices_database):
    factory, _ = prices_database
    older = PriceSnapshot(status="ok", cm_trend=Decimal("1.00"))
    newer = PriceSnapshot(status="ok", tp_normal=Decimal("2.00"))
    with factory.begin() as session:
        store.save_snapshot(session, "base1-4", older, NOW)
    with factory.begin() as session:
        store.save_snapshot(session, "base1-4", newer, NOW + timedelta(hours=25))
    rates = ExchangeRates(Decimal("1000"), Decimal("0.8"), NOW)
    with factory.begin() as session:
        store.save_rates(session, rates, NOW)
    with factory.begin() as session:
        store.record_rates_failure(session, NOW + timedelta(hours=25))
    with factory() as session:
        assert session.scalar(text("SELECT count(*) FROM card_price_snapshots")) == 1
        assert session.scalar(text("SELECT count(*) FROM exchange_rates")) == 1
        row = store.get_snapshots(session, ["base1-4"])["base1-4"]
        kept = store.get_rates(session)
    assert row.snapshot == newer
    assert row.snapshot.cm_trend is None  # replaced, not merged
    assert kept.rates == rates
    assert kept.last_attempt_at == NOW + timedelta(hours=25)


def test_user_deletion_leaves_shared_prices_untouched(prices_database):
    factory, _ = prices_database
    user_id, _ = seed_user_with_copy(factory)
    with factory.begin() as session:
        store.save_snapshot(
            session, "me05-044", PriceSnapshot(status="ok", cm_trend=Decimal("1")), NOW
        )
    with factory.begin() as session:
        session.delete(session.get(User, user_id))
    with factory() as session:
        assert set(store.get_snapshots(session, ["me05-044"])) == {"me05-044"}
