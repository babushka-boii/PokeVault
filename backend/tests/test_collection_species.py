"""Your collection by species: counts, one species' value, owned/missing cards."""

from types import SimpleNamespace

import httpx2 as httpx
import pytest
import test_cards
import test_prices_api

from app.cards.provider import CardNotFound, CardProvider, CardsUnavailable
from app.collection.species import CardSpeciesService

home = test_prices_api.prices
identity = test_prices_api.identity
copy = test_prices_api.copy
PATH = "/api/v1/collection/species"
SPECIES = {
    "me05-044": [1], "me02.5-261": [1, 4], "me02.5-036": [4], "me02.5-130": [7],
    "sm9-1": [25], "sm9-2": [25, 644], "sm9-3": [25], "sm9-4": [25], "sm9-5": [25],
    "trainer-9": [],
}  # fmt: skip


class SpeciesSource:
    """What TCGdex says each card shows; unknown cards are not found."""

    def __init__(self, down=()):
        self.calls = []
        self.down = set(down)

    async def get_card(self, card_id, language="es"):
        self.calls.append(card_id)
        if card_id in self.down:
            raise CardsUnavailable
        if card_id not in SPECIES:
            raise CardNotFound
        return SimpleNamespace(id=card_id, dex_ids=SPECIES[card_id])


def card_provider(fail_index=False):
    """The real provider on a fake TCGdex: species 25 has sm9-1..5."""
    paths = []

    def handle(request):
        if (
            fail_index
            and request.url.path.endswith("/cards")
            and "dexId" in request.url.params
        ):
            return httpx.Response(500)
        if (
            request.url.path.endswith("/cards")
            and request.url.params.get("dexId") != "eq:25"
        ):
            return httpx.Response(
                200, json=[]
            )  # only species 25 has cards in this fake catalog
        return test_cards.paginated_handler(request, paths)

    def with_metadata(request):
        if request.url.path == "/v2/graphql":
            sets = [
                {"id": s, "name": "Team Up", "releaseDate": "2019-02-01"}
                for s in ("sm9",)
            ]
            return httpx.Response(200, json={"data": {"sets": sets}})
        if request.url.path == "/v2/es/sets":
            return httpx.Response(200, json=[{"id": "sm9", "name": "Unión de Aliados"}])
        if request.url.path == "/v2/es/series":
            return httpx.Response(200, json=[])
        return handle(request)

    return CardProvider(transport=httpx.MockTransport(with_metadata)), paths


@pytest.fixture
def world(home):
    client, factory, app, users, provider, rates = home
    source = SpeciesSource()
    app.state.card_species = CardSpeciesService(source)
    app.state.card_provider, paths = card_provider()
    return SimpleNamespace(
        client=client, factory=factory, app=app, users=users, source=source, paths=paths
    )


def stock(world):
    ash, misty = world.users["ash"], world.users["misty"]
    for card, variant in (
        ("me05-044", "normal"),
        ("me05-044", "normal"),
        ("me02.5-261", "holo"),
        ("me02.5-036", "reverse"),
        ("me02.5-130", "normal"),
        ("trainer-9", "normal"),
        ("not-in-catalog-1", "normal"),
        ("sm9-2", "holo"),
        ("sm9-4", "normal"),
    ):
        copy(world.factory, ash, card, variant)
    for card in ("me02.5-261", "me02.5-261", "me02.5-261", "sm9-1"):
        copy(world.factory, misty, card, "holo")


# --- counts per species ---


