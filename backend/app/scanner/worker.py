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

import cv2
import numpy as np
from PIL import Image, ImageFilter, ImageOps

from app.scanner.errors import ScanError
from app.scanner.extraction import OCRLine, extract_clues
from app.scanner.geometry import prepare_card
from app.scanner.images import decode_image, normalize_pixels
from app.scanner.normalization import name_key, number_key
from app.scanner.ocr import engine_environment
from app.scanner.schemas import OCRResult

MAX_NATIVE_OUTPUT = 262_144


def _tesseract(
    engine: str, image: Path, languages: str, timeout: float, *, psm: int = 11
) -> bytes:
    argv = [engine, str(image), "stdout", "-l", languages, "--psm", str(psm), "tsv"]
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


def _lines(
    output: bytes,
    size: tuple[int, int],
    *,
    region: tuple[float, float, float, float] = (0, 0, 1, 1),
    minimum_confidence: float = 20,
    padding: int = 0,
) -> list[OCRLine]:
    rows = csv.DictReader(
        io.StringIO(output.decode("utf-8", errors="replace")),
        delimiter="\t",
        quoting=csv.QUOTE_NONE,
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
            if row["level"] != "5" or float(row["conf"]) < minimum_confidence:
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
                top=region[1]
                + max(0, min(word[1] for word in words) - padding)
                / max(1, size[1] - 2 * padding)
                * (region[3] - region[1]),
                left=region[0]
                + max(0, min(word[0] for word in words) - padding)
                / max(1, size[0] - 2 * padding)
                * (region[2] - region[0]),
                confidence=sum(word[2] for word in words) / len(words),
            )
        )
    return lines


