"""Price, currency-setting and inventory-filter APIs over real sessions (SQLite)."""

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from test_set_completion import checklist

from app.auth.sessions import csrf_token, token_digest
from app.cards.provider import CardPricing, CardsUnavailable
from app.core.config import Settings
from app.db.base import Base
from app.db.models import (
    AuthSession,
    Binder,
    BinderPocket,
    InventoryCopy,
    User,
    UserSettings,
)
from app.main import create_app
from app.prices import store
from app.prices.rates import RatesUnavailable
from app.prices.schemas import ExchangeRates, PriceSnapshot
from app.prices.service import PriceService

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = json.loads((ROOT / "research/prices/tcgdex_sample.json").read_text())
ORIGIN = "http://localhost:5173"
RATES = ExchangeRates(
    Decimal("1000"), Decimal("0.8"), datetime(2026, 11, 23, tzinfo=UTC)
)
CARDS = {
    card_id: CardPricing(
        SAMPLE[f"en/{card_id}"]["pricing"], SAMPLE[f"en/{card_id}"]["variants"]
    )
    for card_id in ("me05-044", "me02.5-261", "me02.5-036", "me02.5-130")
}


class FakeProvider:
    def __init__(self):
        self.fail = False
        self.calls = []

    async def card_pricing(self, card_id):
        self.calls.append(card_id)
        if self.fail:
            raise CardsUnavailable
        return CARDS.get(card_id)


class FakeRates:
    def __init__(self):
        self.error = None
        self.calls = 0

    async def fetch(self):
        self.calls += 1
        if self.error:
            raise self.error
        return RATES


@pytest.fixture
def prices():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
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
    provider, rates = FakeProvider(), FakeRates()
    app.state.price_service = PriceService(provider, rates)
    users = {}
    with factory.begin() as session:
        for name in ("ash", "misty", "expired"):
            user = User(google_sub=name, display_name=name)
            session.add(user)
            session.flush()
            users[name] = user.id
            session.add(
                AuthSession(
                    token_digest=token_digest(name),
                    user_id=user.id,
                    expires_at=datetime.now(UTC)
                    + timedelta(hours=-1 if name == "expired" else 1),
                )
            )
        session.add(UserSettings(user_id=users["ash"]))
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, factory, app, users, provider, rates
    engine.dispose()


def identity(client, name):
    client.cookies.clear()
    if name:
        client.cookies.set("pokevault_session", name)
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(name or "")}


def copy(factory, owner_id, card_id, variant):
    with factory.begin() as session:
        record = InventoryCopy(
            user_id=owner_id,
            card_id=card_id,
            condition="near_mint",
            language="es",
            variant=variant,
        )
        session.add(record)
        session.flush()
        return str(record.id)


def binder(factory, owner_id, copy_ids, order=0):
    with factory.begin() as session:
        record = Binder(user_id=owner_id, name=f"Binder {order}", display_order=order)
        session.add(record)
        session.flush()
        for index, copy_id in enumerate(copy_ids):
            session.add(
                BinderPocket(
                    user_id=owner_id,
                    binder_id=record.id,
                    page=index // 9 + 1,
                    pocket=index % 9 + 1,
                    copy_id=copy_id,
                )
            )
        return str(record.id)


def seed(factory, users):
    from uuid import UUID

    ash, misty = users["ash"], users["misty"]
    ids = {
        "cranidos_a": copy(factory, ash, "me05-044", "normal"),
        "cranidos_b": copy(factory, ash, "me05-044", "normal"),
        "tower": copy(factory, ash, "me02.5-261", "holo"),
        "scorbunny": copy(factory, ash, "me02.5-036", "reverse"),
        "zigzagoon": copy(factory, ash, "me02.5-130", "unknown"),
        "misty_towers": [copy(factory, misty, "me02.5-261", "holo") for _ in range(3)],
    }
    ids["ash_binder"] = binder(
        factory, ash, [UUID(ids["tower"]), UUID(ids["cranidos_a"])]
    )
    ids["misty_binder"] = binder(factory, misty, [UUID(i) for i in ids["misty_towers"]])
    return ids


# --- Collection value and isolation ---


