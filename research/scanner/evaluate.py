"""Real offline OCR + production matcher against captured official catalog facts."""

import argparse
import asyncio
import json
import os
import platform
import statistics
import subprocess
import sys
import time
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import httpx2 as httpx
from PIL import __version__ as pillow_version

ROOT = Path(__file__).resolve().parent
PROJECT = ROOT.parents[1]
sys.path.insert(0, str(PROJECT / "backend"))

from app.cards.provider import CardProvider
from app.scanner.extraction import normalize_text
from app.scanner.matching import match_candidates
from app.scanner.ocr import OCRService
from app.scanner.schemas import MatchRequest


def offline_provider() -> CardProvider:
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
    sets = catalog["sets"]

    def handle(request):
        path = request.url.path
        if path == "/v2/graphql":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "sets": [
                            {
                                key: value
                                for key, value in row.items()
                                if key not in {"cards", "cardCount"}
                            }
                            for row in sets["en"]
                        ]
                    }
                },
            )
        for language in ("en", "es"):
            if path == f"/v2/{language}/series":
                return httpx.Response(200, json=[])
            if path == f"/v2/{language}/sets":
                return httpx.Response(
                    200,
                    json=[
                        {
                            key: value
                            for key, value in row.items()
                            if key not in {"cards", "serie", "releaseDate"}
                        }
                        for row in sets[language]
                    ],
                )
            if path == f"/v2/{language}/cards":
                # Model the bounded literal name discovery endpoint locally;
                # production matching still verifies every row in a checklist.
                query = request.url.params.get("name", "").removeprefix("like:")
                key = normalize_text(query)
                cards = [
                    card
                    for row in sets[language]
                    for card in row["cards"]
                    if key and key in normalize_text(card["name"])
                ]
                return httpx.Response(200, json=cards[:64])
            for row in sets[language]:
                if path == f"/v2/{language}/sets/{row['id']}":
                    return httpx.Response(200, json=deepcopy(row))
        raise AssertionError(
            f"Unexpected offline catalog request: {request.method} {path}"
        )

    return CardProvider(transport=httpx.MockTransport(handle))


def tree_rss_kib() -> int:
    output = subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss="], text=True)
    rows = [
        tuple(map(int, row.split()))
        for row in output.splitlines()
        if len(row.split()) == 3
    ]
    descendants = {os.getpid()}
    while True:
        discovered = {pid for pid, parent, _ in rows if parent in descendants}
        if discovered.issubset(descendants):
            break
        descendants.update(discovered)
    return sum(rss for pid, _, rss in rows if pid in descendants)


async def measure_memory(stop: asyncio.Event) -> float:
    peak = 0
    while not stop.is_set():
        peak = max(peak, await asyncio.to_thread(tree_rss_kib))
        try:
            await asyncio.wait_for(stop.wait(), 0.05)
        except TimeoutError:
            pass
    return round(peak / 1024, 2)


