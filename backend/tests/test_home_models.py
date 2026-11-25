"""Home tables on SQLite: favourites, daily value records and the guide column."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import CardFavorite, CollectionValueDay, User, UserSettings


@pytest.fixture
def factory():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def add_user(factory):
    with factory.begin() as session:
        user = User(google_sub=uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        return user.id


def day(user_id, when=date(2026, 11, 25), **changes):
    values = {
        "user_id": user_id,
        "day": when,
        "eur_total": Decimal("10.00"),
        "usd_original_total": Decimal("2.50"),
        "clp_total": Decimal("12000"),
        "usd_total": Decimal("13.00"),
        "usd_clp": Decimal("920.5"),
        "eur_per_usd": Decimal("0.92"),
        "copy_count": 3,
        "priced_count": 3,
    }
    return CollectionValueDay(**(values | changes))


def test_a_favourite_is_per_user_and_card_and_defaults_its_date(factory):
    ash, misty = add_user(factory), add_user(factory)
    with factory.begin() as session:
        session.add_all(
            [
                CardFavorite(user_id=ash, card_id="base1-4"),
                CardFavorite(user_id=misty, card_id="base1-4"),
            ]
        )
    with factory() as session:
        assert session.get(CardFavorite, (ash, "base1-4")).created_at is not None
        assert session.get(CardFavorite, (misty, "base1-4")) is not None


def test_the_same_card_cannot_be_a_favourite_twice(factory):
    ash = add_user(factory)
    with factory.begin() as session:
        session.add(CardFavorite(user_id=ash, card_id="base1-4"))
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(CardFavorite(user_id=ash, card_id="base1-4"))


@pytest.mark.parametrize("card_id", ["", "x" * 101])
def test_a_favourite_card_id_must_be_1_to_100_characters(factory, card_id):
    ash = add_user(factory)
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(CardFavorite(user_id=ash, card_id=card_id))


def test_one_value_record_per_user_and_day(factory):
    ash, misty = add_user(factory), add_user(factory)
    with factory.begin() as session:
        session.add_all([day(ash), day(misty), day(ash, date(2026, 11, 26))])
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(day(ash))


@pytest.mark.parametrize(
    "changes",
    [
        {"eur_total": Decimal("-1")},
        {"usd_original_total": Decimal("-0.01")},
        {"clp_total": Decimal("-1")},
        {"usd_total": Decimal("-1")},
        {"usd_clp": Decimal("0")},
        {"eur_per_usd": Decimal("0")},
        {"copy_count": -1},
        {"priced_count": 4},
        # The converted totals and the rates that produced them are all or none.
        {"clp_total": None},
        {"usd_total": None},
        {"usd_clp": None},
        {"eur_per_usd": None},
    ],
)
def test_value_records_reject_impossible_values(factory, changes):
    ash = add_user(factory)
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(day(ash, **changes))


def test_a_day_without_rates_stores_originals_only(factory):
    ash = add_user(factory)
    none = {"clp_total": None, "usd_total": None, "usd_clp": None, "eur_per_usd": None}
    with factory.begin() as session:
        session.add(day(ash, **none))
    with factory() as session:
        record = session.get(CollectionValueDay, (ash, date(2026, 11, 25)))
        assert record.clp_total is None and record.eur_total == Decimal("10.00")


def test_deleting_a_user_removes_their_home_data_only(factory):
    ash, misty = add_user(factory), add_user(factory)
    with factory.begin() as session:
        session.add_all(
            [
                CardFavorite(user_id=ash, card_id="base1-4"),
                CardFavorite(user_id=misty, card_id="base1-4"),
                day(ash),
                day(misty),
            ]
        )
    with factory.begin() as session:
        session.delete(session.get(User, ash))
    with factory() as session:
        assert session.get(CardFavorite, (ash, "base1-4")) is None
        assert session.get(CollectionValueDay, (ash, date(2026, 11, 25))) is None
        assert session.get(CardFavorite, (misty, "base1-4")) is not None
        assert session.get(CollectionValueDay, (misty, date(2026, 11, 25))) is not None


def test_the_guide_starts_open_and_remembers_when_it_was_dismissed(factory):
    ash = add_user(factory)
    with factory.begin() as session:
        session.add(UserSettings(user_id=ash))
    with factory() as session:
        assert session.get(UserSettings, ash).home_guide_dismissed_at is None
