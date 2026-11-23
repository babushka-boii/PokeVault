"""Retries preserve one explicit physical-copy intent, not one printing."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from test_inventory import COPY, PATH, identity
from test_inventory import inventory as inventory

from app.auth.sessions import token_digest
from app.cards.provider import CardsUnavailable
from app.db.models import AuthSession, InventoryCopy


def test_same_intent_replays_one_copy_but_new_intent_adds_another(inventory):
    client, factory = inventory
    headers = {**identity(client, "ash"), "Idempotency-Key": str(uuid4())}
    first = client.post(PATH, json=COPY, headers=headers)
    replay = client.post(PATH, json=COPY, headers=headers)
    assert first.status_code == replay.status_code == 201
    assert first.json() == replay.json()
    next_copy = client.post(
        PATH, json=COPY, headers={**headers, "Idempotency-Key": str(uuid4())}
    )
    assert next_copy.status_code == 201
    assert first.json()["id"] != next_copy.json()["id"]
    with factory() as session:
        assert len(session.scalars(select(InventoryCopy)).all()) == 2


def test_key_is_scoped_to_authenticated_owner(inventory):
    client, _ = inventory
    key = str(uuid4())
    copies = []
    for owner in ("ash", "misty"):
        response = client.post(
            PATH,
            json=COPY,
            headers={**identity(client, owner), "Idempotency-Key": key},
        )
        assert response.status_code == 201
        copies.append(response.json()["id"])
    assert copies[0] != copies[1]
    assert client.get(f"{PATH}/{copies[0]}").status_code == 404


def test_conflicting_payload_does_not_repurpose_key(inventory):
    client, _ = inventory
    headers = {**identity(client, "ash"), "Idempotency-Key": str(uuid4())}
    first = client.post(PATH, json=COPY, headers=headers)
    response = client.post(PATH, json={**COPY, "notes": "Different"}, headers=headers)
    assert response.status_code == 409
    assert response.json() == {"detail": "idempotency_conflict"}
    assert client.get(f"{PATH}/{first.json()['id']}").json()["notes"] == COPY["notes"]


def test_lost_response_replay_works_when_provider_is_now_down(inventory):
    client, _ = inventory
    headers = {**identity(client, "ash"), "Idempotency-Key": str(uuid4())}
    first = client.post(PATH, json=COPY, headers=headers)

    async def unavailable(*args):
        raise CardsUnavailable

    client.app.state.card_provider.get_card = unavailable
    replay = client.post(PATH, json=COPY, headers=headers)
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]


@pytest.mark.parametrize(
    "key", ["", "oops", "a" * 1000, str(uuid4()).replace("-", "x")]
)
def test_malformed_keys_never_create_copies(inventory, key):
    client, _ = inventory
    headers = {**identity(client, "ash"), "Idempotency-Key": key}
    assert client.post(PATH, json=COPY, headers=headers).status_code == 422
    assert client.get(PATH).json()["total"] == 0


def test_expiring_session_during_catalog_validation_prevents_save(inventory):
    client, factory = inventory
    headers = {**identity(client, "ash"), "Idempotency-Key": str(uuid4())}

    async def expire(*args):
        with factory.begin() as session:
            record = session.get(AuthSession, token_digest("ash"))
            record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        return object()

    client.app.state.card_provider.get_card = expire
    assert client.post(PATH, json=COPY, headers=headers).status_code == 401
    with factory() as session:
        assert session.scalars(select(InventoryCopy)).all() == []
