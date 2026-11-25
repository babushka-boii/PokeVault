from datetime import datetime

from pydantic import BaseModel

from app.cards.schemas import Identifier
from app.prices.api_schemas import Quote, RatesInfo, TargetCurrency
from app.prices.schemas import NoPriceReason

MAX_FAVORITES = 500
MAX_LISTED = 12
MAX_STATUS = 50


class FavoriteState(BaseModel):
    card_id: Identifier
    favorite: bool


class FavoriteCard(BaseModel):
    card_id: str
    favorited_at: datetime
    price: Quote | None = None
    reason: NoPriceReason | None = None


class FavoriteCards(BaseModel):
    currency: TargetCurrency
    total: int
    results: list[FavoriteCard]
    rates: RatesInfo


class FavoriteStatus(BaseModel):
    # The asked-for cards that are starred, once each, in the order they were asked.
    card_ids: list[Identifier]