def test_collection_value_counts_only_the_signed_in_users_copies(prices):
    client, factory, _, users, _, _ = prices
    ids = seed(factory, users)
    identity(client, "ash")
    response = client.get("/api/v1/prices/collection")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    ash = response.json()
    # 2 x 0.03 + 0.83 = 0.89 EUR x 1250 CLP = 1112.5 -> 1112 (half-even)
    assert ash["currency"] == "CLP" and ash["total"] == "1112"
    assert ash["copy_count"] == 5 and ash["priced_count"] == 3
    assert ash["unpriced_by_reason"] == {"no_market_data": 1, "variant_unknown": 1}
    top_ids = [item["copy_id"] for item in ash["top"]]
    assert top_ids[0] == ids["tower"]
    assert set(top_ids) == {ids["tower"], ids["cranidos_a"], ids["cranidos_b"]}
    assert not set(top_ids) & set(ids["misty_towers"])
    assert ash["rates"] == {
        "available": True,
        "stale": False,
        "updated_at": "2026-11-23T00:00:00Z",
        "provider": "exchangerate-api",
        "attribution_url": "https://www.exchangerate-api.com",
    }
    assert "items" not in ash
    assert "usd_clp" not in response.text and "1000" not in response.text

    identity(client, "misty")
    misty = client.get("/api/v1/prices/collection").json()
    assert misty["total"] == "3112"  # three duplicate towers, each 1037.5 CLP
    assert misty["copy_count"] == 3
    assert {item["copy_id"] for item in misty["top"]} == set(ids["misty_towers"])


def test_a_user_without_copies_gets_an_empty_valuation(prices):
    client, factory, _, users, provider, rates = prices
    seed(factory, users)
    with factory.begin() as session:
        stranger = User(google_sub="brock", display_name="brock")
        session.add(stranger)
        session.flush()
        session.add(
            AuthSession(
                token_digest=token_digest("brock"),
                user_id=stranger.id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
    identity(client, "brock")
    result = client.get("/api/v1/prices/collection").json()
    assert (result["total"], result["copy_count"], result["top"]) == ("0", 0, [])
    assert provider.calls == [] and rates.calls == 0


def test_currency_preference_param_and_settings_endpoint(prices):
    client, factory, _, users, _, _ = prices
    seed(factory, users)
    headers = identity(client, "ash")
    assert client.get("/api/v1/me/settings").json() == {"preferred_currency": "CLP"}
    updated = client.put(
        "/api/v1/me/settings", json={"preferred_currency": "USD"}, headers=headers
    )
    assert updated.status_code == 200
    assert updated.headers["cache-control"] == "no-store"
    assert updated.json() == {"preferred_currency": "USD"}
    usd = client.get("/api/v1/prices/collection").json()
    assert (usd["currency"], usd["total"]) == ("USD", "1.11")  # 0.89 / 0.8 = 1.1125
    assert client.get("/api/v1/prices/collection?currency=CLP").json()["total"] == (
        "1112"
    )
    # Another account keeps its own preference.
    identity(client, "misty")
    assert client.get("/api/v1/me/settings").json() == {"preferred_currency": "CLP"}
    assert client.get("/api/v1/prices/collection").json()["currency"] == "CLP"


def test_settings_put_creates_missing_rows_and_validates_input(prices):
    client, factory, _, users, _, _ = prices
    headers = identity(client, "misty")  # misty has no settings row yet
    response = client.put(
        "/api/v1/me/settings", json={"preferred_currency": "USD"}, headers=headers
    )
    assert response.status_code == 200
    with factory() as session:
        assert session.get(UserSettings, users["misty"]).preferred_currency == "USD"
    for body in (
        {"preferred_currency": "EUR"},
        {"preferred_currency": "usd"},
        {},
        {"preferred_currency": "CLP", "user_id": str(users["ash"])},
    ):
        bad = client.put("/api/v1/me/settings", json=body, headers=headers)
        assert bad.status_code == 422
    with factory() as session:
        assert session.get(UserSettings, users["ash"]).preferred_currency == "CLP"


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/v1/prices/collection"),
        ("get", f"/api/v1/prices/copies?copy_id={uuid4()}"),
        ("get", f"/api/v1/binders/{uuid4()}/value"),
        ("get", "/api/v1/prices/binders"),
        ("get", "/api/v1/me/settings"),
        ("put", "/api/v1/me/settings"),
    ],
)
@pytest.mark.parametrize("name", [None, "expired", "forged"])
def test_private_endpoints_require_a_live_session(prices, method, path, name):
    client = prices[0]
    identity(client, name)
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


def test_settings_put_requires_csrf_and_origin(prices):
    client = prices[0]
    identity(client, "ash")
    body = {"preferred_currency": "USD"}
    assert client.put("/api/v1/me/settings", json=body).status_code == 403
    bad = {"Origin": "https://evil.example", "X-CSRF-Token": csrf_token("ash")}
    assert client.put("/api/v1/me/settings", json=body, headers=bad).status_code == 403
    forged = {"Origin": ORIGIN, "X-CSRF-Token": csrf_token("misty")}
    assert (
        client.put("/api/v1/me/settings", json=body, headers=forged).status_code == 403
    )


# --- Copy batch ---


