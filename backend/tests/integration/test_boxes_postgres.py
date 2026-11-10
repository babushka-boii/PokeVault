"""Real constraints, transactions and persistence in disposable PostgreSQL schemas.

The existing auth fixture guards the configured test database and creates a fresh
schema for every test. No test migrates or writes the populated application schema.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Barrier
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, text
from sqlalchemy.exc import DBAPIError, IntegrityError

from app.auth.sessions import csrf_token, token_digest
from app.core.config import Settings
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app

from . import test_auth_postgres

boxes_database = test_auth_postgres.auth_database
ORIGIN = "http://localhost:5173"


def seed_owner(factory, subject=None, copies=2, boxes=2):
    """Give duplicate printings different physical metadata and UUID identities."""
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
                card_id="base1-4",
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
        box_ids = [uuid4() for _ in range(boxes)]
        for index, box_id in enumerate(box_ids):
            insert_box(session, box_id, user_id, display_order=index)
    return {
        "user_id": user_id,
        "token": token,
        "copies": copy_ids,
        "boxes": box_ids,
    }


def insert_box(session, box_id, user_id, **changes):
    values = {
        "id": box_id,
        "user_id": user_id,
        "name": "Classic box",
        "display_order": 0,
        "wallpaper": "classic",
        **changes,
    }
    session.execute(
        text(
            "INSERT INTO personal_boxes "
            "(id,user_id,name,display_order,wallpaper) "
            "VALUES (:id,:user_id,:name,:display_order,:wallpaper)"
        ),
        values,
    )


def insert_placement(session, owner, box=None, copy=None, position=0, user_id=None):
    session.execute(
        text(
            "INSERT INTO box_memberships (user_id,box_id,position,copy_id) "
            "VALUES (:user_id,:box_id,:position,:copy_id)"
        ),
        {
            "user_id": user_id or owner["user_id"],
            "box_id": box or owner["boxes"][0],
            "copy_id": copy or owner["copies"][0],
            "position": position,
        },
    )


def rows(factory, table):
    assert table in {"personal_boxes", "box_memberships", "inventory_copies"}
    with factory() as session:
        return session.execute(text(f"SELECT * FROM {table}")).mappings().all()


def application(factory, google=False):
    settings = Settings(
        DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
        GOOGLE_CLIENT_ID="local-test-client" if google else "",
        GOOGLE_CLIENT_SECRET="local-placeholder" if google else "",
        _env_file=None,
    )
    app = create_app(settings)
    # Each application creates its own engine, allowing restart tests to exercise
    # actual persistence without sharing an ORM session or an identity map.
    return app


def headers(owner):
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(owner["token"])}


def client_for(app, owner):
    return TestClient(
        app,
        base_url="http://localhost:8000",
        cookies={"pokevault_session": owner["token"]},
    )


def test_migration_has_owner_foreign_keys_and_exact_unique_keys(boxes_database):
    factory, config = boxes_database
    scripts = ScriptDirectory.from_config(config)
    assert scripts.get_current_head() == "0004"
    assert scripts.get_revision("0004").down_revision == "0003"
    with factory() as session:
        inspector = inspect(session.get_bind())
        assert {"personal_boxes", "box_memberships"}.issubset(
            inspector.get_table_names()
        )
        assert inspector.get_pk_constraint("box_memberships")[
            "constrained_columns"
        ] == ["box_id", "position"]
        foreign_keys = inspector.get_foreign_keys("box_memberships")
        assert {
            (
                tuple(key["constrained_columns"]),
                key["referred_table"],
                tuple(key["referred_columns"]),
                key["options"].get("ondelete"),
            )
            for key in foreign_keys
        } == {
            (("user_id", "box_id"), "personal_boxes", ("user_id", "id"), "CASCADE"),
            (("user_id", "copy_id"), "inventory_copies", ("user_id", "id"), "CASCADE"),
        }
        for table, columns in (
            ("box_memberships", ["copy_id"]),
            ("personal_boxes", ["user_id", "display_order"]),
            ("personal_boxes", ["user_id", "id"]),
            ("inventory_copies", ["user_id", "id"]),
        ):
            assert columns in [
                key["column_names"] for key in inspector.get_unique_constraints(table)
            ]


@pytest.mark.parametrize(
    ("changes", "sqlstates"),
    [
        ({"name": ""}, {"23514"}),
        ({"name": "   "}, {"23514"}),
        ({"name": " padded "}, {"23514"}),
        ({"name": "x" * 81}, {"23514", "22001"}),
        ({"wallpaper": "external"}, {"23514"}),
        ({"display_order": -1}, {"23514"}),
    ],
)
def test_raw_box_checks_reject_invalid_values(boxes_database, changes, sqlstates):
    factory, _ = boxes_database
    owner = seed_owner(factory, boxes=0, copies=0)
    with pytest.raises(DBAPIError) as error, factory.begin() as session:
        insert_box(session, uuid4(), owner["user_id"], **changes)
    assert error.value.orig.sqlstate in sqlstates
    assert rows(factory, "personal_boxes") == []


def test_display_order_is_unique_per_owner_and_not_global(boxes_database):
    factory, _ = boxes_database
    first = seed_owner(factory, boxes=1)
    second = seed_owner(factory, boxes=1)
    assert len(rows(factory, "personal_boxes")) == 2
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_box(session, uuid4(), first["user_id"], display_order=0)
    assert error.value.orig.sqlstate == "23505"
    assert {row["user_id"] for row in rows(factory, "personal_boxes")} == {
        first["user_id"],
        second["user_id"],
    }


@pytest.mark.parametrize(
    "foreign", ["box", "copy", "both", "missing_box", "missing_copy"]
)
def test_composite_ownership_foreign_keys_reject_forged_placements(
    boxes_database, foreign
):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    other = seed_owner(factory)
    box = other["boxes"][0] if foreign in {"box", "both"} else owner["boxes"][0]
    copy = other["copies"][0] if foreign in {"copy", "both"} else owner["copies"][0]
    if foreign == "missing_box":
        box = uuid4()
    if foreign == "missing_copy":
        copy = uuid4()
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_placement(session, owner, box=box, copy=copy)
    assert error.value.orig.sqlstate == "23503"
    assert rows(factory, "box_memberships") == []
    assert len(rows(factory, "inventory_copies")) == 4


@pytest.mark.parametrize("position", [-1, 30])
def test_raw_position_is_limited_to_thirty_slots(boxes_database, position):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        insert_placement(session, owner, position=position)
    assert error.value.orig.sqlstate == "23514"
    assert rows(factory, "box_memberships") == []


@pytest.mark.parametrize("conflict", ["copy", "slot"])
def test_physical_copy_and_slot_are_independently_unique(boxes_database, conflict):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    with factory.begin() as session:
        insert_placement(session, owner, position=0)
    with pytest.raises(IntegrityError) as error, factory.begin() as session:
        if conflict == "copy":
            insert_placement(session, owner, box=owner["boxes"][1], position=29)
        else:
            insert_placement(session, owner, copy=owner["copies"][1], position=0)
    assert error.value.orig.sqlstate == "23505"
    placements = rows(factory, "box_memberships")
    assert len(placements) == 1
    assert placements[0]["copy_id"] == owner["copies"][0]


@pytest.mark.parametrize("deleted", ["box", "copy", "user"])
def test_cascades_remove_only_appropriate_owner_records(boxes_database, deleted):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    other = seed_owner(factory, copies=1, boxes=1)
    with factory.begin() as session:
        insert_placement(session, owner)
        insert_placement(session, other)
    original_copies = {
        row["id"]: dict(row) for row in rows(factory, "inventory_copies")
    }
    with factory.begin() as session:
        if deleted == "box":
            session.execute(
                text("DELETE FROM personal_boxes WHERE id=:id"),
                {"id": owner["boxes"][0]},
            )
        elif deleted == "copy":
            session.delete(session.get(InventoryCopy, owner["copies"][0]))
        else:
            session.delete(session.get(User, owner["user_id"]))
    placements = rows(factory, "box_memberships")
    assert len(placements) == 1
    assert placements[0]["user_id"] == other["user_id"]
    remaining = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    expected = set(original_copies)
    if deleted == "copy":
        expected.remove(owner["copies"][0])
    elif deleted == "user":
        expected.difference_update(owner["copies"])
    assert set(remaining) == expected
    assert all(remaining[key] == original_copies[key] for key in remaining)
    remaining_boxes = rows(factory, "personal_boxes")
    assert len(remaining_boxes) == {"box": 2, "copy": 3, "user": 1}[deleted]


def test_upgrade_and_downgrade_preserve_existing_0003_inventory(boxes_database):
    factory, config = boxes_database
    # Both migrations run only in the auth fixture's fresh disposable schema.
    command.downgrade(config, "0003")
    owner = seed_owner(factory, boxes=0)
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    assert len(before) == 2
    command.upgrade(config, "0004")
    with factory.begin() as session:
        box = uuid4()
        insert_box(session, box, owner["user_id"])
        insert_placement(session, owner, box=box)
    command.downgrade(config, "0003")
    with factory() as session:
        inspector = inspect(session.get_bind())
        assert not {"personal_boxes", "box_memberships"} & set(
            inspector.get_table_names()
        )
        assert {"users", "auth_sessions", "inventory_copies"}.issubset(
            inspector.get_table_names()
        )
        assert (
            session.execute(text("SELECT version_num FROM alembic_version")).scalar()
            == "0003"
        )
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before
    command.upgrade(config, "head")
    assert rows(factory, "box_memberships") == []
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before


def test_full_box_conflicts_keep_source_and_all_physical_metadata(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=31)
    destination, source = owner["boxes"]
    with factory.begin() as session:
        for position, copy in enumerate(owner["copies"][:30]):
            insert_placement(
                session, owner, box=destination, copy=copy, position=position
            )
        insert_placement(session, owner, box=source, copy=owner["copies"][30])
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    app = application(factory)
    try:
        with client_for(app, owner) as client:
            for position in range(30):
                response = client.put(
                    f"/api/v1/boxes/{destination}/slots/{position}",
                    headers=headers(owner),
                    json={"copy_id": str(owner["copies"][30])},
                )
                assert response.status_code == 409
            full = client.get(f"/api/v1/boxes/{destination}").json()
            assert full["copy_count"] == 30
            assert [slot["position"] for slot in full["slots"]] == list(range(30))
            current = client.get(f"/api/v1/boxes/{source}").json()
            assert current["slots"][0]["copy"]["id"] == str(owner["copies"][30])
            assert (
                client.put(
                    f"/api/v1/boxes/{destination}/slots/30",
                    headers=headers(owner),
                    json={"copy_id": str(owner["copies"][30])},
                ).status_code
                == 422
            )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert len(rows(factory, "box_memberships")) == 31
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before


def concurrent_requests(app, owner, requests):
    barrier = Barrier(len(requests))
    transactions = Barrier(len(requests))

    def overlap_transactions(
        connection, cursor, statement, parameters, context, executemany
    ):
        # Both PostgreSQL transactions must reach the owner lock before either
        # write runs; the test therefore exercises real lock contention.
        if "FOR UPDATE" in statement and "users.id" in statement:
            transactions.wait(timeout=15)

    def send(request):
        with client_for(app, owner) as client:
            barrier.wait(timeout=15)
            return client.put(request[0], json=request[1], headers=headers(owner))

    engine = app.state.session_factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", overlap_transactions)
    try:
        with ThreadPoolExecutor(max_workers=len(requests)) as executor:
            return list(executor.map(send, requests))
    finally:
        event.remove(engine, "before_cursor_execute", overlap_transactions)


def test_concurrent_different_copies_have_one_target_slot_winner(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=2, boxes=3)
    with factory.begin() as session:
        for index, copy in enumerate(owner["copies"]):
            insert_placement(session, owner, box=owner["boxes"][index], copy=copy)
    target = owner["boxes"][2]
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                (f"/api/v1/boxes/{target}/slots/17", {"copy_id": str(copy)})
                for copy in owner["copies"]
            ],
        )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert sorted(response.status_code for response in responses) == [200, 409]
    placements = rows(factory, "box_memberships")
    assert len(placements) == 2
    destination = [row for row in placements if row["box_id"] == target]
    assert len(destination) == 1 and destination[0]["position"] == 17
    winner = destination[0]["copy_id"]
    loser = next(copy for copy in owner["copies"] if copy != winner)
    original = owner["boxes"][owner["copies"].index(loser)]
    assert any(
        row["copy_id"] == loser and row["box_id"] == original for row in placements
    )
    assert {row["copy_id"] for row in placements} == set(owner["copies"])
    assert len(rows(factory, "inventory_copies")) == 2


def test_concurrent_same_copy_two_targets_has_exactly_one_placement(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=1, boxes=3)
    with factory.begin() as session:
        insert_placement(session, owner)
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                (
                    f"/api/v1/boxes/{box}/slots/{position}",
                    {"copy_id": str(owner["copies"][0])},
                )
                for box, position in zip(owner["boxes"][1:], [3, 29], strict=True)
            ],
        )
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert [response.status_code for response in responses] == [200, 200]
    placements = rows(factory, "box_memberships")
    assert len(placements) == 1
    assert placements[0]["copy_id"] == owner["copies"][0]
    assert (placements[0]["box_id"], placements[0]["position"]) in {
        (owner["boxes"][1], 3),
        (owner["boxes"][2], 29),
    }
    assert len(rows(factory, "inventory_copies")) == 1


def test_concurrent_reorders_are_whole_permutations_and_invalid_order_rolls_back(
    boxes_database,
):
    factory, _ = boxes_database
    owner = seed_owner(factory, boxes=4)
    foreign = seed_owner(factory, boxes=1)
    permutations = [
        list(reversed(owner["boxes"])),
        owner["boxes"][1:] + owner["boxes"][:1],
    ]
    app = application(factory)
    try:
        responses = concurrent_requests(
            app,
            owner,
            [
                ("/api/v1/boxes/order", {"box_ids": [str(box) for box in order]})
                for order in permutations
            ],
        )
        assert [response.status_code for response in responses] == [200, 200]
        for response, expected in zip(responses, permutations, strict=True):
            assert [UUID(box["id"]) for box in response.json()["results"]] == expected
            assert [box["display_order"] for box in response.json()["results"]] == list(
                range(4)
            )
        with client_for(app, owner) as client:
            before = client.get("/api/v1/boxes").json()
            final = [UUID(box["id"]) for box in before["results"]]
            assert final in permutations
            for invalid in (
                owner["boxes"][:-1],
                [owner["boxes"][0]] * 4,
                [*owner["boxes"][:-1], foreign["boxes"][0]],
            ):
                response = client.put(
                    "/api/v1/boxes/order",
                    headers=headers(owner),
                    json={"box_ids": [str(box) for box in invalid]},
                )
                assert response.status_code == 422
                assert client.get("/api/v1/boxes").json() == before
    finally:
        app.state.session_factory.kw["bind"].dispose()
    with factory() as session:
        assert session.execute(
            text(
                "SELECT display_order FROM personal_boxes "
                "WHERE user_id=:id ORDER BY display_order"
            ),
            {"id": owner["user_id"]},
        ).scalars().all() == list(range(4))


def test_stale_removal_and_foreign_resources_cannot_delete_replacement(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory)
    other = seed_owner(factory)
    box = owner["boxes"][0]
    with factory.begin() as session:
        insert_placement(session, owner, copy=owner["copies"][1])
    app = application(factory)
    try:
        with client_for(app, owner) as client:
            stale = client.delete(
                f"/api/v1/boxes/{box}/slots/0",
                headers=headers(owner),
                params={"copy_id": str(owner["copies"][0])},
            )
            assert stale.status_code == 409
            missing = client.get(f"/api/v1/boxes/{uuid4()}")
            foreign = client.get(f"/api/v1/boxes/{other['boxes'][0]}")
            assert (missing.status_code, missing.json()) == (
                foreign.status_code,
                foreign.json(),
            )
            assert (
                client.put(
                    f"/api/v1/boxes/{box}/slots/0",
                    headers=headers(owner),
                    json={"copy_id": str(other["copies"][0])},
                ).status_code
                == 404
            )
            assert client.get(f"/api/v1/boxes/{box}").json()["slots"][0]["copy"][
                "id"
            ] == str(owner["copies"][1])
    finally:
        app.state.session_factory.kw["bind"].dispose()
    assert len(rows(factory, "box_memberships")) == 1
    assert len(rows(factory, "inventory_copies")) == 4


def test_parallel_create_respects_one_hundred_box_limit(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=0, boxes=99)
    app = application(factory)
    barrier = Barrier(2)

    def create(index):
        with client_for(app, owner) as client:
            barrier.wait(timeout=15)
            return client.post(
                "/api/v1/boxes", headers=headers(owner), json={"name": f"Box {index}"}
            )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(create, range(2)))
        assert sorted(response.status_code for response in responses) == [201, 409]
        with client_for(app, owner) as client:
            result = client.get("/api/v1/boxes").json()
            assert result["total"] == len(result["results"]) == 100
            assert [box["display_order"] for box in result["results"]] == list(
                range(100)
            )
    finally:
        app.state.session_factory.kw["bind"].dispose()


def test_views_are_bounded_stable_private_and_do_not_fetch_provider(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=65)
    seed_owner(factory, copies=4, boxes=0)
    with factory.begin() as session:
        for position, copy in enumerate(owner["copies"][:30]):
            insert_placement(session, owner, copy=copy, position=position)
    before = {row["id"]: dict(row) for row in rows(factory, "inventory_copies")}
    app = application(factory)

    async def no_provider(*args, **kwargs):
        pytest.fail("Personal-box reads must not fetch public provider metadata")

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
                response = client.get(f"/api/v1/boxes/views/{view}?offset=3&limit=7")
                assert response.status_code == 200
                assert response.headers["cache-control"] == "no-store"
                page = response.json()
                assert (page["total"], page["offset"], page["limit"]) == (total, 3, 7)
                assert len(page["results"]) == 7
                assert {UUID(copy["id"]) for copy in page["results"]} <= set(
                    owner["copies"]
                )
                data_queries = [
                    sql
                    for sql in statements
                    if "inventory_copies.id" in sql and "count(" not in sql.lower()
                ]
                assert len(data_queries) == 1
                assert "LIMIT" in data_queries[0] and "OFFSET" in data_queries[0]
                assert len(statements) <= 5
                assert (
                    client.get(f"/api/v1/boxes/views/{view}?offset=3&limit=7").json()
                    == page
                )
                if view == "unassigned":
                    assert {UUID(copy["id"]) for copy in page["results"]}.isdisjoint(
                        owner["copies"][:30]
                    )
            detail = client.get(f"/api/v1/boxes/{owner['boxes'][0]}").json()
            assert len(detail["slots"]) == detail["copy_count"] == 30
            assert detail["slots"][0]["copy"]["language"] == "ja"
            assert detail["slots"][1]["copy"]["language"] == "en"
    finally:
        event.remove(engine, "before_cursor_execute", capture)
        engine.dispose()
    assert {row["id"]: dict(row) for row in rows(factory, "inventory_copies")} == before


def test_recent_uses_acquisition_then_added_date_and_stable_uuid_ties(boxes_database):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=5, boxes=0)
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
            first = client.get("/api/v1/boxes/views/recent?limit=3").json()
            second = client.get("/api/v1/boxes/views/recent?offset=3&limit=3").json()
            assert first["total"] == second["total"] == 5
            combined = first["results"] + second["results"]
            assert [UUID(copy["id"]) for copy in combined] == expected
    finally:
        app.state.session_factory.kw["bind"].dispose()


@pytest.mark.parametrize("view", ["owned", "unassigned", "recent"])
def test_view_count_and_page_share_snapshot_during_concurrent_insert(
    boxes_database, view
):
    factory, _ = boxes_database
    owner = seed_owner(factory, copies=1, boxes=0)
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
        # A separate real transaction commits after this read has established
        # its repeatable-read snapshot but before the page SELECT runs.
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
            response = client.get(f"/api/v1/boxes/views/{view}")
            assert response.status_code == 200
            page = response.json()
            assert inserted
            assert page["total"] == len(page["results"]) == 1
            assert page["results"][0]["id"] == str(owner["copies"][0])
            next_page = client.get(f"/api/v1/boxes/views/{view}").json()
            assert next_page["total"] == len(next_page["results"]) == 2
    finally:
        event.remove(engine, "after_cursor_execute", insert_after_count)
        engine.dispose()


def test_box_and_physical_metadata_persist_through_logout_relogin_and_restart(
    boxes_database,
):
    factory, _ = boxes_database
    owner = seed_owner(factory, subject="persistent-box-owner", boxes=0)
    original_id = str(owner["copies"][1])

    def restart():
        app = application(factory, google=True)

        async def identity(code, nonce, verifier):
            assert nonce and verifier
            return {"sub": "persistent-box-owner", "name": "Collector"}

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
                "/api/v1/boxes",
                headers=auth,
                json={"name": "  Persistent favorites  ", "wallpaper": "night"},
            )
            assert created.status_code == 201
            box_id = created.json()["id"]
            placed = client.put(
                f"/api/v1/boxes/{box_id}/slots/29",
                headers=auth,
                json={"copy_id": original_id},
            )
            assert placed.status_code == 200
            expected = placed.json()
            assert client.post("/api/v1/auth/logout", headers=auth).status_code == 204
            assert client.get("/api/v1/boxes").status_code == 401
            assert client.get(f"/api/v1/boxes/{box_id}").status_code == 401
    finally:
        app.state.session_factory.kw["bind"].dispose()
    restarted = restart()
    try:
        with TestClient(restarted, base_url="http://localhost:8000") as client:
            again = login(client)
            assert again["user"]["id"] == str(owner["user_id"])
            assert client.get(f"/api/v1/boxes/{box_id}").json() == expected
            copy = client.get(f"/api/v1/inventory/{original_id}").json()
            assert copy["id"] == original_id
            assert (
                copy["condition"],
                copy["language"],
                copy["variant"],
                copy["notes"],
            ) == ("played", "en", "normal", "Physical copy 1")
            assert client.get("/api/v1/boxes/views/unassigned").json()["total"] == 1
    finally:
        restarted.state.session_factory.kw["bind"].dispose()
