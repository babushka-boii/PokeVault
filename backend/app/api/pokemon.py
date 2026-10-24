from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request

from app.pokemon.detail_schemas import DetailLanguage, PokemonDetails
from app.pokemon.details import DetailsUnavailable
from app.pokemon.provider import PokemonProvider, PokemonUnavailable
from app.pokemon.schemas import NATIONAL_DEX_TOTAL, PokemonList, SpeciesMatches
from app.pokemon.search import IndexUnavailable

router = APIRouter(prefix="/api/v1/pokemon", tags=["pokemon"])


def get_pokemon_provider(request: Request) -> PokemonProvider:
    return request.app.state.pokemon_provider


@router.get(
    "",
    response_model=PokemonList,
    responses={503: {"description": "Catalog unavailable"}},
)
async def list_pokemon(
    provider: PokemonProvider = Depends(get_pokemon_provider),
    offset: int = Query(0, ge=0, lt=NATIONAL_DEX_TOTAL),
    limit: int = Query(20, ge=1, le=30),
) -> PokemonList:
    try:
        return await provider.list_pokemon(offset, limit)
    except PokemonUnavailable:
        raise HTTPException(503, detail="Pokemon catalog is unavailable") from None


@router.get("/search", response_model=SpeciesMatches)
async def search_pokemon(
    q: str = Query(min_length=1, max_length=40),
    limit: int = Query(8, ge=1, le=8),
    provider: PokemonProvider = Depends(get_pokemon_provider),
) -> SpeciesMatches:
    if not q.strip():
        raise HTTPException(422, detail="Search query cannot be blank")
    try:
        return await provider.search_index.search(q, limit)
    except IndexUnavailable:
        raise HTTPException(503, detail="Pokemon search is unavailable") from None


@router.get(
    "/{number}",
    response_model=PokemonDetails,
    responses={503: {"description": "Selected Pokemon details unavailable"}},
)
async def pokemon_details(
    number: int = Path(ge=1, le=NATIONAL_DEX_TOTAL),
    language: DetailLanguage = Query("es"),
    provider: PokemonProvider = Depends(get_pokemon_provider),
) -> PokemonDetails:
    try:
        return await provider.details.get_pokemon(number, language)
    except DetailsUnavailable:
        raise HTTPException(503, detail="Pokemon details are unavailable") from None
