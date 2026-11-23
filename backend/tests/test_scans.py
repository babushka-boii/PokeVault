"""Scanner HTTP boundaries: private, stateless and bounded."""

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from starlette.requests import Request
from test_inventory import identity
from test_inventory import inventory as inventory

from app.core.config import Settings
from app.db.models import InventoryCopy
from app.main import create_app
from app.scanner.schemas import (
    MAX_UPLOAD_BYTES,
    MatchResult,
    OCRResult,
    ScanCapabilities,
    ScanClues,
)


def test_scanner_rejects_missing_session_before_processing():
    app = create_app(
        Settings(
            DATABASE_URL="postgresql+psycopg://test:test@localhost/test", _env_file=None
        )
    )
    with TestClient(app) as client:
        for path in ("recognize", "match"):
            response = client.post(f"/api/v1/scans/{path}", content=b"private image")
            assert response.status_code == 401
            assert response.headers["cache-control"] == "no-store"


def test_scanner_capabilities_are_private():
    app = create_app(
        Settings(
            DATABASE_URL="postgresql+psycopg://test:test@localhost/test", _env_file=None
        )
    )
    with TestClient(app) as client:
        assert client.get("/api/v1/scans/capabilities").status_code == 401


@pytest.fixture
def scanner(inventory):
    from app.api.scans import get_matcher

    client, factory = inventory

    class OCR:
        async def capabilities(self):
            return ScanCapabilities(
                available=True,
                languages=["eng", "spa"],
                formats=["image/jpeg", "image/png", "image/webp"],
            )

        async def recognize(self, data, content_type):
            return OCRResult(
                clues=ScanClues(name="Pikachu", local_number="025", printed_total=198),
                engine_languages=["eng", "spa"],
            )

    async def matcher(provider, payload):
        return MatchResult(clues=payload.clues, status="no_match")

    client.app.state.ocr_service = OCR()
    client.app.dependency_overrides[get_matcher] = lambda: matcher
    return client, factory


def test_recognition_extracts_clues_but_does_not_create_inventory(scanner):
    client, factory = scanner
    response = client.post(
        "/api/v1/scans/recognize?language=en",
        content=b"fixture",
        headers={**identity(client, "ash"), "Content-Type": "image/png"},
    )
    assert response.status_code == 200
    assert response.json()["clues"]["local_number"] == "025"
    assert response.json()["engine_languages"] == ["eng", "spa"]
    assert "raw_text" not in response.text
    assert response.headers["cache-control"] == "no-store"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(InventoryCopy)) == 0


@pytest.mark.parametrize("name,status", [(None, 401), ("expired", 401), ("ash", 403)])
def test_scanner_authentication_and_csrf_precede_private_processing(
    scanner, name, status
):
    client, _ = scanner
    identity(client, name)
    for route in ("recognize", "match"):
        response = client.post(
            f"/api/v1/scans/{route}", content=b"private malformed bytes"
        )
        assert response.status_code == status
        assert response.headers["cache-control"] == "no-store"


def test_capabilities_and_manual_matching_work_without_ocr(scanner, tmp_path):
    from app.scanner.ocr import OCRService

    client, _ = scanner

    client.app.state.ocr_service = OCRService(
        tesseract_command=str(tmp_path / "absent-engine")
    )
    headers = identity(client, "ash")
    assert client.get("/api/v1/scans/capabilities").json()["available"] is False
    result = client.post(
        "/api/v1/scans/recognize",
        content=b"fixture",
        headers={**headers, "Content-Type": "image/jpeg"},
    )
    assert result.status_code == 503
    assert result.json() == {"detail": "ocr_unavailable"}
    manual = client.post(
        "/api/v1/scans/match", json={"clues": {"name": "Pikachu"}}, headers=headers
    )
    assert manual.status_code == 200
    assert manual.json()["clues"]["name"] == "Pikachu"


def test_started_app_reports_installed_native_ocr_capabilities(scanner):
    import shutil

    from app.scanner.ocr import OCRService

    if not shutil.which("tesseract"):
        pytest.skip("Optional native Tesseract executable unavailable")
    client, _ = scanner
    client.app.state.ocr_service = OCRService()
    identity(client, "ash")
    response = client.get("/api/v1/scans/capabilities")
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert set(response.json()["languages"]) <= {"eng", "spa"}
    assert response.json()["languages"]
    assert {"image/jpeg", "image/png"} <= set(response.json()["formats"])
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "body,content_type,status",
    [
        (b"", "image/png", 422),
        (b"a" * (MAX_UPLOAD_BYTES + 1), "image/png", 413),
        (b"GIF89a", "image/gif", 415),
        (b"private", "image/tiff", 415),
        (b"https://example.test/private.jpg", "text/plain", 415),
    ],
)
def test_upload_envelope_rejects_invalid_inputs(scanner, body, content_type, status):
    client, _ = scanner
    response = client.post(
        "/api/v1/scans/recognize",
        content=body,
        headers={**identity(client, "ash"), "Content-Type": content_type},
    )
    assert response.status_code == status
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "payload",
    [
        {"clues": {"name": "x" * 101}},
        {"clues": {"local_number": "x" * 21}},
        {"clues": {"printed_total": True}},
        {"clues": {"printed_total": 0}},
        {"clues": {"printed_total": 2001}},
        {"clues": {"set_id": "../private"}},
        {"clues": {"name": "a\u0000b"}},
        {"clues": {"user_id": "forged"}},
        {"clues": {}, "image_url": "https://example.test"},
        {"clues": {}, "language": "xx"},
    ],
)
def test_corrected_clues_are_bounded_and_validation_never_echoes_input(
    scanner, payload
):
    client, _ = scanner
    response = client.post(
        "/api/v1/scans/match", json=payload, headers=identity(client, "ash")
    )
    assert response.status_code == 422
    assert response.json() == {"detail": "invalid_clues"}


