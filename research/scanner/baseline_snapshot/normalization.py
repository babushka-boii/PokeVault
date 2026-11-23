"""Deterministic comparison keys; no card identity or OCR digit substitution."""

import re
import unicodedata


def name_key(value: str) -> str:
    value = value.replace("♀", " female ").replace("♂", " male ")
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    return "".join(char for char in decomposed if char.isalnum())


def number_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).upper().strip()
    normalized = re.sub(r"[\s.\-]", "", normalized)
    match = re.fullmatch(r"([A-Z]{0,6})([0-9]{1,5})([A-Z]{0,2})", normalized)
    if match is None:
        return ""
    prefix, digits, suffix = match.groups()
    return f"{prefix}{int(digits)}{suffix}"


def useful_name(value: str) -> bool:
    return (
        sum(char.isalpha() for char in value) >= 3
        and name_key(value)
        not in {
            "pokemon",
            "trainer",
            "entrenador",
            "energy",
            "energia",
            "basic",
            "basico",
            "stage",
            "fase",
            "card",
            "carta",
        }
        and not any(
            char in "|*" or ord(char) < 32 or ord(char) == 127 for char in value
        )
        and not re.match(
            r"^(?:eq|neq|like|not|notlike|gte|lte|gt|lt|null|notnull)\s*:",
            value,
            re.IGNORECASE,
        )
    )
