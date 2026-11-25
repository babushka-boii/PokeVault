"""Original geometric fixtures exercise framing without licensed card artwork."""

import io

import pytest
from PIL import Image, ImageDraw

from app.scanner import geometry, images


def marked_card(size=(300, 420)):
    card = Image.new("L", size, 245)
    draw = ImageDraw.Draw(card)
    width, height = size
    draw.rectangle((width * 0.12, height * 0.1, width * 0.3, height * 0.2), fill=55)
    draw.rectangle((width * 0.70, height * 0.8, width * 0.88, height * 0.9), fill=135)
    return card


@pytest.mark.parametrize("angle", [0, 24, -17])
def test_single_surrounded_card_is_rectified_with_corner_content_preserved(angle):
    card = marked_card().rotate(
        angle, expand=True, fillcolor=20, resample=Image.Resampling.BICUBIC
    )
    photograph = Image.new("L", (1000, 1000), 20)
    photograph.paste(card, (380, 390))
    prepared = geometry.prepare_card(photograph)
    assert prepared.rectified
    assert 0.68 < prepared.image.width / prepared.image.height < 0.75
    assert (
        prepared.image.getpixel(
            (round(prepared.image.width * 0.2), round(prepared.image.height * 0.15))
        )
        < 75
    )
    assert (
        115
        < prepared.image.getpixel(
            (round(prepared.image.width * 0.8), round(prepared.image.height * 0.85))
        )
        < 155
    )


def test_two_separate_card_sized_objects_keep_the_whole_image():
    photograph = Image.new("L", (1100, 800), 20)
    photograph.paste(marked_card(), (100, 180))
    photograph.paste(marked_card(), (650, 180))
    prepared = geometry.prepare_card(photograph)
    assert not prepared.rectified
    assert prepared.image.size == photograph.size
    assert prepared.image.tobytes() == photograph.tobytes()
    assert "card_boundary_ambiguous" in prepared.warnings


@pytest.mark.parametrize("kind", ["blank", "noise", "wide_rectangle", "partial"])
def test_uncertain_boundaries_preserve_the_whole_image(kind):
    photograph = Image.new("L", (800, 1000), 20)
    draw = ImageDraw.Draw(photograph)
    if kind == "noise":
        for index in range(75):
            x, y = index * 137 % 750, index * 97 % 950
            draw.ellipse((x, y, x + 30, y + 30), outline=245, width=2)
    elif kind == "wide_rectangle":
        draw.rectangle((100, 400, 700, 600), fill=245)
    elif kind == "partial":
        photograph.paste(marked_card(), (-100, 400))
    prepared = geometry.prepare_card(photograph)
    assert not prepared.rectified
    assert prepared.image.size == photograph.size
    assert prepared.image.tobytes() == photograph.tobytes()


def test_source_is_not_downscaled_until_after_the_card_is_located():
    photograph = Image.new("L", (6000, 2000), 20)
    photograph.paste(marked_card((750, 1050)), (4500, 700))
    stream = io.BytesIO()
    photograph.save(stream, format="PNG")
    decoded = images.decode_image(stream.getvalue(), "image/png")
    assert decoded.size == (6000, 2000)
    prepared = geometry.prepare_card(decoded)
    assert prepared.rectified
    assert prepared.image.height >= 1000
    assert 700 <= prepared.image.width <= 780
    assert not prepared.image.info


def test_rectified_and_fallback_images_remain_bounded():
    photograph = Image.new("L", (4000, 4000), 20)
    photograph.paste(marked_card((2000, 2800)), (1000, 800))
    prepared = geometry.prepare_card(photograph)
    assert prepared.rectified
    assert max(prepared.image.size) <= 2048
    fallback = geometry.prepare_card(Image.new("L", (4000, 4000), 245))
    assert not fallback.rectified
    assert max(fallback.image.size) <= 2048


def test_broken_concave_boundary_recovers_validated_outer_hull(monkeypatch):
    import numpy as np

    # A notch interrupts a rectangular perimeter; no real photograph is stored.
    contour = np.int32(
        [
            [100, 150],
            [400, 150],
            [400, 570],
            [100, 570],
            [100, 400],
            [250, 400],
            [250, 300],
            [100, 300],
        ]
    ).reshape(-1, 1, 2)
    monkeypatch.setattr(geometry.cv2, "findContours", lambda *args: ([contour], None))
    prepared = geometry.prepare_card(Image.new("L", (600, 800), 180))
    assert prepared.rectified
    assert 0.68 < prepared.image.width / prepared.image.height < 0.75


@pytest.mark.parametrize("angle", [0, 24, -17])
def test_detected_outline_is_returned_as_ordered_unit_corners(angle):
    card = marked_card().rotate(
        angle, expand=True, fillcolor=20, resample=Image.Resampling.BICUBIC
    )
    photograph = Image.new("L", (1000, 1000), 20)
    photograph.paste(card, (380, 390))
    prepared = geometry.prepare_card(photograph)
    assert prepared.corners is not None and len(prepared.corners) == 4
    (tlx, tly), (trx, try_), (brx, bry), (blx, bly) = prepared.corners
    assert all(0 <= value <= 1 for corner in prepared.corners for value in corner)
    # Top-left is the corner closest to the origin, bottom-right the farthest.
    assert tlx + tly < trx + try_ and tlx + tly < blx + bly
    assert brx + bry > trx + try_ and brx + bry > blx + bly
    assert trx > tlx and brx > blx and bly > tly and bry > try_
    # The card sits inside the area it was pasted into (380..680 x 390..810 or so).
    xs, ys = [c[0] for c in prepared.corners], [c[1] for c in prepared.corners]
    assert min(xs) > 0.3 and max(xs) < 0.9 and min(ys) > 0.3 and max(ys) < 0.95


@pytest.mark.parametrize("kind", ["blank", "two_cards"])
def test_no_reliable_outline_means_no_corners(kind):
    photograph = Image.new("L", (1100, 800), 20)
    if kind == "two_cards":
        photograph.paste(marked_card(), (100, 180))
        photograph.paste(marked_card(), (650, 180))
    prepared = geometry.prepare_card(photograph)
    assert prepared.corners is None and not prepared.rectified
