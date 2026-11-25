"""Which Pokémon each catalog card shows: stored once, fetched within a budget."""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.cards.provider import CardNotFound, CardsUnavailable
from app.collection.species import CardSpeciesService
from app.db.base import Base
from app.db.models import CardSpecies

START = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)


class Clock:
    def __init__(self):
        self.now = START

    def __call__(self):
        return self.now

    def advance(self, **delta):
        self.now += timedelta(**delta)


class FakeProvider:
    """dex ids per card; a missing card is not found, "down" cards are unavailable."""

    def __init__(self, cards=None, down=(), delay=0.0):
        self.cards = cards or {}
        self.down = set(down)
        self.delay = delay
        self.calls = []
        self.running = 0
        self.peak = 0

    async def get_card(self, card_id, language="es"):
        assert language == "en"  # the species index is the English catalog
        self.calls.append(card_id)
        self.running += 1
        self.peak = max(self.peak, self.running)
        try:
            if self.delay:
                await asyncio.sleep(self.delay)
            if card_id in self.down:
                raise CardsUnavailable
            if card_id not in self.cards:
                raise CardNotFound
            return SimpleNamespace(id=card_id, dex_ids=self.cards[card_id])
        finally:
            self.running -= 1


@pytest.fixture
def factory():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def pragma(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def service(provider, clock=None, **options):
    return CardSpeciesService(provider, clock=clock or Clock(), **options)


def run(coroutine):
    return asyncio.run(coroutine)


def stored(factory):
    with factory() as session:
        return {
            row.card_id: (row.dex_ids, row.status) for row in session.query(CardSpecies)
        }


# --- the table ---


def test_the_table_keeps_a_status_and_a_card_id_of_sensible_length(factory):
    with factory.begin() as session:
        session.add(
            CardSpecies(card_id="base1-4", dex_ids=[6], status="ok", fetched_at=START)
        )
    for bad in (
        CardSpecies(card_id="", dex_ids=[], status="ok", fetched_at=START),
        CardSpecies(card_id="x" * 101, dex_ids=[], status="ok", fetched_at=START),
        CardSpecies(card_id="a-1", dex_ids=[], status="maybe", fetched_at=START),
        CardSpecies(
            card_id="base1-4", dex_ids=[6], status="ok", fetched_at=START
        ),  # twice
    ):
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.add(bad)


# --- resolving ---


def test_unknown_cards_are_fetched_once_stored_and_then_reused(factory):
    provider = FakeProvider({"base1-4": [6], "sv1-1": [25, 26], "trainer-1": []})
    cards = service(provider)
    result = run(cards.resolve(factory, ["base1-4", "sv1-1", "trainer-1", "base1-4"]))
    assert result.species == {
        "base1-4": [6],
        "sv1-1": [25, 26],
        "trainer-1": [],
    }  # a trainer shows no species
    assert result.pending == set()
    assert sorted(provider.calls) == ["base1-4", "sv1-1", "trainer-1"]  # each once
    again = run(cards.resolve(factory, ["base1-4", "sv1-1", "trainer-1"]))
    assert (
        again.species == result.species and len(provider.calls) == 3
    )  # nothing refetched
    assert stored(factory) == {
        "base1-4": ([6], "ok"),
        "sv1-1": ([25, 26], "ok"),
        "trainer-1": ([], "ok"),
    }


def test_a_card_with_two_species_keeps_both(factory):
    provider = FakeProvider({"tag-1": [25, 26]})
    assert run(service(provider).resolve(factory, ["tag-1"])).species == {
        "tag-1": [25, 26]
    }


def test_the_budget_limits_fetches_and_the_rest_is_pending(factory):
    ids = [f"set-{n}" for n in range(10)]
    provider = FakeProvider({card: [n + 1] for n, card in enumerate(ids)})
    cards = service(provider, budget=4)
    first = run(cards.resolve(factory, ids))
    assert (
        len(provider.calls) == 4 and len(first.species) == 4 and len(first.pending) == 6
    )
    assert first.pending == set(ids) - set(first.species)
    second = run(cards.resolve(factory, ids))
    assert (
        len(provider.calls) == 8
        and len(second.species) == 8
        and len(second.pending) == 2
    )
    third = run(cards.resolve(factory, ids))
    assert (
        third.pending == set()
        and len(third.species) == 10
        and len(provider.calls) == 10
    )


def test_fetches_run_a_few_at_a_time(factory):
    ids = [f"set-{n}" for n in range(12)]
    provider = FakeProvider({card: [1] for card in ids}, delay=0.01)
    run(service(provider, concurrency=3).resolve(factory, ids))
    assert 1 < provider.peak <= 3


def test_a_provider_outage_is_pending_and_stores_nothing(factory):
    provider = FakeProvider({"a-1": [1]}, down={"a-1"})
    cards = service(provider)
    result = run(cards.resolve(factory, ["a-1"]))
    assert result.species == {} and result.pending == {"a-1"} and stored(factory) == {}
    provider.down.clear()
    assert run(cards.resolve(factory, ["a-1"])).species == {
        "a-1": [1]
    }  # retried at once, no waiting


def test_a_card_the_catalog_does_not_know_is_remembered_for_a_day(factory):
    provider = FakeProvider({})
    clock = Clock()
    cards = service(provider, clock)
    first = run(cards.resolve(factory, ["ghost-1"]))
    assert (
        first.species == {"ghost-1": []} and first.pending == set()
    )  # known to have no species
    assert stored(factory) == {"ghost-1": ([], "unknown")}
    run(cards.resolve(factory, ["ghost-1"]))
    assert provider.calls == ["ghost-1"]  # not asked again today
    clock.advance(hours=23, minutes=59)
    run(cards.resolve(factory, ["ghost-1"]))
    assert provider.calls == ["ghost-1"]
    clock.advance(minutes=2)
    provider.cards["ghost-1"] = [133]  # the catalog learned it
    assert run(cards.resolve(factory, ["ghost-1"])).species == {"ghost-1": [133]}
    assert stored(factory)["ghost-1"] == ([133], "ok")


def test_known_cards_are_refreshed_after_thirty_days_but_kept_if_that_fails(factory):
    provider = FakeProvider({"base1-4": [6]})
    clock = Clock()
    cards = service(provider, clock)
    run(cards.resolve(factory, ["base1-4"]))
    clock.advance(days=29)
    run(cards.resolve(factory, ["base1-4"]))
    assert provider.calls == ["base1-4"]
    clock.advance(days=2)
    provider.down.add("base1-4")
    stale = run(cards.resolve(factory, ["base1-4"]))
    assert (
        stale.species == {"base1-4": [6]} and stale.pending == set()
    )  # the stored value still serves
    assert provider.calls == ["base1-4", "base1-4"]
    provider.down.clear()
    provider.cards["base1-4"] = [6, 7]
    assert run(cards.resolve(factory, ["base1-4"])).species == {"base1-4": [6, 7]}


def test_invalid_species_numbers_from_the_catalog_are_dropped(factory):
    provider = FakeProvider({"odd-1": [0, 25, 1026, 25, -3]})
    assert run(service(provider).resolve(factory, ["odd-1"])).species == {"odd-1": [25]}


def test_missing_data_never_becomes_a_guess(factory):
    result = run(
        service(FakeProvider(down={"a-1", "b-2"})).resolve(factory, ["a-1", "b-2"])
    )
    assert result.species == {} and result.pending == {"a-1", "b-2"}
    assert run(service(FakeProvider()).resolve(factory, [])).species == {}


def test_invented_identifiers_cannot_grow_the_table(factory):
    provider = FakeProvider({})
    result = run(
        service(provider).resolve(factory, ["not an id", "../x", "a" * 101, "ok-1"])
    )
    assert provider.calls == ["ok-1"]  # only a valid catalog id is asked about
    assert set(result.species) == {"ok-1"}
    assert set(stored(factory)) == {"ok-1"}
