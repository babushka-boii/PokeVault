"""HEIC enters the same validated, metadata-free private image pipeline."""

import io

import pytest
from PIL import Image

from app.scanner.errors import ScanError
from app.scanner.images import normalize_image, supported_formats


def heif_bytes(*, many=False):
    from pillow_heif import register_heif_opener

    register_heif_opener(
        decode_threads=1, thumbnails=False, depth_images=False, aux_images=False
    )
    image = Image.new("RGB", (40, 60), "white")
    image.paste("black", (0, 0, 20, 30))
    out = io.BytesIO()
    image.save(
        out,
        format="HEIF",
        quality=100,
        save_all=many,
        append_images=[Image.new("RGB", (40, 60), "red")] if many else [],
    )
    return out.getvalue()


@pytest.mark.parametrize("mime", ["image/heic", "image/heif"])
def test_native_heif_is_accepted_and_stripped(mime):
    assert mime in supported_formats()
    image = normalize_image(heif_bytes(), mime)
    assert image.size == (40, 60)
    assert image.mode == "L"
    assert image.info == {}
    assert image.getpixel((5, 5)) < 20
    assert image.getpixel((35, 55)) > 230


def test_heif_content_must_match_declared_format():
    with pytest.raises(ScanError) as caught:
        normalize_image(heif_bytes(), "image/png")
    assert caught.value.code == "image_type_mismatch"


def test_heif_multiple_images_are_rejected():
    with pytest.raises(ScanError) as caught:
        normalize_image(heif_bytes(many=True), "image/heic")
    assert caught.value.code == "animated_image"


def test_heif_dimensions_are_bounded_before_decode(monkeypatch):
    data = heif_bytes()
    monkeypatch.setattr("app.scanner.images.MAX_PIXELS", 100)
    with pytest.raises(ScanError) as caught:
        normalize_image(data, "image/heic")
    assert caught.value.code == "image_dimensions_exceeded"


def test_missing_heif_decoder_keeps_common_formats(monkeypatch):
    monkeypatch.setattr("app.scanner.images.register_heif", lambda: False)
    assert "image/heic" not in supported_formats()
    assert {"image/jpeg", "image/png"} <= set(supported_formats())


def test_heif_applies_orientation_once_and_removes_metadata():
    from pillow_heif import register_heif_opener

    register_heif_opener(decode_threads=1)
    original = Image.new("RGB", (40, 60), "white")
    original.paste("black", (0, 0, 20, 30))
    exif = Image.Exif()
    exif[274] = 6
    out = io.BytesIO()
    original.save(out, format="HEIF", quality=100, exif=exif.tobytes())
    decoded = normalize_image(out.getvalue(), "image/heic")
    assert decoded.size == (60, 40)
    assert decoded.getpixel((55, 5)) < 20
    assert decoded.getpixel((5, 35)) > 230
    assert decoded.info == {}


def test_corrupt_heic_is_rejected_by_content():
    with pytest.raises(ScanError) as caught:
        normalize_image(b"not an image", "image/heic")
    assert caught.value.code == "invalid_image"
