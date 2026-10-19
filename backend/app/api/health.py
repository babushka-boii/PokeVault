from typing import Literal

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel

from app.db.health import SessionFactory, check_database

API_VERSION = "0.1.0"
router = APIRouter(prefix="/api/v1", tags=["health"])


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded"]
    api: Literal["healthy"]
    database: Literal["healthy", "unavailable"]
    version: str


def get_session_factory(request: Request) -> SessionFactory:
    return request.app.state.session_factory


@router.get("/health", response_model=HealthResponse)
def health(
    response: Response,
    session_factory: SessionFactory = Depends(get_session_factory),
) -> HealthResponse:
    database = check_database(session_factory)
    if database.status == "unavailable":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        overall: Literal["healthy", "degraded"] = "degraded"
    else:
        overall = "healthy"
    return HealthResponse(
        status=overall,
        api="healthy",
        database=database.status,
        version=API_VERSION,
    )
