"""Owner-scoped binders of existing copies; no catalog requests or copy writes."""

from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.inventory import owned_copy
from app.auth.sessions import require_csrf, require_current_user
from app.binders.placement import (
    CAPACITY,
    MAX_PAGES,
    POCKETS_PER_PAGE,
    next_free,
    visible_pages,
)
from app.binders.schemas import (
    Appearance,
    BinderDetail,
    BindersPage,
    BinderSummary,
    CopyLocation,
    CopyLocations,
    CopyViewPage,
    CreateBinder,
    MovedFrom,
    OrderBinders,
    PlaceCopy,
    Pocket,
    Sticker,
    StoreResult,
    UpdateBinder,
    View,
)
from app.db.models import Binder, BinderPocket, BinderSticker, InventoryCopy, User
from app.inventory.schemas import InventoryCopy as PublicCopy

router = APIRouter(prefix="/api/v1/binders", tags=["binders"])

MAX_BINDERS = 100
PageNumber = Annotated[int, Path(ge=1, le=MAX_PAGES)]
PocketNumber = Annotated[int, Path(ge=1, le=POCKETS_PER_PAGE)]


def database(request: Request):
    try:
        with request.app.state.session_factory.begin() as session:
            yield session
    except IntegrityError:
        raise HTTPException(409, detail="binder_conflict") from None
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


def consistent_read(session):
    if session.get_bind().dialect.name == "postgresql":
        session.connection(execution_options={"isolation_level": "REPEATABLE READ"})


def lock_owner(session, user: User):
    # Every binder write takes this lock before reading mutable pocket/order state,
    # so concurrent stores and moves for one owner are serialized.
    if (
        session.scalar(select(User.id).where(User.id == user.id).with_for_update())
        is None
    ):
        raise HTTPException(404, detail="Binder not found")


def owned_binder(session, user: User, binder_id: UUID) -> Binder:
    record = session.scalar(
        select(Binder).where(Binder.id == binder_id, Binder.user_id == user.id)
    )
    if record is None:
        raise HTTPException(404, detail="Binder not found")
    return record


def _stats(session, user: User, binder_ids=None):
    query = (
        select(
            BinderPocket.binder_id,
            func.count(BinderPocket.copy_id),
            func.max(BinderPocket.page),
            func.max(BinderPocket.placed_at),
        )
        .where(BinderPocket.user_id == user.id)
        .group_by(BinderPocket.binder_id)
    )
    if binder_ids is not None:
        query = query.where(BinderPocket.binder_id.in_(binder_ids))
    return {row[0]: row[1:] for row in session.execute(query).all()}


def _stickers(session, user: User, binder_ids) -> dict[UUID, list[Sticker]]:
    """Every sticker of the owner's returned binders in one query, back to front."""
    rows = session.scalars(
        select(BinderSticker)
        .where(
            BinderSticker.user_id == user.id, BinderSticker.binder_id.in_(binder_ids)
        )
        .order_by(BinderSticker.binder_id, BinderSticker.display_order)
    ).all()
    grouped: dict[UUID, list[Sticker]] = {}
    for row in rows:
        grouped.setdefault(row.binder_id, []).append(
            Sticker.model_construct(
                kind=row.kind,
                species_id=row.species_id,
                pixel_key=row.pixel_key,
                x=float(row.x),
                y=float(row.y),
                rotation=float(row.rotation),
                scale=float(row.scale),
            )
        )
    return grouped


def _summary(binder: Binder, stats, stickers=None) -> BinderSummary:
    count, _, last = stats or (0, None, None)
    return BinderSummary.model_validate(binder).model_copy(
        update={
            "copy_count": count,
            "stickers": stickers or [],
            "last_placed_at": last,
        }
    )


def grow_pages(session, binder: Binder, max_page: int | None) -> None:
    """Placing a card never leaves it beyond the stored pages; they never shrink."""
    binder.page_count = max(binder.page_count, visible_pages(max_page))
    session.flush()


