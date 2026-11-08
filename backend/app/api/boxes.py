"""Owner-scoped arrangements of existing copies; no catalog requests or copy writes."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.api.inventory import owned_copy
from app.auth.sessions import require_csrf, require_current_user
from app.boxes.schemas import (
    BoxDetail,
    BoxesPage,
    BoxSlot,
    BoxSummary,
    CopyViewPage,
    CreateBox,
    OrderBoxes,
    PlaceCopy,
    UpdateBox,
)
from app.db.models import BoxMembership, InventoryCopy, PersonalBox, User
from app.inventory.schemas import InventoryCopy as PublicCopy

router = APIRouter(prefix="/api/v1/boxes", tags=["boxes"])


def database(request: Request):
    try:
        with request.app.state.session_factory.begin() as session:
            yield session
    except IntegrityError:
        raise HTTPException(409, detail="box_conflict") from None
    except SQLAlchemyError:
        raise HTTPException(503, detail="database_unavailable") from None


def consistent_read(session):
    if session.get_bind().dialect.name == "postgresql":
        session.connection(execution_options={"isolation_level": "REPEATABLE READ"})


def lock_owner(session, user: User):
    # Every box write takes this lock before reading mutable placement/order state.
    # Distinct boxes for one owner therefore cannot race to claim a single copy.
    if (
        session.scalar(select(User.id).where(User.id == user.id).with_for_update())
        is None
    ):
        raise HTTPException(404, detail="Box not found")


def owned_box(session, user: User, box_id: UUID) -> PersonalBox:
    record = session.scalar(
        select(PersonalBox).where(
            PersonalBox.id == box_id, PersonalBox.user_id == user.id
        )
    )
    if record is None:
        raise HTTPException(404, detail="Box not found")
    return record


def summary(session, box: PersonalBox) -> BoxSummary:
    count = session.scalar(
        select(func.count())
        .select_from(BoxMembership)
        .where(BoxMembership.box_id == box.id, BoxMembership.user_id == box.user_id)
    )
    return BoxSummary.model_validate(box).model_copy(update={"copy_count": count})


def listing(session, user: User) -> BoxesPage:
    rows = session.execute(
        select(PersonalBox, func.count(BoxMembership.copy_id))
        .outerjoin(BoxMembership, BoxMembership.box_id == PersonalBox.id)
        .where(PersonalBox.user_id == user.id)
        .group_by(PersonalBox.id)
        .order_by(PersonalBox.display_order, PersonalBox.id)
    ).all()
    return BoxesPage(
        results=[
            BoxSummary.model_validate(box).model_copy(update={"copy_count": count})
            for box, count in rows
        ],
        total=len(rows),
    )


def detail(session, box: PersonalBox) -> BoxDetail:
    rows = session.execute(
        select(BoxMembership.position, InventoryCopy)
        .join(InventoryCopy, InventoryCopy.id == BoxMembership.copy_id)
        .where(BoxMembership.box_id == box.id, BoxMembership.user_id == box.user_id)
        .order_by(BoxMembership.position)
    ).all()
    return BoxDetail(
        **BoxSummary.model_validate(box).model_dump(exclude={"copy_count"}),
        copy_count=len(rows),
        slots=[
            BoxSlot(position=position, copy=PublicCopy.model_validate(copy))
            for position, copy in rows
        ],
    )


@router.get("", response_model=BoxesPage)
def list_boxes(user: User = Depends(require_current_user), session=Depends(database)):
    return listing(session, user)


@router.post("", response_model=BoxSummary, status_code=201)
def create_box(
    payload: CreateBox,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    count, maximum = session.execute(
        select(func.count(), func.max(PersonalBox.display_order)).where(
            PersonalBox.user_id == user.id
        )
    ).one()
    if count >= 100:
        raise HTTPException(409, detail="box_limit_reached")
    box = PersonalBox(
        user_id=user.id,
        display_order=0 if maximum is None else maximum + 1,
        **payload.model_dump(),
    )
    session.add(box)
    session.flush()
    result = BoxSummary.model_validate(box)
    session.commit()
    return result


# Static paths precede /{box_id}; "order" and "views" are never parsed as UUIDs.
@router.put("/order", response_model=BoxesPage)
def reorder_boxes(
    payload: OrderBoxes,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    boxes = session.scalars(
        select(PersonalBox).where(PersonalBox.user_id == user.id)
    ).all()
    if len(payload.box_ids) != len(boxes) or set(payload.box_ids) != {
        box.id for box in boxes
    }:
        raise HTTPException(422, detail="Supply every owned box exactly once")
    # Move all values above the current range before swapping the final values.
    # Immediate unique constraints remain valid throughout both flushes.
    temporary_base = max((box.display_order for box in boxes), default=-1) + 1
    for index, box in enumerate(boxes):
        box.display_order = temporary_base + index
    session.flush()
    by_id = {box.id: box for box in boxes}
    for index, box_id in enumerate(payload.box_ids):
        by_id[box_id].display_order = index
    session.flush()
    result = listing(session, user)
    session.commit()
    return result


@router.get("/views/{view}", response_model=CopyViewPage)
def copy_view(
    view: Literal["owned", "unassigned", "recent"],
    user: User = Depends(require_current_user),
    session=Depends(database),
    offset: int = Query(0, ge=0, le=1000000),
    limit: int = Query(30, ge=1, le=100),
):
    consistent_read(session)
    predicates = [InventoryCopy.user_id == user.id]
    if view == "unassigned":
        predicates.append(
            ~select(BoxMembership.copy_id)
            .where(
                BoxMembership.copy_id == InventoryCopy.id,
                BoxMembership.user_id == user.id,
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


@router.get("/{box_id}", response_model=BoxDetail)
def get_box(
    box_id: UUID,
    user: User = Depends(require_current_user),
    session=Depends(database),
):
    consistent_read(session)
    return detail(session, owned_box(session, user, box_id))


@router.put("/{box_id}", response_model=BoxSummary)
def update_box(
    box_id: UUID,
    payload: UpdateBox,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    box = owned_box(session, user, box_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(box, key, value)
    session.flush()
    session.refresh(box)
    result = summary(session, box)
    session.commit()
    return result


@router.delete("/{box_id}", status_code=204)
def delete_box(
    box_id: UUID,
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    session.delete(owned_box(session, user, box_id))
    session.commit()
    return Response(status_code=204)


@router.put("/{box_id}/slots/{position}", response_model=BoxDetail)
def place_copy(
    box_id: UUID,
    payload: PlaceCopy,
    position: int = Path(ge=0, le=29),
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    box = owned_box(session, user, box_id)
    owned_copy(session, user, payload.copy_id)
    occupant = session.get(BoxMembership, (box_id, position))
    if occupant is not None and occupant.copy_id != payload.copy_id:
        raise HTTPException(409, detail="box_slot_occupied")
    if occupant is None:
        placement = session.scalar(
            select(BoxMembership).where(
                BoxMembership.user_id == user.id,
                BoxMembership.copy_id == payload.copy_id,
            )
        )
        if placement is None:
            session.add(
                BoxMembership(
                    user_id=user.id,
                    box_id=box_id,
                    position=position,
                    copy_id=payload.copy_id,
                )
            )
        else:
            placement.box_id = box_id
            placement.position = position
        session.flush()
    result = detail(session, box)
    session.commit()
    return result


@router.delete("/{box_id}/slots/{position}", status_code=204)
def remove_copy(
    box_id: UUID,
    position: int = Path(ge=0, le=29),
    copy_id: UUID = Query(...),
    user: User = Depends(require_csrf),
    session=Depends(database),
):
    lock_owner(session, user)
    owned_box(session, user, box_id)
    placement = session.get(BoxMembership, (box_id, position))
    if placement is not None:
        if placement.copy_id != copy_id:
            raise HTTPException(409, detail="box_slot_changed")
        session.delete(placement)
    session.commit()
    return Response(status_code=204)
