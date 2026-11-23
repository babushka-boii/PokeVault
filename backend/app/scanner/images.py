"""Bounded image validation and preprocessing, used inside the OCR worker."""

import io
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError, features

from app.scanner.errors import ScanError
from app.scanner.heif import register_heif
from app.scanner.schemas import MAX_UPLOAD_BYTES

MAX_PIXELS = 16_000_000
MAX_EDGE = 8192
NORMALIZED_EDGE = 2048
_FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def supported_formats() -> list[str]:
    result = ["image/jpeg", "image/png"]
    if features.check("webp"):
        result.append("image/webp")
    if register_heif():
        result.extend(("image/heic", "image/heif"))
    return result


def validate_upload(data: bytes, content_type: str) -> None:
    if not data:
        raise ScanError("empty_image", 422)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ScanError("image_too_large", 413)
    if content_type not in supported_formats():
        raise ScanError("unsupported_image_type", 415)


def _validate_header(image: Image.Image, content_type: str) -> None:
    matches_heif = image.format == "HEIF" and content_type in {
        "image/heic",
        "image/heif",
    }
    if not matches_heif and _FORMATS.get(image.format) != content_type:
        raise ScanError("image_type_mismatch", 415)
    width, height = image.size
    if (
        width < 1
        or height < 1
        or max(width, height) > MAX_EDGE
        or width * height > MAX_PIXELS
    ):
        raise ScanError("image_dimensions_exceeded", 422)
    if getattr(image, "n_frames", 1) != 1 or getattr(image, "is_animated", False):
        raise ScanError("animated_image", 422)


def decode_image(data: bytes, content_type: str) -> Image.Image:
    """Validate before decoding; retain source pixels for subsequent framing."""
    validate_upload(data, content_type)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                _validate_header(image, content_type)
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                _validate_header(image, content_type)
                oriented = ImageOps.exif_transpose(image)
                # White compositing preserves transparent PNG text edges without
                # allowing the transparent RGB channels to become invisible ink.
                if oriented.mode in {"RGBA", "LA", "P"}:
                    rgba = oriented.convert("RGBA")
                    background = Image.new("RGBA", rgba.size, "white")
                    background.alpha_composite(rgba)
                    oriented = background.convert("RGB")
                gray = ImageOps.grayscale(oriented)
                clean = Image.new("L", gray.size)
                clean.paste(gray)
                return clean
    except (Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise ScanError("image_dimensions_exceeded", 422) from exc
    except ScanError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise ScanError("invalid_image", 422) from exc


def normalize_pixels(image: Image.Image) -> Image.Image:
    """Bound working pixels and gently improve contrast without retaining metadata."""
    gray = image.convert("L")
    gray.thumbnail((NORMALIZED_EDGE, NORMALIZED_EDGE), Image.Resampling.LANCZOS)
    contrast = ImageOps.autocontrast(gray, cutoff=1)
    adjusted = Image.blend(gray, contrast, 0.5)
    clean = Image.new("L", adjusted.size)
    clean.paste(adjusted)
    return clean


def normalize_image(data: bytes, content_type: str) -> Image.Image:
    """Backwards-compatible bounded grayscale image for whole-frame consumers."""
    return normalize_pixels(decode_image(data, content_type))
