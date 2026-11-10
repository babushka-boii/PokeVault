"""Derived completion against real PostgreSQL in disposable auth-test schemas.

Only public catalog/Google identity boundaries are replaced. Ownership, sessions,
CSRF, mutations and aggregation use the application and real migrated database.
"""

from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import pytest
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import event, inspect, text

from app.auth.sessions import csrf_token, token_digest
from app.cards.provider import CardsUnavailable
from app.cards.schemas import CardSerie
from app.cards.set_schemas import SetCard, SetChecklist, SetDetail, SetPage, SetSummary
from app.core.config import Settings
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app

from . import test_auth_postgres

set_completion_database = test_auth_postgres.auth_database
ORIGIN = "http://localhost:5173"
PROGRESS = "/api/v1/sets/base1/progress"


def checklist(set_id="base1", size=100, status="verified"):
    cards = [
        SetCard(
            id=f"{set_id}-{number}",
            name=f"Card {number:03d}",
            local_id=str(number),
            language="en",
            image_url=None,
            thumbnail_url=None,
            image_sources=[],
            image_language=None,
        )
        for number in range(1, size + 1)
    ]
    revision = (
        sha256("\n".join(sorted(card.id for card in cards)).encode()).hexdigest()
        if status == "verified" and cards
        else None
    )
    return SetChecklist(
        metadata=SetDetail(
            id=set_id,
            name="Base Set",
            logo_url=None,
            symbol_url=None,
            logo_sources=[],
            name_language="en",
            serie=CardSerie(id="base", name="Base"),
            release_date="1999-01-09",
            official_count=size,
            provider_total=size + 1 if status == "incomplete" else size,
            checklist_status=status,
            checklist_size=size,
            checklist_revision=revision,
        ),
        cards=cards,
    )


def seed_owner(factory, card_ids=(), *, subject=None, expired=False):
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
                expires_at=datetime.now(UTC)
                + timedelta(hours=-1 if expired else 1),
            )
        )
        copies = [
            InventoryCopy(
                user_id=user_id,
                card_id=card_id,
                condition="mint",
                language="en",
                variant="normal",
                notes=f"Physical copy {index}",
            )
            for index, card_id in enumerate(card_ids)
        ]
        session.add_all(copies)
        session.flush()
        copy_ids = [copy.id for copy in copies]
    return {"user_id": user_id, "token": token, "copies": copy_ids}


@contextmanager
def application(factory, checklists=None, *, google=False, shared_engine=True):
    app = create_app(
        Settings(
            DATABASE_URL=factory.kw["bind"].url.render_as_string(hide_password=False),
            GOOGLE_CLIENT_ID="local-test-client" if google else "",
            GOOGLE_CLIENT_SECRET="local-placeholder" if google else "",
            _env_file=None,
        )
    )
    if shared_engine:
        app.state.session_factory.kw["bind"].dispose()
        app.state.session_factory = factory
    catalog = checklists if checklists is not None else {"base1": checklist()}

    async def get_set_checklist(set_id, language="es"):
        result = catalog[set_id]
        if isinstance(result, Exception):
            raise result
        return result.model_copy(deep=True)

    async def list_sets(language="es", page=1, page_size=12, **kwargs):
        results = [
            SetSummary.model_validate(value.metadata.model_dump())
            for value in catalog.values()
            if isinstance(value, SetChecklist)
        ]
        return SetPage(
            results=results,
            total=len(results),
            page=page,
            page_size=page_size,
            series=[CardSerie(id="base", name="Base")],
        )

    app.state.card_provider.get_set_checklist = get_set_checklist
    app.state.card_provider.list_sets = list_sets
    try:
        yield app
    finally:
        app.state.session_factory.kw["bind"].dispose()


def client_for(app, owner):
    return TestClient(
        app,
        base_url="http://localhost:8000",
        cookies={"pokevault_session": owner["token"]},
    )


def headers(owner):
    return {"Origin": ORIGIN, "X-CSRF-Token": csrf_token(owner["token"])}


def assert_private(response):
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.headers["referrer-policy"] == "no-referrer"


