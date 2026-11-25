"""The new-user guide: three steps computed from the owner's own data."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

import test_prices_api

from app.db.models import CardFavorite, UserSettings

home = test_prices_api.prices
identity = test_prices_api.identity
copy = test_prices_api.copy
binder = test_prices_api.binder
PATH = "/api/v1/home/guide"
FAVORITES = "/api/v1/favorites"
OPEN = {
    "has_copy": False,
    "has_stored": False,
    "has_favorite": False,
    "dismissed": False,
}


def settings_row(factory, user_id):
    with factory() as session:
        return session.get(UserSettings, user_id)


def test_a_new_user_sees_three_open_steps(home):
    client, _, _, _, _, _ = home
    identity(client, "ash")
    response = client.get(PATH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == OPEN


def test_each_step_is_checked_off_from_the_users_own_data(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    first = copy(factory, users["ash"], "base1-4", "holo")
    assert client.get(PATH).json() == OPEN | {"has_copy": True}
    binder(factory, users["ash"], [UUID(first)])
    assert client.get(PATH).json() == OPEN | {"has_copy": True, "has_stored": True}
    client.put(f"{FAVORITES}/base1-4", headers=headers)
    finished = client.get(PATH).json()
    assert finished == {
        "has_copy": True,
        "has_stored": True,
        "has_favorite": True,
        "dismissed": True,
    }


def test_another_users_data_never_completes_a_step(home):
    client, factory, _, users, _, _ = home
    copy(factory, users["misty"], "base1-4", "holo")
    with factory.begin() as session:
        session.add(CardFavorite(user_id=users["misty"], card_id="base1-4"))
    identity(client, "ash")
    assert client.get(PATH).json() == OPEN


def test_completing_all_three_dismisses_the_guide_for_good(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    first = copy(factory, users["ash"], "base1-4", "holo")
    binder(factory, users["ash"], [UUID(first)])
    client.put(f"{FAVORITES}/base1-4", headers=headers)
    assert client.get(PATH).json()["dismissed"] is True
    stamp = settings_row(factory, users["ash"]).home_guide_dismissed_at
    assert stamp is not None
    # Undoing a step later never brings it back, and the stamp is not rewritten.
    client.delete(f"{FAVORITES}/base1-4", headers=headers)
    again = client.get(PATH).json()
    assert again["dismissed"] is True and again["has_favorite"] is False
    assert settings_row(factory, users["ash"]).home_guide_dismissed_at == stamp


def test_closing_the_guide_is_remembered_per_user(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    closed = client.put(PATH, json={"dismissed": True}, headers=headers)
    assert closed.status_code == 200 and closed.json() == OPEN | {"dismissed": True}
    assert client.get(PATH).json()["dismissed"] is True
    identity(client, "misty")  # has no settings row yet
    assert client.get(PATH).json()["dismissed"] is False
    assert settings_row(factory, users["misty"]) is None


def test_closing_creates_the_settings_row_when_missing_and_keeps_the_currency(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "misty")
    client.put(
        "/api/v1/me/settings", json={"preferred_currency": "USD"}, headers=headers
    )
    client.put(PATH, json={"dismissed": True}, headers=headers)
    row = settings_row(factory, users["misty"])
    assert row.preferred_currency == "USD" and row.home_guide_dismissed_at is not None
    assert client.get(PATH).json()["dismissed"] is True


def test_closing_twice_keeps_the_first_time(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    client.put(PATH, json={"dismissed": True}, headers=headers)
    first = settings_row(factory, users["ash"]).home_guide_dismissed_at
    client.put(PATH, json={"dismissed": True}, headers=headers)
    assert settings_row(factory, users["ash"]).home_guide_dismissed_at == first


def test_the_body_is_strict(home):
    client, _, _, _, _, _ = home
    headers = identity(client, "ash")
    for body in (
        {},
        {"dismissed": False},
        {"dismissed": "yes"},
        {"dismissed": True, "x": 1},
    ):
        assert client.put(PATH, json=body, headers=headers).status_code == 422


def test_writes_need_csrf_and_every_route_a_session(home):
    client = home[0]
    identity(client, "ash")
    assert client.put(PATH, json={"dismissed": True}).status_code == 403
    for name in (None, "expired", "forged"):
        identity(client, name)
        assert client.get(PATH).status_code == 401
        assert client.put(PATH, json={"dismissed": True}).status_code == 401


def test_the_stamp_is_a_recent_utc_time(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    client.put(PATH, json={"dismissed": True}, headers=headers)
    stamp = settings_row(factory, users["ash"]).home_guide_dismissed_at
    stamp = stamp.replace(tzinfo=stamp.tzinfo or UTC)
    assert abs(datetime.now(UTC) - stamp) < timedelta(minutes=1)
