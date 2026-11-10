"""Whole-checklist completion through real HTTP, session and inventory boundaries."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.sessions import csrf_token, token_digest
from app.cards.provider import CardsUnavailable
from app.cards.set_schemas import SetCard, SetChecklist, SetDetail, SetPage
from app.core.config import Settings
from app.db.base import Base
from app.db.models import AuthSession, InventoryCopy, User
from app.main import create_app


def checklist(count=100, status="verified", set_id="sv03.5"):
    return SetChecklist(
        metadata=SetDetail(
            id=set_id,
            name="Verified expansion",
            official_count=80,
            provider_total=count,
            name_language="en",
            serie={"id": "sv", "name": "Scarlet & Violet"},
            checklist_status=status,
            checklist_size=count,
            checklist_revision="a" * 64 if status == "verified" else None,
        ),
        cards=[
            SetCard(
                id=f"independent-printing-{index}",
                local_id=str(index),
                name=f"Card {index:03}",
                language="en",
                image_url=None,
                thumbnail_url=None,
                image_sources=[],
                image_language=None,
            )
            for index in range(1, count + 1)
        ],
    )


@pytest.fixture
def completion():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = create_app(
        Settings(
            DATABASE_URL="postgresql+psycopg://unused:unused@localhost/test",
            _env_file=None,
        )
    )
    app.state.session_factory.kw["bind"].dispose()
    app.state.session_factory = factory
    app.state.checklist_fixture = checklist()
    with factory.begin() as session:
        for subject in ("ash", "misty", "expired"):
            user = User(google_sub=subject, display_name=subject)
            session.add(user)
            session.flush()
            session.add(
                AuthSession(
                    token_digest=token_digest(subject),
                    user_id=user.id,
                    expires_at=datetime.now(UTC)
                    + timedelta(hours=-1 if subject == "expired" else 1),
                )
            )

    async def get_checklist(set_id, language="es"):
        return app.state.checklist_fixture.model_copy(deep=True)

    async def list_sets(
        language="es", page=1, page_size=12, q="", series_id=None, sort="newest"
    ):
        return SetPage(
            results=[app.state.checklist_fixture.metadata],
            total=1,
            page=page,
            page_size=page_size,
            series=[{"id": "sv", "name": "Scarlet & Violet"}],
        )

    async def get_card(*_):
        return object()

    app.state.card_provider.get_set_checklist = get_checklist
    app.state.card_provider.list_sets = list_sets
    app.state.card_provider.get_card = get_card
    with TestClient(app, base_url="http://localhost:8000") as client:
        yield client, factory, app
    engine.dispose()


def identify(client, name="ash"):
    client.cookies.clear()
    if name:
        client.cookies.set("pokevault_session", name)
    return {"Origin": "http://localhost:5173", "X-CSRF-Token": csrf_token(name or "")}


def physical(factory, card_id, owner="ash", **attributes):
    with factory.begin() as session:
        user_id = session.scalar(select(User.id).where(User.google_sub == owner))
        record = InventoryCopy(
            user_id=user_id,
            card_id=card_id,
            condition=attributes.get("condition", "unknown"),
            language=attributes.get("language", "ja"),
            variant=attributes.get("variant", "unknown"),
            notes="Independent physical copy",
        )
        session.add(record)
        session.flush()
        return str(record.id)


def test_public_catalog_and_checklist_do_not_require_a_database(completion):
    client, _, app = completion

    def forbidden():
        raise AssertionError("Public catalog must not access private inventory")

    app.state.session_factory = forbidden
    index = client.get("/api/v1/sets")
    assert index.status_code == 200
    assert index.json()["coverage"] == "english_physical_catalog"
    detail = client.get("/api/v1/sets/sv03.5")
    assert detail.status_code == 200
    assert detail.json()["official_count"] == 80
    assert detail.json()["provider_total"] == detail.json()["checklist_size"] == 100
    page = client.get("/api/v1/sets/sv03.5/cards?page=5&page_size=24")
    assert page.status_code == 200
    assert page.json()["total"] == 100
    assert [card["local_id"] for card in page.json()["results"]] == [
        "97",
        "98",
        "99",
        "100",
    ]
    assert "quantities" not in page.json() and "progress" not in page.json()


@pytest.mark.parametrize("name", [None, "expired"])
def test_personal_progress_requires_a_live_session(completion, name):
    client, _, _ = completion
    identify(client, name)
    for path in ("/api/v1/sets/sv03.5/progress", "/api/v1/sets/progress?set_id=sv03.5"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("ids", "owned", "copies", "percentage"),
    [
        ([], 0, 0, 0),
        ([1], 1, 1, 1),
        ([1, 1, 1], 1, 3, 1),
        ([1, 2, 3, 4, 5, 6, 7, 8, 1, 2, 3, 4], 8, 12, 8),
        (list(range(1, 101)), 100, 100, 100),
    ],
)
def test_distinct_completion_uses_full_verified_checklist(
    completion, ids, owned, copies, percentage
):
    client, factory, _ = completion
    identify(client)
    for value in ids:
        physical(factory, f"independent-printing-{value}")
    physical(factory, "sv03.5-outside")
    physical(factory, "independent-printing-99", owner="misty")
    response = client.get("/api/v1/sets/sv03.5/progress?page_size=1&page=2")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    result = response.json()
    assert result["progress"] == {
        "set_id": "sv03.5",
        "checklist_revision": "a" * 64,
        "status": "verified",
        "total": 100,
        "owned": owned,
        "missing": 100 - owned,
        "physical_copies": copies,
        "percentage": percentage,
    }
    assert result["total"] == 100 and len(result["results"]) == 1
    assert set(result["quantities"]) <= {card["id"] for card in result["results"]}


def test_global_owned_missing_filters_search_and_natural_number_order(completion):
    client, factory, _ = completion
    identify(client)
    for index in (2, 11, 99):
        physical(factory, f"independent-printing-{index}")
    owned = client.get(
        "/api/v1/sets/sv03.5/progress?ownership=owned&page_size=2&page=2"
    ).json()
    assert owned["total"] == 3
    assert [card["local_id"] for card in owned["results"]] == ["99"]
    assert owned["progress"]["owned"] == 3
    missing = client.get(
        "/api/v1/sets/sv03.5/progress?ownership=missing&q=Card%200&page_size=24"
    ).json()
    assert missing["total"] == 96
    assert missing["progress"]["missing"] == 97
    assert all(
        card["id"]
        not in {
            "independent-printing-2",
            "independent-printing-11",
            "independent-printing-99",
        }
        for card in missing["results"]
    )
    by_id = client.get("/api/v1/sets/sv03.5/cards?q=independent-printing-100").json()
    assert by_id["total"] == 1 and by_id["results"][0]["local_id"] == "100"


def test_quantities_update_after_add_and_final_copy_deletion(completion):
    client, _, _ = completion
    headers = identify(client)
    ids = []
    for expected_quantity in (1, 2):
        response = client.post(
            "/api/v1/inventory",
            headers=headers,
            json={"card_id": "independent-printing-1"},
        )
        assert response.status_code == 201
        ids.append(response.json()["id"])
        page = client.get("/api/v1/sets/sv03.5/progress").json()
        assert page["progress"]["owned"] == 1
        assert page["quantities"]["independent-printing-1"] == expected_quantity
    for index, copy_id in enumerate(ids):
        assert (
            client.delete(f"/api/v1/inventory/{copy_id}", headers=headers).status_code
            == 204
        )
        page = client.get("/api/v1/sets/sv03.5/progress").json()
        assert page["progress"]["owned"] == (1 if index == 0 else 0)
        assert page["progress"]["missing"] == (99 if index == 0 else 100)


def test_accounts_are_isolated_and_client_user_ids_confer_no_access(completion):
    client, factory, _ = completion
    physical(factory, "independent-printing-1", owner="ash")
    for _ in range(3):
        physical(factory, "independent-printing-2", owner="misty")
    identify(client, "ash")
    assert client.get("/api/v1/sets/sv03.5/progress?user_id=misty").json()[
        "quantities"
    ] == {"independent-printing-1": 1}
    identify(client, "misty")
    page = client.get("/api/v1/sets/sv03.5/progress").json()
    assert page["quantities"] == {"independent-printing-2": 3}
    assert page["progress"]["physical_copies"] == 3


def test_half_percent_ties_round_consistently_for_numeric_progress(completion):
    client, factory, app = completion
    app.state.checklist_fixture = checklist(32)
    # Official count must not affect the verified denominator in this fixture.
    app.state.checklist_fixture.metadata.official_count = 30
    physical(factory, "independent-printing-1")
    identify(client)
    result = client.get("/api/v1/sets/sv03.5/progress").json()
    assert result["progress"]["percentage"] == 3.13


@pytest.mark.parametrize(("status", "count"), [("empty", 0), ("incomplete", 5)])
def test_unverified_and_empty_checklists_never_fabricate_percentages(
    completion, status, count
):
    client, _, app = completion
    app.state.checklist_fixture = checklist(count, status)
    identify(client)
    response = client.get("/api/v1/sets/sv03.5/progress")
    assert response.status_code == 200
    progress = response.json()["progress"]
    assert progress["status"] == status and progress["percentage"] is None
    assert progress["total"] == (0 if status == "empty" else None)
    assert progress["owned"] == (0 if status == "empty" else None)
    assert (
        client.get("/api/v1/sets/sv03.5/progress?ownership=missing").status_code == 409
    )


def test_explorer_batch_uses_one_membership_baseline_and_private_counts(completion):
    client, factory, app = completion
    physical(factory, "independent-printing-1")
    identify(client)
    original = app.state.card_provider.get_set_checklist

    async def get(set_id, language="es"):
        if set_id == "missing":
            raise CardsUnavailable("Never expose provider internals")
        return await original(set_id, language)

    app.state.card_provider.get_set_checklist = get
    response = client.get("/api/v1/sets/progress?set_id=sv03.5&set_id=missing")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    rows = response.json()["results"]
    assert rows[0]["owned"] == 1 and rows[0]["percentage"] == 1
    assert rows[1]["set_id"] == "missing" and rows[1]["status"] == "unavailable"
    assert rows[1]["owned"] is None


@pytest.mark.parametrize(
    "query", ["page=0", "page_size=25", "sort=price", "language=fr", "q=" + "x" * 101]
)
def test_public_query_validation_is_bounded(completion, query):
    client, _, _ = completion
    assert client.get(f"/api/v1/sets?{query}").status_code == 422


def test_progress_invalid_filters_and_batch_budgets(completion):
    client, _, _ = completion
    identify(client)
    assert (
        client.get("/api/v1/sets/sv03.5/progress?ownership=someone").status_code == 422
    )
    assert client.get("/api/v1/sets/progress").status_code == 422
    assert client.get("/api/v1/sets/progress?set_id=x&set_id=x").status_code == 422
    assert (
        client.get(
            "/api/v1/sets/progress?" + "&".join(f"set_id=s{i}" for i in range(13))
        ).status_code
        == 422
    )
    assert client.get("/api/v1/sets/bad_id/cards").status_code == 422


def test_provider_and_database_failures_are_sanitized(completion):
    client, _, app = completion

    async def unavailable(*_args, **_kwargs):
        raise CardsUnavailable("secret-provider-internal")

    app.state.card_provider.get_set_checklist = unavailable
    response = client.get("/api/v1/sets/sv03.5/cards")
    assert response.status_code == 503
    assert "secret" not in response.text

    def unavailable_database():
        raise OperationalError("secret-db", {}, Exception("private-host"))

    app.state.session_factory = unavailable_database
    identify(client)
    response = client.get("/api/v1/sets/sv03.5/progress")
    assert response.status_code == 503 and "private-host" not in response.text
