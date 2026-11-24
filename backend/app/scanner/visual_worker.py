"""Disposable, network-free visual comparison of a private photo and public art."""

import io
import json
import re
import sys
import warnings
from pathlib import Path

from PIL import Image

from app.cards.schemas import IDENTIFIER_PATTERN
from app.scanner.images import normalize_image
from app.scanner.schemas import MAX_UPLOAD_BYTES

MAX_REFERENCES = 16
MAX_REFERENCE_BYTES = 1_048_576
MAX_MANIFEST_BYTES = 8192
_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def _read(path: Path, limit: int) -> bytes:
    with path.open("rb") as source:
        data = source.read(limit + 1)
    if not data or len(data) > limit:
        raise ValueError("Invalid bounded file")
    return data


def _manifest(path: Path) -> list[tuple[str, Path]]:
    rows = json.loads(_read(path, MAX_MANIFEST_BYTES))
    if not isinstance(rows, list) or len(rows) > MAX_REFERENCES:
        raise ValueError("Invalid reference list")
    references = []
    identifiers = set()
    directory = path.parent.resolve()
    for row in rows:
        if not isinstance(row, dict) or set(row) != {"card_id", "path"}:
            raise ValueError("Invalid reference entry")
        card_id, filename = row["card_id"], row["path"]
        if (
            not isinstance(card_id, str)
            or not 1 <= len(card_id) <= 100
            or not re.fullmatch(IDENTIFIER_PATTERN, card_id)
            or card_id in identifiers
            or not isinstance(filename, str)
            or not 1 <= len(filename) <= 1024
        ):
            raise ValueError("Invalid reference identity")
        reference = Path(filename)
        # The parent writes every downloaded asset into its private scratch dir.
        # Manifest data cannot turn this worker into an arbitrary file reader.
        if (
            not reference.is_absolute()
            or reference.is_symlink()
            or reference.resolve().parent != directory
        ):
            raise ValueError("Invalid reference location")
        identifiers.add(card_id)
        references.append((card_id, reference))
    return references


def _reference(path: Path) -> Image.Image:
    data = _read(path, MAX_REFERENCE_BYTES)
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as header:
            mime = _FORMATS.get(header.format)
            if (
                mime is None
                or max(header.size) > 1200
                or header.width * header.height > 1_000_000
                or getattr(header, "n_frames", 1) != 1
            ):
                raise ValueError("Invalid reference dimensions")
    return normalize_image(data, mime)


def verify_file(upload: Path, mime: str, manifest: Path) -> dict:
    import cv2

    from app.scanner.geometry import prepare_card
    from app.scanner.visual import compare

    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    cv2.setRNGSeed(0)
    query = normalize_image(_read(upload, MAX_UPLOAD_BYTES), mime)
    references = _manifest(manifest)
    prepared = prepare_card(query)
    matches = []
    for card_id, path in references:
        try:
            reference = _reference(path)
        except OSError, ValueError, SyntaxError, Image.DecompressionBombWarning:
            continue
        evidence = compare(prepared.image, reference)
        if evidence is None and prepared.rectified:
            # Bad boundary selection must not discard the full photograph.
            evidence = compare(query, reference)
        if evidence is not None:
            matches.append(
                {
                    "card_id": card_id,
                    "inliers": evidence.inliers,
                    "support": evidence.support,
                }
            )
    matches.sort(key=lambda row: (-row["inliers"], -row["support"], row["card_id"]))
    # Several qualified artworks remain alternatives regardless of score margin.
    return {"matches": matches, "ambiguous": len(matches) > 1}


def main() -> None:
    try:
        upload, mime, manifest = sys.argv[1:]
        result = verify_file(Path(upload), mime, Path(manifest))
    except BaseException:
        # Never expose photo paths, decoder output, descriptors or native traces.
        result = {"matches": [], "ambiguous": False, "error": "visual_failed"}
    print(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