def test_twelve_physical_copies_eight_printings_are_eight_percent(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(
        factory,
        [f"base1-{number}" for number in range(1, 9)]
        + ["base1-1", "base1-2", "base1-3", "base1-4"],
    )
    with application(factory) as app, client_for(app, owner) as client:
        response = client.get(PROGRESS)
        assert response.status_code == 200
        assert_private(response)
        payload = response.json()
        assert payload["progress"] == {
            "set_id": "base1",
            "checklist_revision": payload["set"]["checklist_revision"],
            "status": "verified",
            "total": 100,
            "owned": 8,
            "missing": 92,
            "physical_copies": 12,
            "percentage": 8.0,
        }
        assert payload["total"] == 100
        assert len(payload["results"]) == 12
        assert payload["quantities"]["base1-1"] == 2
        assert payload["quantities"]["base1-8"] == 1
        assert payload["quantities"].get("base1-9", 0) == 0
        assert set(payload["quantities"]) <= {
            card["id"] for card in payload["results"]
        }


@pytest.mark.parametrize(
    ("distinct", "missing", "percentage"),
    [(0, 100, 0.0), (1, 99, 1.0), (100, 0, 100.0)],
)
def test_zero_one_and_all_printings_have_full_checklist_denominator(
    set_completion_database, distinct, missing, percentage
):
    factory, _ = set_completion_database
    owner = seed_owner(
        factory,
        [f"base1-{number}" for number in range(1, distinct + 1)]
        + ["base1-101", "base1-other", "base2-1"],
    )
    with application(factory) as app, client_for(app, owner) as client:
        response = client.get(PROGRESS, params={"page_size": 1, "page": 100})
        assert response.status_code == 200
        progress = response.json()["progress"]
        assert progress["total"] == 100
        assert progress["owned"] == progress["physical_copies"] == distinct
        assert progress["missing"] == missing
        assert progress["percentage"] == percentage
        assert response.json()["results"][0]["id"] == "base1-100"


def test_session_owner_isolates_progress_even_with_foreign_user_id_query(
    set_completion_database,
):
    factory, _ = set_completion_database
    first = seed_owner(factory, ["base1-1", "base1-1"])
    second = seed_owner(factory, ["base1-2", "base1-3", "base1-3"])
    with application(factory) as app:
        for owner, foreign, owned, copies, printing in (
            (first, second, 1, 2, "base1-1"),
            (second, first, 2, 3, "base1-2"),
            (first, second, 1, 2, "base1-1"),
        ):
            with client_for(app, owner) as client:
                response = client.get(
                    PROGRESS,
                    params={"user_id": str(foreign["user_id"]), "ownership": "owned"},
                )
                assert response.status_code == 200
                assert_private(response)
                page = response.json()
                assert page["progress"]["owned"] == owned
                assert page["progress"]["physical_copies"] == copies
                assert page["total"] == owned
                assert page["results"][0]["id"] == printing
                batch = client.get(
                    "/api/v1/sets/progress",
                    params={"set_id": "base1", "user_id": str(foreign["user_id"])},
                )
                assert batch.status_code == 200
                assert batch.json()["results"][0] == page["progress"]


@pytest.mark.parametrize(
    ("query", "total", "identifiers"),
    [
        ({"q": "Card 00", "page": 2}, 9, ["base1-4", "base1-5", "base1-6"]),
        (
            {"q": "Card 00", "page": 2, "ownership": "owned", "sort": "name"},
            8,
            ["base1-4", "base1-5", "base1-6"],
        ),
        ({"q": "Card 00", "ownership": "missing"}, 1, ["base1-9"]),
    ],
)
def test_search_ownership_and_page_only_filter_visible_rows(
    set_completion_database, query, total, identifiers
):
    factory, _ = set_completion_database
    owner = seed_owner(
        factory,
        [f"base1-{number}" for number in range(1, 9)] + ["base1-4"] * 4,
    )
    with application(factory) as app, client_for(app, owner) as client:
        response = client.get(PROGRESS, params={"page_size": 3, **query})
        assert response.status_code == 200
        page = response.json()
        assert page["total"] == total
        assert [card["id"] for card in page["results"]] == identifiers
        assert page["progress"]["total"] == 100
        assert page["progress"]["owned"] == 8
        assert page["progress"]["missing"] == 92
        assert page["progress"]["physical_copies"] == 12
        assert page["progress"]["percentage"] == 8.0
        assert set(page["quantities"]) <= set(identifiers)
        if "base1-4" in identifiers:
            assert page["quantities"]["base1-4"] == 5


def test_only_removing_last_physical_copy_makes_printing_missing(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1", "base1-1", "base1-2"])
    with application(factory) as app, client_for(app, owner) as client:
        initial = client.get(PROGRESS).json()["progress"]
        assert (initial["owned"], initial["physical_copies"]) == (2, 3)
        first_copy, last_copy, _ = owner["copies"]
        for copy_id, owned, copies, missing in (
            (first_copy, 2, 2, 0),
            (last_copy, 1, 1, 1),
        ):
            path = f"/api/v1/inventory/{copy_id}"
            assert client.delete(path).status_code == 403
            assert client.delete(path, headers=headers(owner)).status_code == 204
            response = client.get(
                PROGRESS, params={"ownership": "missing", "q": "Card 001"}
            )
            assert response.status_code == 200
            page = response.json()
            assert page["progress"]["owned"] == owned
            assert page["progress"]["physical_copies"] == copies
            assert page["total"] == missing
            if missing:
                assert [card["id"] for card in page["results"]] == ["base1-1"]
                assert page["quantities"].get("base1-1", 0) == 0


def test_physical_attributes_and_box_placement_do_not_change_completion(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1", "base1-1", "base1-2"])
    with application(factory) as app, client_for(app, owner) as client:
        before = client.get(PROGRESS).json()
        copy_id = str(owner["copies"][0])
        updated = client.put(
            f"/api/v1/inventory/{copy_id}",
            headers=headers(owner),
            json={
                "condition": "poor",
                "language": "ja",
                "variant": "reverse",
                "acquired_on": "2026-10-01",
                "notes": "Changed physical attributes",
            },
        )
        assert updated.status_code == 200
        assert updated.json()["language"] == "ja"
        created = client.post(
            "/api/v1/boxes", headers=headers(owner), json={"name": "Favorites"}
        )
        assert created.status_code == 201
        box_id = created.json()["id"]
        placed = client.put(
            f"/api/v1/boxes/{box_id}/slots/29",
            headers=headers(owner),
            json={"copy_id": copy_id},
        )
        assert placed.status_code == 200
        assert client.get(PROGRESS).json() == before
        assert (
            client.delete(f"/api/v1/boxes/{box_id}", headers=headers(owner)).status_code
            == 204
        )
        assert client.get(PROGRESS).json() == before


@pytest.mark.parametrize("expired", [False, True], ids=["anonymous", "expired"])
@pytest.mark.parametrize("path", [PROGRESS, "/api/v1/sets/progress?set_id=base1"])
def test_private_progress_requires_live_session_and_never_caches_401(
    set_completion_database, expired, path
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"], expired=True)
    with application(factory) as app, TestClient(app) as client:
        if expired:
            client.cookies.set("pokevault_session", owner["token"])
        response = client.get(path)
        assert response.status_code == 401
        assert response.json() == {"detail": "unauthenticated"}
        assert_private(response)


@pytest.mark.parametrize("status", ["empty", "incomplete"])
def test_unverified_checklists_do_not_claim_numeric_completion(
    set_completion_database, status
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"])
    source = checklist(size=0 if status == "empty" else 3, status=status)
    with (
        application(factory, {"base1": source}) as app,
        client_for(app, owner) as client,
    ):
        response = client.get(PROGRESS)
        assert response.status_code == 200
        progress = response.json()["progress"]
        assert progress["status"] == status
        assert progress["percentage"] is None
        expected = 0 if status == "empty" else None
        for field in ("total", "owned", "missing", "physical_copies"):
            assert progress[field] == expected
        for ownership in ("owned", "missing"):
            response = client.get(PROGRESS, params={"ownership": ownership})
            assert response.status_code == 409
            assert response.json() == {"detail": "checklist_not_verified"}
            assert_private(response)


@contextmanager
def capture_statements(factory):
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append((statement, parameters))

    engine = factory.kw["bind"]
    event.listen(engine, "before_cursor_execute", capture)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", capture)


def inventory_reads(statements):
    return [
        (sql, params)
        for sql, params in statements
        if sql.lstrip().upper().startswith("SELECT") and "inventory_copies" in sql
    ]


def assert_one_bounded_aggregate(statements):
    reads = inventory_reads(statements)
    assert len(reads) == 1
    sql, _ = reads[0]
    assert "GROUP BY inventory_copies.card_id" in sql
    assert "count(" in sql.lower()
    assert "inventory_copies.user_id" in sql
    assert "inventory_copies.card_id IN" in sql
    for physical_attribute in ("notes", "condition", "language", "variant"):
        assert f"inventory_copies.{physical_attribute}" not in sql
    # AuthSession and User are the only other SELECTs, regardless of copies/sets.
    assert len([sql for sql, _ in statements if sql.lstrip().startswith("SELECT")]) <= 3


def test_progress_groups_card_ids_once_without_loading_physical_copy_rows(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"] * 1000 + ["base1-100", "base2-1"])
    with (
        application(factory) as app,
        client_for(app, owner) as client,
        capture_statements(factory) as statements,
    ):
        response = client.get(PROGRESS, params={"page_size": 1, "page": 100})
        assert response.status_code == 200
        assert_one_bounded_aggregate(statements)
        page = response.json()
        assert page["progress"]["owned"] == 2
        assert page["progress"]["physical_copies"] == 1001
        assert page["progress"]["percentage"] == 2.0
        assert page["quantities"] == {"base1-100": 1}


def test_batch_uses_one_union_aggregate_and_keeps_provider_failures_unknown(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(
        factory,
        [f"base1-{number}" for number in range(1, 9)]
        + ["base1-1"] * 4
        + ["base2-1", "base2-1", "base2-2", "outside-1"],
    )
    catalog = {
        "base1": checklist(),
        "base2": checklist("base2", size=40),
        "unavailable": CardsUnavailable("Local provider failure"),
    }
    with (
        application(factory, catalog) as app,
        client_for(app, owner) as client,
        capture_statements(factory) as statements,
    ):
        response = client.get(
            "/api/v1/sets/progress",
            params=[
                ("set_id", "base1"),
                ("set_id", "base2"),
                ("set_id", "unavailable"),
            ],
        )
        assert response.status_code == 200
        assert_private(response)
        assert_one_bounded_aggregate(statements)
        results = response.json()["results"]
        assert len(results) == 3
        by_id = {row["set_id"]: row for row in results}
        assert by_id["base1"]["owned"] == 8
        assert by_id["base1"]["physical_copies"] == 12
        assert by_id["base1"]["percentage"] == 8.0
        assert by_id["base2"]["total"] == 40
        assert by_id["base2"]["owned"] == 2
        assert by_id["base2"]["missing"] == 38
        assert by_id["base2"]["physical_copies"] == 3
        assert by_id["base2"]["percentage"] == 5.0
        assert by_id["unavailable"] == {
            "set_id": "unavailable",
            "checklist_revision": None,
            "status": "unavailable",
            "total": None,
            "owned": None,
            "missing": None,
            "physical_copies": None,
            "percentage": None,
        }
        for set_id in ("base1", "base2"):
            single = client.get(f"/api/v1/sets/{set_id}/progress")
            assert single.status_code == 200
            assert single.json()["progress"] == by_id[set_id]


def test_unavailable_private_progress_is_sanitized_and_does_not_read_inventory(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"])
    with (
        application(factory, {"base1": CardsUnavailable("Internal upstream detail")})
        as app,
        client_for(app, owner) as client,
        capture_statements(factory) as statements,
    ):
        response = client.get(PROGRESS)
        assert response.status_code == 503
        assert response.json() == {"detail": "Set catalog is unavailable"}
        assert_private(response)
        batch = client.get("/api/v1/sets/progress?set_id=base1")
        assert batch.status_code == 200
        assert_private(batch)
        result = batch.json()["results"][0]
        assert result["status"] == "unavailable"
        assert all(
            result[field] is None
            for field in ("total", "owned", "missing", "physical_copies", "percentage")
        )
        assert inventory_reads(statements) == []


@pytest.mark.parametrize("batch", [False, True], ids=["single", "batch"])
def test_page_quantities_and_full_progress_share_concurrent_insert_snapshot(
    set_completion_database, batch
):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"])
    inserted = False

    def insert_after_read(connection, cursor, statement, parameters, context, many):
        nonlocal inserted
        if inserted or "FROM inventory_copies" not in statement:
            return
        if not statement.lstrip().upper().startswith("SELECT"):
            return
        inserted = True
        # Commit on another connection immediately after the first ownership
        # read. One grouped read is inherently consistent; split reads must use
        # one snapshot to preserve agreement between totals and visible rows.
        with factory.begin() as other:
            other.add(
                InventoryCopy(
                    user_id=owner["user_id"],
                    card_id="base1-2",
                    condition="mint",
                    language="en",
                    variant="normal",
                    notes="Concurrent insertion",
                )
            )

    engine = factory.kw["bind"]
    with application(factory) as app, client_for(app, owner) as client:
        event.listen(engine, "after_cursor_execute", insert_after_read)
        try:
            path = "/api/v1/sets/progress?set_id=base1" if batch else PROGRESS
            response = client.get(path)
            assert response.status_code == 200
            assert inserted
            page = response.json()
            progress = page["results"][0] if batch else page["progress"]
            assert progress["owned"] == progress["physical_copies"] == 1
            assert progress["missing"] == 99
            if not batch:
                assert page["quantities"]["base1-1"] == 1
                assert page["quantities"].get("base1-2", 0) == 0
            again = client.get(path).json()
            progress = again["results"][0] if batch else again["progress"]
            assert progress["owned"] == progress["physical_copies"] == 2
            assert progress["missing"] == 98
        finally:
            event.remove(engine, "after_cursor_execute", insert_after_read)


def test_public_set_reads_never_access_inventory(set_completion_database):
    factory, _ = set_completion_database
    owner = seed_owner(factory, ["base1-1"])
    with (
        application(factory) as app,
        client_for(app, owner) as client,
        capture_statements(factory) as statements,
    ):
        for path in (
            "/api/v1/sets",
            "/api/v1/sets/base1",
            "/api/v1/sets/base1/cards?page=2&page_size=3",
        ):
            response = client.get(path)
            assert response.status_code == 200
            assert "progress" not in response.json()
            assert "quantities" not in response.json()
        assert inventory_reads(statements) == []


def test_progress_is_rederived_after_logout_relogin_and_application_restart(
    set_completion_database,
):
    factory, _ = set_completion_database
    owner = seed_owner(
        factory, ["base1-1", "base1-1", "base1-2"], subject="persistent-set-owner"
    )

    async def identity(code, nonce, verifier):
        assert nonce and verifier
        return {"sub": "persistent-set-owner", "name": "Collector"}

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
        me = client.get("/api/v1/auth/me")
        assert me.status_code == 200
        return me.json()

    with (
        application(factory, google=True, shared_engine=False) as app,
        client_for(app, owner) as client,
    ):
        app.state.google_provider.identity = identity
        response = client.get(PROGRESS)
        assert response.status_code == 200
        expected = response.json()
        assert expected["progress"]["owned"] == 2
        assert expected["progress"]["physical_copies"] == 3
        assert (
            client.post("/api/v1/auth/logout", headers=headers(owner)).status_code
            == 204
        )
        assert client.get(PROGRESS).status_code == 401
    with (
        application(factory, google=True, shared_engine=False) as restarted,
        TestClient(restarted, base_url="http://localhost:8000") as client,
    ):
        restarted.state.google_provider.identity = identity
        me = login(client)
        assert me["user"]["id"] == str(owner["user_id"])
        response = client.get(PROGRESS)
        assert response.status_code == 200
        assert_private(response)
        assert response.json() == expected


def test_completion_adds_no_storage_or_migration(set_completion_database):
    factory, config = set_completion_database
    assert ScriptDirectory.from_config(config).get_current_head() == "0004"
    with factory() as session:
        assert set(inspect(session.get_bind()).get_table_names()) == {
            "alembic_version",
            "app_metadata",
            "users",
            "user_settings",
            "auth_sessions",
            "oauth_transactions",
            "inventory_copies",
            "personal_boxes",
            "box_memberships",
        }
        assert session.scalar(text("SELECT version_num FROM alembic_version")) == "0004"
        assert {
            index["name"]
            for index in inspect(session.get_bind()).get_indexes("inventory_copies")
        } == {
            "ix_inventory_owner_created",
            "ix_inventory_owner_card",
            "uq_inventory_owner_id",
        }
