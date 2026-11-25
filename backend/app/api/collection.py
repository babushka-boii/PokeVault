"""Your collection by species (Pokédex). The owner always comes from the session."""

from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.prices import (
    CurrencyParam,
    _factory,
    _priced,
    _read,
    _still_signed_in,
    get_price_service,
    user_currency,
)
from app.auth.sessions import require_current_user
from app.cards.provider import CardProvider, CardsUnavailable
from app.cards.schemas import IDENTIFIER_PATTERN, CardSort, Language
from app.collection.schemas import (
    OwnedCardPage,
    Show,
    SpeciesCollection,
    SpeciesCounts,
)
from app.db.models import InventoryCopy, User
from app.pokemon.schemas import NATIONAL_DEX_TOTAL
from app.prices.service import CopyRef, PriceService

router = APIRouter(prefix="/api/v1/collection", tags=["collection"])
Number = Annotated[int, Path(ge=1, le=NATIONAL_DEX_TOTAL)]


def _copies_by_card(request: Request, user: User) -> Counter[str]:
    def load(session):
        rows = session.execute(
            select(InventoryCopy.card_id, func.count())
            .where(InventoryCopy.user_id == user.id)
            .group_by(InventoryCopy.card_id)
        ).all()
        return Counter(dict(rows))

    return _read(request, load)


@router.get("/species", response_model=SpeciesCounts)
async def species_counts(
    request: Request, user: User = Depends(require_current_user)
) -> SpeciesCounts:
    """Copies per national number, from the cards' stored species (one request)."""
    copies = _copies_by_card(request, user)
    resolution = await request.app.state.card_species.resolve(
        _factory(request), list(copies)
    )
    _still_signed_in(request, user)
    counts: Counter[int] = Counter()
    for card, owned in copies.items():
        for number in resolution.species.get(card, []):
            counts[number] += owned
    return SpeciesCounts(
        counts={str(number): total for number, total in sorted(counts.items())},
        species_owned=len(counts),
        pending=len(resolution.pending),
    )


@router.get("/species/{number}", response_model=SpeciesCollection)
async def species_collection(
    request: Request,
    number: Number,
    currency: CurrencyParam = None,
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> SpeciesCollection:
    copies = _copies_by_card(request, user)
    resolution = await request.app.state.card_species.resolve(
        _factory(request), list(copies)
    )
    cards = sorted(
        card for card in copies if number in resolution.species.get(card, [])
    )

    def load(session):
        rows = (
            session.execute(
                select(InventoryCopy.id, InventoryCopy.card_id, InventoryCopy.variant)
                .where(
                    InventoryCopy.user_id == user.id, InventoryCopy.card_id.in_(cards)
                )
                .order_by(InventoryCopy.created_at, InventoryCopy.id)
            ).all()
            if cards
            else []
        )
        return [CopyRef(*row) for row in rows], currency or user_currency(session, user)

    refs, chosen = _read(request, load)
    value = await _priced(service.value(_factory(request), refs, chosen, top=0))
    provider: CardProvider = request.app.state.card_provider
    try:
        total = await provider.species_total(number)
    except CardsUnavailable:
        total = None  # never guessed: the page then shows only the user's own cards
    _still_signed_in(request, user)
    return SpeciesCollection(
        national_dex_number=number,
        copies=sum(copies[card] for card in cards),
        distinct_cards=len(cards),
        owned_card_ids=cards,
        value=value,
        catalog_total=total,
        pending=len(resolution.pending),
    )


@router.get("/species/{number}/cards", response_model=OwnedCardPage)
async def species_cards(
    request: Request,
    number: Number,
    show: Show = Query("all"),
    language: Language = Query("es"),
    page: int = Query(1, ge=1, le=500),
    page_size: int = Query(12, ge=1, le=24),
    set_id: str | None = Query(
        None, pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100
    ),
    sort: CardSort = Query("name"),
    user: User = Depends(require_current_user),
) -> OwnedCardPage:
    """The species' catalog cards, with owned or missing filtered before paging."""
    owned = frozenset(_copies_by_card(request, user))
    provider: CardProvider = request.app.state.card_provider
    try:
        catalog = await provider.list_for_pokemon(
            number,
            language,
            page,
            page_size,
            set_id,
            sort,
            only=owned if show == "owned" else None,
            exclude=owned if show == "missing" else None,
        )
    except CardsUnavailable:
        raise HTTPException(503, detail="Card catalog is unavailable") from None
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None
    _still_signed_in(request, user)
    return OwnedCardPage(
        **catalog.model_dump(),
        owned_ids=[card.id for card in catalog.results if card.id in owned],
    )
