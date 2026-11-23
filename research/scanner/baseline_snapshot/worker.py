"""Private disposable process: decode pixels, run bounded OCR, emit clues only."""

import csv
import io
import json
import os
import select
import subprocess
import sys
import time
from pathlib import Path

from app.scanner.errors import ScanError
from app.scanner.extraction import OCRLine, extract_clues
from app.scanner.images import normalize_image
from app.scanner.ocr import engine_environment
from app.scanner.schemas import OCRResult

MAX_NATIVE_OUTPUT = 262_144


def _tesseract(engine: str, image: Path, languages: str, timeout: float) -> bytes:
    argv = [engine, str(image), "stdout", "-l", languages, "--psm", "11", "tsv"]
    with subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        shell=False,
        env=engine_environment(str(image.parent)),
    ) as process:
        deadline = time.monotonic() + timeout
        output = bytearray()
        try:
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise ScanError("ocr_timeout", 504)
                readable, _, _ = select.select([process.stdout], [], [], remaining)
                if not readable:
                    raise ScanError("ocr_timeout", 504)
                chunk = os.read(process.stdout.fileno(), 8192)
                if not chunk:
                    break
                output.extend(chunk)
                if len(output) > MAX_NATIVE_OUTPUT:
                    raise ScanError("ocr_output_invalid", 503)
            if process.wait(timeout=max(0.01, deadline - time.monotonic())) != 0:
                raise ScanError("ocr_engine_failed", 503)
        except BaseException:
            process.kill()
            process.wait()
            raise
        return bytes(output)


def _lines(output: bytes, size: tuple[int, int]) -> list[OCRLine]:
    rows = csv.DictReader(
        io.StringIO(output.decode("utf-8", errors="replace")), delimiter="\t"
    )
    required = {
        "level",
        "block_num",
        "par_num",
        "line_num",
        "left",
        "top",
        "conf",
        "text",
    }
    if rows.fieldnames is None or not required.issubset(rows.fieldnames):
        raise ScanError("ocr_engine_failed", 503)
    grouped: dict[tuple[str, str, str], list[tuple[int, int, float, str]]] = {}
    for index, row in enumerate(rows):
        if index >= 2048:
            break
        try:
            if row["level"] != "5" or float(row["conf"]) < 20:
                continue
            text = row["text"].strip()[:100]
            left, top, confidence = (
                int(row["left"]),
                int(row["top"]),
                float(row["conf"]),
            )
            if not text or not (0 <= left <= size[0] and 0 <= top <= size[1]):
                continue
            key = (row["block_num"], row["par_num"], row["line_num"])
            grouped.setdefault(key, []).append((left, top, confidence, text))
        except KeyError, ValueError, TypeError:
            continue
    lines = []
    for words in list(grouped.values())[:128]:
        words.sort(key=lambda word: word[0])
        lines.append(
            OCRLine(
                " ".join(word[3] for word in words)[:200],
                top=min(word[1] for word in words) / size[1],
                left=min(word[0] for word in words) / size[0],
                confidence=sum(word[2] for word in words) / len(words),
            )
        )
    return lines


def recognize_file(
    upload: Path, mime: str, engine: str, languages: str, timeout: float
) -> OCRResult:
    image = normalize_image(upload.read_bytes(), mime)
    normalized = upload.parent / "normalized.png"
    best = None
    best_score = -1
    best_lines = []
    best_angle = 0
    for angle in (0, 90, 180, 270):
        oriented = image if angle == 0 else image.rotate(angle, expand=True)
        oriented.save(normalized, format="PNG")
        lines = _lines(
            _tesseract(engine, normalized, languages, timeout), oriented.size
        )
        clues = extract_clues(lines)
        score = (
            4 * bool(clues.local_number)
            + 2 * bool(clues.name)
            + bool(clues.printed_total)
            + 0.25 * bool(clues.category)
        )
        if score > best_score:
            best, best_score, best_lines, best_angle = clues, score, lines, angle
        if clues.name and clues.local_number:
            break
    warnings = []
    if not best_lines:
        warnings.append("no_text_found")
    elif not best.name and not best.local_number:
        warnings.append("no_identifying_clues")
    if best_angle:
        warnings.append("image_rotated")
    return OCRResult(
        clues=best, engine_languages=languages.split("+"), warnings=warnings
    )


def main() -> None:
    try:
        upload, mime, engine, languages, timeout = sys.argv[1:]
        result = recognize_file(
            Path(upload), mime, engine, languages, min(float(timeout), 5)
        )
        print(result.model_dump_json())
    except ScanError as exc:
        print(json.dumps({"error": exc.code, "status": exc.status}))
    except BaseException:
        # Native/decode traces may include upload paths or recognized text.
        print(json.dumps({"error": "ocr_engine_failed", "status": 503}))


if __name__ == "__main__":
    main()
