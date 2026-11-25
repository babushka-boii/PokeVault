"""Binders on real PostgreSQL: isolation, locking, views and persistence.

Every test runs in a disposable schema created by the auth fixture; none touches the
populated application schema.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Barrier
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, text

from app.auth.sessions import csrf_token, token_digest
from app.core.config import Settings
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app

from . import test_auth_postgres

binders_database = test_auth_postgres.auth_database
ORIGIN = "http://localhost:5173"
PATH = "/api/v1/binders"


def seed_owner(factory, subject=None, copies=2, binders=2, card_id="base1-4"):
    """Duplicate printings get different physical metadata and UUID identities."""
    token = uuid4().hex
    with factory.begin() as session:
        user = User(google_sub=subject or uuid4().hex, display_name="Collector")
        session.add(user)
        session.flush()
        user_id = user.id
        session.add(
            AuthSession(
                token_digest=token_digest(token),
                user_id=user_id,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        physical = [
            InventoryCopy(
                user_id=user_id,
                card_id=card_id,
                condition="mint" if index % 2 == 0 else "played",
                language="ja" if index % 2 == 0 else "en",
                variant="holo" if index % 2 == 0 else "normal",
                acquired_on=date(2026, 10, 1),
                notes=f"Physical copy {index}",
            )
            for index in range(copies)
        ]
        session.add_all(physical)
        session.flush()
        copy_ids = [copy.id for copy in physical]
        binder_ids = [uuid4() for _ in range(binders)]
        for index, binder_id in enumerate(binder_ids):
            insert_binder(session, binder_id, user_id, display_order=index)
    return {
        "user_id": user_id,
        "token": token,
        "copies": copy_ids,
        "binders": binder_ids,
    }


def insert_binder(session, binder_id, user_id, **changes):
    values = {
        "id": binder_id,
        "user_id": user_id,
        "name": "Kanto",
        "display_order": 0,
        **changes,
    }
    session.execute(
        text(
            "INSERT INTO binders (id,user_id,name,display_order) "
            "VALUES (:id,:user_id,:name,:display_order)"
        ),
        values,
    )


def insert_pocket(session, owner, binder=None, copy=None, page=1, pocket=1):
    session.execute(
        text(
            "INSERT INTO binder_pockets (user_id,binder_id,page,pocket,copy_id) "
            "VALUES (:user_id,:binder_id,:page,:pocket,:copy_id)"
        ),
        {
            "user_id": owner["user_id"],
            "binder_id": binder or owner["binders"][0],
            "copy_id": copy or owner["copies"][0],
            "page": page,
            "pocket": pocket,
        },
    )
    # Like the API: a card beyond the stored pages grows them (page + spare, even).
    # Tests pinned to an older revision have no such column yet.
    stored = session.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'binders' AND column_name = 'page_count'"
        )
    ).first()
    if stored:
        session.execute(
            text(
                "UPDATE binders SET page_count = GREATEST(page_count, :pages) "
                "WHERE id = :id"
            ),
            {
                "pages": min(40, max(2, -(-(page + 1) // 2) * 2)),
                "id": binder or owner["binders"][0],
            },
        )


def rows(factory, table):
    assert table in {"binders", "binder_pockets", "inventory_copies"}
    with factory() as session:
        return session.execute(text(f"SELECT * FROM {table}")).mappings().all()


def application(factory, google=False):
    settings = Settings(
        DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
        GOOGLE_CLIENT_ID="local-test-client" if google else "",
        GOOGLE_CLIENT_SECRET="local-placeholder" if google else "",
        _env_file=None,
    )
    # Each application creates its own engine, so restart tests exercise real
    # persistence without sharing an ORM session or identity map.
    return create_app(settings)


def headers(owner):
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(owner["token"])}


def client_for(app, owner):
    return TestClient(
        app,
        base_url="http://localhost:8000",
        cookies={"pokevault_session": owner["token"]},
    )


def concurrent_requests(app, owner, requests):
    """Send requests in parallel; both transactions reach the owner lock first."""
    barrier = Barrier(len(requests))
    transactions = Barrier(len(requests))

    def overlap_transactions(
        connection, cursor, statement, parameters, context, executemany
    ):
        if "FOR UPDATE" in statement and "users.id" in statement:
            transactions.wait(timeout=15)

    def send(request):
        method, path, body = request
        with client_for(app, owner) as client:
            barrier.wait(timeout=15)
            return client.request(method, path, json=body, headers=headers(owner))

    engine = app.state.session_factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", overlap_transactions)
    try:
        with ThreadPoolExecutor(max_workers=len(requests)) as executor:
            return list(executor.map(send, requests))
    finally:
        event.remove(engine, "before_cursor_execute", overlap_transactions)


def test_two_owners_with_the_same_card_never_see_or_change_each_other(
    binders_database,
):
    factory, _ = binders_database
    ash = seed_owner(factory, copies=3)
    misty = seed_owner(factory, copies=3)
    with factory.begin() as session:
        insert_pocket(session, ash, page=2, pocket=4)
        insert_pocket(session, misty, page=2, pocket=4)
    app = application(factory)
    try:
        with client_for(app, ash) as client:
            listing = client.get(PATH).json()
            assert {UUID(b["id"]) for b in listing["results"]} == set(ash["binders"])
            assert listing["results"][0]["copy_count"] == 1
            detail = client.get(f"{PATH}/{ash['binders'][0]}").json()
            assert [UUID(p["copy"]["id"]) for p in detail["pockets"]] == [
                ash["copies"][0]
            ]
            for path in (
                f"{PATH}/views/owned",
                f"{PATH}/views/unassigned",
                f"{PATH}/views/recent",
            ):
                ids = {UUID(c["id"]) for c in client.get(path).json()["results"]}
                assert ids <= set(ash["copies"])
            located = client.get(
                f"{PATH}/locations",
                params={"copy_id": [str(ash["copies"][0]), str(misty["copies"][0])]},
            ).json()["results"]
            assert [UUID(item["copy_id"]) for item in located] == [ash["copies"][0]]
            foreign = misty["binders"][0]
            for method, suffix, body in (
                ("get", "", None),
                ("put", "", {"name": "Mine"}),
                ("delete", "", None),
                ("post", "/pockets", {"copy_id": str(ash["copies"][1])}),
                ("put", "/pockets/1/1", {"copy_id": str(ash["copies"][1])}),
            ):
                response = client.request(
                    method, f"{PATH}/{foreign}{suffix}", json=body, headers=headers(ash)
                )
                assert response.status_code == 404
            removal = client.delete(
                f"{PATH}/{foreign}/pockets/2/4",
                params={"copy_id": str(misty["copies"][0])},
                headers=headers(ash),
            )
            assert removal.status_code == 404
            stolen = client.put(
                f"{PATH}/{ash['binders'][0]}/pockets/1/1",
                json={"copy_id": str(misty["copies"][1])},
                headers=headers(ash),
            )
            assert stolen.status_code == 404
    finally:
        app.state.session_factory.kw["bind"].dispose()
    pockets = rows(factory, "binder_pockets")
    assert sorted((p["user_id"], p["copy_id"]) for p in pockets) == sorted(
        [(ash["user_id"], ash["copies"][0]), (misty["user_id"], misty["copies"][0])]
    )


def test_full_binder_conflicts_keep_the_source_and_all_physical_metadata(
    binders_database,
):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=361)
    destination, source = owner["binders"]
    with factory.begin() as session:
        for index, copy in enumerate(owner["copies"][:360]):
            insert_pocket(
                session,
                owner,
                binder=destination,
                copy=copy,
                page=index // 9 + 1,
                pocket=index % 9 + 1,
            )
        insert_pocket(session, owner, binder=source, copy=owner["copies"][360])
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    app = application(factory)
    try:
        with client_for(app, owner) as client:
            last = {"copy_id": str(owner["copies"][360])}
            for page, pocket in ((1, 1), (20, 5), (40, 9)):
                response = client.put(
                    f"{PATH}/{destination}/pockets/{page}/{pocket}",
                    headers=headers(owner),
                    json=last,
                )
                assert response.status_code == 409
            full = client.post(
                f"{PATH}/{destination}/pockets", headers=headers(owner), json=last
            )
            assert (full.status_code, full.json()["detail"]) == (409, "binder_full")
            summary = client.get(f"{PATH}/{destination}").json()
            assert (summary["copy_count"], summary["page_count"]) == (360, 40)
            current = client.get(f"{PATH}/{source}").json()
            assert current["pockets"][0]["copy"]["id"] == str(owner["copies"][360])
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert len(rows(factory, "binder_pockets")) == 361
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before


def test_concurrent_different_copies_have_one_target_pocket_winner(binders_database):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=2, binders=3)
    with factory.begin() as session:
        for index, copy in enumerate(owner["copies"]):
            insert_pocket(session, owner, binder=owner["binders"][index], copy=copy)
    target = owner["binders"][2]
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                ("PUT", f"{PATH}/{target}/pockets/3/7", {"copy_id": str(copy)})
                for copy in owner["copies"]
            ],
        )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert sorted(response.status_code for response in responses) == [200, 409]
    pockets = rows(factory, "binder_pockets")
    assert len(pockets) == 2
    destination = [row for row in pockets if row["binder_id"] == target]
    assert len(destination) == 1
    assert (destination[0]["page"], destination[0]["pocket"]) == (3, 7)
    assert {row["copy_id"] for row in pockets} == set(owner["copies"])


def test_concurrent_stores_take_distinct_next_free_pockets(binders_database):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=3, binders=1)
    binder = owner["binders"][0]
    with factory.begin() as session:
        insert_pocket(session, owner, copy=owner["copies"][0], page=1, pocket=1)
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                ("POST", f"{PATH}/{binder}/pockets", {"copy_id": str(copy)})
                for copy in owner["copies"][1:]
            ],
        )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert [response.status_code for response in responses] == [200, 200]
    assert sorted((r.json()["page"], r.json()["pocket"]) for r in responses) == [
        (1, 2),
        (1, 3),
    ]
    pockets = sorted(
        (row["page"], row["pocket"]) for row in rows(factory, "binder_pockets")
    )
    assert pockets == [(1, 1), (1, 2), (1, 3)]


def test_concurrent_same_copy_two_targets_has_exactly_one_pocket(binders_database):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=1, binders=3)
    with factory.begin() as session:
        insert_pocket(session, owner)
    copy = {"copy_id": str(owner["copies"][0])}
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                ("PUT", f"{PATH}/{owner['binders'][1]}/pockets/1/3", copy),
                ("PUT", f"{PATH}/{owner['binders'][2]}/pockets/40/9", copy),
            ],
        )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert [response.status_code for response in responses] == [200, 200]
    # The second move reports the first move's destination as its origin.
    origins = {
        (r.json()["moved_from"]["page"], r.json()["moved_from"]["pocket"])
        for r in responses
    }
    assert (1, 1) in origins
    pockets = rows(factory, "binder_pockets")
    assert len(pockets) == 1
    assert (pockets[0]["binder_id"], pockets[0]["page"], pockets[0]["pocket"]) in {
        (owner["binders"][1], 1, 3),
        (owner["binders"][2], 40, 9),
    }


def test_concurrent_reorders_are_whole_permutations_and_invalid_order_rolls_back(
    binders_database,
):
    factory, _ = binders_database
    owner = seed_owner(factory, binders=4)
    foreign = seed_owner(factory, binders=1)
    permutations = [
        list(reversed(owner["binders"])),
        owner["binders"][1:] + owner["binders"][:1],
    ]
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                ("PUT", f"{PATH}/order", {"binder_ids": [str(b) for b in order]})
                for order in permutations
            ],
        )
        assert [response.status_code for response in responses] == [200, 200]
        for response, expected in zip(responses, permutations, strict=True):
            assert [UUID(b["id"]) for b in response.json()["results"]] == expected
        with client_for(app, owner) as client:
            before = client.get(PATH).json()
            assert [UUID(b["id"]) for b in before["results"]] in permutations
            for invalid in (
                owner["binders"][:-1],
                [owner["binders"][0]] * 4,
                [*owner["binders"][:-1], foreign["binders"][0]],
            ):
                response = client.put(
                    f"{PATH}/order",
                    headers=headers(owner),
                    json={"binder_ids": [str(b) for b in invalid]},
                )
                assert response.status_code == 422
                assert client.get(PATH).json() == before
    finally:
        app.state.session_factory.kw["bind"].dispose()


def test_stale_removal_cannot_delete_a_replacement(binders_database):
    factory, _ = binders_database
    owner = seed_owner(factory)
    binder = owner["binders"][0]
    with factory.begin() as session:
        insert_pocket(session, owner, copy=owner["copies"][1])
    app = application(factory)
    try:
        with client_for(app, owner) as client:
            stale = client.delete(
                f"{PATH}/{binder}/pockets/1/1",
                headers=headers(owner),
                params={"copy_id": str(owner["copies"][0])},
            )
            assert (stale.status_code, stale.json()["detail"]) == (
                409,
                "pocket_changed",
            )
            missing = client.get(f"{PATH}/{uuid4()}")
            assert missing.status_code == 404
            assert client.get(f"{PATH}/{binder}").json()["pockets"][0]["copy"][
                "id"
            ] == str(owner["copies"][1])
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert len(rows(factory, "binder_pockets")) == 1


def test_parallel_create_respects_one_hundred_binder_limit(binders_database):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=0, binders=99)
    app = application(factory)
    barrier = Barrier(2)

    def create(index):
        with client_for(app, owner) as client:
            barrier.wait(timeout=15)
            return client.post(PATH, headers=headers(owner), json={"name": f"B{index}"})

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(create, range(2)))
        assert sorted(response.status_code for response in responses) == [201, 409]
        with client_for(app, owner) as client:
            result = client.get(PATH).json()
            assert result["total"] == len(result["results"]) == 100
            assert [b["display_order"] for b in result["results"]] == list(range(100))
    finally:
        app.state.session_factory.kw["bind"].dispose()


def test_views_and_binders_are_bounded_private_and_never_fetch_the_provider(
    binders_database,
):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=65)
    seed_owner(factory, copies=4, binders=0)
    with factory.begin() as session:
        for index, copy in enumerate(owner["copies"][:30]):
            insert_pocket(
                session, owner, copy=copy, page=index // 9 + 1, pocket=index % 9 + 1
            )
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    app = application(factory)

    async def no_provider(*args, **kwargs):
        pytest.fail("Binder reads must not fetch public provider metadata")

    app.state.card_provider.get_card = no_provider
    app.state.card_provider.list_cards = no_provider
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    engine = app.state.session_factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", capture)
    try:
        with client_for(app, owner) as client:
            for view, total in (("owned", 65), ("unassigned", 35), ("recent", 65)):
                statements.clear()
                response = client.get(f"{PATH}/views/{view}?offset=3&limit=7")
                assert response.status_code == 200
                assert response.headers["cache-control"] == "no-store"
                page = response.json()
                assert (page["total"], page["offset"], page["limit"]) == (total, 3, 7)
                assert len(page["results"]) == 7
                data_queries = [
                    sql
                    for sql in statements
                    if "inventory_copies.id" in sql and "count(" not in sql.lower()
                ]
                assert len(data_queries) == 1
                assert "LIMIT" in data_queries[0] and "OFFSET" in data_queries[0]
                if view == "unassigned":
                    assert {UUID(copy["id"]) for copy in page["results"]}.isdisjoint(
                        owner["copies"][:30]
                    )
            detail = client.get(f"{PATH}/{owner['binders'][0]}").json()
            assert len(detail["pockets"]) == detail["copy_count"] == 30
            assert (detail["pockets"][-1]["page"], detail["pockets"][-1]["pocket"]) == (
                4,
                3,
            )
            assert detail["page_count"] == 6
    finally:
        event.remove(engine, "before_cursor_execute", capture)
        engine.dispose()
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before


def test_recent_uses_acquisition_then_added_date_and_stable_uuid_ties(
    binders_database,
):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=5, binders=0)
    copy_ids = sorted(owner["copies"])
    added = datetime(2026, 10, 2, 13, tzinfo=UTC)
    with factory.begin() as session:
        for index, copy_id in enumerate(copy_ids):
            copy = session.get(InventoryCopy, copy_id)
            copy.created_at = added
            copy.acquired_on = date(2026, 10, 1)
            if index == 0:
                copy.acquired_on = date(2026, 10, 3)
            elif index == 1:
                copy.acquired_on = None  # Added date is October 2.
            elif index == 2:
                copy.created_at = added - timedelta(hours=1)
    expected = [copy_ids[0], copy_ids[1], copy_ids[4], copy_ids[3], copy_ids[2]]
    app = application(factory)
    try:
        with client_for(app, owner) as client:
            first = client.get(f"{PATH}/views/recent?limit=3").json()
            second = client.get(f"{PATH}/views/recent?offset=3&limit=3").json()
            assert first["total"] == second["total"] == 5
            combined = first["results"] + second["results"]
            assert [UUID(copy["id"]) for copy in combined] == expected
    finally:
        app.state.session_factory.kw["bind"].dispose()


@pytest.mark.parametrize("view", ["owned", "unassigned", "recent"])
def test_view_count_and_page_share_snapshot_during_concurrent_insert(
    binders_database, view
):
    factory, _ = binders_database
    owner = seed_owner(factory, copies=1, binders=0)
    app = application(factory)
    inserted = False

    def insert_after_count(
        connection, cursor, statement, parameters, context, executemany
    ):
        nonlocal inserted
        if inserted or "FROM inventory_copies" not in statement:
            return
        if "count(" not in statement.lower():
            return
        inserted = True
        with factory.begin() as other:
            other.add(
                InventoryCopy(
                    user_id=owner["user_id"],
                    card_id="base1-4",
                    condition="mint",
                    language="es",
                    variant="normal",
                    notes="Concurrent copy",
                )
            )

    engine = app.state.session_factory.kw["bind"]
    event.listen(engine, "after_cursor_execute", insert_after_count)
    try:
        with client_for(app, owner) as client:
            page = client.get(f"{PATH}/views/{view}").json()
            assert inserted
            assert page["total"] == len(page["results"]) == 1
            next_page = client.get(f"{PATH}/views/{view}").json()
            assert next_page["total"] == len(next_page["results"]) == 2
    finally:
        event.remove(engine, "after_cursor_execute", insert_after_count)
        engine.dispose()


def test_binder_and_physical_metadata_persist_through_logout_relogin_and_restart(
    binders_database,
):
    factory, _ = binders_database
    owner = seed_owner(factory, subject="persistent-binder-owner", binders=0)
    original_id = str(owner["copies"][1])

    def restart():
        app = application(factory, google=True)

        async def identity(code, nonce, verifier):
            assert nonce and verifier
            return {"sub": "persistent-binder-owner", "name": "Collector"}

        async def no_provider(*args, **kwargs):
            pytest.fail("Persistence checks must not depend on a live card provider")

        app.state.google_provider.identity = identity
        app.state.card_provider.get_card = no_provider
        return app

    def login(client):
        response = client.get(
            "/api/v1/auth/google/login", headers={"Accept": "application/json"}
        )
        assert response.status_code == 200
        state = parse_qs(urlsplit(response.json()["authorization_url"]).query)["state"][
            0
        ]
        callback = client.get(
            "/api/v1/auth/google/callback",
            params={"state": state, "code": "local"},
            follow_redirects=False,
        )
        assert callback.status_code == 303
        response = client.get("/api/v1/auth/me")
        assert response.status_code == 200
        return response.json()

    app = restart()
    try:
        with TestClient(app, base_url="http://localhost:8000") as client:
            me = login(client)
            auth = {"Origin": ORIGIN, "X-CSRF-Token": me["csrf_token"]}
            created = client.post(
                PATH, headers=auth, json={"name": "  Persistent favorites  "}
            )
            assert created.status_code == 201
            binder_id = created.json()["id"]
            placed = client.put(
                f"{PATH}/{binder_id}/pockets/40/9",
                headers=auth,
                json={"copy_id": original_id},
            )
            assert placed.status_code == 200
            expected = client.get(f"{PATH}/{binder_id}").json()
            assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
            assert client.get(PATH).status_code == 401
            assert client.get(f"{PATH}/{binder_id}").status_code == 401
    finally:
        app.state.session_factory.kw["bind"].dispose()
    restarted = restart()
    try:
        with TestClient(restarted, base_url="http://localhost:8000") as client:
            again = login(client)
            assert again["user"]["id"] == str(owner["user_id"])
            assert client.get(f"{PATH}/{binder_id}").json() == expected
            copy = client.get(f"/api/v1/inventory/{original_id}").json()
            assert (
                copy["condition"],
                copy["language"],
                copy["variant"],
                copy["notes"],
            ) == ("played", "en", "normal", "Physical copy 1")
            assert client.get(f"{PATH}/views/unassigned").json()["total"] == 1
    finally:
        restarted.state.session_factory.kw["bind"].dispose()
