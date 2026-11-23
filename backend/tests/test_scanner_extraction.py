"""OCR clues must come from printed evidence, rather than inferred card identities."""

import pytest

from app.scanner import extraction


@pytest.mark.parametrize(
    ("lines", "name", "number", "total", "category", "language"),
    [
        (
            ["BASIC", "Mr. Mime HP 90", "025/198", "© 2025 Pokémon"],
            "Mr. Mime",
            "025",
            198,
            "Pokemon",
            "en",
        ),
        (
            ["ENTRENADOR", "Investigación de Profesores", "O25/I98"],
            "Investigación de Profesores",
            "025",
            198,
            "Trainer",
            "es",
        ),
        (
            ["ENERGÍA", "Energía Básica Rayo", "TG01/TG30"],
            "Energía Básica Rayo",
            "TG01",
            30,
            "Energy",
            "es",
        ),
        (
            ["TRAINER", "Professor's Research", "201/198"],
            "Professor's Research",
            "201",
            198,
            "Trainer",
            "en",
        ),
    ],
)
def test_extracts_printed_clues_without_losing_punctuation_or_prefixes(
    lines, name, number, total, category, language
):
    result = extraction.extract_clues(lines)
    assert result.name == name
    assert result.local_number == number
    assert result.printed_total == total
    assert result.category == category
    assert result.language == language
    assert result.set_id is None


def test_does_not_turn_hp_attack_damage_or_years_into_a_card_number():
    result = extraction.extract_clues(
        ["BASIC", "Pikachu HP 60", "Thunder Shock 30", "© 2025 Pokémon"]
    )
    assert result.local_number == ""
    assert result.printed_total is None


@pytest.mark.parametrize(
    "line",
    [
        "HP 60/100",
        "PS 60/100",
        "Attack damage 20/30",
        "Ataque daño 20/30",
        "HP60/100",
        "PS60/100",
        "Attack20/30",
        "Ataque20/30",
        "© 1999/2000 Pokémon",
    ],
)
def test_non_identifier_fraction_context_is_not_a_printed_card_number(line):
    result = extraction.extract_clues(["Pikachu", line])
    assert result.local_number == ""
    assert result.printed_total is None


def test_conflicting_printed_fractions_abstain_from_an_arbitrary_number():
    result = extraction.extract_clues(["Pikachu", "025/198", "026/198"])
    assert result.local_number == ""
    assert result.printed_total is None


def test_does_not_correct_letters_outside_a_numeric_fraction():
    result = extraction.extract_clues(["TRAINER", "Iono", "OOO/III", "HP 120"])
    assert result.name == "Iono"
    assert result.local_number == ""


def test_explicit_expansion_label_is_a_hint_until_catalog_verification():
    result = extraction.extract_clues(["Pikachu", "Expansion: Surging Sparks"])
    assert result.set_hint == "Surging Sparks"
    assert result.set_id is None


def test_name_comes_from_top_region_instead_of_attack_or_copyright_text():
    result = extraction.extract_clues(
        [
            extraction.OCRLine("Pikachu HP 60", top=0.04),
            extraction.OCRLine("Thunder Shock", top=0.55),
            extraction.OCRLine("025/198", top=0.92),
            extraction.OCRLine("© 2025 Pokémon", top=0.97),
        ]
    )
    assert result.name == "Pikachu"
    assert result.local_number == "025"


def test_blank_or_body_only_text_does_not_invent_a_name():
    result = extraction.extract_clues(
        [extraction.OCRLine("Draw three cards.", top=0.70)]
    )
    assert result.name == ""
    assert result.category is None


def test_isolated_single_letter_noise_is_not_a_name():
    result = extraction.extract_clues([extraction.OCRLine("Y", top=0.10)])
    assert result.name == ""


def test_explicit_trainer_heading_preserves_a_real_single_letter_title():
    result = extraction.extract_clues(["TRAINER", "N", "105/124"])
    assert result.name == "N"
    assert result.category == "Trainer"


def test_normalization_is_accent_case_and_punctuation_insensitive():
    assert extraction.normalize_text("  Flabébé — Mr. Mime! ") == "flabebe mr mime"


def test_clues_are_bounded_and_strip_control_characters():
    result = extraction.extract_clues(["Flabébé\x00 HP 40", "X" * 300])
    assert result.name == "Flabébé"
    assert len(result.name) <= 100


def test_fragmented_trainer_header_is_not_the_stadium_title():
    from app.scanner.extraction import OCRLine, extract_clues

    clues = extract_clues(
        [
            OCRLine("EN: TRENADOR", top=0.02, confidence=95),
            OCRLine("Est.", top=0.03, confidence=94),
            OCRLine("Torre del Viento", top=0.08, confidence=96),
            OCRLine("261/217", top=0.96, confidence=92),
        ]
    )
    assert clues.name == "Torre del Viento"
    assert (clues.local_number, clues.printed_total) == ("261", 217)
