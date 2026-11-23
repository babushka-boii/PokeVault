"""Real local feature matching on original procedural images, never card photos."""

import json
import os
import random
import subprocess
import sys
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter


def textured_card(seed=1, *, number="001"):
    """Shared template, independently generated art; no licensed artwork."""
    rng = random.Random(seed)
    image = Image.new("RGB", (480, 660), "#dbc564")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((12, 12, 468, 648), radius=15, fill="#f1eee0")
    draw.text((35, 30), "ORIGINAL TEST SPECIMEN", fill="black", font_size=21)
    draw.rectangle((35, 85, 445, 375), fill="#b8b6b0", outline="black", width=3)
    for _ in range(160):
        x, y = rng.randint(45, 425), rng.randint(95, 355)
        size = rng.randint(4, 17)
        color = rng.choice(("#292727", "#faf8ed", "#686868"))
        draw.polygon(
            [(x, y), (x + size, y + size // 2), (x - size // 2, y + size)],
            fill=color,
        )
    for y in (420, 453, 493, 530):
        draw.text((38, y), "Shared template and descriptive text", fill="black")
    draw.text((355, 610), f"{number}/999", fill="black", font_size=19)
    return image


def perspective_scene(card):
    import cv2
    import numpy as np

    source = np.float32([[0, 0], [479, 0], [479, 659], [0, 659]])
    target = np.float32([[180, 95], [650, 145], [610, 790], [100, 730]])
    matrix = cv2.getPerspectiveTransform(source, target)
    return Image.fromarray(
        cv2.warpPerspective(
            np.array(card), matrix, (850, 900), borderValue=(24, 27, 29)
        )
    )


@pytest.mark.parametrize("condition", ["perspective", "rotated", "dim", "glare"])
def test_visual_evidence_survives_original_art_transformations(condition):
    from app.scanner.visual import compare

    reference = textured_card()
    query = reference.copy()
    if condition == "perspective":
        query = perspective_scene(query)
    elif condition == "rotated":
        query = query.rotate(90, expand=True)
    elif condition == "dim":
        query = ImageEnhance.Brightness(query).enhance(0.55)
        query = query.filter(ImageFilter.GaussianBlur(0.6))
    else:
        ImageDraw.Draw(query).polygon(
            [(160, 0), (205, 0), (340, 660), (295, 660)], fill="white"
        )
    evidence = compare(query, reference)
    assert evidence is not None
    assert evidence.inliers >= 12
    assert 0 < evidence.support <= 1


def test_shared_template_with_different_art_is_not_visual_identity():
    from app.scanner.visual import compare

    assert compare(textured_card(1), textured_card(21)) is None


def test_blank_image_is_not_visual_identity():
    from app.scanner.visual import compare

    assert compare(Image.new("L", (480, 660), 128), textured_card()) is None


def test_small_copied_art_patch_is_insufficient_spatial_evidence():
    from app.scanner.visual import compare

    reference = textured_card()
    unrelated = textured_card(21)
    unrelated.paste(reference.crop((90, 120, 150, 180)), (90, 120))
    assert compare(unrelated, reference) is None


def run_worker(tmp_path, upload, references, *, mime="image/png", manifest=None):
    upload_path = tmp_path / "upload.bin"
    if isinstance(upload, bytes):
        upload_path.write_bytes(upload)
    else:
        upload.save(upload_path, format="PNG")
    rows = []
    for index, (card_id, reference) in enumerate(references):
        path = tmp_path / f"reference-{index}.bin"
        if isinstance(reference, bytes):
            path.write_bytes(reference)
        else:
            reference.save(path, format="PNG")
        rows.append({"card_id": card_id, "path": str(path)})
    manifest_path = tmp_path / "references.json"
    manifest_path.write_text(json.dumps(rows if manifest is None else manifest))
    completed = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.scanner.visual_worker",
            str(upload_path),
            mime,
            str(manifest_path),
        ],
        cwd=Path(__file__).resolve().parents[1],
        env=os.environ.copy(),
        capture_output=True,
        timeout=10,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr.decode()
    assert len(completed.stdout) < 8192
    return json.loads(completed.stdout)


def test_worker_returns_verified_ids_and_skips_corrupt_reference(tmp_path):
    result = run_worker(
        tmp_path,
        textured_card(),
        [("control-a", textured_card()), ("control-b", b"private broken bytes")],
    )
    assert [row["card_id"] for row in result["matches"]] == ["control-a"]
    assert set(result["matches"][0]) == {"card_id", "inliers", "support"}
    assert result["ambiguous"] is False


def test_worker_preserves_reprints_sharing_artwork_as_ambiguous(tmp_path):
    result = run_worker(
        tmp_path,
        textured_card(number="001"),
        [
            ("control-a", textured_card(number="001")),
            ("control-b", textured_card(number="002")),
        ],
    )
    assert {row["card_id"] for row in result["matches"]} == {
        "control-a",
        "control-b",
    }
    assert result["ambiguous"] is True


@pytest.mark.parametrize(
    ("upload", "mime"),
    [(b"private corrupt upload", "image/png"), (b"x", "image/heic")],
)
def test_worker_sanitizes_upload_failures(tmp_path, upload, mime):
    result = run_worker(tmp_path, upload, [], mime=mime)
    assert result == {"matches": [], "ambiguous": False, "error": "visual_failed"}


@pytest.mark.parametrize(
    "manifest",
    [
        [{"card_id": "control-a", "path": "/does/not/exist"}] * 17,
        [{"card_id": "control-a", "path": "/does/not/exist"}] * 2,
        [{"card_id": "../private", "path": "/does/not/exist"}],
        {"private": "not a list"},
    ],
)
def test_worker_rejects_invalid_or_unbounded_manifests(tmp_path, manifest):
    result = run_worker(tmp_path, textured_card(), [], manifest=manifest)
    assert result == {"matches": [], "ambiguous": False, "error": "visual_failed"}
