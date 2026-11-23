"""Local-only evaluation: PYTHONPATH=backend python this.py INPUT_DIR OUTPUT_JSON.
Original images are never written; output contains OCR clues and public catalog data.
"""

import asyncio, hashlib, json, sys, time
from pathlib import Path
from app.cards.provider import CardProvider
from app.scanner.ocr import OCRService
from app.scanner.matching import match_candidates
from app.scanner.schemas import MatchRequest


async def main():
    p = CardProvider()
    rows = []
    for f in sorted(Path(sys.argv[1]).iterdir()):
        if f.suffix.lower() not in (".jpeg", ".heic"):
            continue
        raw = f.read_bytes()
        start = time.perf_counter()
        o = await OCRService().recognize(
            raw, "image/heic" if f.suffix == ".heic" else "image/jpeg"
        )
        elapsed = time.perf_counter() - start
        m = await match_candidates(p, MatchRequest(clues=o.clues, language="es"))
        row = dict(
            file=f.name,
            sha256=hashlib.sha256(raw).hexdigest(),
            ocr=o.model_dump(mode="json"),
            match=m.model_dump(mode="json"),
            ocr_seconds=elapsed,
            total_seconds=time.perf_counter() - start,
        )
        rows.append(row)
        print(f.name, o.clues, [c.card.id for c in m.candidates], flush=True)
    Path(sys.argv[2]).write_text(json.dumps(rows, indent=2))


asyncio.run(main())
