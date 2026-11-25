"""Dedicated reading of the footer and the title of foil and full art cards.

On these cards the collector number is printed in white with a dark outline over
artwork, and the title sits on a metallic gradient. The general pass reads neither, so
this module prepares small, enlarged crops of the (already detected) card in several
variants and votes across the readings. It only proposes OCR evidence: the matching
step still decides, and nothing here consults a catalogue or invents a certainty.
"""

import re
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher

import cv2
import numpy as np
from PIL import Image

# (left, top, right, bottom) as fractions of the card.
FOOTER_BOXES = ((0.0, 0.915, 0.62, 1.0), (0.38, 0.915, 1.0, 1.0))
TITLE_BOXES = ((0.08, 0.015, 0.70, 0.085), (0.14, 0.02, 0.64, 0.08))
TARGET_WIDTH = 1500
# The most reads the dedicated passes can spend: 8 footer variants x 2 page modes in
# each of the 2 orientations they try, plus 6 title variants x 2 page modes. The
# worker's own deadline still applies on top of this.
FOOTER_READS_PER_ANGLE = len(FOOTER_BOXES) * 2 * 2 * 2
TITLE_READS = len(TITLE_BOXES) * 3 * 2
MAX_DEDICATED_READS = 2 * FOOTER_READS_PER_ANGLE + TITLE_READS

# A collector number "119/103"; or two numbers whose slash the engine lost ("119 103").
_STRONG = re.compile(r"(?<!\d)(\d{1,3})\s*/\s*(\d{2,3})(?!\d)")
_WEAK = re.compile(r"(?<![\d/])(\d{1,3})\s+(\d{2,3})(?![\d/])")
MIN_VOTES = 2


@dataclass(frozen=True, slots=True)
class FooterReading:
    number: str = ""
    total: int | None = None
    votes: int = 0
    total_votes: int = 0


def _crop(
    card: Image.Image,
    box: tuple[float, float, float, float],
    target: int = TARGET_WIDTH,
) -> np.ndarray:
    width, height = card.size
    left, top, right, bottom = box
    crop = card.convert("RGB").crop(
        (
            round(left * width),
            round(top * height),
            round(right * width),
            round(bottom * height),
        )
    )
    pixels = np.asarray(crop)
    factor = min(5.0, max(1.0, target / max(1, pixels.shape[1])))
    if factor > 1:
        pixels = cv2.resize(
            pixels, None, fx=factor, fy=factor, interpolation=cv2.INTER_CUBIC
        )
    return pixels


def tame_glare(channel: np.ndarray) -> np.ndarray:
    """Clip the brightest 2 % (specular glare) and stretch the rest to full range."""
    low, high = np.percentile(channel, (2, 98))
    stretched = (channel.astype(np.float32) - low) / max(float(high - low), 1.0)
    return np.clip(stretched * 255, 0, 255).astype(np.uint8)


def enclosed_glyphs(pixels: np.ndarray, block: int = 31) -> np.ndarray:
    """Glyphs printed as a fill inside an outline: keep the enclosed regions as text."""
    outline = cv2.adaptiveThreshold(
        pixels, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, -10
    )
    height, width = outline.shape
    padded = cv2.copyMakeBorder(outline, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    cv2.floodFill(padded, np.zeros((height + 4, width + 4), np.uint8), (0, 0), 255)
    enclosed = (padded[1:-1, 1:-1] == 0).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(enclosed)
    glyphs = np.full((height, width), 255, np.uint8)
    for index in range(1, count):
        if (
            stats[index, cv2.CC_STAT_AREA] > 40
            and stats[index, cv2.CC_STAT_HEIGHT] > height * 0.04
        ):
            glyphs[labels == index] = 0
    return glyphs


def footer_variants(card: Image.Image) -> list[Image.Image]:
    """Enlarged bottom strips as black text on white, most promising first.

    ``min`` (the whitest channel) separates white print from red or dark artwork;
    plain luminance covers dark print. Glare is clipped before rendering the glyphs,
    and each strip is rendered at two sizes because the engine's errors change with it.
    """
    variants = []
    for box in FOOTER_BOXES:
        for target in (TARGET_WIDTH, TARGET_WIDTH * 4 // 3):
            crop = _crop(card, box, target)
            gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY)
            # A grayscale card has no whiter-than-red channel: reading twice is waste.
            channels = (
                (gray,) if card.mode in {"L", "LA", "1"} else (crop.min(axis=2), gray)
            )
            for channel in channels:
                glyphs = enclosed_glyphs(tame_glare(channel))
                variants.append(
                    Image.fromarray(
                        cv2.copyMakeBorder(
                            glyphs, 10, 10, 10, 10, cv2.BORDER_CONSTANT, value=255
                        )
                    )
                )
    return variants


def title_variants(card: Image.Image) -> list[Image.Image]:
    """Enlarged title strips: glare-tamed luminance, CLAHE and an adaptive threshold."""
    variants = []
    for box in TITLE_BOXES:
        gray = cv2.cvtColor(_crop(card, box), cv2.COLOR_RGB2GRAY)
        clipped = tame_glare(gray)
        equalized = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4)).apply(clipped)
        adaptive = cv2.adaptiveThreshold(
            equalized, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 41, 12
        )
        for image in (clipped, equalized, adaptive):
            variants.append(
                Image.fromarray(
                    cv2.copyMakeBorder(
                        image, 15, 15, 15, 15, cv2.BORDER_CONSTANT, value=255
                    )
                )
            )
    return variants