def test_copies_are_counted_per_species_including_cards_that_show_two(world):
    stock(world)
    identity(world.client, "ash")
    response = world.client.get(PATH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    # sm9-2 shows #25 and #644: its copy counts for both. Trainers and unknown
    # cards count for none.
    assert body == {
        "counts": {"1": 3, "4": 2, "7": 1, "25": 2, "644": 1},
        "species_owned": 5,
        "pending": 0,
    }


def test_two_users_never_see_each_others_species(world):
    stock(world)
    identity(world.client, "misty")
    assert world.client.get(PATH).json()["counts"] == {"1": 3, "4": 3, "25": 1}
    identity(world.client, "ash")
    assert (
        "4" in world.client.get(PATH).json()["counts"]
        and world.client.get(PATH).json()["counts"]["4"] == 2
    )
    identity(world.client, "expired")
    assert world.client.get(PATH).status_code == 401


def test_a_user_with_no_cards_has_an_empty_pokedex_and_no_provider_calls(world):
    identity(world.client, "ash")
    assert world.client.get(PATH).json() == {
        "counts": {},
        "species_owned": 0,
        "pending": 0,
    }
    assert world.source.calls == []


def test_cards_not_resolved_yet_are_pending_and_never_guessed(world):
    stock(world)
    world.app.state.card_species = CardSpeciesService(world.source, budget=3)
    identity(world.client, "ash")
    first = world.client.get(PATH).json()
    assert first["pending"] == 5  # 8 distinct cards, 3 resolved
    assert sum(first["counts"].values()) < 9
    again = world.client.get(PATH).json()
    assert again["pending"] == 2
    final = world.client.get(PATH).json()
    assert final["pending"] == 0 and final["counts"] == {
        "1": 3,
        "4": 2,
        "7": 1,
        "25": 2,
        "644": 1,
    }


def test_a_catalog_outage_is_pending_not_an_error_or_a_zero(world):
    stock(world)
    world.app.state.card_species = CardSpeciesService(SpeciesSource(down=set(SPECIES)))
    identity(world.client, "ash")
    response = world.client.get(PATH)
    assert response.status_code == 200
    body = response.json()
    assert body["counts"] == {} and body["species_owned"] == 0
    # Seven cards could not be asked about; the eighth is unknown to the catalog.
    assert body["pending"] == 7


# --- one species ---


def test_one_species_gives_copies_value_and_owned_cards(world):
    stock(world)
    identity(world.client, "ash")
    response = world.client.get(f"{PATH}/1")
    assert (
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
    )
    body = response.json()
    assert body["national_dex_number"] == 1
    assert body["copies"] == 3 and body["distinct_cards"] == 2
    assert body["owned_card_ids"] == ["me02.5-261", "me05-044"]
    assert body["pending"] == 0
    assert (
        body["value"]["total"] == "1112" and body["value"]["currency"] == "CLP"
    )  # 0.89 EUR x 1250
    assert (
        body["value"]["copy_count"] == 3 and body["value"]["rates"]["available"] is True
    )
    assert body["value"]["prices_updated_at"] is not None
    assert (
        "usd_clp" not in response.text
        and "top" not in body["value"]
        or body["value"]["top"] == []
    )
    assert world.client.get(f"{PATH}/1?currency=USD").json()["value"]["total"] == "1.11"


def test_a_species_you_do_not_own_is_zero_without_inventing_a_value(world):
    stock(world)
    identity(world.client, "ash")
    body = world.client.get(f"{PATH}/150").json()
    assert (
        body["copies"] == 0
        and body["distinct_cards"] == 0
        and body["owned_card_ids"] == []
    )
    assert body["value"]["total"] == "0" and body["value"]["copy_count"] == 0


def test_the_catalog_total_comes_from_the_verified_index_or_is_null(world):
    stock(world)
    identity(world.client, "ash")
    assert world.client.get(f"{PATH}/25").json()["catalog_total"] == 5
    world.app.state.card_provider, _ = card_provider(fail_index=True)
    body = world.client.get(f"{PATH}/25").json()
    assert (
        body["catalog_total"] is None and body["copies"] == 2
    )  # your cards still show


def test_one_species_is_isolated_between_users_and_validated(world):
    stock(world)
    identity(world.client, "misty")
    assert (
        world.client.get(f"{PATH}/1").json()["copies"] == 3
    )  # her three Charmander-line copies, not ash's
    assert world.client.get(f"{PATH}/1").json()["owned_card_ids"] == ["me02.5-261"]
    identity(world.client, "ash")
    for bad in ("0", "1026", "abc", "-1"):
        assert world.client.get(f"{PATH}/{bad}").status_code == 422
    assert world.client.get(f"{PATH}/1?currency=EUR").status_code == 422


# --- the species' cards, owned or missing ---


def ids(response):
    return [card["id"] for card in response.json()["results"]]


def test_all_owned_and_missing_pages_are_exact(world):
    stock(world)
    identity(world.client, "ash")
    base = f"{PATH}/25/cards?language=en&sort=id"
    everything = world.client.get(base)
    assert (
        everything.status_code == 200
        and everything.headers["cache-control"] == "no-store"
    )
    assert ids(everything) == ["sm9-1", "sm9-2", "sm9-3", "sm9-4", "sm9-5"]
    assert everything.json()["owned_ids"] == ["sm9-2", "sm9-4"]
    owned = world.client.get(f"{base}&show=owned")
    assert ids(owned) == ["sm9-2", "sm9-4"] and owned.json()["owned_ids"] == [
        "sm9-2",
        "sm9-4",
    ]
    assert owned.json()["has_more"] is False
    missing = world.client.get(f"{base}&show=missing")
    assert (
        ids(missing) == ["sm9-1", "sm9-3", "sm9-5"]
        and missing.json()["owned_ids"] == []
    )
    # Pages are filled from the filtered list, not from the unfiltered one.
    first = world.client.get(f"{base}&show=missing&page_size=2")
    second = world.client.get(f"{base}&show=missing&page_size=2&page=2")
    assert ids(first) == ["sm9-1", "sm9-3"] and first.json()["has_more"] is True
    assert ids(second) == ["sm9-5"] and second.json()["has_more"] is False
    assert (
        world.client.get(f"{base}&show=owned&page_size=1&page=2").json()["has_more"]
        is False
    )


def test_owned_and_missing_are_per_user(world):
    stock(world)
    identity(world.client, "misty")
    base = f"{PATH}/25/cards?language=en&sort=id"
    assert ids(world.client.get(f"{base}&show=owned")) == ["sm9-1"]
    assert ids(world.client.get(f"{base}&show=missing")) == [
        "sm9-2",
        "sm9-3",
        "sm9-4",
        "sm9-5",
    ]
    assert world.client.get(base).json()["owned_ids"] == ["sm9-1"]


def test_a_user_with_no_cards_owns_nothing_and_misses_everything(world):
    identity(world.client, "ash")
    base = f"{PATH}/25/cards?language=en&sort=id"
    assert ids(world.client.get(f"{base}&show=owned")) == []
    assert (
        world.client.get(f"{base}&show=owned").json()
        == world.client.get(f"{base}&show=owned").json()
    )
    assert len(ids(world.client.get(f"{base}&show=missing"))) == 5


def test_the_set_filter_and_validation_still_apply(world):
    stock(world)
    identity(world.client, "ash")
    assert ids(
        world.client.get(f"{PATH}/25/cards?language=en&set_id=sm9&show=owned")
    ) == ["sm9-2", "sm9-4"]
    for query in ("show=all2", "page=0", "page_size=25", "set_id=bad id", "sort=weird"):
        assert world.client.get(f"{PATH}/25/cards?{query}").status_code == 422
    assert world.client.get(f"{PATH}/0/cards").status_code == 422
    assert world.client.get(f"{PATH}/1026/cards").status_code == 422


def test_a_catalog_outage_is_a_calm_503(world):
    world.app.state.card_provider, _ = card_provider(fail_index=True)
    identity(world.client, "ash")
    response = world.client.get(f"{PATH}/25/cards?language=en")
    assert response.status_code == 503 and response.json() == {
        "detail": "Card catalog is unavailable"
    }


@pytest.mark.parametrize("path", ["", "/1", "/25/cards"])
@pytest.mark.parametrize("name", [None, "expired", "forged"])
def test_every_route_needs_a_live_session(world, path, name):
    identity(world.client, name)
    response = world.client.get(f"{PATH}{path}")
    assert (
        response.status_code == 401 and response.headers["cache-control"] == "no-store"
    )


def test_no_uuid_or_private_data_leaves_the_counts(world):
    stock(world)
    identity(world.client, "ash")
    text = world.client.get(PATH).text + world.client.get(f"{PATH}/1").text
    assert str(world.users["ash"]) not in text and str(world.users["misty"]) not in text
    assert "misty" not in text