def _enclosed_glyphs(pixels: np.ndarray) -> np.ndarray:
    """Render glyphs printed as a dark fill inside a light outline.

    Full-art and reverse-holo footers print the collector number this way, so
    Tesseract only sees thin light strokes. Light outlines are thresholded,
    everything reachable from the border is background, and the enclosed dark
    regions (the actual glyph shapes) become black text on white.
    """
    outline = cv2.adaptiveThreshold(
        pixels, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, -10
    )
    height, width = outline.shape
    padded = cv2.copyMakeBorder(outline, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    cv2.floodFill(padded, np.zeros((height + 4, width + 4), np.uint8), (0, 0), 255)
    enclosed = (padded[1:-1, 1:-1] == 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(enclosed)
    glyphs = np.full((height, width), 255, np.uint8)
    for index in range(1, count):
        # Drop specks from foil texture; glyph interiors are taller than 4%.
        if (
            stats[index, cv2.CC_STAT_AREA] > 40
            and stats[index, cv2.CC_STAT_HEIGHT] > height * 0.04
        ):
            glyphs[labels == index] = 0
    return glyphs


def recognize_file(
    upload: Path, mime: str, engine: str, languages: str, timeout: float
) -> OCRResult:
    deadline = time.monotonic() + 18
    source = decode_image(upload.read_bytes(), mime)
    prepared = prepare_card(source)
    image = normalize_pixels(prepared.image)
    normalized = upload.parent / "normalized.png"

    def read(
        oriented,
        *,
        region=(0, 0, 1, 1),
        psm=11,
        minimum_confidence=20,
        padding=0,
    ):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise ScanError("ocr_timeout", 504)
        oriented.save(normalized, format="PNG")
        return _lines(
            _tesseract(
                engine, normalized, languages, min(timeout, 5, remaining), psm=psm
            ),
            oriented.size,
            region=region,
            minimum_confidence=minimum_confidence,
            padding=padding,
        )

    best = None
    best_score = -1
    best_lines = []
    best_angle = 0
    for angle in (0, 90, 180, 270):
        oriented = image if angle == 0 else image.rotate(angle, expand=True)
        lines = read(oriented)
        clues = extract_clues(lines)
        score = (
            4 * bool(clues.local_number)
            + 2 * bool(clues.name)
            + bool(clues.printed_total)
            + 0.25 * bool(clues.category)
        )
        if score > best_score:
            best, best_score, best_lines, best_angle = clues, score, lines, angle
        # Short fragments cannot terminate orientation discovery. Low-confidence
        # titles are discarded by extraction before reaching this decision.
        if (
            clues.name
            and clues.local_number
            and any(
                line.top <= 0.30 and line.confidence >= 55 and clues.name in line.text
                for line in lines
            )
        ):
            break

    # Most clear scans need only the full-card pass. The narrow title recovery
    # excludes evolution text and HP symbols; it is supplementary because other
    # templates place names elsewhere. Source grayscale avoids amplifying foil.
    oriented = (
        prepared.image
        if best_angle == 0
        else prepared.image.rotate(best_angle, expand=True)
    )

    def crop_region(box):
        crop = oriented.crop(
            tuple(
                round(value * size)
                for value, size in zip(
                    box,
                    (oriented.width, oriented.height, oriented.width, oriented.height),
                    strict=True,
                )
            )
        )
        factor = min(2.0, 1500 / crop.width)
        if factor > 1:
            crop = crop.resize(
                (round(crop.width * factor), round(crop.height * factor)),
                Image.Resampling.LANCZOS,
            )
        return crop

    if not (best.name and best.local_number):
        trainer = best.category == "Trainer"
        title_box = (0, 0.03, 0.95, 0.13) if trainer else (0.16, 0.02, 0.70, 0.08)
        title = ImageOps.expand(
            crop_region(title_box)
            if trainer
            else crop_region(title_box).filter(ImageFilter.GaussianBlur(1.2)),
            border=10,
            fill="white",
        )
        lines = read(
            title,
            region=title_box,
            psm=6 if trainer else 7,
            minimum_confidence=55,
            padding=10,
        )
        title_clues = extract_clues(lines)
        if title_clues.name:
            best.name = title_clues.name
        best_lines += lines

    if not best.local_number:
        footer_box = (0, 0.90, 1, 1)
        footer = crop_region(footer_box)
        lines = read(footer, region=footer_box)
        footer_clues = extract_clues(lines)
        best_lines += lines
        if not footer_clues.local_number:
            # Only one alternate threshold pass: it helps low-contrast printed
            # numbers; applying it to foil titles degraded measured extraction.
            pixels = cv2.adaptiveThreshold(
                np.asarray(footer),
                255,
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY,
                51,
                11,
            )
            lines = read(Image.fromarray(pixels), region=footer_box)
            footer_clues = extract_clues(lines)
            best_lines += lines
        if not footer_clues.local_number:
            # Outlined numbers: one bounded pass. Its reading is OCR evidence
            # only; matching still flags it when it contradicts the name.
            lines = read(
                Image.fromarray(_enclosed_glyphs(np.asarray(footer))),
                region=footer_box,
            )
            footer_clues = extract_clues(lines)
            best_lines += lines
        best.local_number = footer_clues.local_number
        best.printed_total = footer_clues.printed_total
    warnings = list(prepared.warnings)
    if prepared.rectified:
        # Retain a coherent reading from one path: never splice a crop's title
        # onto an unrelated number found elsewhere in the photograph.
        original = normalize_pixels(source)
        fallback_deadline = min(deadline, time.monotonic() + 4)
        crop_complete = bool(best.name and best.local_number)

        def evidence_rank(clues):
            return (
                bool(clues.name and clues.local_number),
                bool(clues.local_number),
                bool(clues.name),
            )

        angles = list(dict.fromkeys((best_angle, 0, 90, 180, 270)))
        for angle in angles:
            remaining = fallback_deadline - time.monotonic()
            if remaining <= 0:
                warnings.append("localization_fallback_unavailable")
                break
            full = original if angle == 0 else original.rotate(angle, expand=True)
            full.save(normalized, format="PNG")
            try:
                lines = _lines(
                    _tesseract(
                        engine, normalized, languages, min(timeout, 5, remaining)
                    ),
                    full.size,
                    minimum_confidence=55,
                )
            except ScanError:
                warnings.append("localization_fallback_unavailable")
                break
            alternative = extract_clues(lines)
            conflict = (
                best.name
                and alternative.name
                and name_key(best.name) != name_key(alternative.name)
            ) or (
                best.local_number
                and alternative.local_number
                and (
                    number_key(best.local_number)
                    != number_key(alternative.local_number)
                    or best.printed_total != alternative.printed_total
                )
            )
            if conflict and "localization_conflict" not in warnings:
                warnings.append("localization_conflict")
            if evidence_rank(alternative) > evidence_rank(best):
                best, best_angle = alternative, angle
                if "original_image_selected" not in warnings:
                    warnings.append("original_image_selected")
            best_lines += lines
            # Complete crop: one verification pass. Incomplete crop: at most
            # four original orientations, stopping on a complete reading.
            if crop_complete or (best.name and best.local_number):
                break
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
