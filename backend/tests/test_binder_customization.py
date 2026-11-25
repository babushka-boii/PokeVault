"""Cover materials, stickers and stored pages (8D Part 2): API bounds and isolation."""

import pytest
from sqlalchemy import select
from test_binders import (  # noqa: F401
    PATH,
    add_copy,
    binders,
    create_binder,
    identity,
    place,
    store,
)

from app.db.models import Binder, BinderSticker

PIXEL = {
    "kind": "pixel",
    "pixel_key": "star",
    "x": 50,
    "y": 50,
    "rotation": 0,
    "scale": 1,
}
POKEMON = {
    "kind": "pokemon",
    "species_id": 25,
    "x": 20.5,
    "y": 70.25,
    "rotation": -12.5,
    "scale": 1.25,
}


def save(client, headers, binder_id, cover="metallic", stickers=()):
    return client.put(
        f"{PATH}/{binder_id}/appearance",
        json={"cover": cover, "stickers": list(stickers)},
        headers=headers,
    )


def test_saves_a_cover_and_stickers_in_order_and_lists_them_without_ids(binders):  # noqa: F811
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    response = save(client, headers, binder["id"], "brown_leather", [PIXEL, POKEMON])
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["cover"] == "brown_leather"
    assert body["stickers"] == [
        {
            "kind": "pixel",
            "species_id": None,
            "pixel_key": "star",
            "x": 50.0,
            "y": 50.0,
            "rotation": 0.0,
            "scale": 1.0,
        },
        {
            "kind": "pokemon",
            "species_id": 25,
            "pixel_key": None,
            "x": 20.5,
            "y": 70.25,
            "rotation": -12.5,
            "scale": 1.25,
        },
    ]
    # The list and the detail carry the same look, so the shelf needs no extra request.
    listed = client.get(PATH).json()["results"][0]
    assert listed["cover"] == "brown_leather" and listed["stickers"] == body["stickers"]
    assert client.get(f"{PATH}/{binder['id']}").json()["stickers"] == body["stickers"]
    assert all("id" not in sticker for sticker in body["stickers"])


def test_saving_replaces_the_whole_look_and_can_clear_it(binders):  # noqa: F811
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    save(client, headers, binder["id"], "white", [PIXEL, POKEMON])
    again = save(client, headers, binder["id"], "noir", [POKEMON]).json()
    assert [s["species_id"] for s in again["stickers"]] == [25] and again[
        "cover"
    ] == "noir"
    assert save(client, headers, binder["id"], "noir", []).json()["stickers"] == []
    with factory() as session:
        assert session.scalars(select(BinderSticker)).all() == []


def test_the_limit_is_24_stickers(binders):  # noqa: F811
    client, _ = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    assert save(client, headers, binder["id"], stickers=[PIXEL] * 24).status_code == 200
    assert save(client, headers, binder["id"], stickers=[PIXEL] * 25).status_code == 422
    assert len(client.get(f"{PATH}/{binder['id']}").json()["stickers"]) == 24


@pytest.mark.parametrize(
    "bad",
    [
        {**PIXEL, "pixel_key": "dragon"},
        {**PIXEL, "pixel_key": None},
        {**PIXEL, "species_id": 25},
        {**POKEMON, "species_id": 0},
        {**POKEMON, "species_id": 1026},
        {**POKEMON, "species_id": "25"},
        {**POKEMON, "species_id": True},
        {**POKEMON, "pixel_key": "star"},
        {"kind": "pokemon", "x": 1, "y": 1},
        {**PIXEL, "kind": "image", "url": "https://evil.example/a.png"},
        {**PIXEL, "url": "https://evil.example/a.png"},
        {**PIXEL, "x": -0.1},
        {**PIXEL, "x": 100.1},
        {**PIXEL, "y": 101},
        {**PIXEL, "x": "50"},
        {**PIXEL, "y": True},
        {**PIXEL, "x": 12.345},
        {**PIXEL, "rotation": 181},
        {**PIXEL, "rotation": 0.25},
        {**PIXEL, "scale": 0.49},
        {**PIXEL, "scale": 2.01},
        {**PIXEL, "scale": 1.005},
    ],
)
def test_rejects_anything_outside_the_closed_catalogues(binders, bad):  # noqa: F811
    client, _ = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    assert save(client, headers, binder["id"], stickers=[PIXEL]).status_code == 200
    assert save(client, headers, binder["id"], "white", [bad]).status_code == 422
    kept = client.get(
        f"{PATH}/{binder['id']}"
    ).json()  # a rejected save changes nothing
    assert kept["cover"] == "metallic" and len(kept["stickers"]) == 1