def fractions_in(text: str) -> list[tuple[str, int, int]]:
    """(number, total, weight) found in one reading; a visible slash weighs double."""
    found = [(m[1], int(m[2]), 2) for m in _STRONG.finditer(text)]
    found += [(m[1], int(m[2]), 1) for m in _WEAK.finditer(text)]
    return [(n, t, w) for n, t, w in found if 10 <= t <= 400 and 1 <= int(n) <= 999]


def vote_footer(readings: list[str], hint_total: int | None = None) -> FooterReading:
    """Choose the collector number most readings agree on.

    A number needs two votes (a visible slash counts twice). The printed total is more
    legible than the number on these cards, so it can be kept on its own with two votes.
    ``hint_total`` is a total the general pass also saw: matching readings gain a
    vote.
    """
    pairs: Counter[tuple[str, int]] = Counter()
    totals: Counter[int] = Counter()
    for text in dict.fromkeys(readings):
        for number, total, weight in fractions_in(text):
            bonus = 1 if hint_total == total else 0
            pairs[number, total] += weight + bonus
            totals[total] += weight + bonus
    if not pairs:
        return FooterReading()
    ranked = sorted(pairs.items(), key=lambda item: -item[1])
    (number, total), votes = ranked[0]
    # Two readings with the same weight (a "1" read as a "3") are not a reading.
    tied = len(ranked) > 1 and ranked[1][1] == votes
    if votes >= MIN_VOTES and not tied:
        return FooterReading(number, total, votes, totals[total])
    best_total, total_votes = max(totals.items(), key=lambda item: item[1])
    if total_votes >= MIN_VOTES:
        return FooterReading("", best_total, 0, total_votes)
    return FooterReading()


_WORD = re.compile(r"[A-Za-zÀ-ÿ]{3,}")
_CAMEL = re.compile(r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Þ])")


def vote_name(readings: list[str]) -> str:
    """The title words most readings agree on, in the order they were first seen.

    Foil titles come out as "Heat Rotom@x", "HeatiRotom" or "Neat Roton": no single
    reading is trusted. Words of 3+ letters are grouped when they are nearly equal and a
    group needs two different readings to count. A partial name ("Rotom") is a fine
    result: the matching step combines it with the number and the printed total.
    """
    groups: list[dict] = []
    # The same text read twice (two page modes) is one reading, not two votes.
    for index, text in enumerate(dict.fromkeys(readings)):
        split = _CAMEL.sub(" ", text)
        for match in _WORD.finditer(split):
            word, where = match.group(), match.start() / max(1, len(split))
            if word.isupper() and len(word) < 4:
                continue  # short capitals are artwork and shadow noise, not name words
            for group in groups:
                if SequenceMatcher(None, word.lower(), group["key"]).ratio() >= 0.75:
                    group["spellings"][word] += 1
                    group["readings"].add(index)
                    group["where"].append(where)
                    break
            else:
                groups.append(
                    {
                        "key": word.lower(),
                        "spellings": Counter({word: 1}),
                        "readings": {index},
                        "where": [where],
                    }
                )
    kept = [group for group in groups if len(group["readings"]) >= 2]
    kept.sort(key=lambda group: sum(group["where"]) / len(group["where"]))
    return " ".join(group["spellings"].most_common(1)[0][0] for group in kept)


def settled(readings: list[str]) -> bool:
    """True when one collector number clearly leads, so no more readings are needed."""
    pairs: Counter[tuple[str, int]] = Counter()
    for text in dict.fromkeys(readings):
        for number, total, weight in fractions_in(text):
            pairs[number, total] += weight
    ranked = sorted(pairs.values(), reverse=True)
    return (
        bool(ranked)
        and ranked[0] >= 6
        and (len(ranked) == 1 or ranked[1] * 3 <= ranked[0])
    )
