"""Daily value records, the guide and the added view on real PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from sqlalchemy import text

from . import test_auth_postgres
from .test_binders_postgres import (
    client_for,
    headers,
    insert_pocket,
    seed_owner,
)
from .test_prices_postgres import _priced_app

history_database = test_auth_postgres.auth_database
PATH = "/api/v1/collection/history"


def day_rows(factory, owner):
    with factory() as session:
        return (
            session.execute(
                text(
                    "SELECT day, clp_total, usd_total, copy_count FROM "
                    "collection_value_days WHERE user_id = :u ORDER BY day"
                ),
                {"u": owner["user_id"]},
            )
            .mappings()
            .all()
        )


def test_two_users_with_the_same_cards_get_separate_records(history_database):
    factory, _ = history_database
    ash = seed_owner(factory, copies=3, binders=0)
    misty = seed_owner(factory, copies=2, binders=0)
    app, _, _ = _priced_app(factory)
    try:
        with client_for(app, ash) as client:
            mine = client.get(PATH).json()
        with client_for(app, misty) as client:
            hers = client.get(PATH).json()
            assert client.get(PATH).json() == hers  # idempotent within the day
    finally:
        app.state.session_factory.kw["bind"].dispose()
    # holo 5 USD (x2) + normal 2 EUR = 12500 CLP for ash; 7500 for misty.
    assert [p["total"] for p in mine["points"]] == ["12500"]
    assert [p["total"] for p in hers["points"]] == ["7500"]
    assert [(r["clp_total"], r["copy_count"]) for r in day_rows(factory, ash)] == [
        (12500, 3)
    ]
    assert [(r["clp_total"], r["copy_count"]) for r in day_rows(factory, misty)] == [
        (7500, 2)
    ]


def test_parallel_first_loads_create_one_record(history_database):
    factory, _ = history_database
    ash = seed_owner(factory, copies=2, binders=0)
    app, _, _ = _priced_app(factory)
    barrier = Barrier(4)

    def load(_):
        with client_for(app, ash) as client:
            barrier.wait(timeout=15)
            return client.get(PATH).status_code

    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            statuses = list(executor.map(load, range(4)))
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert statuses == [200, 200, 200, 200]
    assert len(day_rows(factory, ash)) == 1


def test_the_guide_and_the_added_view_stay_with_their_owner(history_database):
    factory, _ = history_database
    ash = seed_owner(factory, copies=2, binders=1)
    misty = seed_owner(factory, copies=1, binders=0)
    with factory.begin() as session:
        insert_pocket(session, ash, page=1, pocket=1)
        session.execute(
            text(
                "INSERT INTO card_favorites (user_id, card_id) VALUES (:u, 'base1-4')"
            ),
            {"u": ash["user_id"]},
        )
    app, _, _ = _priced_app(factory)
    try:
        with client_for(app, ash) as client:
            guide = client.get("/api/v1/home/guide").json()
            assert guide == {
                "has_copy": True,
                "has_stored": True,
                "has_favorite": True,
                "dismissed": True,
            }
            added = client.get("/api/v1/binders/views/added").json()
            assert {c["id"] for c in added["results"]} == {
                str(i) for i in ash["copies"]
            }
        with client_for(app, misty) as client:
            guide = client.get("/api/v1/home/guide").json()
            assert guide == {
                "has_copy": True,
                "has_stored": False,
                "has_favorite": False,
                "dismissed": False,
            }
            closed = client.put(
                "/api/v1/home/guide", json={"dismissed": True}, headers=headers(misty)
            )
            assert closed.status_code == 200
        with client_for(app, ash) as client:
            assert client.get("/api/v1/home/guide").json()["has_favorite"] is True
    finally:
        app.state.session_factory.kw["bind"].dispose()
    with factory() as session:
        stamps = dict(
            session.execute(
                text(
                    "SELECT user_id, home_guide_dismissed_at IS NOT NULL "
                    "FROM user_settings"
                )
            ).all()
        )
    assert stamps.get(misty["user_id"]) is True