@pytest.mark.parametrize(
    "cover", ["gold", "NOIR", "", "https://evil.example/c.png", None]
)
def test_rejects_unknown_covers(binders, cover):  # noqa: F811
    client, _ = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    assert save(client, headers, binder["id"], cover).status_code == 422


def test_only_the_owner_can_change_a_look_and_others_get_404(binders):  # noqa: F811
    client, _ = binders
    ash = identity(client, "ash")
    binder = create_binder(client, ash)
    save(client, ash, binder["id"], "holographic", [PIXEL])
    misty = identity(client, "misty")
    assert save(client, misty, binder["id"], "white", []).status_code == 404
    assert client.get(PATH).json()["results"] == []
    assert client.get(f"{PATH}/{binder['id']}").status_code == 404
    identity(client, "ash")
    assert client.get(f"{PATH}/{binder['id']}").json()["cover"] == "holographic"


def test_appearance_needs_a_session_and_csrf(binders):  # noqa: F811
    client, _ = binders
    headers = identity(client, "ash")
    binder = create_binder(client, headers)
    body = {"cover": "white", "stickers": []}
    url = f"{PATH}/{binder['id']}/appearance"
    assert (
        client.put(url, json=body, headers={"Origin": headers["Origin"]}).status_code
        == 403
    )
    identity(client, None)
    assert client.put(url, json=body).status_code == 401
    identity(client, "expired")
    assert (
        client.put(url, json=body, headers={"Origin": headers["Origin"]}).status_code
        == 401
    )


def test_deleting_a_binder_removes_its_stickers(binders):  # noqa: F811
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    save(client, headers, binder["id"], stickers=[PIXEL, POKEMON])
    assert client.delete(f"{PATH}/{binder['id']}", headers=headers).status_code == 204
    with factory() as session:
        assert session.scalars(select(BinderSticker)).all() == []


def test_cover_edits_do_not_touch_cards_or_pages(binders):  # noqa: F811
    client, _ = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    copy = add_copy(base_factory(binders))
    assert place(client, headers, binder["id"], 3, 1, copy).status_code == 200
    before = client.get(f"{PATH}/{binder['id']}").json()
    after = save(client, headers, binder["id"], "white", [PIXEL]).json()
    assert (after["copy_count"], after["page_count"]) == (
        before["copy_count"],
        before["page_count"],
    )
    assert len(client.get(f"{PATH}/{binder['id']}").json()["pockets"]) == 1


def base_factory(fixture):
    return fixture[1]


def pages(client, headers, binder_id):
    return client.post(f"{PATH}/{binder_id}/pages", headers=headers)


def test_adding_pages_adds_two_up_to_forty_and_never_removes_any(binders):  # noqa: F811
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    assert binder["page_count"] == 2
    seen = []
    while (response := pages(client, headers, binder["id"])).status_code == 200:
        seen.append(response.json()["page_count"])
    assert seen == list(range(4, 41, 2))
    assert (
        response.status_code == 409 and response.json()["detail"] == "binder_max_pages"
    )
    with factory() as session:
        assert session.scalar(select(Binder.page_count)) == 40


def test_added_pages_survive_empty_and_stored_cards_keep_their_pages(binders):  # noqa: F811
    client, factory = binders
    headers = identity(client)
    binder = create_binder(client, headers)
    first = add_copy(factory)
    assert store(client, headers, binder["id"], first).status_code == 200
    assert pages(client, headers, binder["id"]).json()["page_count"] == 4
    assert (
        client.get(f"{PATH}/{binder['id']}").json()["page_count"] == 4
    )  # empty pages are kept
    far = add_copy(factory)
    assert place(client, headers, binder["id"], 9, 1, far).status_code == 200
    assert (
        client.get(f"{PATH}/{binder['id']}").json()["page_count"] == 10
    )  # a card beyond them grows it
    assert place(client, headers, binder["id"], 9, 1, far).status_code == 200
    detail = client.get(f"{PATH}/{binder['id']}").json()
    assert detail["page_count"] == 10 and len(detail["pockets"]) == 2


def test_add_pages_is_owner_scoped_and_protected(binders):  # noqa: F811
    client, _ = binders
    ash = identity(client, "ash")
    binder = create_binder(client, ash)
    misty = identity(client, "misty")
    assert pages(client, misty, binder["id"]).status_code == 404
    assert (
        client.post(
            f"{PATH}/{binder['id']}/pages", headers={"Origin": misty["Origin"]}
        ).status_code
        == 403
    )
    identity(client, None)
    assert client.post(f"{PATH}/{binder['id']}/pages").status_code == 401
    identity(client, "ash")
    assert client.get(f"{PATH}/{binder['id']}").json()["page_count"] == 2
