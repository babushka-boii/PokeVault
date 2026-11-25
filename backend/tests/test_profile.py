"""Trainer profile API: sprite and team, per account, validated."""

import pytest
from test_prices_api import identity, prices  # noqa: F401

from app.db.models import UserSettings

PATH = "/api/v1/me/profile"
GOOD = {"trainer_id": "diego", "team": [559, 501, 605]}


def test_defaults_then_saves_for_the_owner_only(prices):  # noqa: F811
    client, factory, _, users, _, _ = prices
    headers = identity(client, "ash")
    first = client.get(PATH)
    assert first.status_code == 200 and first.headers["cache-control"] == "no-store"
    assert first.json()["trainer_id"] == "mateo" and first.json()["team"] == []
    assert len(first.json()["member_since"]) == 10
    saved = client.put(PATH, json=GOOD, headers=headers)
    assert saved.status_code == 200 and saved.json()["team"] == [559, 501, 605]
    identity(client, "misty")
    other = client.get(PATH).json()
    assert other["trainer_id"] == "mateo" and other["team"] == []
    identity(client, "ash")
    assert client.get(PATH).json()["trainer_id"] == "diego"
    with factory() as session:
        assert session.get(UserSettings, users["ash"]).team == [559, 501, 605]


def test_put_creates_the_settings_row_when_missing(prices):  # noqa: F811
    client, factory, _, users, _, _ = prices
    headers = identity(client, "misty")
    assert client.put(PATH, json=GOOD, headers=headers).status_code == 200
    with factory() as session:
        assert session.get(UserSettings, users["misty"]).trainer_id == "diego"


@pytest.mark.parametrize(
    "body",
    [
        {"trainer_id": "red", "team": []},
        {"trainer_id": "mateo", "team": [1, 2, 3, 4, 5, 6]},
        {"trainer_id": "mateo", "team": [0]},
        {"trainer_id": "mateo", "team": [1026]},
        {"trainer_id": "mateo", "team": [25, 25]},
        {"trainer_id": "mateo", "team": ["25"]},
        {"trainer_id": "mateo", "team": [25.5]},
        {"trainer_id": "mateo", "team": [True]},
        {"trainer_id": "mateo"},
        {"trainer_id": "mateo", "team": [], "member_since": "2020-01-01"},
    ],
)
def test_rejects_invalid_profiles_and_keeps_the_old_one(prices, body):  # noqa: F811
    client, _, _, _, _, _ = prices
    headers = identity(client, "ash")
    client.put(PATH, json=GOOD, headers=headers)
    assert client.put(PATH, json=body, headers=headers).status_code == 422
    assert client.get(PATH).json()["team"] == [559, 501, 605]


def test_five_is_allowed_and_writes_need_session_and_csrf(prices):  # noqa: F811
    client, _, _, _, _, _ = prices
    headers = identity(client, "ash")
    full = {"trainer_id": "camila", "team": [1, 4, 7, 25, 1025]}
    assert client.put(PATH, json=full, headers=headers).status_code == 200
    assert client.put(
        PATH, json=full, headers={"Origin": headers["Origin"]}
    ).status_code in (401, 403)
    identity(client, None)
    assert client.get(PATH).status_code == 401
    assert client.put(PATH, json=full, headers=headers).status_code == 401
    identity(client, "expired")
    assert client.get(PATH).status_code == 401
