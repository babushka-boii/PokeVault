"""Reproducible engineering comparison on ORIGINAL SYNTHETIC card controls.

No photographs, licensed card artwork or calibrated identity confidence.
Run with backend/.venv/bin/python research/scanner/visual_compare.py.
"""

import argparse
import hashlib
import json
import platform
import random
import statistics
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))


def card(seed):
    rng = random.Random(seed)
    image = Image.new("RGB", (480, 660), "#d9c66e")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((12, 12, 468, 648), radius=15, fill="#eeeade")
    draw.text((35, 30), "ORIGINAL GEOMETRIC SPECIMEN", fill="black", font_size=18)
    draw.rectangle((35, 85, 445, 375), fill="#afafa9", outline="black", width=3)
    for _ in range(180):
        x, y = rng.randint(45, 425), rng.randint(95, 355)
        radius = rng.randint(4, 16)
        draw.polygon(
            [(x, y), (x + radius, y + radius // 2), (x - radius // 2, y + radius)],
            fill=rng.choice(("#252525", "#f5f5eb", "#777777")),
        )
    for y in (420, 453, 493, 530):
        draw.text((38, y), "Identical descriptive template text", fill="black")
    draw.text((350, 610), "001/999", fill="black", font_size=19)
    return image


def variations(reference):
    yield "already_rectified", reference
    yield "dim", ImageEnhance.Brightness(reference).enhance(0.5)
    yield "blur", reference.filter(ImageFilter.GaussianBlur(1.1))
    yield "quarter_turn", reference.rotate(90, expand=True)
    glare = reference.copy()
    ImageDraw.Draw(glare).polygon(
        [(130, 0), (175, 0), (310, 660), (265, 660)], fill="white"
    )
    yield "synthetic_glare", glare
    source = np.float32([[0, 0], [479, 0], [479, 659], [0, 659]])
    target = np.float32([[180, 95], [650, 145], [610, 790], [100, 730]])
    homography = cv2.getPerspectiveTransform(source, target)
    yield (
        "perspective_background",
        Image.fromarray(
            cv2.warpPerspective(
                np.array(reference), homography, (850, 900), borderValue=(24, 27, 29)
            )
        ),
    )
    scene = Image.new("RGB", (960, 1000), "#191919")
    scene.paste(reference.resize((264, 363)), (360, 310))
    yield "small_in_background", scene


def phash(image):
    pixels = np.float32(image.convert("L").resize((32, 32)))
    low = cv2.dct(pixels)[:8, :8].flatten()[1:]
    return low > np.median(low)


def dhash(image):
    pixels = np.array(image.convert("L").resize((9, 8)))
    return (pixels[:, 1:] > pixels[:, :-1]).flatten()


def orb_candidate(query, reference):
    """Experimental candidate, replaced by the production primitive after selection."""
    query = query.convert("L")
    query.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    reference = reference.convert("L")
    reference.thumbnail((1000, 1000), Image.Resampling.LANCZOS)
    query, reference = np.array(query), np.array(reference)
    height, width = reference.shape
    mask = np.zeros_like(reference)
    mask[
        int(height * 0.14) : int(height * 0.65), int(width * 0.08) : int(width * 0.92)
    ] = 255
    orb = cv2.ORB_create(nfeatures=1000)
    rk, rd = orb.detectAndCompute(reference, mask)
    qk, qd = orb.detectAndCompute(query, None)
    if rd is None or qd is None:
        return None
    pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(rd, qd, k=2)
    matches = [
        pair[0]
        for pair in pairs
        if len(pair) == 2 and pair[0].distance < 0.72 * pair[1].distance
    ]
    matches = list(
        {
            match.trainIdx: match
            for match in sorted(matches, key=lambda m: -m.distance)
        }.values()
    )
    if len(matches) < 12:
        return None
    src = np.float32([rk[match.queryIdx].pt for match in matches])
    dst = np.float32([qk[match.trainIdx].pt for match in matches])
    matrix, inlier_mask = cv2.findHomography(
        src, dst, cv2.RANSAC, 4.0, maxIters=1000, confidence=0.995
    )
    if matrix is None or inlier_mask is None:
        return None
    inliers = inlier_mask.ravel().astype(bool)
    count = int(inliers.sum())
    support = cv2.contourArea(cv2.convexHull(src[inliers])) / (width * height)
    cells = {
        (min(2, int(x / width * 3)), min(2, int(y / height * 3)))
        for x, y in src[inliers]
    }
    if count < 12 or count / len(matches) < 0.5 or support < 0.06 or len(cells) < 3:
        return None
    corners = np.float32([[[0, 0], [width, 0], [width, height], [0, height]]])
    projected = cv2.perspectiveTransform(corners, matrix)[0]
    query_height, query_width = query.shape
    area = cv2.contourArea(projected) / (query_width * query_height)
    if (
        not np.isfinite(projected).all()
        or not cv2.isContourConvex(projected)
        or not 0.035 <= area <= 1.2
    ):
        return None
    return count, float(support)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).with_name("visual-results.json")
    )
    args = parser.parse_args()
    cv2.setNumThreads(1)
    cv2.ocl.setUseOpenCL(False)
    cv2.setRNGSeed(0)
    references = [card(seed) for seed in range(100, 106)]
    hash_features = {
        name: [function(reference) for reference in references]
        for name, function in (("phash", phash), ("dhash", dhash))
    }
    rows = []
    for expected, reference in enumerate(references):
        for condition, query in variations(reference):
            row = {
                "control": expected,
                "condition": condition,
                "sha256_pixels": hashlib.sha256(query.tobytes()).hexdigest(),
                "methods": {},
            }
            for name, function in (("phash", phash), ("dhash", dhash)):
                started = time.perf_counter()
                # Give both global hash baselines four orientations, without
                # access to known crop/corner coordinates unavailable in use.
                features = [
                    function(query.rotate(angle, expand=True))
                    for angle in (0, 90, 180, 270)
                ]
                distances = [
                    min(
                        int(np.count_nonzero(feature != target)) for feature in features
                    )
                    for target in hash_features[name]
                ]
                ranking = sorted(
                    range(len(references)), key=lambda index: (distances[index], index)
                )
                row["methods"][name] = {
                    "rank": ranking.index(expected) + 1,
                    "winner_unique": distances.count(min(distances)) == 1,
                    "distances": distances,
                    "elapsed_ms": round(1000 * (time.perf_counter() - started), 3),
                }
            started = time.perf_counter()
            matches = [
                (index, orb_candidate(query, target))
                for index, target in enumerate(references)
            ]
            qualified = [
                (index, evidence) for index, evidence in matches if evidence is not None
            ]
            qualified.sort(key=lambda item: (-item[1][0], -item[1][1], item[0]))
            ranking = [index for index, _ in qualified]
            row["methods"]["orb"] = {
                "rank": ranking.index(expected) + 1 if expected in ranking else None,
                "matches": [
                    {
                        "control": index,
                        "inliers": evidence[0],
                        "support": round(evidence[1], 5),
                    }
                    for index, evidence in qualified
                ],
                "elapsed_ms": round(1000 * (time.perf_counter() - started), 3),
            }
            rows.append(row)
    summary = {}
    for name in ("phash", "dhash", "orb"):
        values = [row["methods"][name] for row in rows]
        times = [value["elapsed_ms"] for value in values]
        summary[name] = {
            "top1": sum(value["rank"] == 1 for value in values),
            "top3": sum(value["rank"] in (1, 2, 3) for value in values),
            "cases": len(values),
            "median_ms": round(statistics.median(times), 3),
            "max_ms": max(times),
        }
    negative_rows = []
    for label, query in [
        ("blank", Image.new("RGB", (480, 660), "#888888")),
        ("unseen_art_same_template", card(999)),
    ]:
        matched = [
            index
            for index, target in enumerate(references)
            if orb_candidate(query, target) is not None
        ]
        negative_rows.append({"condition": label, "orb_qualified_controls": matched})
    payload = {
        "scope": "Original procedural controls only, not real photos or measured real-card accuracy. Six controls share layout and low-frequency art structure, with independent local geometric textures. No confidence calibration.",
        "measured_at": datetime.now(UTC).isoformat(),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "opencv": cv2.__version__,
        "numpy": np.__version__,
        "threads": cv2.getNumThreads(),
        "methods": "Global pHash/dHash with best of four orientations; ORB with art-region features, Hamming ratio, RANSAC and spatial verification. Cached reference hashes; ORB currently recomputes features for every pair. No network, cold process startup or artwork decode included.",
        "summary": summary,
        "negative_controls": negative_rows,
        "cases": rows,
    }
    args.output.write_text(json.dumps(payload, indent=2) + "\n")
    print(
        json.dumps({"summary": summary, "negative_controls": negative_rows}, indent=2)
    )


if __name__ == "__main__":
    main()
