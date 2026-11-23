"""Price storage and freshness rules (SQLite here; PostgreSQL in integration tests)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.db.models import CardPriceSnapshot, ExchangeRate, User, UserSettings
from app.prices import store
from app.prices.schemas import ExchangeRates, PriceSnapshot

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
RATES = ExchangeRates(
    usd_clp=Decimal("1016.589577"),
    eur_per_usd=Decimal("0.911134"),
    updated_at=datetime(2026, 11, 23, 0, 2, 32, tzinfo=UTC),
)


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def snap(**values):
    base = {"status": "ok", "cm_trend": Decimal("0.83")}
    return PriceSnapshot(**{**base, **values})


# --- Freshness (exact boundaries) --------------------------------------------------


@pytest.mark.parametrize(
    ("age", "ttl", "fresh"),
    [
        (timedelta(hours=23, minutes=59, seconds=59), store.SNAPSHOT_TTL, True),
        (timedelta(hours=24), store.SNAPSHOT_TTL, False),
        (timedelta(hours=24), store.RATES_TTL, False),
        (timedelta(hours=23, minutes=59), store.RATES_TTL, True),
        (timedelta(0), store.SNAPSHOT_TTL, True),
        (timedelta(seconds=-5), store.SNAPSHOT_TTL, True),  # small clock skew
    ],
)
def test_is_fresh_boundaries(age, ttl, fresh):
    assert store.is_fresh(NOW - age, NOW, ttl) is fresh


def test_ttl_constants_follow_the_spec():
    assert timedelta(hours=24) == store.SNAPSHOT_TTL
    assert timedelta(hours=24) == store.RATES_TTL
    assert timedelta(minutes=20) == store.RATES_RETRY_GAP


def stored_rates(fetched_ago, attempt_ago, with_rates=True):
    return store.StoredRates(
        rates=RATES if with_rates else None,
        fetched_at=NOW - fetched_ago if with_rates else None,
        last_attempt_at=NOW - attempt_ago,
    )


def test_rates_refresh_policy():
    minute = timedelta(minutes=1)
    assert store.rates_refresh_allowed(None, NOW) is True
    # Fresh rates are never refreshed.
    assert (
        store.rates_refresh_allowed(stored_rates(10 * minute, 10 * minute), NOW)
        is False
    )
    old = timedelta(hours=24)
    # Stale rates refresh only once the 20-minute gap since the last attempt passed.
    assert store.rates_refresh_allowed(stored_rates(old, 19 * minute), NOW) is False
    assert store.rates_refresh_allowed(stored_rates(old, 20 * minute), NOW) is True
    # No rates ever stored: a failed first attempt also waits 20 minutes.
    never = stored_rates(old, 5 * minute, with_rates=False)
    assert store.rates_refresh_allowed(never, NOW) is False
    never = stored_rates(old, 20 * minute, with_rates=False)
    assert store.rates_refresh_allowed(never, NOW) is True


# --- Snapshots ------------------------------------------------------------------------


def test_snapshot_round_trip_preserves_values_and_utc_timestamps(factory):
    original = snap(
        cm_trend_reverse=Decimal("0.07"),
        cm_updated=datetime(2026, 11, 22, 22, 16, 19, tzinfo=UTC),
        tp_normal=Decimal("0.19"),
        tp_holofoil=None,
        tp_reverse=Decimal("0.25"),
        tp_updated=datetime(2026, 11, 22, 22, 16, 35, tzinfo=UTC),
        has_normal=True,
        has_holo=False,
        has_reverse=None,
    )
    with factory.begin() as session:
        store.save_snapshot(session, "me05-044", original, NOW)
    with factory() as session:
        found = store.get_snapshots(session, ["me05-044", "missing-1"])
    assert set(found) == {"me05-044"}
    assert found["me05-044"].snapshot == original
    assert found["me05-044"].fetched_at == NOW
    assert found["me05-044"].fetched_at.tzinfo is not None


def test_sub_cent_prices_survive_storage_exactly(factory):
    tiny = snap(cm_trend=Decimal("0.004"), tp_normal=Decimal("0.0001"))
    with factory.begin() as session:
        store.save_snapshot(session, "tiny-1", tiny, NOW)
    with factory() as session:
        assert store.get_snapshots(session, ["tiny-1"])["tiny-1"].snapshot == tiny


def test_saving_again_replaces_the_row_without_duplicates(factory):
    with factory.begin() as session:
        store.save_snapshot(session, "base1-4", snap(), NOW)
    later = NOW + timedelta(hours=25)
    with factory.begin() as session:
        store.save_snapshot(
            session, "base1-4", snap(cm_trend=Decimal("1.10"), tp_normal=None), later
        )
    with factory() as session:
        assert session.scalar(text("SELECT count(*) FROM card_price_snapshots")) == 1
        found = store.get_snapshots(session, ["base1-4"])["base1-4"]
    assert found.snapshot.cm_trend == Decimal("1.10")
    assert found.fetched_at == later


def test_no_data_snapshots_are_stored_so_they_are_not_refetched(factory):
    empty = PriceSnapshot(status="no_data", has_normal=True)
    with factory.begin() as session:
        store.save_snapshot(session, "x1-1", empty, NOW)
    with factory() as session:
        assert store.get_snapshots(session, ["x1-1"])["x1-1"].snapshot == empty


def test_get_snapshots_handles_many_ids_and_empty_input(factory):
    with factory() as session:
        assert store.get_snapshots(session, []) == {}
    with factory.begin() as session:
        store.save_snapshot(session, "set1-1", snap(), NOW)
    ids = [f"set1-{n}" for n in range(1, 1300)]
    with factory() as session:
        assert set(store.get_snapshots(session, ids)) == {"set1-1"}


@pytest.mark.parametrize(
    "bad",
    [
        {"cm_trend": Decimal("0")},
        {"cm_trend": Decimal("-0.01")},
        {"tp_normal": Decimal("1000000.01")},
        {"status": "weird"},
        {"status": "no_data"},  # claims no data but carries a price
    ],
)
def test_snapshot_constraints_reject_inconsistent_rows(factory, bad):
    with pytest.raises(IntegrityError), factory.begin() as session:
        store.save_snapshot(session, "bad-1", snap(**bad), NOW)


def test_no_data_snapshot_cannot_carry_a_price_but_ok_must_have_one(factory):
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            CardPriceSnapshot(card_id="bad-2", status="ok", fetched_at=NOW)
        )  # ok without any price


def test_snapshot_card_id_is_primary_key(factory):
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            CardPriceSnapshot(card_id="dup-1", status="ok", cm_trend=1, fetched_at=NOW)
        )
        session.add(
            CardPriceSnapshot(card_id="dup-1", status="ok", cm_trend=2, fetched_at=NOW)
        )


# --- Exchange rates ---


def test_rates_round_trip_and_failure_keeps_previous_values(factory):
    with factory() as session:
        assert store.get_rates(session) is None
    with factory.begin() as session:
        store.save_rates(session, RATES, NOW)
    later = NOW + timedelta(hours=25)
    with factory.begin() as session:
        store.record_rates_failure(session, later)
    with factory() as session:
        found = store.get_rates(session)
        assert session.scalar(text("SELECT count(*) FROM exchange_rates")) == 1
    assert found.rates == RATES
    assert found.rates.updated_at.tzinfo is not None
    assert found.fetched_at == NOW
    assert found.last_attempt_at == later


def test_first_ever_failure_creates_a_rates_free_row_for_the_backoff(factory):
    with factory.begin() as session:
        store.record_rates_failure(session, NOW)
    with factory() as session:
        found = store.get_rates(session)
    assert found.rates is None
    assert found.fetched_at is None
    assert found.last_attempt_at == NOW
    assert store.rates_refresh_allowed(found, NOW + timedelta(minutes=19)) is False
    assert store.rates_refresh_allowed(found, NOW + timedelta(minutes=20)) is True


def test_successful_refresh_replaces_rates_and_attempt_time(factory):
    with factory.begin() as session:
        store.record_rates_failure(session, NOW)
    newer = ExchangeRates(Decimal("1020"), Decimal("0.9"), RATES.updated_at)
    with factory.begin() as session:
        store.save_rates(session, newer, NOW + timedelta(minutes=30))
    with factory() as session:
        found = store.get_rates(session)
    assert found.rates == newer
    assert found.last_attempt_at == NOW + timedelta(minutes=30)


@pytest.mark.parametrize(
    "values",
    [
        {"usd_clp": 0},
        {"usd_clp": -1},
        {"eur_per_usd": 0},
        {"fetched_at": None},  # rates without a fetch time
        {"usd_clp": None},  # half-filled rates
    ],
)
def test_rates_constraints_reject_inconsistent_rows(factory, values):
    row = {
        "source": store.RATES_SOURCE,
        "usd_clp": 1000,
        "eur_per_usd": Decimal("0.9"),
        "rates_updated_at": NOW,
        "fetched_at": NOW,
        "last_attempt_at": NOW,
    }
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(ExchangeRate(**{**row, **values}))


# --- Currency preference ---


def test_preferred_currency_defaults_to_clp_and_rejects_unknown_values(factory):
    with factory.begin() as session:
        user = User(google_sub="ash", display_name="Ash")
        session.add(user)
        session.flush()
        session.add(UserSettings(user_id=user.id))
        user_id = user.id
    with factory() as session:
        assert session.get(UserSettings, user_id).preferred_currency == "CLP"
    with factory.begin() as session:
        session.get(UserSettings, user_id).preferred_currency = "USD"
    with factory() as session:
        assert session.get(UserSettings, user_id).preferred_currency == "USD"
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.get(UserSettings, user_id).preferred_currency = "EUR"