def test_copy_prices_return_only_owned_copies_in_request_order(prices):
    client, factory, _, users, _, _ = prices
    ids = seed(factory, users)
    identity(client, "ash")
    requested = [ids["scorbunny"], ids["misty_towers"][0], str(uuid4()), ids["tower"]]
    response = client.get("/api/v1/prices/copies", params={"copy_id": requested})
    assert response.status_code == 200
    rows = response.json()["results"]
    assert [row["copy_id"] for row in rows] == [ids["scorbunny"], ids["tower"]]
    assert rows[0]["price"] is None and rows[0]["reason"] == "no_market_data"
    assert rows[1]["price"]["amount"] == "1038"
    assert rows[1]["price"]["original_amount"] == "0.83"
    assert rows[1]["price"]["source"] == "cardmarket"


def test_copy_prices_validate_the_batch(prices):
    client = prices[0]
    identity(client, "ash")
    assert client.get("/api/v1/prices/copies").status_code == 422
    assert client.get("/api/v1/prices/copies?copy_id=nope").status_code == 422
    many = {"copy_id": [str(uuid4()) for _ in range(101)]}
    assert client.get("/api/v1/prices/copies", params=many).status_code == 422
    hundred = {"copy_id": [str(uuid4()) for _ in range(100)]}
    response = client.get("/api/v1/prices/copies", params=hundred)
    assert response.status_code == 200 and response.json()["results"] == []
    assert (
        client.get(f"/api/v1/prices/copies?copy_id={uuid4()}&currency=EUR").status_code
        == 422
    )


# --- Binder value ---


def test_binder_value_includes_only_that_binders_copies_and_hides_foreign(prices):
    client, factory, _, users, _, _ = prices
    ids = seed(factory, users)
    identity(client, "ash")
    response = client.get(f"/api/v1/binders/{ids['ash_binder']}/value")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    value = response.json()
    assert value["copy_count"] == 2
    assert value["total"] == "1075"  # (0.83 + 0.03) x 1250
    assert value["top"] == []  # binder totals carry no ranking
    missing = client.get(f"/api/v1/binders/{uuid4()}/value")
    foreign = client.get(f"/api/v1/binders/{ids['misty_binder']}/value")
    assert missing.status_code == foreign.status_code == 404
    assert missing.json() == foreign.json()
    assert client.get("/api/v1/binders/not-a-uuid/value").status_code == 422


def test_empty_binder_value_is_zero(prices):
    client, factory, _, users, _, _ = prices
    empty = binder(factory, users["ash"], [], order=5)
    identity(client, "ash")
    value = client.get(f"/api/v1/binders/{empty}/value").json()
    assert (value["total"], value["copy_count"]) == ("0", 0)


def test_shelf_values_every_owned_binder_in_one_request(prices):
    client, factory, _, users, _, _ = prices
    ids = seed(factory, users)
    empty = binder(factory, users["ash"], [], order=5)
    identity(client, "ash")
    response = client.get("/api/v1/prices/binders")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["currency"] == "CLP"
    assert body["rates"]["available"] is True
    by_id = {item["binder_id"]: item for item in body["results"]}
    assert list(by_id) == [ids["ash_binder"], empty]  # owned only, in shelf order
    assert by_id[ids["ash_binder"]]["total"] == "1075"  # same as the single value
    assert by_id[ids["ash_binder"]]["copy_count"] == 2
    assert (by_id[empty]["total"], by_id[empty]["copy_count"]) == ("0", 0)
    assert set(by_id[empty]) == {
        "binder_id",
        "total",
        "original_totals",
        "copy_count",
        "priced_count",
        "pending_count",
        "stale_count",
    }
    usd = client.get("/api/v1/prices/binders?currency=USD").json()
    assert usd["currency"] == "USD"
    identity(client, "misty")
    misty = client.get("/api/v1/prices/binders").json()["results"]
    assert [item["binder_id"] for item in misty] == [ids["misty_binder"]]


# --- Public card prices ---


def test_card_prices_are_public_and_default_to_clp(prices):
    client = prices[0]
    identity(client, None)
    response = client.get("/api/v1/prices/cards/me05-044")
    assert response.status_code == 200
    body = response.json()
    assert body["currency"] == "CLP" and body["language_independent"] is True
    rows = {row["variant"]: row for row in body["variants"]}
    assert rows["normal"]["price"]["amount"] == "38"
    assert rows["reverse"]["price"]["original_amount"] == "0.07"
    assert rows["holo"]["reason"] == "variant_not_in_catalog"
    assert body["rates"]["attribution_url"] == "https://www.exchangerate-api.com"
    usd = client.get("/api/v1/prices/cards/me05-044?currency=USD").json()
    assert usd["variants"][0]["price"]["amount"] == "0.04"  # 0.0375 -> 0.04


