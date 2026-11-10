"""Pure checklist pagination and one-query inventory aggregation for set progress."""

import re
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import func, select

from app.cards.provider import CardsUnavailable
from app.cards.set_schemas import (
    ChecklistSort,
    OwnershipFilter,
    SetCard,
    SetCardPage,
    SetChecklist,
    SetCollectionPage,
    SetProgress,
)
from app.db.models import InventoryCopy


def membership(checklist: SetChecklist) -> set[str]:
    identifiers = {card.id for card in checklist.cards}
    if len(identifiers) != len(checklist.cards):
        raise CardsUnavailable("Duplicate checklist identity")
    if checklist.metadata.checklist_status == "verified" and (
        not identifiers
        or len(identifiers) != checklist.metadata.checklist_size
        or len(identifiers) != checklist.metadata.provider_total
        or checklist.metadata.checklist_revision is None
    ):
        raise CardsUnavailable("Conflicting checklist baseline")
    return identifiers


def inventory_quantities(
    session, user_id: UUID, identifiers: set[str]
) -> dict[str, int]:
    if not identifiers:
        return {}
    return dict(
        session.execute(
            select(InventoryCopy.card_id, func.count(InventoryCopy.id))
            .where(
                InventoryCopy.user_id == user_id, InventoryCopy.card_id.in_(identifiers)
            )
            .group_by(InventoryCopy.card_id)
        ).all()
    )


def progress(checklist: SetChecklist, quantities: dict[str, int]) -> SetProgress:
    identifiers = membership(checklist)
    status = checklist.metadata.checklist_status
    values = dict(
        total=None, owned=None, missing=None, physical_copies=None, percentage=None
    )
    if status == "empty":
        values.update(total=0, owned=0, missing=0, physical_copies=0)
    elif status == "verified":
        owned = sum(quantities.get(card_id, 0) > 0 for card_id in identifiers)
        values.update(
            total=len(identifiers),
            owned=owned,
            missing=len(identifiers) - owned,
            physical_copies=sum(quantities.get(card_id, 0) for card_id in identifiers),
            percentage=float(
                (Decimal(owned * 100) / Decimal(len(identifiers))).quantize(
                    Decimal("0.01"), rounding=ROUND_HALF_UP
                )
            ),
        )
    return SetProgress(
        set_id=checklist.metadata.id,
        checklist_revision=checklist.metadata.checklist_revision,
        status=status,
        **values,
    )


def unavailable_progress(set_id: str) -> SetProgress:
    return SetProgress(
        set_id=set_id,
        checklist_revision=None,
        status="unavailable",
        total=None,
        owned=None,
        missing=None,
        physical_copies=None,
        percentage=None,
    )


def number_key(card: SetCard):
    tokens = tuple(
        (0, int(token)) if token.isdigit() else (1, token.casefold())
        for token in re.split(r"(\d+)", card.local_id)
        if token
    )
    return tokens, card.id


def card_page(
    checklist: SetChecklist,
    *,
    page: int,
    page_size: int,
    q: str = "",
    sort: ChecklistSort = "number",
    ownership: OwnershipFilter = "all",
    quantities: dict[str, int] | None = None,
) -> SetCardPage:
    membership(checklist)
    counts = quantities or {}
    query = q.strip().casefold()
    cards = [
        card
        for card in checklist.cards
        if (
            not query
            or query in card.name.casefold()
            or query in card.id.casefold()
            or query in card.local_id.casefold()
        )
        and (
            ownership == "all" or (counts.get(card.id, 0) > 0) == (ownership == "owned")
        )
    ]
    cards.sort(
        key=number_key
        if sort == "number"
        else lambda card: (card.name.casefold(), card.id)
    )
    start = (page - 1) * page_size
    return SetCardPage(
        set=checklist.metadata,
        results=cards[start : start + page_size],
        total=len(cards),
        page=page,
        page_size=page_size,
    )


def collection_page(
    checklist: SetChecklist, quantities: dict[str, int], **filters
) -> SetCollectionPage:
    result = card_page(checklist, quantities=quantities, **filters)
    visible = {card.id for card in result.results}
    return SetCollectionPage(
        **result.model_dump(),
        progress=progress(checklist, quantities),
        quantities={
            card_id: count
            for card_id, count in quantities.items()
            if card_id in visible
        },
    )