def listing(session, user: User) -> BindersPage:
    binders = session.scalars(
        select(Binder)
        .where(Binder.user_id == user.id)
        .order_by(Binder.display_order, Binder.id)
    ).all()
    stats = _stats(session, user)
    stickers = _stickers(session, user, [binder.id for binder in binders])
    return BindersPage(
        results=[
            _summary(binder, stats.get(binder.id), stickers.get(binder.id))
            for binder in binders
        ],
        total=len(binders),
    )


def detail(session, user: User, binder: Binder) -> BinderDetail:
    rows = session.execute(
        select(BinderPocket, InventoryCopy)
        .join(InventoryCopy, InventoryCopy.id == BinderPocket.copy_id)
        .where(
            BinderPocket.binder_id == binder.id,
            BinderPocket.user_id == user.id,
            InventoryCopy.user_id == user.id,
        )
        .order_by(BinderPocket.page, BinderPocket.pocket)
    ).all()
    summary = _summary(
        binder,
        _stats(session, user, [binder.id]).get(binder.id),
        _stickers(session, user, [binder.id]).get(binder.id),
    )
    return BinderDetail(
        **summary.model_dump(),
        pockets=[
            Pocket(
                page=pocket.page,
                pocket=pocket.pocket,
                copy=PublicCopy.model_validate(copy),
                placed_at=pocket.placed_at,
            )
            for pocket, copy in rows
        ],
    )


def current_pocket(session, user: User, copy_id: UUID) -> BinderPocket | None:
    return session.scalar(
        select(BinderPocket).where(
            BinderPocket.user_id == user.id, BinderPocket.copy_id == copy_id
        )
    )


def put_copy(
    session, user: User, binder: Binder, page: int, pocket: int, copy_id: UUID
) -> MovedFrom | None:
    """Insert or move the copy's single pocket row; return where it came from."""
    existing = current_pocket(session, user, copy_id)
    if existing is None:
        session.add(
            BinderPocket(
                user_id=user.id,
                binder_id=binder.id,
                page=page,
                pocket=pocket,
                copy_id=copy_id,
            )
        )
        session.flush()
        return None
    if (existing.binder_id, existing.page, existing.pocket) == (
        binder.id,
        page,
        pocket,
    ):
        return None
    origin = session.get(Binder, existing.binder_id)
    moved_from = MovedFrom(
        binder_id=existing.binder_id,
        binder_name=origin.name,
        page=existing.page,
        pocket=existing.pocket,
    )
    existing.binder_id = binder.id
    existing.page = page
    existing.pocket = pocket
    existing.placed_at = func.now()
    session.flush()
    return moved_from


def stored(session, user, binder, page, pocket, moved_from) -> StoreResult:
    session.expire_all()
    binder = owned_binder(session, user, binder.id)
    return StoreResult(
        page=page,
        pocket=pocket,
        moved_from=moved_from,
        binder=detail(session, user, binder),
    )


@router.get("", response_model=BindersPage)
def list_binders(user: User = Depends(require_current_user), session=Depends(database)):
    consistent_read(session)
    return listing(session, user)


