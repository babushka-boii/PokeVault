"""Starred catalog cards: per user and card, idempotent, bounded, priced in a batch."""

import pytest
import test_prices_api
from sqlalchemy import func, select

from app.auth.sessions import csrf_token
from app.db.models import CardFavorite

home = test_prices_api.prices
identity = test_prices_api.identity
copy = test_prices_api.copy
ORIGIN = test_prices_api.ORIGIN
PATH = "/api/v1/favorites"


def favourites(factory, user_id):
    with factory() as session:
        return set(
            session.scalars(
                select(CardFavorite.card_id).where(CardFavorite.user_id == user_id)
            )
        )


def test_starring_is_idempotent_and_reflected_by_the_state_route(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    assert client.get(f"{PATH}/base1-4").json() == {
        "card_id": "base1-4",
        "favorite": False,
    }
    for _ in range(2):
        added = client.put(f"{PATH}/base1-4", headers=headers)
        assert added.status_code == 200
        assert added.json() == {"card_id": "base1-4", "favorite": True}
        assert added.headers["cache-control"] == "no-store"
    assert client.get(f"{PATH}/base1-4").json()["favorite"] is True
    assert favourites(factory, users["ash"]) == {"base1-4"}
    for _ in range(2):
        removed = client.delete(f"{PATH}/base1-4", headers=headers)
        assert removed.status_code == 200
        assert removed.json() == {"card_id": "base1-4", "favorite": False}
    assert favourites(factory, users["ash"]) == set()


@pytest.mark.parametrize("card_id", ["bad id", "-x", "x-", "a..b", "x" * 101, "é"])
def test_only_catalog_identifiers_are_accepted(home, card_id):
    client = home[0]
    headers = identity(client, "ash")
    assert client.get(f"{PATH}/{card_id}").status_code == 422
    assert client.put(f"{PATH}/{card_id}", headers=headers).status_code == 422
    assert client.delete(f"{PATH}/{card_id}", headers=headers).status_code == 422


def test_starring_never_contacts_the_card_provider(home):
    client, _, _, _, provider, rates = home
    headers = identity(client, "ash")
    assert (
        client.put(f"{PATH}/not-in-the-catalog-1", headers=headers).status_code == 200
    )
    assert provider.calls == [] and rates.calls == 0


def test_two_users_keep_separate_favourites(home):
    client, factory, _, users, _, _ = home
    ash = identity(client, "ash")
    client.put(f"{PATH}/base1-4", headers=ash)
    client.put(f"{PATH}/me02.5-261", headers=ash)
    misty = identity(client, "misty")
    assert client.get(f"{PATH}/base1-4").json()["favorite"] is False
    assert client.get(f"{PATH}/cards").json()["total"] == 0
    client.put(f"{PATH}/base1-4", headers=misty)
    client.delete(f"{PATH}/me02.5-261", headers=misty)  # not hers: changes nothing
    assert favourites(factory, users["ash"]) == {"base1-4", "me02.5-261"}
    assert favourites(factory, users["misty"]) == {"base1-4"}
    identity(client, "ash")
    listed = client.get(f"{PATH}/cards").json()
    assert {item["card_id"] for item in listed["results"]} == {"base1-4", "me02.5-261"}


def test_writes_need_a_session_origin_and_csrf(home):
    client = home[0]
    identity(client, "ash")
    assert client.put(f"{PATH}/base1-4").status_code == 403
    bad = {"Origin": "https://evil.example", "X-CSRF-Token": csrf_token("ash")}
    assert client.put(f"{PATH}/base1-4", headers=bad).status_code == 403
    forged = {"Origin": ORIGIN, "X-CSRF-Token": csrf_token("misty")}
    assert client.delete(f"{PATH}/base1-4", headers=forged).status_code == 403


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", f"{PATH}/base1-4"),
        ("put", f"{PATH}/base1-4"),
        ("delete", f"{PATH}/base1-4"),
        ("get", f"{PATH}/cards"),
    ],
)
@pytest.mark.parametrize("name", [None, "expired", "forged"])
def test_every_route_requires_a_live_session(home, method, path, name):
    client = home[0]
    identity(client, name)
    response = getattr(client, method)(path)
    assert response.status_code == 401
    assert response.headers["cache-control"] == "no-store"


