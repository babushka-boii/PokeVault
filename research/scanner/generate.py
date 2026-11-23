"""Original text/geometric OCR specimens; no card photographs or artwork."""

import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent


def font_path() -> str:
    for candidate in (
        os.environ.get("POKEVAULT_SCANNER_FONT", ""),
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "DejaVuSans.ttf",
    ):
        if not candidate:
            continue
        try:
            ImageFont.truetype(candidate, 28)
            return candidate
        except OSError:
            continue
    raise RuntimeError("Install an accented Latin font or set POKEVAULT_SCANNER_FONT")


FONT = font_path()


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT, size)


def specimen(
    name: str,
    number: str,
    heading: str,
    *,
    scale=1.0,
    angle=0,
    low_contrast=False,
    blank=False,
    noise=False,
) -> Image.Image:
    background, ink = (205, 145) if low_contrast else (250, 20)
    image = Image.new("L", (720, 1008), background)
    draw = ImageDraw.Draw(image)
    if not blank:
        draw.text((38, 32), heading, font=font(28), fill=ink)
        title_size = 45
        while draw.textlength(name, font=font(title_size)) > 644:
            title_size -= 1
        draw.text((38, 91), name, font=font(title_size), fill=ink)
        # These shapes are original geometric placeholders, never copied art.
        draw.rectangle((38, 185, 682, 535), outline=ink, width=2)
        draw.ellipse((220, 245, 500, 500), outline=ink, width=3)
        draw.line((38, 185, 682, 535), fill=ink, width=2)
        draw.text((38, 620), "Original synthetic specimen", font=font(25), fill=ink)
        draw.text((38, 676), "No card artwork or photograph", font=font(22), fill=ink)
        if number:
            draw.text((38, 910), number, font=font(36), fill=ink)
    if noise:
        for index in range(80):
            x = (index * 137) % 680
            y = (index * 197) % 968
            draw.ellipse((x, y, x + 30, y + 30), outline=ink, width=2)
    if scale != 1:
        image = image.resize(
            (round(720 * scale), round(1008 * scale)), Image.Resampling.LANCZOS
        )
    if angle:
        image = image.rotate(
            angle, expand=True, fillcolor=background, resample=Image.Resampling.BICUBIC
        )
    return image


def cases() -> list[dict]:
    # Expected identities/names come from the captured official catalog facts.
    return [
        {
            "id": "upright-en",
            "name": "Pikachu",
            "number": "025/165",
            "heading": "BASIC",
            "expected_id": "sv03.5-025",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "upright-es",
            "name": "Furret",
            "number": "136/189",
            "heading": "FASE 1",
            "expected_id": "swsh3-136",
            "language": "es",
            "category": "Pokemon",
        },
        {
            "id": "mild-rotation",
            "name": "Pikachu",
            "number": "025/165",
            "heading": "BASIC",
            "angle": 2.5,
            "expected_id": "sv03.5-025",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "low-contrast-trainer",
            "name": "Professor Oak",
            "number": "088/102",
            "heading": "TRAINER",
            "low_contrast": True,
            "expected_id": "base1-88",
            "language": "en",
            "category": "Trainer",
        },
        {
            "id": "small-punctuation",
            "name": "Mr. Mime",
            "number": "122/165",
            "heading": "BASIC",
            "scale": 0.5,
            "expected_id": "sv03.5-122",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "large-dimensions",
            "name": "Pikachu",
            "number": "025/165",
            "heading": "BASIC",
            "scale": 3,
            "expected_id": "sv03.5-025",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "quarter-turn",
            "name": "Furret",
            "number": "136/189",
            "heading": "STAGE 1",
            "angle": 90,
            "expected_id": "swsh3-136",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "upside-down-energy",
            "name": "Grass Energy",
            "number": "099/102",
            "heading": "ENERGY",
            "angle": 180,
            "expected_id": "base1-99",
            "language": "en",
            "category": "Energy",
        },
        {
            "id": "spanish-accent-trainer",
            "name": "Ornitólogo",
            "number": "159/189",
            "heading": "ENTRENADOR",
            "expected_id": "swsh3-159",
            "language": "es",
            "category": "Trainer",
        },
        {
            "id": "spanish-energy",
            "name": "Energía Psychic Básica",
            "number": "207/165",
            "heading": "ENERGÍA",
            "expected_id": "sv03.5-207",
            "language": "es",
            "category": "Energy",
        },
        {
            "id": "deliberate-name-typo",
            "name": "Pikacbu",
            "number": "025/165",
            "heading": "BASIC",
            "expected_name": "Pikacbu",
            "expected_id": "sv03.5-025",
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "ambiguous-name",
            "name": "Pikachu",
            "number": "",
            "heading": "BASIC",
            "ambiguous": True,
            "language": "en",
            "category": "Pokemon",
        },
        {
            "id": "blank",
            "name": "",
            "number": "",
            "heading": "",
            "blank": True,
            "abstain": True,
        },
        {
            "id": "geometric-noise",
            "name": "",
            "number": "",
            "heading": "",
            "blank": True,
            "noise": True,
            "abstain": True,
        },
    ]


def generate(destination: Path = ROOT / "samples") -> list[dict]:
    destination.mkdir(parents=True, exist_ok=True)
    manifest = []
    for case in cases():
        options = {
            key: case[key]
            for key in ("scale", "angle", "low_contrast", "blank", "noise")
            if key in case
        }
        image = specimen(case["name"], case["number"], case["heading"], **options)
        target = destination / f"{case['id']}.png"
        image.save(target)
        manifest.append(
            {
                **case,
                "file": target.name,
                "size": list(image.size),
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            }
        )
    (destination / "manifest.json").write_text(
        json.dumps(
            {
                "provenance": "Original text/geometric specimens generated by generate.py; no card art or photographs. Names/numbers in identified cases are catalog facts, with deliberate typo case labeled separately.",
                "font": FONT,
                "cases": manifest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return manifest


if __name__ == "__main__":
    generate()