def test_manual_search_body_is_bounded_before_json_parsing(scanner):
    client, _ = scanner
    response = client.post(
        "/api/v1/scans/match",
        content=b" " * 4097,
        headers={**identity(client, "ash"), "Content-Type": "application/json"},
    )
    assert response.status_code == 413


def test_provider_failure_is_sanitized_and_does_not_write(scanner):
    from app.api.scans import get_matcher
    from app.cards.provider import CardsUnavailable

    client, _ = scanner

    async def unavailable(*args):
        raise CardsUnavailable("private internal URL")

    client.app.dependency_overrides[get_matcher] = lambda: unavailable
    response = client.post(
        "/api/v1/scans/match",
        json={"clues": {"name": "Pikachu"}},
        headers=identity(client, "ash"),
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "provider_unavailable"}
    assert client.get("/api/v1/inventory").json()["total"] == 0


@pytest.mark.parametrize(
    "code,status",
    [("ocr_timeout", 504), ("invalid_image", 422), ("ocr_unavailable", 503)],
)
def test_ocr_failures_are_sanitized(scanner, code, status):
    from app.scanner.errors import ScanError

    client, _ = scanner

    async def fail(*args):
        raise ScanError(code, status)

    client.app.state.ocr_service.recognize = fail
    response = client.post(
        "/api/v1/scans/recognize",
        content=b"fixture",
        headers={**identity(client, "ash"), "Content-Type": "image/png"},
    )
    assert response.status_code == status
    assert response.json() == {"detail": code}


def test_disconnect_cancels_the_underlying_work():
    from app.api.scans import while_connected

    async def scenario():
        started, canceled = asyncio.Event(), asyncio.Event()

        async def receive():
            await started.wait()
            return {"type": "http.disconnect"}

        async def work():
            try:
                started.set()
                await asyncio.Event().wait()
            finally:
                canceled.set()

        request = Request({"type": "http"}, receive)
        with pytest.raises(HTTPException) as failure:
            await while_connected(request, work())
        assert failure.value.status_code == 499
        assert canceled.is_set()

    asyncio.run(scenario())


def test_stream_limit_ignores_forged_small_content_length():
    from app.api.scans import read_body

    async def scenario():
        chunks = iter(
            [
                {"type": "http.request", "body": b"x" * 4, "more_body": True},
                {"type": "http.request", "body": b"x" * 5, "more_body": False},
            ]
        )

        async def receive():
            return next(chunks)

        request = Request(
            {"type": "http", "headers": [(b"content-length", b"1")]}, receive
        )
        with pytest.raises(HTTPException) as failure:
            await read_body(request, 8)
        assert failure.value.status_code == 413

    asyncio.run(scenario())


def test_capability_inspection_respects_process_capacity(scanner):
    client, _ = scanner
    identity(client, "ash")
    client.app.state.scan_match_slots = asyncio.Semaphore(0)
    response = client.get("/api/v1/scans/capabilities")
    assert response.status_code == 429
    assert response.headers["retry-after"] == "2"


def test_upload_capacity_is_rejected_before_retaining_more_photos(scanner):
    client, _ = scanner
    client.app.state.scan_upload_slots = asyncio.Semaphore(0)
    response = client.post(
        "/api/v1/scans/recognize",
        content=b"private",
        headers={**identity(client, "ash"), "Content-Type": "image/png"},
    )
    assert response.status_code == 429
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("mime", ["image/heic", "image/heif"])
def test_native_heif_http_recognition_requires_no_manual_conversion(scanner, mime):
    import io
    from pathlib import Path

    from PIL import Image

    from app.scanner.heif import register_heif
    from app.scanner.ocr import OCRService

    client, factory = scanner
    assert register_heif()
    source = (
        Path(__file__).resolve().parents[2] / "research/scanner/samples/upright-en.png"
    )
    with Image.open(source) as image:
        encoded = io.BytesIO()
        image.save(encoded, format="HEIF", quality=100)
    client.app.state.ocr_service = OCRService()
    headers = {**identity(client, "ash"), "Content-Type": mime}
    response = client.post(
        "/api/v1/scans/recognize?language=en",
        content=encoded.getvalue(),
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["clues"]["name"] == "Pikachu"
    assert response.json()["clues"]["local_number"] == "025"
    assert response.json()["clues"]["printed_total"] == 165
    assert response.headers["cache-control"] == "no-store"
    with factory() as session:
        assert session.scalar(select(func.count()).select_from(InventoryCopy)) == 0
    corrupt = client.post(
        "/api/v1/scans/recognize", content=b"private invalid image", headers=headers
    )
    assert corrupt.status_code == 422
    assert "private invalid image" not in corrupt.text
