from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response

from app.pokemon.catalog import get_catalog
from app.pokemon.detail_schemas import DetailLanguage, PokemonDetails
from app.pokemon.details import DetailsUnavailable
from app.pokemon.provider import PokemonProvider, PokemonUnavailable
from app.pokemon.schemas import (
    NATIONAL_DEX_TOTAL,
    IndexEntry,
    PokemonList,
    SpeciesIndexResponse,
    SpeciesMatches,
)

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


@router.get("/index", response_model=SpeciesIndexResponse)
def species_index(request: Request, response: Response):
    """All 1025 species (names in both languages and types) from the versioned file.

    Public, static data: a long HTTP cache, and an ETag so a browser can revalidate
    for free.
    """
    catalog = get_catalog()
    headers = {"Cache-Control": "public, max-age=604800", "ETag": catalog.etag}
    if request.headers.get("if-none-match") == catalog.etag:
        return Response(status_code=304, headers=headers)
    response.headers.update(headers)
    return SpeciesIndexResponse(
        results=[
            IndexEntry(
                national_dex_number=row.number,
                name_en=row.name_en,
                name_es=row.name_es,
                types=row.types,
            )
            for row in catalog.rows
        ]
    )


@router.get("/search", response_model=SpeciesMatches)
async def search_pokemon(
    q: str = Query(min_length=1, max_length=40),
    limit: int = Query(8, ge=1, le=8),
    provider: PokemonProvider = Depends(get_pokemon_provider),
) -> SpeciesMatches:
    if not q.strip():
        raise HTTPException(422, detail="Search query cannot be blank")
    return await provider.search_index.search(q, limit)


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
