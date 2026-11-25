"""Species ownership on real PostgreSQL: two users, the same cards, no leaks."""

import test_collection_species as shared

from app.collection.species import CardSpeciesService
from app.db.models import InventoryCopy

from . import test_auth_postgres
from .test_binders_postgres import application, client_for, seed_owner

species_database = test_auth_postgres.auth_database
PATH = "/api/v1/collection/species"


def add(factory, owner, card_id, times=1):
    with factory.begin() as session:
        for _ in range(times):
            session.add(
                InventoryCopy(
                    user_id=owner["user_id"], card_id=card_id, condition="mint",
                    language="en", variant="normal",
                )
            )  # fmt: skip


def test_two_users_with_the_same_cards_get_their_own_counts_and_pages(species_database):
    factory, _ = species_database
    ash = seed_owner(factory, copies=0, binders=0)
    misty = seed_owner(factory, copies=0, binders=0)
    add(factory, ash, "sm9-2", 2)
    add(factory, ash, "sm9-4")
    add(factory, misty, "sm9-2")
    add(factory, misty, "me02.5-261", 5)
    app = application(factory)
    source = shared.SpeciesSource()
    app.state.card_species = CardSpeciesService(source)
    app.state.card_provider, _ = shared.card_provider()
    base = f"{PATH}/25/cards?language=en&sort=id"
    try:
        with client_for(app, ash) as client:
            assert client.get(PATH).json()["counts"] == {"25": 3, "644": 2}
            detail = client.get(f"{PATH}/25").json()
            assert detail["copies"] == 3 and detail["owned_card_ids"] == [
                "sm9-2",
                "sm9-4",
            ]
            assert [
                c["id"] for c in client.get(f"{base}&show=owned").json()["results"]
            ] == ["sm9-2", "sm9-4"]
            assert [
                c["id"] for c in client.get(f"{base}&show=missing").json()["results"]
            ] == ["sm9-1", "sm9-3", "sm9-5"]
        with client_for(app, misty) as client:
            assert client.get(PATH).json()["counts"] == {
                "1": 5,
                "4": 5,
                "25": 1,
                "644": 1,
            }
            assert client.get(f"{PATH}/25").json()["owned_card_ids"] == ["sm9-2"]
            assert [
                c["id"] for c in client.get(f"{base}&show=owned").json()["results"]
            ] == ["sm9-2"]
    finally:
        app.state.session_factory.kw["bind"].dispose()
    # A card's species is shared catalog data: each card was asked about once.
    assert sorted(source.calls) == ["me02.5-261", "sm9-2", "sm9-4"]
