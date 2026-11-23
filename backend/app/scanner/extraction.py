"""Conservative extraction of printed card clues from bounded OCR lines."""

import re
import unicodedata
from collections.abc import Sequence
from dataclasses import dataclass

from app.scanner.schemas import ScanClues


@dataclass(frozen=True, slots=True)
class OCRLine:
    text: str
    top: float = 0.0
    left: float = 0.0
    confidence: float = 0.0


def normalize_text(value: str) -> str:
    """Compare accents/punctuation without changing the displayed OCR spelling."""
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    plain = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(re.sub(r"[^\w]+", " ", plain).split())


_FRACTION = re.compile(
    r"(?<![A-Za-z0-9])([A-Za-z0-9]{1,12})\s*/\s*"
    r"([A-Za-z0-9]{1,8})(?![A-Za-z0-9])"
)
_SET_LABEL = re.compile(r"^(?:set|expansion|expansión|colección)\s*:\s*(.+)$", re.I)
_LABELS = {
    "basic",
    "basico",
    "basica",
    "stage 1",
    "stage 2",
    "fase 1",
    "fase 2",
    "trainer",
    "entrenador",
    "energy",
    "energia",
    "pokemon",
    "supporter",
    "partidario",
    "item",
    "objeto",
    "stadium",
    "estadio",
    "est",
}
_NUMERIC_TRANSLATION = str.maketrans({"O": "0", "I": "1", "L": "1"})


def _clean(value: str) -> str:
    return " ".join(
        "".join(
            c
            for c in unicodedata.normalize("NFC", value)
            if ord(c) >= 32 and ord(c) != 127
        ).split()
    )[:200]


def _number_token(value: str) -> tuple[str, str, int] | None:
    # Only fraction context permits O/I/L correction, and at least one real
    # digit is required. Prefixes such as TG, SVP and SWSH remain printed text.
    token = value.upper()
    match = re.fullmatch(r"([A-HJ-KM-NP-Z]{0,4})([0-9OIL]{1,4})", token)
    if match is None:
        return None
    prefix, digits = match.groups()
    corrected = digits.translate(_NUMERIC_TRANSLATION)
    return prefix, prefix + corrected, int(corrected)


def _fraction_clue(text: str) -> list[tuple[str, int]]:
    normal = normalize_text(text)
    if any(
        word in normal.split()
        for word in ("copyright", "damage", "dano", "attack", "ataque", "hp", "ps")
    ):
        return []
    if re.search(r"\b(?:hp|ps)\s*[0-9oil]", normal):
        return []
    result = []
    for match in _FRACTION.finditer(text):
        left, right = match.groups()
        if not any(c in "0123456789" for c in left + right):
            continue
        local, total = _number_token(left), _number_token(right)
        if local is None or total is None:
            continue
        if "©" in text and 1900 <= local[2] <= 2100:
            continue
        if total[0] and local[0] != total[0]:
            continue
        if 1 <= total[2] <= 2000:
            result.append((local[1], total[2]))
    return result


def _name(text: str) -> str:
    normal = normalize_text(text)
    if (
        normal in _LABELS
        or normal.replace(" ", "") in {"entrenador", "trainer", "stadium", "estadio"}
        or not any(c.isalpha() for c in text)
        or "/" in text
        or _SET_LABEL.match(text)
        or "©" in text
        or re.search(
            r"\b(?:copyright|illustrator|ilustrador|evolves|evoluciona)\b", normal
        )
        or re.match(r"^(?:hp|ps|stage|fase|draw|roba|attack|ataque)\b", normal)
    ):
        return ""
    value = re.sub(r"\s*\b(?:HP|PS)\s*\d+\b.*$", "", text, flags=re.I)
    value = re.sub(r"\s*\b\d+\s*(?:HP|PS)\b.*$", "", value, flags=re.I)
    value = re.sub(
        r"^(?:BASIC|BÁSICO|BASICO|TRAINER|ENTRENADOR)\s+", "", value, flags=re.I
    )
    if normalize_text(value) in _LABELS or len(value) > 100:
        return ""
    return value.strip(' |:;-()[],"“”‘’')


def extract_clues(lines: Sequence[str | OCRLine]) -> ScanClues:
    """Extract clues conservatively; an expansion hint is never a verified ID."""
    bounded = [
        OCRLine(_clean(line.text), line.top, line.left, line.confidence)
        if isinstance(line, OCRLine)
        else OCRLine(_clean(line), top=index / 12)
        for index, line in enumerate(lines[:128])
    ]
    bounded = [line for line in bounded if line.text]
    top = sorted(
        (line for line in bounded if 0 <= line.top <= 0.30),
        key=lambda line: (line.top, line.left),
    )
    headings = [normalize_text(line.text) for line in top]
    words = set(" ".join(headings).split())
    category = None
    if {"trainer", "entrenador"} & words:
        category = "Trainer"
    elif any(
        h in {"energy", "energia"}
        or re.match(
            r"^(?:basic|basica|energia basica)\b.*\b(?:energy|energia|rayo)\b", h
        )
        for h in headings
    ):
        category = "Energy"
    elif any(
        h in {"basic", "basico", "pokemon", "stage 1", "stage 2", "fase 1", "fase 2"}
        or h.startswith(("basic ", "basico "))
        for h in headings
    ):
        category = "Pokemon"

    spanish = bool({"entrenador", "energia", "basico", "basica", "fase", "ps"} & words)
    english = bool({"trainer", "energy", "basic", "stage", "hp"} & words)
    language = (
        "es" if spanish and not english else "en" if english and not spanish else None
    )
    fractions = {clue for line in bounded for clue in _fraction_clue(line.text)}
    local_number, printed_total = (
        next(iter(fractions)) if len(fractions) == 1 else ("", None)
    )
    set_hint = next(
        (
            match.group(1)[:100]
            for line in bounded
            if (match := _SET_LABEL.match(line.text))
        ),
        "",
    )
    name = next(
        (
            name
            for line in top
            if (line.confidence == 0 or line.confidence >= 45)
            and (name := _name(line.text))
            and (category == "Trainer" or sum(char.isalpha() for char in name) >= 3)
        ),
        "",
    )
    return ScanClues(
        name=name,
        local_number=local_number,
        printed_total=printed_total,
        set_hint=set_hint,
        category=category,
        language=language,
    )
