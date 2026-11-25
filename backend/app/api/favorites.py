"""Favourite cards. The owner always comes from the session.

Nothing here calls a provider on write, so an outage can never block the star.
"""

from decimal import Decimal
from typing import Annotated
from uuid import NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.prices import (
    CurrencyParam,
    _factory,
    _priced,
    _still_signed_in,
    get_price_service,
    user_currency,
)
from app.auth.sessions import require_csrf, require_current_user
from app.cards.schemas import IDENTIFIER_PATTERN
from app.db.models import CardFavorite, InventoryCopy, User
from app.favorites.schemas import (
    MAX_FAVORITES,
    MAX_LISTED,
    FavoriteCard,
    FavoriteCards,
    FavoriteState,
)
from app.prices.service import CopyRef, PriceService

router = APIRouter(prefix="/api/v1/favorites", tags=["favorites"])
CardId = Annotated[str, Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100)]
# When a favourite is not owned, it shows the first of these that has a price.
VARIANT_ORDER = ("normal", "holo", "reverse")


def database(request: Request):
    try:
        with request.app.state.session_factory.begin() as session:
            yield session
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


def _lock_owner(session, user: User) -> None:
    # Serializes this owner's writes, so the 500 limit cannot be raced past.
    session.scalar(select(User.id).where(User.id == user.id).with_for_update())


@router.get("/cards", response_model=FavoriteCards)
async def favorite_cards(
    request: Request,
    currency: CurrencyParam = None,
    limit: int = Query(MAX_LISTED, ge=1, le=MAX_LISTED),
    user: User = Depends(require_current_user),
    service: PriceService = Depends(get_price_service),
) -> FavoriteCards:
    """Newest favourites with one price each, from a single batched evaluation."""
    factory = _factory(request)

    def load(session):
        total = session.scalar(
            select(func.count()).where(CardFavorite.user_id == user.id)
        )
        rows = session.execute(
            select(CardFavorite.card_id, CardFavorite.created_at)
            .where(CardFavorite.user_id == user.id)
            .order_by(CardFavorite.created_at.desc(), CardFavorite.card_id)
            .limit(limit)
        ).all()
        ids = [card_id for card_id, _ in rows]
        owned = session.execute(
            select(InventoryCopy.id, InventoryCopy.card_id, InventoryCopy.variant)
            .where(InventoryCopy.user_id == user.id, InventoryCopy.card_id.in_(ids))
            .order_by(InventoryCopy.created_at, InventoryCopy.id)
        ).all()
        return total, rows, owned, currency or user_currency(session, user)

    try:
        with factory.begin() as session:
            total, rows, owned, chosen = load(session)
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None
    refs = [CopyRef(copy_id, card_id, variant) for copy_id, card_id, variant in owned]
    # One reference copy per variant, so an unowned favourite still has a price.
    refs += [
        CopyRef(uuid5(NAMESPACE_URL, f"{card_id}:{variant}"), card_id, variant)
        for card_id, _ in rows
        for variant in VARIANT_ORDER
    ]
    result = await _priced(service.copy_prices(factory, refs, chosen))
    _still_signed_in(request, user)
    by_copy = {item.copy_id: item for item in result.results}
    owned_ids = {}
    for copy_id, card_id, _ in owned:
        owned_ids.setdefault(card_id, []).append(copy_id)

    def amount(item) -> Decimal:
        quote = item.price
        return Decimal(
            quote.amount if quote.amount is not None else quote.original_amount
        )

    cards = []
    for card_id, created in rows:
        owned_prices = [
            by_copy[copy_id]
            for copy_id in owned_ids.get(card_id, [])
            if by_copy[copy_id].price
        ]
        reference = [
            by_copy[uuid5(NAMESPACE_URL, f"{card_id}:{variant}")]
            for variant in VARIANT_ORDER
        ]
        if owned_prices:
            chosen_item = max(owned_prices, key=amount)
        else:
            chosen_item = next((item for item in reference if item.price), None)
        if chosen_item is not None:
            cards.append(
                FavoriteCard(
                    card_id=card_id, favorited_at=created, price=chosen_item.price
                )
            )
        else:
            cards.append(
                FavoriteCard(
                    card_id=card_id, favorited_at=created, reason=reference[0].reason
                )
            )
    return FavoriteCards(
        currency=chosen, total=total, results=cards, rates=result.rates
    )


@router.get("/{card_id}", response_model=FavoriteState)
def favorite_state(
    card_id: CardId,
    user: User = Depends(require_current_user),
    session=Depends(database),
) -> FavoriteState:
    present = session.scalar(
        select(CardFavorite.card_id).where(
            CardFavorite.user_id == user.id, CardFavorite.card_id == card_id
        )
    )
    return FavoriteState(card_id=card_id, favorite=present is not None)


@router.put("/{card_id}", response_model=FavoriteState)
def add_favorite(
    card_id: CardId,
    user: User = Depends(require_csrf),
    session=Depends(database),
) -> FavoriteState:
    _lock_owner(session, user)
    if session.get(CardFavorite, (user.id, card_id)) is None:
        count = session.scalar(
            select(func.count()).where(CardFavorite.user_id == user.id)
        )
        if count >= MAX_FAVORITES:
            raise HTTPException(409, detail="favorites_full")
        try:
            with session.begin_nested():
                session.add(CardFavorite(user_id=user.id, card_id=card_id))
        except IntegrityError:
            pass  # a parallel request starred it first: still starred
    return FavoriteState(card_id=card_id, favorite=True)


@router.delete("/{card_id}", response_model=FavoriteState)
def remove_favorite(
    card_id: CardId,
    user: User = Depends(require_csrf),
    session=Depends(database),
) -> FavoriteState:
    _lock_owner(session, user)
    record = session.get(CardFavorite, (user.id, card_id))
    if record is not None:
        session.delete(record)
    return FavoriteState(card_id=card_id, favorite=False)
