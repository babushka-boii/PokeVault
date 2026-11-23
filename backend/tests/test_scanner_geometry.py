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
