"""Public physical expansions and private derived progress, with one ownership query."""

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app.api.cards import get_card_provider
from app.api.inventory import database
from app.auth.sessions import require_current_user
from app.cards.provider import CardProvider, CardsUnavailable, SetNotFound
from app.cards.schemas import IDENTIFIER_PATTERN, Identifier, Language
from app.cards.set_completion import (
    card_page,
    collection_page,
    inventory_quantities,
    membership,
    progress,
    unavailable_progress,
)
from app.cards.set_schemas import (
    ChecklistSort,
    OwnershipFilter,
    SetCardPage,
    SetChecklist,
    SetCollectionPage,
    SetDetail,
    SetPage,
    SetProgressBatch,
    SetSort,
)
from app.db.models import User

router = APIRouter(prefix="/api/v1/sets", tags=["sets"])


async def load_checklist(
    provider: CardProvider, set_id: str, language: Language
) -> SetChecklist:
    try:
        checklist = await provider.get_set_checklist(set_id, language)
        if checklist.metadata.id != set_id:
            raise CardsUnavailable("Conflicting set identity")
        membership(checklist)
        return checklist
    except SetNotFound:
        raise HTTPException(404, detail="Set not found") from None
    except CardsUnavailable:
        raise HTTPException(503, detail="Set catalog is unavailable") from None


@router.get("", response_model=SetPage)
async def list_sets(
    language: Language = Query("es"),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(12, ge=1, le=24),
    q: str = Query("", max_length=100),
    series_id: Identifier | None = Query(None),
    sort: SetSort = Query("newest"),
    provider: CardProvider = Depends(get_card_provider),
):
    try:
        return await provider.list_sets(
            language=language,
            page=page,
            page_size=page_size,
            q=q,
            series_id=series_id,
            sort=sort,
        )
    except CardsUnavailable:
        raise HTTPException(503, detail="Set catalog is unavailable") from None


# Static batch route must precede /{set_id}.
@router.get("/progress", response_model=SetProgressBatch)
async def batch_progress(
    set_id: Annotated[list[Identifier], Query(min_length=1, max_length=12)],
    user: User = Depends(require_current_user),
    session=Depends(database),
    provider: CardProvider = Depends(get_card_provider),
):
    if len(set(set_id)) != len(set_id):
        raise HTTPException(422, detail="Supply unique set identifiers")

    async def fetch(identifier):
        try:
            return await load_checklist(provider, identifier, "en")
        except HTTPException:
            return None

    try:
        async with asyncio.timeout(20):
            checklists = await asyncio.gather(
                *(fetch(identifier) for identifier in set_id)
            )
    except TimeoutError:
        checklists = [None] * len(set_id)
    identifiers: set[str] = set()
    for checklist in checklists:
        if checklist is not None:
            identifiers.update(membership(checklist))
    quantities = inventory_quantities(session, user.id, identifiers)
    return SetProgressBatch(
        results=[
            progress(checklist, quantities)
            if checklist is not None
            else unavailable_progress(identifier)
            for identifier, checklist in zip(set_id, checklists, strict=True)
        ]
    )


@router.get("/{set_id}", response_model=SetDetail)
async def set_detail(
    set_id: str = Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100),
    language: Language = Query("es"),
    provider: CardProvider = Depends(get_card_provider),
):
    return (await load_checklist(provider, set_id, language)).metadata


@router.get("/{set_id}/cards", response_model=SetCardPage)
async def set_cards(
    set_id: str = Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100),
    language: Language = Query("es"),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(12, ge=1, le=24),
    q: str = Query("", max_length=100),
    sort: ChecklistSort = Query("number"),
    provider: CardProvider = Depends(get_card_provider),
):
    checklist = await load_checklist(provider, set_id, language)
    return card_page(checklist, page=page, page_size=page_size, q=q, sort=sort)


@router.get("/{set_id}/progress", response_model=SetCollectionPage)
async def set_progress(
    set_id: str = Path(pattern=IDENTIFIER_PATTERN, min_length=1, max_length=100),
    language: Language = Query("es"),
    page: int = Query(1, ge=1, le=10000),
    page_size: int = Query(12, ge=1, le=24),
    q: str = Query("", max_length=100),
    sort: ChecklistSort = Query("number"),
    ownership: OwnershipFilter = Query("all"),
    user: User = Depends(require_current_user),
    session=Depends(database),
    provider: CardProvider = Depends(get_card_provider),
):
    checklist = await load_checklist(provider, set_id, language)
    if ownership != "all" and checklist.metadata.checklist_status != "verified":
        raise HTTPException(409, detail="checklist_not_verified")
    quantities = inventory_quantities(session, user.id, membership(checklist))
    return collection_page(
        checklist,
        quantities,
        page=page,
        page_size=page_size,
        q=q,
        sort=sort,
        ownership=ownership,
    )
