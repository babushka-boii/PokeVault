"""Asynchronous, bounded OCR worker supervision."""

import asyncio
import json
import os
import shutil
import signal
import sys
from contextlib import suppress
from pathlib import Path
from tempfile import TemporaryDirectory

from pydantic import ValidationError

from app.scanner.errors import ScanError
from app.scanner.images import supported_formats, validate_upload
from app.scanner.schemas import OCRResult, ScanCapabilities

_ERROR_STATUS = {
    "empty_image": 422,
    "image_too_large": 413,
    "unsupported_image_type": 415,
    "image_type_mismatch": 415,
    "invalid_image": 422,
    "image_dimensions_exceeded": 422,
    "animated_image": 422,
    "ocr_unavailable": 503,
    "ocr_engine_failed": 503,
    "ocr_output_invalid": 503,
    "ocr_timeout": 504,
}


def engine_environment(temp_root: str | None = None) -> dict[str, str]:
    """Native recognition needs no application/session/database environment."""
    environment = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "OMP_THREAD_LIMIT": "1",
        "OMP_NUM_THREADS": "1",
    }
    for name in ("TESSDATA_PREFIX", "LANG", "LC_ALL", "SYSTEMROOT"):
        if value := os.environ.get(name):
            environment[name] = value
    if temp_root is not None:
        environment["TMPDIR"] = temp_root
    return environment


async def _terminate_group(process: asyncio.subprocess.Process) -> None:
    # All scratch files belong to the parent, so native processing needs no
    # graceful shutdown. A single group kill also stops descendants after a
    # worker has returned a per-call timeout and exited itself.
    with suppress(ProcessLookupError):
        os.killpg(process.pid, signal.SIGKILL)
    await process.wait()


async def _capture(
    argv: list[str],
    timeout: float,
    limit: int,
    *,
    cwd: Path | None = None,
    temp_root: str | None = None,
) -> tuple[int, bytes]:
    launch = asyncio.create_task(
        asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            stdin=asyncio.subprocess.DEVNULL,
            start_new_session=True,
            cwd=cwd,
            env=engine_environment(temp_root),
        )
    )
    try:
        process = await asyncio.shield(launch)
    except asyncio.CancelledError:
        process = await launch
        await _terminate_group(process)
        raise
    try:
        async with asyncio.timeout(timeout):
            output = bytearray()
            while chunk := await process.stdout.read(4096):
                output.extend(chunk)
                if len(output) > limit:
                    raise ScanError("ocr_output_invalid", 503)
            returncode = await process.wait()
            return returncode, bytes(output)
    finally:
        await _terminate_group(process)


class OCRService:
    """Own at most two isolated workers; busy requests never join a queue."""

    def __init__(
        self,
        *,
        tesseract_command: str | None = None,
        temp_root: str | Path | None = None,
        worker_timeout: float = 20,
        tesseract_timeout: float = 5,
    ):
        self._command = tesseract_command or "tesseract"
        self._temp_root = temp_root
        self._worker_timeout = max(0.05, min(worker_timeout, 20))
        self._tesseract_timeout = max(0.05, min(tesseract_timeout, 5))
        self._active = 0

    async def capabilities(self) -> ScanCapabilities:
        languages = []
        executable = shutil.which(self._command)
        if executable:
            try:
                returncode, output = await _capture(
                    [executable, "--list-langs"], timeout=3, limit=4096
                )
                if returncode == 0:
                    installed = set(
                        output.decode("utf-8", errors="replace").splitlines()
                    )
                    languages = [lang for lang in ("eng", "spa") if lang in installed]
            except OSError, TimeoutError, ScanError:
                pass
        return ScanCapabilities(
            available=bool(languages), languages=languages, formats=supported_formats()
        )

    async def recognize(self, data: bytes, content_type: str) -> OCRResult:
        validate_upload(data, content_type)
        if self._active >= 2:
            raise ScanError("ocr_busy", 429)
        self._active += 1
        try:
            capabilities = await self.capabilities()
            executable = shutil.which(self._command)
            if not capabilities.available or not executable:
                raise ScanError("ocr_unavailable", 503)
            # The parent owns removal, including if the worker is killed during
            # Pillow/native work. No image path or raw native text is returned.
            with TemporaryDirectory(
                prefix="pokevault-scan-", dir=self._temp_root
            ) as directory:
                upload = Path(directory) / "upload.bin"
                upload.write_bytes(data)
                try:
                    returncode, output = await _capture(
                        [
                            sys.executable,
                            "-m",
                            "app.scanner.worker",
                            str(upload),
                            content_type,
                            executable,
                            "+".join(capabilities.languages),
                            str(self._tesseract_timeout),
                        ],
                        timeout=self._worker_timeout,
                        limit=32_768,
                        cwd=Path(__file__).resolve().parents[2],
                        temp_root=directory,
                    )
                except TimeoutError as exc:
                    raise ScanError("ocr_timeout", 504) from exc
                except OSError as exc:
                    raise ScanError("ocr_engine_failed", 503) from exc
                try:
                    payload = json.loads(output)
                    if (
                        isinstance(payload, dict)
                        and (code := payload.get("error")) in _ERROR_STATUS
                    ):
                        raise ScanError(code, _ERROR_STATUS[code])
                    if returncode != 0:
                        raise ScanError("ocr_engine_failed", 503)
                    result = OCRResult.model_validate(payload)
                except (ValueError, TypeError, ValidationError) as exc:
                    raise ScanError("ocr_engine_failed", 503) from exc
                if len(capabilities.languages) < 2:
                    result.warnings.append("ocr_partial_languages")
                return result
        finally:
            self._active -= 1
