"""Binder models on SQLite: defaults, checks and cascades without the API."""

from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.db.models import Binder, BinderPocket, InventoryCopy, User


@pytest.fixture
def factory():
    engine = create_engine("sqlite://")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine, expire_on_commit=False)
    engine.dispose()


def owner_with_copies(factory, count=2):
    with factory.begin() as session:
        user = User(google_sub=uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        copies = [
            InventoryCopy(
                user_id=user.id,
                card_id="base1-4",
                condition="mint",
                language="en",
                variant="holo",
            )
            for _ in range(count)
        ]
        session.add_all(copies)
        session.flush()
        binder = Binder(user_id=user.id, name="Kanto", display_order=0)
        session.add(binder)
        session.flush()
        return user.id, binder.id, [copy.id for copy in copies]


def test_new_binders_use_the_noir_cover_and_pockets_record_placement(factory):
    user_id, binder_id, copies = owner_with_copies(factory)
    with factory.begin() as session:
        session.add(
            BinderPocket(
                user_id=user_id,
                binder_id=binder_id,
                page=1,
                pocket=1,
                copy_id=copies[0],
            )
        )
    with factory() as session:
        assert session.get(Binder, binder_id).cover == "noir"
        pocket = session.get(BinderPocket, (binder_id, 1, 1))
        assert pocket.placed_at is not None


@pytest.mark.parametrize(("page", "pocket"), [(0, 1), (41, 1), (1, 0), (1, 10)])
def test_page_and_pocket_ranges_are_enforced(factory, page, pocket):
    user_id, binder_id, copies = owner_with_copies(factory)
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            BinderPocket(
                user_id=user_id,
                binder_id=binder_id,
                page=page,
                pocket=pocket,
                copy_id=copies[0],
            )
        )


@pytest.mark.parametrize(
    "changes", [{"name": " padded "}, {"display_order": -1}, {"cover": "sepia"}]
)
def test_binder_checks_are_enforced(factory, changes):
    user_id, _, _ = owner_with_copies(factory)
    with pytest.raises(IntegrityError), factory.begin() as session:
        session.add(
            Binder(user_id=user_id, **({"name": "Other", "display_order": 1} | changes))
        )


def test_one_copy_per_binder_and_one_copy_per_pocket(factory):
    user_id, binder_id, copies = owner_with_copies(factory)
    with factory.begin() as session:
        session.add(
            BinderPocket(
                user_id=user_id,
                binder_id=binder_id,
                page=1,
                pocket=1,
                copy_id=copies[0],
            )
        )
    for page, pocket, copy_id in ((2, 1, copies[0]), (1, 1, copies[1])):
        with pytest.raises(IntegrityError), factory.begin() as session:
            session.add(
                BinderPocket(
                    user_id=user_id,
                    binder_id=binder_id,
                    page=page,
                    pocket=pocket,
                    copy_id=copy_id,
                )
            )


def test_deleting_a_binder_keeps_copies_and_deleting_a_copy_frees_its_pocket(factory):
    user_id, binder_id, copies = owner_with_copies(factory)
    with factory.begin() as session:
        session.add_all(
            BinderPocket(
                user_id=user_id,
                binder_id=binder_id,
                page=1,
                pocket=index + 1,
                copy_id=copy_id,
            )
            for index, copy_id in enumerate(copies)
        )
    with factory.begin() as session:
        session.delete(session.get(InventoryCopy, copies[0]))
    with factory() as session:
        assert session.scalars(select(BinderPocket.copy_id)).all() == [copies[1]]
    with factory.begin() as session:
        session.delete(session.get(Binder, binder_id))
    with factory() as session:
        assert session.scalars(select(BinderPocket)).all() == []
        assert session.scalars(select(InventoryCopy.id)).all() == [copies[1]]
