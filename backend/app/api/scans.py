"""Private, stateless scanner operations; creation stays in the inventory API."""

import asyncio
from collections.abc import Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import ValidationError
from starlette.requests import ClientDisconnect

from app.api.cards import get_card_provider
from app.auth.sessions import require_csrf, require_current_user
from app.cards.provider import CardProvider, CardsUnavailable, SetNotFound
from app.cards.schemas import Language
from app.db.models import User
from app.scanner.errors import ScanError
from app.scanner.images import supported_formats
from app.scanner.matching import match_candidates
from app.scanner.ocr import OCRService
from app.scanner.schemas import (
    MAX_UPLOAD_BYTES,
    MatchRequest,
    MatchResult,
    RecognizeResult,
    ScanCapabilities,
)

router = APIRouter(prefix="/api/v1/scans", tags=["scanner"])
Matcher = Callable[[CardProvider, MatchRequest], Awaitable[MatchResult]]


def get_ocr(request: Request) -> OCRService:
    return request.app.state.ocr_service


def get_matcher() -> Matcher:
    return match_candidates


@asynccontextmanager
async def capacity(slots: asyncio.Semaphore):
    # No unbounded queue of retained uploads or corrected private clues.
    if slots.locked():
        raise HTTPException(429, detail="scanner_busy", headers={"Retry-After": "2"})
    async with slots:
        yield


async def read_body(request: Request, limit: int) -> bytes:
    length = request.headers.get("content-length")
    if length is not None:
        if not length.isascii() or not length.isdigit():
            raise HTTPException(422, detail="invalid_upload")
        if len(length) > 10 or int(length) > limit:
            raise HTTPException(413, detail="upload_too_large")
    if request.headers.get("content-encoding", "identity").lower() != "identity":
        raise HTTPException(415, detail="unsupported_image")
    body = bytearray()
    try:
        async with asyncio.timeout(10):
            async for chunk in request.stream():
                if len(body) + len(chunk) > limit:
                    raise HTTPException(413, detail="upload_too_large")
                body.extend(chunk)
    except TimeoutError:
        raise HTTPException(408, detail="upload_timeout") from None
    except ClientDisconnect:
        raise HTTPException(499, detail="request_cancelled") from None
    if not body:
        raise HTTPException(422, detail="empty_upload")
    return bytes(body)


async def while_connected[T](request: Request, operation: Awaitable[T]) -> T:
    """An aborted fetch must terminate the OCR child, not just hide its response."""

    async def disconnected():
        while True:
            message = await request.receive()
            if message["type"] == "http.disconnect":
                return

    work = asyncio.create_task(operation)
    watcher = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait(
            (work, watcher), return_when=asyncio.FIRST_COMPLETED
        )
        if watcher in done:
            raise HTTPException(499, detail="request_cancelled")
        return await work
    finally:
        work.cancel()
        watcher.cancel()
        await asyncio.gather(work, watcher, return_exceptions=True)


async def identify(provider: CardProvider, matcher: Matcher, payload: MatchRequest):
    try:
        async with asyncio.timeout(20):
            return await matcher(provider, payload)
    except SetNotFound:
        raise HTTPException(404, detail="set_not_found") from None
    except CardsUnavailable, TimeoutError:
        raise HTTPException(503, detail="provider_unavailable") from None


@router.get("/capabilities", response_model=ScanCapabilities)
async def capabilities(
    request: Request,
    user: User = Depends(require_current_user),
    ocr: OCRService = Depends(get_ocr),
):
    async with capacity(request.app.state.scan_match_slots):
        return await while_connected(request, ocr.capabilities())


@router.post("/match", response_model=MatchResult)
async def match(
    request: Request,
    user: User = Depends(require_csrf),
    provider: CardProvider = Depends(get_card_provider),
    matcher: Matcher = Depends(get_matcher),
):
    async with capacity(request.app.state.scan_match_slots):
        if (
            request.headers.get("content-type", "").split(";")[0].lower()
            != "application/json"
        ):
            raise HTTPException(415, detail="invalid_content_type")
        body = await read_body(request, 4096)
        try:
            payload = MatchRequest.model_validate_json(body)
        except ValidationError:
            # Default validation errors echo input; keep private OCR clues private.
            raise HTTPException(422, detail="invalid_clues") from None
        result = await while_connected(request, identify(provider, matcher, payload))
        require_current_user(request)
        return result


@router.post("/recognize", response_model=RecognizeResult)
async def recognize(
    request: Request,
    language: Language = Query("es"),
    user: User = Depends(require_csrf),
    ocr: OCRService = Depends(get_ocr),
    provider: CardProvider = Depends(get_card_provider),
    matcher: Matcher = Depends(get_matcher),
):
    async with capacity(request.app.state.scan_upload_slots):
        content_type = request.headers.get("content-type", "").split(";")[0].lower()
        if content_type not in supported_formats():
            raise HTTPException(415, detail="unsupported_image")
        body = await read_body(request, MAX_UPLOAD_BYTES)

        async def process():
            try:
                ocr_result = await ocr.recognize(body, content_type)
            except ScanError as error:
                raise HTTPException(error.status, detail=error.code) from None
            result = await identify(
                provider,
                matcher,
                MatchRequest(clues=ocr_result.clues, language=language),
            )
            return RecognizeResult(
                **result.model_dump(exclude={"warnings"}),
                warnings=list(dict.fromkeys([*ocr_result.warnings, *result.warnings]))[
                    :16
                ],
                engine_languages=ocr_result.engine_languages,
            )

        result = await while_connected(request, process())
        require_current_user(request)
        return result
