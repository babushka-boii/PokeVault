from collections.abc import Callable
from contextlib import AbstractContextManager
from typing import Literal

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

SessionFactory = Callable[[], AbstractContextManager[Session]]


class DatabaseHealth(BaseModel):
    status: Literal["healthy", "unavailable"]


def check_database(session_factory: SessionFactory) -> DatabaseHealth:
    try:
        with session_factory() as session:
            session.execute(text("SELECT 1"))
    except Exception:
        return DatabaseHealth(status="unavailable")
    return DatabaseHealth(status="healthy")
