"""Wrong crops must not erase stronger original-frame evidence."""

import pytest
from PIL import Image

from app.scanner import worker
from app.scanner.geometry import PreparedCard

HEADER = b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"


def output(name="", number=""):
    rows = []
    if name:
        rows.append(f"5\t1\t1\t1\t20\t40\t95\t{name}\n")
    if number:
        rows.append(f"5\t2\t1\t1\t20\t700\t95\t{number}\n")
    return HEADER + "".join(rows).encode()


@pytest.mark.parametrize(
    "crop,original,want_name,want_number,conflict",
    [
        (output(), output("Dragonite", "149/165"), "Dragonite", "149", False),
        (
            output("Dragonite"),
            output("Dragonite", "149/165"),
            "Dragonite",
            "149",
            False,
        ),
        (
            output("Dragonite", "149/165"),
            output("Raichu", "026/165"),
            "Dragonite",
            "149",
            True,
        ),
        (output("Dragonite", "149/165"), output(), "Dragonite", "149", False),
        (output("Dragonite"), output("", "149/165"), "", "149", False),
    ],
    ids=[
        "empty-crop",
        "partial-crop",
        "conflicting-readings",
        "strong-crop",
        "no-splicing",
    ],
)
def test_original_evidence_compared_without_mixing_paths(
    tmp_path, monkeypatch, crop, original, want_name, want_number, conflict
):
    upload = tmp_path / "photo.png"
    Image.new("L", (1000, 1000), 180).save(upload)
    monkeypatch.setattr(
        worker,
        "prepare_card",
        lambda image: PreparedCard(
            Image.new("L", (600, 800), 240), True, ["card_rectified"]
        ),
    )
    calls = []

    def native(engine, path, languages, timeout, **kwargs):
        with Image.open(path) as im:
            size = im.size
        calls.append(size)
        if size == (1000, 1000):
            return original
        if size in ((600, 800), (800, 600)):
            return crop
        return HEADER

    monkeypatch.setattr(worker, "_tesseract", native)
    result = worker.recognize_file(upload, "image/png", "native", "eng", 5)
    assert result.clues.name == want_name
    assert result.clues.local_number == want_number
    assert ("localization_conflict" in result.warnings) == conflict
    assert (1000, 1000) in calls
    # 4 crop orientations, title, 3 footer passes, up to 4 original orientations.
    assert len(calls) <= 12


def test_original_fallback_timeout_preserves_crop(tmp_path, monkeypatch):
    from app.scanner.errors import ScanError

    upload = tmp_path / "photo.png"
    Image.new("L", (1000, 1000), 180).save(upload)
    monkeypatch.setattr(
        worker,
        "prepare_card",
        lambda image: PreparedCard(
            Image.new("L", (600, 800), 240), True, ["card_rectified"]
        ),
    )

    def native(engine, path, languages, timeout, **kwargs):
        with Image.open(path) as im:
            if im.size == (1000, 1000):
                raise ScanError("ocr_timeout", 504)
        return output("Dragonite", "149/165")

    monkeypatch.setattr(worker, "_tesseract", native)
    result = worker.recognize_file(upload, "image/png", "native", "eng", 5)
    assert result.clues.name == "Dragonite"
    assert "localization_fallback_unavailable" in result.warnings


@pytest.mark.parametrize("angle", [0, 90])
def test_actual_ocr_recovers_from_overaggressive_crop(tmp_path, monkeypatch, angle):
    import shutil
    from pathlib import Path

    engine = shutil.which("tesseract")
    if engine is None:
        pytest.skip("Native Tesseract unavailable")
    source = (
        Path(__file__).resolve().parents[2] / "research/scanner/samples/upright-en.png"
    )
    upload = tmp_path / "photo.png"
    with Image.open(source) as image:
        image.rotate(angle, expand=True).save(upload)
    monkeypatch.setattr(
        worker,
        "prepare_card",
        lambda image: PreparedCard(
            Image.new("L", (300, 420), 240), True, ["card_rectified"]
        ),
    )
    result = worker.recognize_file(upload, "image/png", engine, "eng", 5)
    assert result.clues.name == "Pikachu"
    assert result.clues.local_number == "025"
    assert result.clues.printed_total == 165
    assert "original_image_selected" in result.warnings


def test_original_passes_share_one_four_second_allowance(tmp_path, monkeypatch):
    upload = tmp_path / "photo.png"
    Image.new("L", (1000, 1000), 180).save(upload)
    monkeypatch.setattr(
        worker,
        "prepare_card",
        lambda image: PreparedCard(
            Image.new("L", (600, 800), 240), True, ["card_rectified"]
        ),
    )
    clock = [0.0]
    monkeypatch.setattr(worker.time, "monotonic", lambda: clock[0])
    allowances = []

    def native(engine, path, languages, timeout, **kwargs):
        with Image.open(path) as im:
            if im.size == (1000, 1000):
                allowances.append(timeout)
                clock[0] += 2
        return HEADER

    monkeypatch.setattr(worker, "_tesseract", native)
    result = worker.recognize_file(upload, "image/png", "native", "eng", 5)
    assert allowances == [4, 2]
    assert "localization_fallback_unavailable" in result.warnings
    assert result.clues.name == ""