def test_a_user_can_star_at_most_500_cards(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    with factory.begin() as session:
        session.add_all(
            CardFavorite(user_id=users["ash"], card_id=f"set1-{index}")
            for index in range(500)
        )
    full = client.put(f"{PATH}/base1-4", headers=headers)
    assert full.status_code == 409 and full.json()["detail"] == "favorites_full"
    # Re-starring one that is already there is not a new favourite.
    assert client.put(f"{PATH}/set1-7", headers=headers).status_code == 200
    # Removing one makes room again.
    client.delete(f"{PATH}/set1-7", headers=headers)
    assert client.put(f"{PATH}/base1-4", headers=headers).status_code == 200
    with factory() as session:
        count = session.scalar(
            select(func.count()).where(CardFavorite.user_id == users["ash"])
        )
    assert count == 500


def test_favourite_cards_list_newest_first_and_honour_the_limit(home):
    client, _, _, _, _, _ = home
    headers = identity(client, "ash")
    for card_id in ("me05-044", "me02.5-261", "me02.5-036"):
        client.put(f"{PATH}/{card_id}", headers=headers)
    page = client.get(f"{PATH}/cards").json()
    assert page["currency"] == "CLP" and page["total"] == 3
    assert [item["card_id"] for item in page["results"]] == [
        "me02.5-036",
        "me02.5-261",
        "me05-044",
    ]
    assert all(item["favorited_at"] for item in page["results"])
    short = client.get(f"{PATH}/cards?limit=2").json()
    assert short["total"] == 3 and len(short["results"]) == 2
    for bad in ("0", "13", "x"):
        assert client.get(f"{PATH}/cards?limit={bad}").status_code == 422


def test_favourite_prices_use_the_best_owned_copy_else_the_first_priced_variant(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    client.put(f"{PATH}/me02.5-261", headers=headers)  # owned as a holo
    client.put(f"{PATH}/me05-044", headers=headers)  # not owned
    client.put(
        f"{PATH}/me02.5-036", headers=headers
    )  # owned only as an unpriced reverse
    copy(factory, users["ash"], "me02.5-261", "holo")
    copy(factory, users["ash"], "me02.5-036", "reverse")
    # A stranger owning a card never changes someone else's favourite.
    copy(factory, users["misty"], "me05-044", "holo")
    listed = {
        item["card_id"]: item for item in client.get(f"{PATH}/cards").json()["results"]
    }
    assert listed["me02.5-261"]["price"]["amount"] == "1038"
    assert listed["me02.5-261"]["price"]["original_amount"] == "0.83"

    def first_priced(card_id):
        rows = {
            row["variant"]: row
            for row in client.get(f"/api/v1/prices/cards/{card_id}").json()["variants"]
        }
        return next(
            rows[name] for name in ("normal", "holo", "reverse") if rows[name]["price"]
        )

    assert listed["me05-044"]["price"] == first_priced("me05-044")["price"]
    # Owned only as a variant without a market price: the card's own reference price.
    assert listed["me02.5-036"]["price"] == first_priced("me02.5-036")["price"]


def test_favourite_prices_are_batched_and_do_not_leak_rates(home):
    client, factory, _, users, provider, rates = home
    headers = identity(client, "ash")
    for card_id in ("me05-044", "me02.5-261", "me02.5-036"):
        client.put(f"{PATH}/{card_id}", headers=headers)
    copy(factory, users["ash"], "me02.5-261", "holo")
    response = client.get(f"{PATH}/cards")
    assert sorted(provider.calls) == [
        "me02.5-036",
        "me02.5-261",
        "me05-044",
    ]  # one each
    assert rates.calls == 1
    assert "usd_clp" not in response.text and "eur_per_usd" not in response.text
    assert response.json()["rates"]["available"] is True
    provider.calls.clear()
    client.get(f"{PATH}/cards")
    assert provider.calls == []  # cached


def test_favourite_cards_degrade_when_prices_are_unavailable(home):
    client, _, _, _, provider, _ = home
    headers = identity(client, "ash")
    client.put(f"{PATH}/me02.5-261", headers=headers)
    provider.fail = True
    response = client.get(f"{PATH}/cards")
    assert response.status_code == 200
    item = response.json()["results"][0]
    assert item["card_id"] == "me02.5-261" and item["price"] is None and item["reason"]


def test_favourite_cards_can_be_priced_in_usd(home):
    client, _, _, _, _, _ = home
    headers = identity(client, "ash")
    client.put(f"{PATH}/me02.5-261", headers=headers)
    usd = client.get(f"{PATH}/cards?currency=USD").json()
    assert usd["currency"] == "USD"
    assert usd["results"][0]["price"]["amount"] == "1.04"  # 0.83 EUR / 0.8
    assert client.get(f"{PATH}/cards?currency=EUR").status_code == 422


def test_the_status_of_many_cards_comes_in_one_request(home):
    client, factory, _, users, _, _ = home
    headers = identity(client, "ash")
    for card_id in ("base1-4", "me02.5-261"):
        client.put(f"{PATH}/{card_id}", headers=headers)
    misty = identity(client, "misty")
    client.put(f"{PATH}/base1-5", headers=misty)
    identity(client, "ash")
    asked = ["base1-4", "base1-5", "me02.5-261", "zz9-9", "base1-4"]
    response = client.get(f"{PATH}/status", params={"card_id": asked})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    # Only this user's stars, each id once, in the order asked.
    assert response.json() == {"card_ids": ["base1-4", "me02.5-261"]}
    assert client.get(f"{PATH}/status", params={"card_id": ["zz9-9"]}).json() == {
        "card_ids": []
    }


def test_the_status_batch_is_validated_and_private(home):
    client, _, _, _, provider, _ = home
    identity(client, "ash")
    assert client.get(f"{PATH}/status").status_code == 422
    assert (
        client.get(f"{PATH}/status", params={"card_id": ["bad id"]}).status_code == 422
    )
    assert (
        client.get(
            f"{PATH}/status", params={"card_id": [f"c-{n}" for n in range(51)]}
        ).status_code
        == 422
    )
    assert (
        client.get(
            f"{PATH}/status", params={"card_id": [f"c-{n}" for n in range(50)]}
        ).status_code
        == 200
    )
    assert provider.calls == []
    for name in (None, "expired", "forged"):
        identity(client, name)
        assert (
            client.get(f"{PATH}/status", params={"card_id": ["base1-4"]}).status_code
            == 401
        )
