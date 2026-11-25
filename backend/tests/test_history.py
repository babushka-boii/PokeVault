"""Daily value records: lazy, complete-only, per user, never invented."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
import test_prices_api
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.models import CollectionValueDay
from app.prices.rates import RatesUnavailable
from app.prices.service import PriceService

home = test_prices_api.prices
identity = test_prices_api.identity
seed = test_prices_api.seed
copy = test_prices_api.copy
PATH = "/api/v1/collection/history"
NOON = datetime(2026, 11, 25, 15, 0, tzinfo=UTC)  # 12:00 in Santiago (UTC-3)


def clock(app, moment):
    """Make the price service (and so "today") read a fixed instant."""
    app.state.price_service = PriceService(
        app.state.price_service._provider,
        app.state.price_service._rates_client,
        clock=lambda: moment,
    )


def records(factory, user_id):
    with factory() as session:
        return {
            row.day: row
            for row in session.scalars(
                select(CollectionValueDay).where(CollectionValueDay.user_id == user_id)
            )
        }


def add_day(factory, user_id, when, clp="12000", usd="13.00", **changes):
    values = {
        "user_id": user_id,
        "day": when,
        "eur_total": Decimal("10"),
        "usd_original_total": Decimal("1"),
        "clp_total": Decimal(clp) if clp else None,
        "usd_total": Decimal(usd) if usd else None,
        "usd_clp": Decimal("900") if clp else None,
        "eur_per_usd": Decimal("0.9") if clp else None,
        "copy_count": 2,
        "priced_count": 2,
    }
    with factory.begin() as session:
        session.add(CollectionValueDay(**(values | changes)))


def test_the_first_load_of_the_day_records_a_complete_valuation(home):
    client, factory, app, users, _, _ = home
    seed(factory, users)
    clock(app, NOON)
    identity(client, "ash")
    response = client.get(PATH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["currency"] == "CLP" and body["range"] == "30d"
    assert body["started_on"] == "2026-11-25"
    assert body["points"] == [{"day": "2026-11-25", "total": "1112"}]
    assert body["baseline"] is None
    row = records(factory, users["ash"])[date(2026, 11, 25)]
    # Originals in their own currencies; both converted totals, with that day's rates.
    assert (row.eur_total, row.usd_original_total) == (Decimal("0.89"), Decimal("0"))
    assert row.clp_total == Decimal("1112") and row.usd_total == Decimal("1.11")
    assert (row.usd_clp, row.eur_per_usd) == (Decimal("1000"), Decimal("0.8"))
    assert (row.copy_count, row.priced_count) == (5, 3)
    assert "1000" not in response.text and "usd_clp" not in response.text


def test_the_record_is_kept_all_day_and_never_updated(home):
    client, factory, app, users, _, _ = home
    ids = seed(factory, users)
    clock(app, NOON)
    identity(client, "ash")
    client.get(PATH)
    copy(
        factory, users["ash"], "me02.5-261", "holo"
    )  # the collection grows later today
    client.get(PATH)
    rows = records(factory, users["ash"])
    assert len(rows) == 1
    assert rows[date(2026, 11, 25)].copy_count == 5 and ids


def test_a_pending_valuation_stores_nothing_and_the_next_load_tries_again(home):
    client, factory, app, users, provider, _ = home
    seed(factory, users)
    clock(app, NOON)
    identity(client, "ash")
    app.state.price_service._budget = 0  # nothing can be priced yet
    body = client.get(PATH).json()
    assert body["points"] == [] and body["started_on"] is None
    assert records(factory, users["ash"]) == {}
    app.state.price_service._budget = 40
    assert client.get(PATH).json()["points"][0]["total"] == "1112"


def test_a_provider_outage_stores_nothing_instead_of_a_lower_total(home):
    client, factory, app, users, provider, _ = home
    seed(factory, users)
    provider.fail = True
    clock(app, NOON)
    identity(client, "ash")
    assert client.get(PATH).json()["points"] == []
    assert records(factory, users["ash"]) == {}


def test_an_empty_collection_records_nothing(home):
    client, factory, app, users, provider, _ = home
    clock(app, NOON)
    identity(client, "ash")
    body = client.get(PATH).json()
    assert body == {
        "currency": "CLP",
        "range": "30d",
        "started_on": None,
        "points": [],
        "baseline": None,
    }
    assert records(factory, users["ash"]) == {} and provider.calls == []


def test_without_exchange_rates_only_the_originals_are_stored_and_no_point_exists(home):
    client, factory, app, users, _, rates = home
    seed(factory, users)
    rates.error = RatesUnavailable("down")
    clock(app, NOON)
    identity(client, "ash")
    assert client.get(PATH).json()["points"] == []
    row = records(factory, users["ash"])[date(2026, 11, 25)]
    assert row.eur_total == Decimal("0.89") and row.clp_total is None
    assert row.usd_total is None and row.usd_clp is None and row.eur_per_usd is None
    assert client.get(f"{PATH}?currency=USD").json()["points"] == []


def test_a_day_is_the_calendar_day_in_santiago(home):
    client, factory, app, users, _, _ = home
    seed(factory, users)
    identity(client, "ash")
    clock(app, datetime(2026, 11, 26, 2, 30, tzinfo=UTC))  # 23:30 on the 25th in Chile
    client.get(PATH)
    clock(app, datetime(2026, 11, 26, 3, 30, tzinfo=UTC))  # 00:30 on the 26th
    client.get(PATH)
    assert sorted(records(factory, users["ash"])) == [
        date(2026, 11, 25),
        date(2026, 11, 26),
    ]


def test_ranges_currencies_and_the_seven_day_baseline(home):
    client, factory, app, users, _, _ = home
    ash = users["ash"]
    clock(app, NOON)
    today = date(2026, 11, 25)
    for offset, clp, usd in (
        (400, "5000", "5.00"),
        (40, "9000", "9.00"),
        (10, "10000", "10.00"),
        (7, "11000", "11.00"),
        (3, "11500", "11.50"),
        (1, "12000", "12.00"),
    ):
        add_day(factory, ash, today - timedelta(days=offset), clp, usd)
    identity(client, "ash")
    seven = client.get(f"{PATH}?range=7d").json()
    assert [p["day"] for p in seven["points"]] == [
        "2026-11-18",
        "2026-11-22",
        "2026-11-24",
    ]
    assert [p["total"] for p in client.get(f"{PATH}?range=30d").json()["points"]] == [
        "10000",
        "11000",
        "11500",
        "12000",
    ]
    year = client.get(f"{PATH}?range=1y").json()
    assert [p["total"] for p in year["points"]][0] == "9000"  # 400 days ago is out
    assert year["started_on"] == "2025-10-21"  # but it started then
    usd = client.get(f"{PATH}?range=30d&currency=USD").json()
    assert usd["currency"] == "USD" and usd["points"][-1]["total"] == "12.00"
    # The baseline is the latest record at least seven days old (here: 7 days ago).
    assert seven["baseline"] == {"day": "2026-11-18", "total": "11000"}
    assert usd["baseline"] == {"day": "2026-11-18", "total": "11.00"}


def test_days_without_a_total_in_the_currency_are_left_out_and_never_filled(home):
    client, factory, app, users, _, _ = home
    ash = users["ash"]
    clock(app, NOON)
    today = date(2026, 11, 25)
    add_day(factory, ash, today - timedelta(days=9), "10000", "10.00")
    add_day(factory, ash, today - timedelta(days=8), None, None)  # a day with no rates
    add_day(factory, ash, today - timedelta(days=2), "12000", "12.00")
    identity(client, "ash")
    body = client.get(f"{PATH}?range=30d").json()
    assert [p["day"] for p in body["points"]] == ["2026-11-16", "2026-11-23"]
    assert body["baseline"]["day"] == "2026-11-16"  # the no-rate day is skipped


def test_two_users_keep_separate_histories(home):
    client, factory, app, users, _, _ = home
    seed(factory, users)
    clock(app, NOON)
    identity(client, "ash")
    client.get(PATH)
    identity(client, "misty")
    misty = client.get(PATH).json()
    assert misty["points"] == [{"day": "2026-11-25", "total": "3112"}]
    assert records(factory, users["ash"])[date(2026, 11, 25)].clp_total == Decimal(
        "1112"
    )
    assert records(factory, users["misty"])[date(2026, 11, 25)].clp_total == Decimal(
        "3112"
    )
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(CollectionValueDay)) == 2


def test_validation_and_a_live_session(home):
    client, _, app, _, _, _ = home
    clock(app, NOON)
    identity(client, "ash")
    for query in ("range=2y", "range=", "currency=EUR"):
        assert client.get(f"{PATH}?{query}").status_code == 422
    for name in (None, "expired", "forged"):
        identity(client, name)
        response = client.get(PATH)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"


def test_a_pricing_failure_never_hides_the_recorded_history(home):
    client, factory, app, users, provider, _ = home
    seed(factory, users)
    clock(app, NOON)
    add_day(factory, users["ash"], date(2026, 11, 20), "10000", "10.00")
    provider.fail = True
    identity(client, "ash")
    response = client.get(PATH)
    assert response.status_code == 200
    assert [p["day"] for p in response.json()["points"]] == ["2026-11-20"]


def test_the_timezone_setting_is_validated():
    base = {"DATABASE_URL": "postgresql+psycopg://u:p@localhost/db", "_env_file": None}
    assert Settings(**base).home_timezone == "America/Santiago"
    assert Settings(**base, HOME_TIMEZONE="UTC").home_timezone == "UTC"
    with pytest.raises(ValueError, match="HOME_TIMEZONE"):
        Settings(**base, HOME_TIMEZONE="Mars/Olympus")
