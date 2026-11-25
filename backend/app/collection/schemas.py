from typing import Literal

from pydantic import BaseModel, Field

from app.cards.schemas import CardPage
from app.pokemon.schemas import NATIONAL_DEX_TOTAL
from app.prices.api_schemas import Valuation

Show = Literal["all", "owned", "missing"]


class SpeciesCounts(BaseModel):
    # National number (as text) -> how many of the user's copies show that species.
    counts: dict[str, int]
    species_owned: int
    # Cards whose species is not known yet: the counts may grow, never shrink.
    pending: int


class SpeciesCollection(BaseModel):
    national_dex_number: int = Field(ge=1, le=NATIONAL_DEX_TOTAL)
    copies: int
    distinct_cards: int
    owned_card_ids: list[str]
    value: Valuation
    # Cards of this species in the verified English catalog, or null when unknown.
    catalog_total: int | None
    pending: int


class OwnedCardPage(CardPage):
    # The cards on this page that the user owns (any number of copies).
    owned_ids: list[str]
