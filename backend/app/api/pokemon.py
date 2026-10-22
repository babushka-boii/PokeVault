from fastapi import APIRouter, Depends, HTTPException, Request

from app.pokemon.provider import PokemonProvider, PokemonUnavailable
from app.pokemon.schemas import PokemonList

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
) -> PokemonList:
    try:
        return await provider.list_pokemon()
    except PokemonUnavailable:
        raise HTTPException(503, detail="Pokemon catalog is unavailable") from None
