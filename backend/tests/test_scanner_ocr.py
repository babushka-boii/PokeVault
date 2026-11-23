"""Exercise image boundaries and real subprocess lifecycles without private images."""

import asyncio
import io
import os
import struct
import subprocess
import sys
import textwrap
import time
import zlib
from contextlib import suppress
from pathlib import Path

import pytest
from PIL import Image, PngImagePlugin

from app.scanner import images
from app.scanner.errors import ScanError
from app.scanner.extraction import normalize_text
from app.scanner.ocr import OCRService


def image_bytes(mode="PNG", size=(300, 420), **kwargs):
    stream = io.BytesIO()
    Image.new("RGB", size, "white").save(stream, format=mode, **kwargs)
    return stream.getvalue()


@pytest.mark.parametrize(
    ("data", "mime", "code", "status"),
    [
        (b"", "image/png", "empty_image", 422),
        (b"x" * (8 * 1024 * 1024 + 1), "image/png", "image_too_large", 413),
        (b"not an image", "image/gif", "unsupported_image_type", 415),
        (b"not an image", "image/png", "invalid_image", 422),
        (image_bytes(), "image/jpeg", "image_type_mismatch", 415),
    ],
    ids=["empty", "oversize", "gif", "corrupt", "mime-mismatch"],
)
def test_rejects_invalid_uploads_before_native_ocr(data, mime, code, status):
    with pytest.raises(ScanError) as caught:
        images.normalize_image(data, mime)
    assert (caught.value.code, caught.value.status) == (code, status)


@pytest.mark.parametrize("size", [(8193, 1), (5000, 4000)])
def test_rejects_excessive_decoded_dimensions(size):
    with pytest.raises(ScanError) as caught:
        images.normalize_image(image_bytes(size=size), "image/png")
    assert caught.value.code == "image_dimensions_exceeded"


def test_rejects_decompression_bomb_headers_before_pixel_allocation():
    encoded = bytearray(image_bytes(size=(1, 1)))
    encoded[16:24] = struct.pack(">II", 100_000, 100_000)
    encoded[29:33] = struct.pack(">I", zlib.crc32(encoded[12:29]))
    with pytest.raises(ScanError) as caught:
        images.normalize_image(bytes(encoded), "image/png")
    assert caught.value.code == "image_dimensions_exceeded"


def test_rejects_animated_png():
    stream = io.BytesIO()
    Image.new("RGB", (40, 60), "white").save(
        stream,
        format="PNG",
        save_all=True,
        append_images=[Image.new("RGB", (40, 60), "black")],
        duration=100,
    )
    with pytest.raises(ScanError) as caught:
        images.normalize_image(stream.getvalue(), "image/png")
    assert caught.value.code == "animated_image"


def test_preprocessing_respects_exif_orientation_and_discards_metadata():
    exif = Image.Exif()
    exif[274] = 6
    exif[270] = "PRIVATE GPS-LIKE DESCRIPTION"
    result = images.normalize_image(
        image_bytes("JPEG", (40, 20), exif=exif), "image/jpeg"
    )
    assert result.size == (20, 40)
    assert result.mode == "L"
    assert not result.getexif()
    assert not result.info


def test_preprocessing_bounds_normalized_pixels_and_removes_png_text():
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("private", "PRIVATE TEXT")
    result = images.normalize_image(
        image_bytes(size=(3000, 2000), pnginfo=metadata), "image/png"
    )
    assert result.size == (2048, 1365)
    assert not result.info


def fake_engine(tmp_path: Path, behavior="ok") -> Path:
    executable = tmp_path / "tesseract-test"
    executable.write_text(
        f"#!{os.path.realpath(sys.executable)}\n"
        + textwrap.dedent(f"""\
        import os, subprocess, sys, time
        if os.environ.get('OMP_THREAD_LIMIT') != '1':
            sys.exit(8)
        if '--list-langs' in sys.argv:
            print('List of available languages (2):\\neng\\nspa')
            sys.exit(0)
        behavior = {behavior!r}
        if behavior == 'slow':
            child = subprocess.Popen([
                sys.executable, '-c', 'import time; time.sleep(60)'
            ])
            with open({str(tmp_path / "child.pid")!r}, 'w') as handle:
                handle.write(str(child.pid))
            time.sleep(60)
        if behavior == 'failure':
            print('PRIVATE OCR/path/secret', file=sys.stderr)
            sys.exit(1)
        if behavior == 'flood':
            print('X' * 400000)
            sys.exit(0)
        print('level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext')
        print('5\\t1\\t1\\t1\\t1\\t1\\t20\\t20\\t100\\t25\\t95\\tPikachu')
        print('5\\t1\\t2\\t1\\t1\\t1\\t20\\t380\\t100\\t25\\t95\\t025/198')
        """),
        encoding="utf-8",
    )
    executable.chmod(0o700)
    return executable


def test_capabilities_reports_real_engine_language_subset_and_formats(tmp_path):
    result = asyncio.run(
        OCRService(tesseract_command=str(fake_engine(tmp_path))).capabilities()
    )
    assert result.available
    assert result.languages == ["eng", "spa"]
    assert {"image/jpeg", "image/png"}.issubset(result.formats)
    assert result.max_upload_bytes == 8 * 1024 * 1024


def test_missing_engine_is_a_sanitized_manual_fallback(tmp_path):
    service = OCRService(tesseract_command=str(tmp_path / "absent"))
    result = asyncio.run(service.capabilities())
    assert not result.available
    assert result.languages == []
    with pytest.raises(ScanError) as caught:
        asyncio.run(service.recognize(image_bytes(), "image/png"))
    assert (caught.value.code, caught.value.status) == ("ocr_unavailable", 503)


