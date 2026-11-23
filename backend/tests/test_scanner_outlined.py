"""Outlined collector numbers (dark fill, light outline) on dark footers."""

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from app.scanner import worker
from app.scanner.geometry import PreparedCard

HEADER = b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"


def _footer(*, outlined: bool) -> np.ndarray:
    image = Image.new("L", (900, 120), 45 if outlined else 225)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default(size=64)
    if outlined:
        draw.text(
            (60, 20), "130/217", font=font, fill=40, stroke_width=4, stroke_fill=235
        )
    else:
        draw.text((60, 20), "130/217", font=font, fill=30)
    return np.asarray(image)


def test_outlined_glyph_interiors_become_dark_text_on_white():
    glyphs = worker._enclosed_glyphs(_footer(outlined=True))
    dark = glyphs == 0
    assert dark.any()
    rows, cols = np.nonzero(dark)
    # Only the number area is kept; the dark background becomes white.
    assert rows.min() >= 10 and rows.max() <= 110
    assert cols.min() >= 50 and cols.max() <= 500
    assert dark.mean() < 0.15


def test_blank_or_smooth_footer_yields_no_glyphs():
    blank = np.full((120, 900), 45, np.uint8)
    gradient = np.tile(np.linspace(30, 120, 900, dtype=np.uint8), (120, 1))
    for footer in (blank, gradient):
        assert (worker._enclosed_glyphs(footer) == 0).sum() == 0


def test_outlined_pass_runs_only_after_both_footer_passes_fail(tmp_path, monkeypatch):
    upload = tmp_path / "card.png"
    Image.new("L", (600, 800), 200).save(upload)
    monkeypatch.setattr(
        worker, "prepare_card", lambda image: PreparedCard(image, False, [])
    )
    footer_calls = []

    def native(engine, path, languages, timeout, *, psm=11):
        with Image.open(path) as im:
            size = im.size
        name = b"5\t1\t1\t1\t30\t10\t96\tZigzagoon\n"
        if size != (1200, 160):  # not the 2x-upscaled footer crop
            return HEADER + name
        footer_calls.append(size)
        # Third footer read (outlined pass) is the first to find the number.
        if len(footer_calls) == 3:
            return HEADER + b"5\t1\t1\t1\t30\t10\t96\t130/217\n"
        return HEADER

    monkeypatch.setattr(worker, "_tesseract", native)
    result = worker.recognize_file(upload, "image/png", "unused", "eng", 5)
    assert result.clues.local_number == "130"
    assert result.clues.printed_total == 217
    assert len(footer_calls) == 3