async def evaluate() -> dict:
    service = OCRService()
    capabilities = await service.capabilities()
    if not capabilities.available:
        raise SystemExit(
            "Tesseract with eng/spa language data is required for this evaluation"
        )
    manifest = json.loads(
        (ROOT / "samples" / "manifest.json").read_text(encoding="utf-8")
    )["cases"]
    results = []
    for case in manifest:
        stop = asyncio.Event()
        memory = asyncio.create_task(measure_memory(stop))
        started = time.monotonic()
        try:
            recognized = await service.recognize(
                (ROOT / "samples" / case["file"]).read_bytes(), "image/png"
            )
        finally:
            stop.set()
        elapsed = time.monotonic() - started
        peak = await memory
        matches = await match_candidates(
            offline_provider(),
            MatchRequest(clues=recognized.clues, language=case.get("language", "en")),
        )
        ids = [candidate.card.id for candidate in matches.candidates]
        expected_id = case.get("expected_id")
        expected_name = case.get("expected_name", case["name"])
        number, _, total = case["number"].partition("/")
        results.append(
            {
                "case": case["id"],
                "expected_id": expected_id,
                "name_exact_normalized": normalize_text(recognized.clues.name)
                == normalize_text(expected_name),
                "printed_number_exact": recognized.clues.local_number == number,
                "printed_total_exact": recognized.clues.printed_total
                == (int(total) if total else None),
                "category_exact": recognized.clues.category == case.get("category"),
                "clues": recognized.clues.model_dump(),
                "ocr_warnings": recognized.warnings,
                "candidate_ids": ids,
                "qualities": [candidate.quality for candidate in matches.candidates],
                "matching_status": matches.status,
                "matching_warnings": matches.warnings,
                "matching_limited": matches.limited,
                "top1": bool(expected_id and ids and ids[0] == expected_id),
                "top3": bool(expected_id and expected_id in ids[:3]),
                "expected_abstention": bool(case.get("abstain")),
                "abstained": not ids,
                "expected_ambiguity": bool(case.get("ambiguous")),
                "ambiguity_preserved": bool(
                    case.get("ambiguous")
                    and len(ids) > 1
                    and all(
                        candidate.quality != "strong"
                        for candidate in matches.candidates
                    )
                ),
                "ocr_seconds": round(elapsed, 4),
                "peak_sampled_tree_rss_mib": peak,
            }
        )
    identified = [row for row in results if row["expected_id"]]
    abstentions = [row for row in results if row["expected_abstention"]]
    ambiguities = [row for row in results if row["expected_ambiguity"]]
    latencies = [row["ocr_seconds"] for row in results]
    return {
        "measured_at": datetime.now(UTC).isoformat(),
        "scope": "14 original synthetic text/geometric images; real local OCR; production matcher; offline captured facts for 510 physical cards in three expansions. No real photographs and no live provider calls. Small constrained catalog is not representative of global retrieval or card-photo accuracy.",
        "environment": {
            "platform": platform.platform(),
            "machine": platform.machine(),
            "python": platform.python_version(),
            "pillow": pillow_version,
            "tesseract": (
                await asyncio.to_thread(
                    subprocess.check_output, ["tesseract", "--version"], text=True
                )
            ).splitlines()[0],
            "languages": capabilities.languages,
        },
        "metrics": {
            "total_images": len(results),
            "identified_images": len(identified),
            "top1_hits": sum(row["top1"] for row in identified),
            "top3_hits": sum(row["top3"] for row in identified),
            "top1_accuracy": sum(row["top1"] for row in identified) / len(identified),
            "top3_recall": sum(row["top3"] for row in identified) / len(identified),
            "abstention_hits": sum(row["abstained"] for row in abstentions),
            "abstention_cases": len(abstentions),
            "ambiguity_preserved": sum(
                row["ambiguity_preserved"] for row in ambiguities
            ),
            "ambiguity_cases": len(ambiguities),
            "name_exact_normalized": sum(
                row["name_exact_normalized"] for row in results
            ),
            "number_exact": sum(row["printed_number_exact"] for row in results),
            "total_exact": sum(row["printed_total_exact"] for row in results),
            "category_exact": sum(row["category_exact"] for row in results),
            "ocr_latency_seconds_min": min(latencies),
            "ocr_latency_seconds_median": round(statistics.median(latencies), 4),
            "ocr_latency_seconds_max": max(latencies),
            "peak_sampled_tree_rss_mib": max(
                row["peak_sampled_tree_rss_mib"] for row in results
            ),
        },
        "memory_method": "Sum of RSS for evaluator and descendants sampled via ps every ~50ms, including the brief ps process. This observed peak is approximate, includes interpreter/worker/Tesseract, and is not a hard limit or a simultaneous two-worker benchmark.",
        "results": results,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "results.json")
    arguments = parser.parse_args()
    report = asyncio.run(evaluate())
    arguments.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(report["metrics"], indent=2))
