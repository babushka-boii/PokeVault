"""All ownership predicates are derived from the existing authenticated session."""

from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import UUID4
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.cards import get_card_provider
from app.auth.sessions import require_csrf, require_current_user
from app.cards.provider import CardNotFound, CardProvider, CardsUnavailable
from app.cards.schemas import Identifier
from app.db.models import InventoryCopy, User
from app.inventory.schemas import (
    Condition,
    CopyAttributes,
    CreateCopy,
    InventoryPage,
    PhysicalLanguage,
)
from app.inventory.schemas import (
    InventoryCopy as PublicCopy,
)

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


def database(request: Request):
    try:
        with request.app.state.session_factory.begin() as session:
            yield session
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


def owned_copy(session, user: User, copy_id: UUID) -> InventoryCopy:
    record = session.scalar(
        select(InventoryCopy).where(
            InventoryCopy.id == copy_id,
            InventoryCopy.user_id == user.id,
        )
    )
    if record is None:
        raise HTTPException(404, detail="Copy not found")
    return record


@router.get("", response_model=InventoryPage)
def list_copies(
    user: User = Depends(require_current_user),
    session=Depends(database),
    offset: int = Query(0, ge=0, le=1000000),
    limit: int = Query(24, ge=1, le=100),
    card_id: Identifier | None = Query(None),
    language: PhysicalLanguage | None = Query(None),
    condition: Condition | None = Query(None),
):
    # Counts and rows must share a snapshot when another tab changes copies.
    if session.get_bind().dialect.name == "postgresql":
        session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
    predicates = [InventoryCopy.user_id == user.id]
    for column, value in (
        (InventoryCopy.card_id, card_id),
        (InventoryCopy.language, language),
        (InventoryCopy.condition, condition),
    ):
        if value is not None:
            predicates.append(column == value)
    quantities = dict(
        session.execute(
            select(InventoryCopy.card_id, func.count(InventoryCopy.id))
            .where(*predicates)
            .group_by(InventoryCopy.card_id)
        ).all()
    )
    records = session.scalars(
        select(InventoryCopy)
        .where(*predicates)
        .order_by(InventoryCopy.created_at.desc(), InventoryCopy.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return InventoryPage(
        results=[PublicCopy.model_validate(r) for r in records],
        total=sum(quantities.values()),
        quantities=quantities,
        offset=offset,
        limit=limit,
    )


@router.post("", response_model=PublicCopy, status_code=201)
async def add_copy(
    request: Request,
    payload: CreateCopy,
    user: User = Depends(require_csrf),
    session=Depends(database),
    provider: CardProvider = Depends(get_card_provider),
    idempotency_key: UUID4 | None = Header(None, alias="Idempotency-Key"),
):
    # The existing primary key supplies persistent, cross-process retry identity.
    # Namespace by the session owner: a key never identifies another user's copy.
    copy_id = (
        uuid5(user.id, f"inventory-create-v1:{idempotency_key}")
        if idempotency_key is not None
        else None
    )
    if copy_id is not None:
        existing = session.get(InventoryCopy, copy_id)
        if existing is not None:
            return replay_copy(existing, user, payload)
    try:
        # Validate catalog identity; requested physical language need not be one
        # of the two catalog text languages supported by the application.
        await provider.get_card(payload.card_id, "en")
    except CardNotFound:
        raise HTTPException(404, detail="Card not found") from None
    except CardsUnavailable:
        raise HTTPException(503, detail="Card catalog is unavailable") from None
    # A logout/expiry while the external catalog was pending invalidates the save.
    require_current_user(request)
    record = InventoryCopy(user_id=user.id, **payload.model_dump())
    if copy_id is None:
        session.add(record)
        session.flush()
    else:
        record.id = copy_id
        try:
            with session.begin_nested():
                session.add(record)
                session.flush()
        except IntegrityError:
            # A concurrent confirmation with the same key won the PK race.
            # The savepoint preserves this transaction for the owner/payload check.
            existing = session.get(InventoryCopy, copy_id)
            if existing is None:
                raise
            return replay_copy(existing, user, payload)
    result = PublicCopy.model_validate(record)
    session.commit()
    return result


def replay_copy(record: InventoryCopy, user: User, payload: CreateCopy) -> PublicCopy:
    if record.user_id != user.id or any(
        getattr(record, field) != value for field, value in payload.model_dump().items()
    ):
        raise HTTPException(409, detail="idempotency_conflict")
    return PublicCopy.model_validate(record)


@router.get("/{copy_id}", response_model=PublicCopy)
def get_copy(
    copy_id: UUID, user: User = Depends(require_current_user), session=Depends(database)
):
    return PublicCopy.model_validate(owned_copy(session, user, copy_id))


@router.put("/{copy_id}", response_model=PublicCopy)
def update_copy(
    copy_id: UUID,
    payload: CopyAttributes,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    record = owned_copy(session, user, copy_id)
    for name, value in payload.model_dump().items():
        setattr(record, name, value)
    session.flush()
    session.refresh(record)
    result = PublicCopy.model_validate(record)
    session.commit()
    return result


@router.delete("/{copy_id}", status_code=204)
def delete_copy(
    copy_id: UUID, user: User = Depends(require_csrf), session=Depends(database)
):
    session.delete(owned_copy(session, user, copy_id))
    session.commit()
    return Response(status_code=204)
