"""Compare bounded reference matching locally; never copy or upload photographs.

Manifest (keep outside repository):
{"cases": [{"label": "photo-1", "path": "/private/tmp/photo.png",
"mime": "image/png", "expected_id": "verified-id"}],
"references": [{"card_id": "verified-id", "path": "/private/tmp/ref.webp",
"mime": "image/webp"}]}
Only labels, public card IDs and measured features enter the result JSON.
"""

import argparse
import json
import platform
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np
from visual_compare import dhash, orb_candidate, phash

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def main():
    from app.scanner.images import normalize_image

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text())
    if not 1 <= len(manifest["references"]) <= 16:
        raise ValueError("Expected one to sixteen references")
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    cv2.setRNGSeed(0)
    references = [
        (row["card_id"], normalize_image(Path(row["path"]).read_bytes(), row["mime"]))
        for row in manifest["references"]
    ]
    try:
        from app.scanner.geometry import prepare_card
    except ImportError:
        prepare_card = None
    results = []
    for case in manifest["cases"]:
        query = normalize_image(Path(case["path"]).read_bytes(), case["mime"])
        variants = [("full_image", query)]
        if prepare_card is not None:
            prepared = prepare_card(query)
            if prepared.rectified:
                variants.append(("automatic_rectangle", prepared.image))
        for label, pixels in variants:
            methods = {}
            for name, function in (("phash", phash), ("dhash", dhash)):
                started = time.perf_counter()
                features = [
                    function(pixels.rotate(angle, expand=True))
                    for angle in (0, 90, 180, 270)
                ]
                scores = [
                    {
                        "card_id": card_id,
                        "distance": min(
                            int(np.count_nonzero(feature != function(reference)))
                            for feature in features
                        ),
                    }
                    for card_id, reference in references
                ]
                scores.sort(key=lambda row: (row["distance"], row["card_id"]))
                ids = [row["card_id"] for row in scores]
                methods[name] = {
                    "expected_rank": ids.index(case["expected_id"]) + 1
                    if case["expected_id"] in ids
                    else None,
                    "scores": scores,
                    "elapsed_ms": round(1000 * (time.perf_counter() - started), 3),
                }
            started = time.perf_counter()
            qualified = []
            for card_id, reference in references:
                evidence = orb_candidate(pixels, reference)
                if evidence is not None:
                    qualified.append(
                        {
                            "card_id": card_id,
                            "inliers": evidence[0],
                            "support": round(evidence[1], 5),
                        }
                    )
            qualified.sort(
                key=lambda row: (-row["inliers"], -row["support"], row["card_id"])
            )
            ids = [row["card_id"] for row in qualified]
            methods["orb"] = {
                "expected_rank": ids.index(case["expected_id"]) + 1
                if case["expected_id"] in ids
                else None,
                "qualified": qualified,
                "elapsed_ms": round(1000 * (time.perf_counter() - started), 3),
            }
            results.append(
                {
                    "case": case["label"],
                    "expected_id": case["expected_id"],
                    "variant": label,
                    "methods": methods,
                }
            )
    payload = {
        "scope": (
            "Two user-authorized local photographs. Bounded supplied reference "
            "pool; measures verification/ranking, not catalog-wide discovery. "
            "No calibrated confidence or claim of general accuracy. "
            "No image bytes, paths or metadata are retained in this result."
        ),
        "measured_at": datetime.now(UTC).isoformat(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "reference_ids": [card_id for card_id, _ in references],
        "results": results,
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