def test_worker_returns_clues_and_always_cleans_parent_temp_directory(tmp_path):
    temp_root = tmp_path / "scans"
    temp_root.mkdir()
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path)), temp_root=temp_root
    )
    result = asyncio.run(service.recognize(image_bytes(), "image/png"))
    assert result.clues.name == "Pikachu"
    assert result.clues.local_number == "025"
    assert result.clues.printed_total == 198
    assert result.engine_languages == ["eng", "spa"]
    assert not list(temp_root.iterdir())
    assert "PRIVATE" not in result.model_dump_json()


@pytest.mark.parametrize("behavior", ["failure", "flood"])
def test_engine_failure_and_excessive_output_are_bounded_and_sanitized(
    tmp_path, behavior
):
    temp_root = tmp_path / "scans"
    temp_root.mkdir()
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path, behavior)), temp_root=temp_root
    )
    with pytest.raises(ScanError) as caught:
        asyncio.run(service.recognize(image_bytes(), "image/png"))
    assert caught.value.status == 503
    assert "PRIVATE" not in str(caught.value)
    assert str(tmp_path) not in str(caught.value)
    assert not list(temp_root.iterdir())


def test_hard_worker_deadline_stops_native_descendants_and_cleans_temp(tmp_path):
    temp_root = tmp_path / "scans"
    temp_root.mkdir()
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path, "slow")),
        temp_root=temp_root,
        worker_timeout=0.4,
    )
    with pytest.raises(ScanError) as caught:
        asyncio.run(service.recognize(image_bytes(), "image/png"))
    assert (caught.value.code, caught.value.status) == ("ocr_timeout", 504)
    assert not list(temp_root.iterdir())
    assert_process_stopped(int((tmp_path / "child.pid").read_text()))


def assert_process_stopped(pid):
    try:
        for _ in range(100):
            state = subprocess.run(
                ["ps", "-o", "stat=", "-p", str(pid)],
                capture_output=True,
                text=True,
                check=False,
            ).stdout.strip()
            if not state or state.startswith("Z"):
                return
            time.sleep(0.01)
        pytest.fail("native descendant continued running after OCR ended")
    finally:
        # A regression must not itself leak the intentionally slow test child.
        with suppress(ProcessLookupError):
            os.kill(pid, 9)


def test_per_call_timeout_stops_native_descendants_even_when_worker_exits(tmp_path):
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path, "slow")),
        tesseract_timeout=0.15,
    )
    with pytest.raises(ScanError) as caught:
        asyncio.run(service.recognize(image_bytes(), "image/png"))
    assert (caught.value.code, caught.value.status) == ("ocr_timeout", 504)
    assert_process_stopped(int((tmp_path / "child.pid").read_text()))


def test_cancellation_during_native_ocr_keeps_event_loop_live_and_cleans(tmp_path):
    temp_root = tmp_path / "scans"
    temp_root.mkdir()
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path, "slow")),
        temp_root=temp_root,
    )

    async def run():
        recognition = asyncio.create_task(service.recognize(image_bytes(), "image/png"))
        try:
            for _ in range(100):
                if (tmp_path / "child.pid").exists():
                    break
                await asyncio.sleep(0.01)
            assert (tmp_path / "child.pid").exists()
        finally:
            recognition.cancel()
            with pytest.raises(asyncio.CancelledError):
                await recognition
        assert not list(temp_root.iterdir())

    asyncio.run(run())
    assert_process_stopped(int((tmp_path / "child.pid").read_text()))


def test_two_worker_limit_rejects_busy_without_queueing_and_cancel_cleans(tmp_path):
    temp_root = tmp_path / "scans"
    temp_root.mkdir()
    service = OCRService(
        tesseract_command=str(fake_engine(tmp_path, "slow")),
        temp_root=temp_root,
    )

    async def run():
        first = asyncio.create_task(service.recognize(image_bytes(), "image/png"))
        second = asyncio.create_task(service.recognize(image_bytes(), "image/png"))
        try:
            for _ in range(100):
                if len(list(temp_root.iterdir())) == 2:
                    break
                await asyncio.sleep(0.01)
            with pytest.raises(ScanError) as caught:
                await service.recognize(image_bytes(), "image/png")
            assert (caught.value.code, caught.value.status) == ("ocr_busy", 429)
        finally:
            first.cancel()
            second.cancel()
            await asyncio.gather(first, second, return_exceptions=True)
        assert not list(temp_root.iterdir())

    asyncio.run(run())


@pytest.mark.parametrize(
    ("sample", "name", "number", "category", "language"),
    [
        ("upright-en", "Pikachu", "025", "Pokemon", "en"),
        ("spanish-accent-trainer", "Ornitólogo", "159", "Trainer", "es"),
        ("spanish-energy", "Energía Psychic Básica", "207", "Energy", "es"),
        ("quarter-turn", "Furret", "136", "Pokemon", "en"),
    ],
)
def test_actual_native_engine_reads_original_synthetic_clues(
    sample, name, number, category, language
):
    async def run():
        service = OCRService()
        capabilities = await service.capabilities()
        if set(capabilities.languages) != {"eng", "spa"}:
            pytest.skip("Optional native Tesseract eng+spa data unavailable")
        source = (
            Path(__file__).resolve().parents[2]
            / "research"
            / "scanner"
            / "samples"
            / f"{sample}.png"
        )
        return await service.recognize(source.read_bytes(), "image/png")

    result = asyncio.run(run())
    assert normalize_text(result.clues.name) == normalize_text(name)
    assert result.clues.local_number == number
    assert result.clues.category == category
    assert result.clues.language == language
