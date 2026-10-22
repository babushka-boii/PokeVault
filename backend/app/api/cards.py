from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from app.cards.provider import CardNotFound, CardProvider, CardsUnavailable
from app.cards.schemas import IDENTIFIER_PATTERN, Card, CardPage, CardSort, Language
from app.pokemon.schemas import NATIONAL_DEX_TOTAL

router = APIRouter(prefix="/api/v1", tags=["cards"])


def get_card_provider(request: Request) -> CardProvider:
    return request.app.state.card_provider


@router.get("/cards/{card_id}", response_model=Card)
async def card_details(
    card_id: str = Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100),
    language: Language = Query("es"),
    provider: CardProvider = Depends(get_card_provider),
) -> Card:
    try:
        return await provider.get_card(card_id, language)
    except CardNotFound:
        raise HTTPException(404, detail="Card not found") from None
    except CardsUnavailable:
        raise HTTPException(503, detail="Card catalog is unavailable") from None


@router.get("/pokemon/{number}/cards", response_model=CardPage)
async def cards_for_pokemon(
    number: int = Path(ge=1, le=NATIONAL_DEX_TOTAL),
    language: Language = Query("es"),
    page: int = Query(1, ge=1, le=500),
    page_size: int = Query(12, ge=1, le=24),
    set_id: str | None = Query(
        None, pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100
    ),
    sort: CardSort = Query("name"),
    provider: CardProvider = Depends(get_card_provider),
) -> CardPage:
    try:
        return await provider.list_for_pokemon(
            number, language, page, page_size, set_id, sort
        )
    except CardsUnavailable:
        raise HTTPException(503, detail="Card catalog is unavailable") from None
