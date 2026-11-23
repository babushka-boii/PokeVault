"""Scanner confirmation and retry guarantees against disposable PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.api.scans import get_matcher
from app.cards.provider import CardsUnavailable
from app.db.models import BoxMembership, InventoryCopy, PersonalBox
from app.scanner.schemas import MatchResult, OCRResult, ScanClues

from . import test_auth_postgres
from .test_set_completion_postgres import (
    application,
    assert_private,
    client_for,
    headers,
    seed_owner,
)

scanner_database = test_auth_postgres.auth_database
COPY = {
    "card_id": "base1-4",
    "condition": "near_mint",
    "language": "es",
    "variant": "holo",
    "acquired_on": "2026-11-10",
    "notes": "Confirmed manually",
}


def test_concurrent_identical_confirmation_has_one_durable_copy(scanner_database):
    factory, _ = scanner_database
    owner = seed_owner(factory)
    key = str(uuid4())
    barrier = Barrier(4)
    with application(factory) as app:

        async def catalog(*args):
            barrier.wait(timeout=10)
            return object()

        app.state.card_provider.get_card = catalog

        def submit(_):
            with client_for(app, owner) as client:
                return client.post(
                    "/api/v1/inventory",
                    json=COPY,
                    headers={**headers(owner), "Idempotency-Key": key},
                )

        with ThreadPoolExecutor(max_workers=4) as pool:
            responses = list(pool.map(submit, range(4)))
        assert [r.status_code for r in responses] == [201] * 4
        assert len({r.json()["id"] for r in responses}) == 1
        for response in responses:
            assert_private(response)
        with factory() as session:
            assert session.scalar(select(func.count()).select_from(InventoryCopy)) == 1


def test_concurrent_conflicting_confirmation_never_overwrites(scanner_database):
    factory, _ = scanner_database
    owner = seed_owner(factory)
    key = str(uuid4())
    barrier = Barrier(2)
    with application(factory) as app:

        async def catalog(*args):
            barrier.wait(timeout=10)
            return object()

        app.state.card_provider.get_card = catalog

        def submit(note):
            with client_for(app, owner) as client:
                return client.post(
                    "/api/v1/inventory",
                    json={**COPY, "notes": note},
                    headers={**headers(owner), "Idempotency-Key": key},
                )

        with ThreadPoolExecutor(max_workers=2) as pool:
            responses = list(pool.map(submit, ("Original", "Other")))
        assert sorted(r.status_code for r in responses) == [201, 409]
        created = next(r.json() for r in responses if r.status_code == 201)
        with client_for(app, owner) as client:
            assert client.get("/api/v1/inventory").json()["total"] == 1
            assert client.get(f"/api/v1/inventory/{created['id']}").json() == created


def test_intentional_duplicates_update_quantity_once_without_moving_boxes(
    scanner_database,
):
    factory, _ = scanner_database
    owner = seed_owner(factory, ["base1-1"])
    with factory.begin() as session:
        box = PersonalBox(
            user_id=owner["user_id"], name="Keep", display_order=0, wallpaper="classic"
        )
        session.add(box)
        session.flush()
        session.add(
            BoxMembership(
                user_id=owner["user_id"],
                box_id=box.id,
                position=2,
                copy_id=owner["copies"][0],
            )
        )
        box_id = box.id
    with application(factory) as app, client_for(app, owner) as client:

        async def catalog(*args):
            return object()

        app.state.card_provider.get_card = catalog
        before = client.get(f"/api/v1/boxes/{box_id}").json()
        intent = {**headers(owner), "Idempotency-Key": str(uuid4())}
        first = client.post("/api/v1/inventory", json=COPY, headers=intent)
        retry = client.post("/api/v1/inventory", json=COPY, headers=intent)
        another = client.post(
            "/api/v1/inventory",
            json=COPY,
            headers={**headers(owner), "Idempotency-Key": str(uuid4())},
        )
        assert first.status_code == retry.status_code == another.status_code == 201
        assert retry.json()["id"] == first.json()["id"] != another.json()["id"]
        copies = client.get("/api/v1/inventory?card_id=base1-4").json()
        assert copies["quantities"] == {"base1-4": 2}
        progress = client.get("/api/v1/sets/base1/progress").json()["progress"]
        assert (
            progress["owned"],
            progress["physical_copies"],
            progress["percentage"],
        ) == (2, 3, 2.0)
        assert client.get(f"/api/v1/boxes/{box_id}").json() == before
        assert (
            client.get(f"/api/v1/inventory/{first.json()['id']}").json()["notes"]
            == COPY["notes"]
        )


def test_retry_identity_survives_app_restart_and_provider_outage(scanner_database):
    factory, _ = scanner_database
    owner = seed_owner(factory)
    intent = {**headers(owner), "Idempotency-Key": str(uuid4())}
    with application(factory) as app, client_for(app, owner) as client:

        async def catalog(*args):
            return object()

        app.state.card_provider.get_card = catalog
        original = client.post("/api/v1/inventory", json=COPY, headers=intent)
        assert original.status_code == 201
    with application(factory) as restarted, client_for(restarted, owner) as client:

        async def unavailable(*args):
            raise CardsUnavailable

        restarted.state.card_provider.get_card = unavailable
        replay = client.post("/api/v1/inventory", json=COPY, headers=intent)
        assert replay.status_code == 201
        assert replay.json() == original.json()
        assert client.get("/api/v1/inventory").json()["total"] == 1


def test_recognition_and_manual_search_never_mutate_inventory_or_boxes(
    scanner_database,
):
    factory, _ = scanner_database
    owner = seed_owner(factory, ["base1-1", "base1-1"])
    with application(factory) as app, client_for(app, owner) as client:

        class OCR:
            async def recognize(self, *args):
                return OCRResult(
                    clues=ScanClues(name="Pikachu", local_number="025"),
                    engine_languages=["eng"],
                )

        async def matcher(provider, payload):
            return MatchResult(clues=payload.clues, status="no_match")

        app.state.ocr_service = OCR()
        app.dependency_overrides[get_matcher] = lambda: matcher
        inventory_before = client.get("/api/v1/inventory").json()
        progress_before = client.get("/api/v1/sets/base1/progress").json()
        boxes_before = client.get("/api/v1/boxes").json()
        recognized = client.post(
            "/api/v1/scans/recognize",
            content=b"test boundary",
            headers={**headers(owner), "Content-Type": "image/png"},
        )
        manual = client.post(
            "/api/v1/scans/match",
            json={"clues": {"name": "Professor Oak"}},
            headers=headers(owner),
        )
        assert recognized.status_code == manual.status_code == 200
        assert recognized.json()["clues"]["name"] == "Pikachu"
        assert manual.json()["clues"]["name"] == "Professor Oak"
        assert_private(recognized)
        assert_private(manual)
        assert client.get("/api/v1/inventory").json() == inventory_before
        assert client.get("/api/v1/sets/base1/progress").json() == progress_before
        assert client.get("/api/v1/boxes").json() == boxes_before


@pytest.mark.parametrize(
    "mode,expected", [("missing", 401), ("expired", 401), ("csrf", 403)]
)
def test_scanner_rejects_invalid_sessions_before_ocr_or_matching(
    scanner_database, mode, expected
):
    factory, _ = scanner_database
    owner = seed_owner(factory, expired=mode == "expired")
    with (
        application(factory) as app,
        TestClient(app, base_url="http://localhost:8000") as client,
    ):
        if mode != "missing":
            client.cookies.set("pokevault_session", owner["token"])
        response = client.post(
            "/api/v1/scans/recognize",
            content=b"private malformed",
            headers={"Content-Type": "image/jpeg"},
        )
        assert response.status_code == expected
        assert_private(response)
        with factory() as session:
            assert session.scalar(select(func.count()).select_from(InventoryCopy)) == 0


def test_same_key_in_different_accounts_preserves_ownership(scanner_database):
    factory, _ = scanner_database
    first, second = seed_owner(factory), seed_owner(factory)
    key = str(uuid4())
    with application(factory) as app:

        async def catalog(*args):
            return object()

        app.state.card_provider.get_card = catalog
        with client_for(app, first) as client:
            one = client.post(
                "/api/v1/inventory",
                json=COPY,
                headers={**headers(first), "Idempotency-Key": key},
            )
        with client_for(app, second) as client:
            two = client.post(
                "/api/v1/inventory",
                json=COPY,
                headers={**headers(second), "Idempotency-Key": key},
            )
            assert one.status_code == two.status_code == 201
            assert one.json()["id"] != two.json()["id"]
            assert (
                client.get(f"/api/v1/inventory/{one.json()['id']}").status_code == 404
            )
            assert client.get("/api/v1/inventory").json()["total"] == 1
