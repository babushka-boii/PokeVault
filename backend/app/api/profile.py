"""The trainer profile: sprite and team. The owner always comes from the session."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.api.inventory import database
from app.auth.sessions import require_csrf, require_current_user
from app.db.models import User, UserSettings

router = APIRouter(prefix="/api/v1/me", tags=["profile"])
TrainerId = Literal["mateo", "diego", "valentina", "camila"]
TEAM_MAX = 5
DEX_TOTAL = 1025


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trainer_id: TrainerId
    team: Annotated[
        list[Annotated[int, Field(strict=True, ge=1, le=DEX_TOTAL)]],
        Field(max_length=TEAM_MAX),
    ]

    @field_validator("team")
    @classmethod
    def no_duplicates(cls, team: list[int]) -> list[int]:
        if len(set(team)) != len(team):
            raise ValueError("A species can appear only once in the team")
        return team


class Profile(ProfileUpdate):
    member_since: date


def _profile(user: User, record: UserSettings | None) -> Profile:
    return Profile(
        trainer_id=record.trainer_id if record else "mateo",
        team=list(record.team) if record else [],
        member_since=user.created_at.date(),
    )


@router.get("/profile", response_model=Profile)
def read_profile(
    user: User = Depends(require_current_user), session=Depends(database)
) -> Profile:
    return _profile(user, session.get(UserSettings, user.id))


@router.put("/profile", response_model=Profile)
def update_profile(
    payload: ProfileUpdate,
    user: User = Depends(require_csrf),
    session=Depends(database),
) -> Profile:
    record = session.get(UserSettings, user.id)
    if record is None:  # sign-in normally creates it; tolerate older accounts
        record = UserSettings(user_id=user.id)
        session.add(record)
    record.trainer_id = payload.trainer_id
    record.team = list(payload.team)
    session.commit()
    return _profile(user, record)
