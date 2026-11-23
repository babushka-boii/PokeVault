"""PriceService: fresh/stale/refresh logic, budgets, coalescing and valuation."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cards.provider import CardPricing, CardsUnavailable
from app.db.base import Base
from app.prices import store
from app.prices.rates import RatesUnavailable
from app.prices.schemas import ExchangeRates, PriceSnapshot
from app.prices.service import CopyRef, PriceService

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = json.loads((ROOT / "research/prices/tcgdex_sample.json").read_text())
START = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)
RATES = ExchangeRates(Decimal("1000"), Decimal("0.8"), START)  # 1 EUR = 1250 CLP


def sample(card_id):
    entry = SAMPLE[f"en/{card_id}"]
    return CardPricing(entry["pricing"], entry["variants"])


class FakeProvider:
    def __init__(self, cards=None, fail=False, delay=0.0):
        self.cards = cards if cards is not None else {}
        self.fail = fail
        self.delay = delay
        self.calls = []

    async def card_pricing(self, card_id):
        self.calls.append(card_id)
        if self.delay:
            await asyncio.sleep(self.delay)
        if self.fail:
            raise CardsUnavailable
        if card_id in self.cards:
            return self.cards[card_id]
        if card_id.startswith("bulk-"):
            return CardPricing({"cardmarket": {"unit": "EUR", "trend": 1}}, None)
        return None


class FakeRates:
    def __init__(self, rates=RATES, error=None):
        self.rates = rates
        self.error = error
        self.calls = 0

    async def fetch(self):
        self.calls += 1
        await asyncio.sleep(0)
        if self.error is not None:
            raise self.error
        return self.rates


class Clock:
    def __init__(self):
        self.now = START

    def __call__(self):
        return self.now

    def advance(self, **delta):
        self.now += timedelta(**delta)


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def service(provider=None, rates=None, clock=None, **options):
    return PriceService(
        provider or FakeProvider(),
        rates or FakeRates(),
        clock=clock or Clock(),
        **options,
    )


def run(coroutine):
    return asyncio.run(coroutine)


def save(factory, card_id, snapshot, fetched_at):
    with factory.begin() as session:
        store.save_snapshot(session, card_id, snapshot, fetched_at)


CHEAP = PriceSnapshot(status="ok", cm_trend=Decimal("0.50"), has_normal=True)


# --- Snapshots ---


def test_fresh_snapshots_are_served_without_provider_calls(factory):
    provider = FakeProvider()
    save(factory, "a-1", CHEAP, START - timedelta(hours=23))
    result = run(service(provider).snapshots(factory, ["a-1"]))
    assert result["a-1"].snapshot == CHEAP
    assert result["a-1"].stale is False
    assert provider.calls == []


def test_missing_snapshots_are_fetched_once_saved_and_then_reused(factory):
    provider = FakeProvider({"me05-044": sample("me05-044")})
    clock = Clock()
    prices = service(provider, clock=clock)
    first = run(prices.snapshots(factory, ["me05-044", "me05-044"]))
    assert first["me05-044"].snapshot.cm_trend_reverse == Decimal("0.07")
    clock.advance(hours=23, minutes=59)
    run(prices.snapshots(factory, ["me05-044"]))
    assert provider.calls == ["me05-044"]
    with factory() as session:
        stored = store.get_snapshots(session, ["me05-044"])["me05-044"]
    assert stored.fetched_at == START


def test_stale_snapshots_are_refreshed_after_24_hours(factory):
    provider = FakeProvider({"me05-044": sample("me05-044")})
    save(factory, "me05-044", CHEAP, START - timedelta(hours=24))
    result = run(service(provider).snapshots(factory, ["me05-044"]))
    assert provider.calls == ["me05-044"]
    assert result["me05-044"].stale is False
    assert result["me05-044"].snapshot.cm_trend == Decimal("0.03")


def test_provider_failure_serves_stale_value_and_pauses_refreshes(factory):
    provider = FakeProvider(fail=True)
    clock = Clock()
    prices = service(provider, clock=clock)
    save(factory, "old-1", CHEAP, START - timedelta(days=3))
    result = run(prices.snapshots(factory, ["old-1", "new-1"]))
    assert result["old-1"].snapshot == CHEAP and result["old-1"].stale is True
    assert result["new-1"].snapshot is None
    assert result["new-1"].reason == "source_unavailable"
    calls = len(provider.calls)
    clock.advance(seconds=59)
    again = run(prices.snapshots(factory, ["old-1", "new-1"]))
    assert len(provider.calls) == calls  # cooldown: no new requests
    assert again["new-1"].reason == "source_unavailable"
    assert again["old-1"].stale is True
    provider.fail = False
    clock.advance(seconds=1)
    recovered = run(prices.snapshots(factory, ["new-1"]))
    assert recovered["new-1"].snapshot.status == "no_data"


def test_not_found_cards_are_remembered_in_memory_but_never_stored(factory):
    provider = FakeProvider()
    clock = Clock()
    prices = service(provider, clock=clock)
    result = run(prices.snapshots(factory, ["gone-1"]))
    assert result["gone-1"].snapshot.status == "no_data"
    with factory() as session:
        assert store.get_snapshots(session, ["gone-1"]) == {}
    clock.advance(hours=23)
    later = run(prices.snapshots(factory, ["gone-1"]))
    assert later["gone-1"].snapshot.status == "no_data"
    assert provider.calls == ["gone-1"]
    clock.advance(hours=1)
    run(prices.snapshots(factory, ["gone-1"]))
    assert provider.calls == ["gone-1", "gone-1"]


def test_invented_identifiers_cannot_grow_the_database_or_memory(factory):
    from app.prices import service as service_module

    prices = service(FakeProvider(), refresh_budget=5000)
    ids = [f"fake-{n}" for n in range(service_module.MISSING_CAPACITY + 100)]
    run(prices.snapshots(factory, ids))
    with factory() as session:
        assert store.get_snapshots(session, ids) == {}
    assert len(prices._missing) == service_module.MISSING_CAPACITY


def test_refresh_budget_limits_requests_and_reports_pending(factory):
    provider = FakeProvider()
    ids = [f"bulk-{n}" for n in range(45)]
    result = run(service(provider).snapshots(factory, ids))
    assert len(provider.calls) == 40
    pending = [card for card, value in result.items() if value.snapshot is None]
    assert len(pending) == 5
    assert {result[card].reason for card in pending} == {"pending"}


def test_missing_cards_are_refreshed_before_stale_ones(factory):
    provider = FakeProvider()
    save(factory, "bulk-stale", CHEAP, START - timedelta(days=2))
    ids = ["bulk-stale"] + [f"bulk-{n}" for n in range(40)]
    result = run(service(provider).snapshots(factory, ids))
    assert "bulk-stale" not in provider.calls
    assert result["bulk-stale"].stale is True
    assert result["bulk-stale"].snapshot == CHEAP


def test_concurrent_requests_for_one_card_share_one_provider_call(factory):
    provider = FakeProvider({"me05-044": sample("me05-044")}, delay=0.02)
    prices = service(provider)

    async def both():
        return await asyncio.gather(
            prices.snapshots(factory, ["me05-044"]),
            prices.snapshots(factory, ["me05-044"]),
        )

    first, second = run(both())
    assert provider.calls == ["me05-044"]
    assert first["me05-044"].snapshot == second["me05-044"].snapshot


def test_slow_refreshes_return_pending_and_finish_in_the_background(factory):
    provider = FakeProvider({"me05-044": sample("me05-044")}, delay=0.1)
    prices = service(provider, refresh_deadline=0.01)

    async def scenario():
        early = await prices.snapshots(factory, ["me05-044"])
        await asyncio.sleep(0.2)
        late = await prices.snapshots(factory, ["me05-044"])
        return early, late

    early, late = run(scenario())
    assert early["me05-044"].reason == "pending"
    assert late["me05-044"].snapshot.cm_trend == Decimal("0.03")
    assert provider.calls == ["me05-044"]


def test_save_failures_do_not_hide_fresh_prices(factory):
    provider = FakeProvider({"me05-044": sample("me05-044")})

    class ReadOnly:
        """Reads work, writes fail (e.g. a concurrent writer won the key)."""

        def begin(self):
            return factory.begin()

    prices = service(provider)
    original = store.save_snapshot

    def failing(*args, **kwargs):
        from sqlalchemy.exc import IntegrityError

        raise IntegrityError("insert", {}, Exception("duplicate"))

    store.save_snapshot = failing
    try:
        result = run(prices.snapshots(ReadOnly(), ["me05-044"]))
    finally:
        store.save_snapshot = original
    assert result["me05-044"].snapshot.cm_trend == Decimal("0.03")


# --- Rates ---


def test_rates_are_fetched_once_and_cached_for_24_hours(factory):
    rates = FakeRates()
    clock = Clock()
    prices = service(rates=rates, clock=clock)
    first = run(prices.rates(factory))
    assert first.rates == RATES and first.stale is False
    clock.advance(hours=23, minutes=59)
    assert run(prices.rates(factory)).rates == RATES
    assert rates.calls == 1
    clock.advance(minutes=1)
    run(prices.rates(factory))
    assert rates.calls == 2


def test_rate_limit_keeps_old_rates_and_waits_20_minutes(factory):
    rates = FakeRates()
    clock = Clock()
    prices = service(rates=rates, clock=clock)
    run(prices.rates(factory))
    clock.advance(hours=25)
    rates.error = RatesUnavailable("rate limited", rate_limited=True)
    result = run(prices.rates(factory))
    assert result.rates == RATES and result.stale is True
    assert rates.calls == 2
    clock.advance(minutes=19)
    run(prices.rates(factory))
    assert rates.calls == 2  # no request during the 20-minute block
    rates.error = None
    clock.advance(minutes=1)
    assert run(prices.rates(factory)).stale is False
    assert rates.calls == 3


def test_first_ever_rates_failure_returns_none_and_backs_off(factory):
    rates = FakeRates(error=RatesUnavailable("down"))
    clock = Clock()
    prices = service(rates=rates, clock=clock)
    assert run(prices.rates(factory)).rates is None
    clock.advance(minutes=10)
    assert run(prices.rates(factory)).rates is None
    assert rates.calls == 1


def test_concurrent_rate_refreshes_make_one_request(factory):
    rates = FakeRates()
    prices = service(rates=rates)

    async def many():
        return await asyncio.gather(*(prices.rates(factory) for _ in range(5)))

    assert all(result.rates == RATES for result in run(many()))
    assert rates.calls == 1


# --- Valuation ---

ASH = [
    CopyRef(UUID(int=3), "me05-044", "normal"),
    CopyRef(UUID(int=2), "me05-044", "normal"),  # duplicate copy, separate value
    CopyRef(UUID(int=1), "me02.5-261", "holo"),
    CopyRef(UUID(int=4), "me02.5-036", "reverse"),
    CopyRef(UUID(int=5), "me02.5-130", "unknown"),
    CopyRef(UUID(int=6), "me02.5-130", "first_edition"),
]
CARDS = {
    card_id: sample(card_id)
    for card_id in ("me05-044", "me02.5-261", "me02.5-036", "me02.5-130")
}


def test_valuation_sums_duplicates_before_rounding_and_ranks_top_copies(factory):
    provider = FakeProvider(CARDS)
    result = run(service(provider).value(factory, ASH, "CLP", top=5))
    # 2 x 0.03 EUR + 0.83 EUR = 0.89 EUR x 1250 = 1112.5 -> 1112 (half-even)
    assert result.total == "1112"
    assert result.currency == "CLP"
    assert result.original_totals == {"EUR": "0.89"}
    assert (result.copy_count, result.priced_count, result.unpriced_count) == (6, 3, 3)
    assert result.unpriced_by_reason == {
        "no_market_data": 1,
        "variant_unknown": 1,
        "variant_unpriced": 1,
    }
    assert result.sources == {"cardmarket": 3}
    assert (result.pending_count, result.stale_count) == (0, 0)
    assert [str(item.copy_id) for item in result.top] == [
        str(UUID(int=1)),
        str(UUID(int=2)),  # equal values: ordered by copy id
        str(UUID(int=3)),
    ]
    tower = result.top[0].price
    assert (tower.amount, tower.original_amount, tower.original_currency) == (
        "1038",
        "0.83",
        "EUR",
    )
    assert result.rates.available is True
    assert result.rates.attribution_url == "https://www.exchangerate-api.com"


def test_valuation_in_usd(factory):
    result = run(service(FakeProvider(CARDS)).value(factory, ASH, "USD", top=5))
    assert result.total == "1.11"  # 0.89 EUR / 0.8 = 1.1125
    assert result.top[0].price.amount == "1.04"


def test_unpriceable_variants_never_trigger_requests_or_rates(factory):
    provider = FakeProvider(CARDS)
    rates = FakeRates()
    refs = [ASH[4], ASH[5]]
    result = run(service(provider, rates).value(factory, refs, "CLP", top=5))
    assert provider.calls == []
    assert rates.calls == 0
    assert result.total == "0"
    assert result.priced_count == 0
    assert result.rates.available is False


def test_without_rates_totals_stay_in_original_currencies(factory):
    rates = FakeRates(error=RatesUnavailable("down"))
    usd_card = CardPricing(
        {"tcgplayer": {"unit": "USD", "normal": {"marketPrice": 0.66}}}, None
    )
    provider = FakeProvider({**CARDS, "usd-1": usd_card})
    refs = [*ASH[:3], CopyRef(UUID(int=9), "usd-1", "normal")]
    result = run(service(provider, rates).value(factory, refs, "CLP", top=5))
    assert result.total is None
    assert result.original_totals == {"EUR": "0.89", "USD": "0.66"}
    assert result.top == []
    assert result.rates.available is False
    assert all(item.price.amount is None for item in result.items)


def test_stale_and_pending_copies_are_counted(factory):
    provider = FakeProvider(fail=True)
    save(factory, "me05-044", CHEAP, START - timedelta(days=2))
    refs = [
        CopyRef(UUID(int=1), "me05-044", "normal"),
        CopyRef(UUID(int=2), "x-1", "normal"),
    ]
    result = run(service(provider).value(factory, refs, "CLP", top=5))
    assert result.priced_count == 1 and result.stale_count == 1
    assert result.top[0].price.stale is True
    assert result.unpriced_by_reason == {"source_unavailable": 1}


def test_card_prices_cover_the_three_priceable_variants(factory):
    provider = FakeProvider(CARDS)
    result = run(service(provider).card_prices(factory, "me05-044", "CLP"))
    by_variant = {row.variant: row for row in result.variants}
    assert list(by_variant) == ["normal", "reverse", "holo"]
    assert by_variant["normal"].price.amount == "38"  # 0.03 x 1250 = 37.5 -> 38
    assert by_variant["reverse"].price.original_amount == "0.07"
    assert by_variant["holo"].reason == "variant_not_in_catalog"
    assert result.language_independent is True