def test_card_prices_use_the_signed_in_preference(prices):
    client, factory, _, users, _, _ = prices
    with factory.begin() as session:
        session.get(UserSettings, users["ash"]).preferred_currency = "USD"
    identity(client, "ash")
    assert client.get("/api/v1/prices/cards/me05-044").json()["currency"] == "USD"
    identity(client, "expired")  # an expired cookie is just an anonymous visitor
    assert client.get("/api/v1/prices/cards/me05-044").json()["currency"] == "CLP"


@pytest.mark.parametrize("card_id", ["a b", "x..y", "-1", "a" * 101])
def test_card_prices_validate_identifiers(prices, card_id):
    client, _, _, _, provider, _ = prices
    assert client.get(f"/api/v1/prices/cards/{card_id}").status_code in (404, 422)
    assert provider.calls == []


# --- Failures never break anything ---


def test_provider_outage_degrades_per_copy_and_keeps_stale_values(prices):
    client, factory, _, users, provider, _ = prices
    ids = seed(factory, users)
    with factory.begin() as session:
        store.save_snapshot(
            session,
            "me02.5-261",
            PriceSnapshot(
                status="ok", cm_trend=Decimal("0.80"), has_normal=False, has_holo=True
            ),
            datetime.now(UTC) - timedelta(days=3),
        )
    provider.fail = True
    identity(client, "ash")
    response = client.get("/api/v1/prices/collection")
    assert response.status_code == 200
    body = response.json()
    assert body["priced_count"] == 1 and body["stale_count"] == 1
    assert body["top"][0]["copy_id"] == ids["tower"]
    assert body["top"][0]["price"]["stale"] is True
    assert body["top"][0]["price"]["original_amount"] == "0.8"
    assert body["unpriced_by_reason"]["source_unavailable"] == 3


def test_rates_outage_shows_original_amounts_without_attribution(prices):
    client, factory, _, users, _, rates = prices
    seed(factory, users)
    rates.error = RatesUnavailable("rate limited", rate_limited=True)
    identity(client, "ash")
    body = client.get("/api/v1/prices/collection").json()
    assert body["total"] is None
    assert body["original_totals"] == {"EUR": "0.89"}
    assert body["rates"]["available"] is False
    assert body["top"] == []
    # The failed attempt is remembered: no new request for 20 minutes.
    client.get("/api/v1/prices/collection")
    assert rates.calls == 1


def test_database_outage_is_a_sanitized_503(prices):
    client, factory, _, users, _, _ = prices
    seed(factory, users)
    identity(client, "ash")

    def broken():
        raise OperationalError("private-query", {}, Exception("private-password"))

    original = factory.begin
    factory.begin = broken
    try:
        for path in ("/api/v1/prices/collection", "/api/v1/prices/cards/me05-044"):
            response = client.get(path)
            assert response.status_code == 503
            assert "private" not in response.text
    finally:
        factory.begin = original


class Exploding:
    def __getattr__(self, name):
        raise AssertionError(f"price service must not be used ({name})")


def test_inventory_binders_and_sets_never_depend_on_prices(prices):
    client, factory, app, users, _, _ = prices
    ids = seed(factory, users)
    app.state.price_service = Exploding()
    fixture = checklist()

    async def get_checklist(set_id, language="es"):
        return fixture.model_copy(deep=True)

    app.state.card_provider.get_set_checklist = get_checklist
    identity(client, "ash")
    for path in (
        "/api/v1/inventory",
        f"/api/v1/inventory/{ids['tower']}",
        "/api/v1/binders",
        f"/api/v1/binders/{ids['ash_binder']}",
        "/api/v1/binders/views/unassigned",
        "/api/v1/binders/views/recent",
        f"/api/v1/binders/locations?copy_id={ids['tower']}",
        "/api/v1/sets/progress?set_id=sv03.5",
        "/api/v1/sets/sv03.5/progress",
    ):
        assert client.get(path).status_code == 200, path


# --- Inventory variant filter ---


def test_inventory_can_be_filtered_by_variant_per_user(prices):
    client, factory, _, users, _, _ = prices
    ids = seed(factory, users)
    identity(client, "ash")
    unknown = client.get("/api/v1/inventory?variant=unknown").json()
    assert [row["id"] for row in unknown["results"]] == [ids["zigzagoon"]]
    assert unknown["total"] == 1
    holo = client.get("/api/v1/inventory?variant=holo").json()
    assert [row["id"] for row in holo["results"]] == [ids["tower"]]
    assert client.get("/api/v1/inventory?variant=shiny").status_code == 422
    identity(client, "misty")
    assert client.get("/api/v1/inventory?variant=holo").json()["total"] == 3
    assert client.get("/api/v1/inventory?variant=unknown").json()["total"] == 0
    with factory() as session:
        assert session.scalar(select(InventoryCopy.id).limit(1)) is not None
