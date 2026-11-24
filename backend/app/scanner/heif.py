"""Optional portable HEIF decoder registration, with native safeguards intact."""

from functools import lru_cache


@lru_cache(maxsize=1)
def register_heif() -> bool:
    try:
        from pillow_heif import options, register_heif_opener

        options.DISABLE_SECURITY_LIMITS = False
        register_heif_opener(
            decode_threads=1,
            thumbnails=False,
            depth_images=False,
            aux_images=False,
        )
        return True
    except ImportError, OSError:
        # Common image formats/manual matching remain available without the
        # optional native binary on an unsupported deployment platform.
        return False
