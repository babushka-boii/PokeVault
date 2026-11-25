"""Favourite cards on real PostgreSQL: isolation and parallel writes."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from sqlalchemy import text

from . import test_auth_postgres
from .test_binders_postgres import application, client_for, headers, seed_owner

favorites_database = test_auth_postgres.auth_database
PATH = "/api/v1/favorites"


def stored(factory, owner):
    with factory() as session:
        return set(
            session.execute(
                text("SELECT card_id FROM card_favorites WHERE user_id = :u"),
                {"u": owner["user_id"]},
            ).scalars()
        )


def test_two_users_never_see_or_change_each_others_favourites(favorites_database):
    factory, _ = favorites_database
    ash = seed_owner(factory, copies=1, binders=0)
    misty = seed_owner(factory, copies=1, binders=0)
    app = application(factory)
    try:
        with client_for(app, ash) as client:
            assert (
                client.put(f"{PATH}/base1-4", headers=headers(ash)).status_code == 200
            )
            assert (
                client.put(f"{PATH}/base1-5", headers=headers(ash)).status_code == 200
            )
        with client_for(app, misty) as client:
            assert client.get(f"{PATH}/base1-4").json()["favorite"] is False
            assert client.get(f"{PATH}/cards").json()["total"] == 0
            client.delete(f"{PATH}/base1-4", headers=headers(misty))  # not hers
            assert (
                client.put(f"{PATH}/base1-4", headers=headers(misty)).status_code == 200
            )
        with client_for(app, ash) as client:
            assert client.get(f"{PATH}/cards").json()["total"] == 2
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert stored(factory, ash) == {"base1-4", "base1-5"}
    assert stored(factory, misty) == {"base1-4"}


def test_parallel_stars_of_the_same_card_end_with_one_favourite(favorites_database):
    factory, _ = favorites_database
    ash = seed_owner(factory, copies=1, binders=0)
    app = application(factory)
    barrier = Barrier(4)

    def star(_):
        with client_for(app, ash) as client:
            barrier.wait(timeout=15)
            return client.put(f"{PATH}/base1-4", headers=headers(ash)).status_code

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            statuses = list(executor.map(star, range(4)))
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert statuses == [200, 200, 200, 200]
    assert stored(factory, ash) == {"base1-4"}


def test_the_limit_holds_under_parallel_writes(favorites_database):
    factory, _ = favorites_database
    ash = seed_owner(factory, copies=1, binders=0)
    with factory.begin() as session:
        for index in range(499):
            session.execute(
                text("INSERT INTO card_favorites (user_id, card_id) VALUES (:u, :c)"),
                {"u": ash["user_id"], "c": f"set1-{index}"},
            )
    app = application(factory)
    barrier = Barrier(3)

    def star(card_id):
        with client_for(app, ash) as client:
            barrier.wait(timeout=15)
            return client.put(f"{PATH}/{card_id}", headers=headers(ash)).status_code

    try:
        with ThreadPoolExecutor(max_workers=3) as executor:
            statuses = sorted(executor.map(star, ["new-1", "new-2", "new-3"]))
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert statuses == [200, 409, 409]
    assert len(stored(factory, ash)) == 500


def test_the_batch_status_only_sees_the_callers_stars(favorites_database):
    factory, _ = favorites_database
    ash = seed_owner(factory, copies=1, binders=0)
    misty = seed_owner(factory, copies=1, binders=0)
    with factory.begin() as session:
        for owner, card in ((ash, "base1-4"), (misty, "base1-5"), (misty, "base1-4")):
            session.execute(
                text("INSERT INTO card_favorites (user_id, card_id) VALUES (:u, :c)"),
                {"u": owner["user_id"], "c": card},
            )
    app = application(factory)
    asked = {"card_id": ["base1-5", "base1-4", "base1-6"]}
    try:
        with client_for(app, ash) as client:
            assert client.get(f"{PATH}/status", params=asked).json() == {
                "card_ids": ["base1-4"]
            }
        with client_for(app, misty) as client:
            assert client.get(f"{PATH}/status", params=asked).json() == {
                "card_ids": ["base1-5", "base1-4"]
            }
    finally:
        app.state.session_factory.kw["bind"].dispose()