@router.post("", response_model=BinderSummary, status_code=201)
def create_binder(
    payload: CreateBinder,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    count, maximum = session.execute(
        select(func.count(), func.max(Binder.display_order)).where(
            Binder.user_id == user.id
        )
    ).one()
    if count >= MAX_BINDERS:
        raise HTTPException(409, detail="binder_limit_reached")
    binder = Binder(
        user_id=user.id,
        display_order=0 if maximum is None else maximum + 1,
        **payload.model_dump(),
    )
    session.add(binder)
    session.flush()
    session.refresh(binder)
    result = _summary(binder, None)
    session.commit()
    return result


# Static paths precede /{binder_id}; "order", "views" and "locations" are not UUIDs.
@router.put("/order", response_model=BindersPage)
def reorder_binders(
    payload: OrderBinders,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    binders = session.scalars(select(Binder).where(Binder.user_id == user.id)).all()
    if len(payload.binder_ids) != len(binders) or set(payload.binder_ids) != {
        binder.id for binder in binders
    }:
        raise HTTPException(422, detail="Supply every owned binder exactly once")
    # Move every value above the current range first, keeping uniqueness valid.
    temporary_base = max((binder.display_order for binder in binders), default=-1) + 1
    for index, binder in enumerate(binders):
        binder.display_order = temporary_base + index
    session.flush()
    by_id = {binder.id: binder for binder in binders}
    for index, binder_id in enumerate(payload.binder_ids):
        by_id[binder_id].display_order = index
    session.flush()
    result = listing(session, user)
    session.commit()
    return result


@router.get("/views/{view}", response_model=CopyViewPage)
def copy_view(
    view: View,
    user: User = Depends(require_current_user),
    session=Depends(database),
    offset: int = Query(0, ge=0, le=1000000),
    limit: int = Query(30, ge=1, le=100),
):
    consistent_read(session)
    predicates = [InventoryCopy.user_id == user.id]
    if view == "unassigned":
        predicates.append(
            ~select(BinderPocket.copy_id)
            .where(
                BinderPocket.copy_id == InventoryCopy.id,
                BinderPocket.user_id == user.id,
            )
            .exists()
        )
    total = session.scalar(
        select(func.count()).select_from(InventoryCopy).where(*predicates)
    )
    ordering = [InventoryCopy.created_at.desc(), InventoryCopy.id.desc()]
    if view == "recent":
        ordering.insert(
            0,
            func.coalesce(
                InventoryCopy.acquired_on, func.date(InventoryCopy.created_at)
            ).desc(),
        )
    records = session.scalars(
        select(InventoryCopy)
        .where(*predicates)
        .order_by(*ordering)
        .offset(offset)
        .limit(limit)
    ).all()
    return CopyViewPage(
        results=[PublicCopy.model_validate(record) for record in records],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.get("/locations", response_model=CopyLocations)
def copy_locations(
    copy_id: Annotated[list[UUID], Query(min_length=1, max_length=100)],
    user: User = Depends(require_current_user),
    session=Depends(database),
):
    if len(set(copy_id)) != len(copy_id):
        raise HTTPException(422, detail="Supply unique copy identifiers")
    consistent_read(session)
    rows = session.execute(
        select(BinderPocket, Binder.name)
        .join(Binder, Binder.id == BinderPocket.binder_id)
        .where(
            BinderPocket.user_id == user.id,
            Binder.user_id == user.id,
            BinderPocket.copy_id.in_(copy_id),
        )
    ).all()
    by_copy = {pocket.copy_id: (pocket, name) for pocket, name in rows}
    return CopyLocations(
        results=[
            CopyLocation(
                copy_id=identifier,
                binder_id=by_copy[identifier][0].binder_id,
                binder_name=by_copy[identifier][1],
                page=by_copy[identifier][0].page,
                pocket=by_copy[identifier][0].pocket,
            )
            for identifier in copy_id
            if identifier in by_copy
        ]
    )


@router.get("/{binder_id}", response_model=BinderDetail)
def get_binder(
    binder_id: UUID,
    user: User = Depends(require_current_user),
    session=Depends(database),
):
    consistent_read(session)
    return detail(session, user, owned_binder(session, user, binder_id))


@router.put("/{binder_id}", response_model=BinderSummary)
def update_binder(
    binder_id: UUID,
    payload: UpdateBinder,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(binder, key, value)
    session.flush()
    session.refresh(binder)
    result = _summary(
        binder,
        _stats(session, user, [binder.id]).get(binder.id),
        _stickers(session, user, [binder.id]).get(binder.id),
    )
    session.commit()
    return result


@router.put("/{binder_id}/appearance", response_model=BinderSummary)
def save_appearance(
    binder_id: UUID,
    payload: Appearance,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    """Replace the cover and every sticker in one transaction (owner lock)."""
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    binder.cover = payload.cover
    session.execute(
        delete(BinderSticker).where(
            BinderSticker.binder_id == binder.id, BinderSticker.user_id == user.id
        )
    )
    session.flush()
    for order, sticker in enumerate(payload.stickers):
        session.add(
            BinderSticker(
                user_id=user.id,
                binder_id=binder.id,
                display_order=order,
                kind=sticker.kind,
                species_id=sticker.species_id,
                pixel_key=sticker.pixel_key,
                x=Decimal(str(sticker.x)),
                y=Decimal(str(sticker.y)),
                rotation=Decimal(str(sticker.rotation)),
                scale=Decimal(str(sticker.scale)),
            )
        )
    binder.updated_at = func.now()
    session.flush()
    session.refresh(binder)
    result = _summary(
        binder,
        _stats(session, user, [binder.id]).get(binder.id),
        _stickers(session, user, [binder.id]).get(binder.id),
    )
    session.commit()
    return result


@router.post("/{binder_id}/pages", response_model=BinderSummary)
def add_pages(
    binder_id: UUID,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    """Add two pages ("+ Agregar hojas"): even, saved when empty, never fewer."""
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    if binder.page_count >= MAX_PAGES:
        raise HTTPException(409, detail="binder_max_pages")
    binder.page_count = min(MAX_PAGES, binder.page_count + 2)
    session.flush()
    session.refresh(binder)
    result = _summary(
        binder,
        _stats(session, user, [binder.id]).get(binder.id),
        _stickers(session, user, [binder.id]).get(binder.id),
    )
    session.commit()
    return result


@router.delete("/{binder_id}", status_code=204)
def delete_binder(
    binder_id: UUID,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    session.delete(owned_binder(session, user, binder_id))
    session.commit()
    return Response(status_code=204)


@router.post("/{binder_id}/pockets", response_model=StoreResult)
def store_copy(
    binder_id: UUID,
    payload: PlaceCopy,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    """Store a copy in the lowest free pocket (chosen under the owner lock)."""
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    owned_copy(session, user, payload.copy_id)
    existing = current_pocket(session, user, payload.copy_id)
    if existing is not None and existing.binder_id == binder.id:
        result = stored(session, user, binder, existing.page, existing.pocket, None)
        session.commit()
        return result
    occupied = set(
        session.execute(
            select(BinderPocket.page, BinderPocket.pocket).where(
                BinderPocket.binder_id == binder.id, BinderPocket.user_id == user.id
            )
        ).all()
    )
    target = next_free(occupied) if len(occupied) < CAPACITY else None
    if target is None:
        raise HTTPException(409, detail="binder_full")
    moved_from = put_copy(session, user, binder, *target, payload.copy_id)
    grow_pages(session, binder, target[0])
    result = stored(session, user, binder, *target, moved_from)
    session.commit()
    return result


@router.put("/{binder_id}/pockets/{page}/{pocket}", response_model=StoreResult)
def place_copy(
    binder_id: UUID,
    page: PageNumber,
    pocket: PocketNumber,
    payload: PlaceCopy,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    """Place or move a copy into one pocket; an occupied pocket is never swapped."""
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    owned_copy(session, user, payload.copy_id)
    occupant = session.get(BinderPocket, (binder.id, page, pocket))
    if occupant is not None and occupant.copy_id != payload.copy_id:
        raise HTTPException(409, detail="pocket_occupied")
    moved_from = put_copy(session, user, binder, page, pocket, payload.copy_id)
    grow_pages(session, binder, page)
    result = stored(session, user, binder, page, pocket, moved_from)
    session.commit()
    return result


@router.delete("/{binder_id}/pockets/{page}/{pocket}", status_code=204)
def remove_copy(
    binder_id: UUID,
    page: PageNumber,
    pocket: PocketNumber,
    copy_id: UUID = Query(...),
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    binder = owned_binder(session, user, binder_id)
    placement = session.get(BinderPocket, (binder.id, page, pocket))
    if placement is not None:
        if placement.copy_id != copy_id:
            raise HTTPException(409, detail="pocket_changed")
        session.delete(placement)
    session.commit()
    return Response(status_code=204)
