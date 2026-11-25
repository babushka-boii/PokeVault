"""Foil and full art cards: dedicated footer and title passes (synthetic fixtures)."""

import cv2
import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

from app.scanner import foil, worker
from app.scanner.foil import (
    FooterReading,
    footer_variants,
    title_variants,
    vote_footer,
    vote_name,
)
from app.scanner.geometry import PreparedCard

HEADER = b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"


def row(text, conf=90, line=1, top=10):
    return f"5\t1\t1\t{line}\t10\t{top}\t{conf}\t{text}\n".encode()


def foil_card(width=786, height=1116, mode="RGB"):
    """A red, softly textured card with a white, dark-outlined bottom-left number."""
    rng = np.random.default_rng(7)
    base = np.zeros((height, width, 3), np.float32)
    base[:] = (190, 50, 30)
    glare = cv2.GaussianBlur(
        rng.integers(-90, 90, base.shape).astype(np.float32), (0, 0), 6
    )
    image = Image.fromarray(np.clip(base + glare, 0, 255).astype(np.uint8))
    draw = ImageDraw.Draw(image)
    draw.text(
        (118, round(0.952 * height)),
        "119/103",
        font=ImageFont.load_default(size=40),
        fill=(255, 255, 255),
        stroke_width=2,
        stroke_fill=(25, 25, 40),
    )
    return image.convert(mode)


# --- Voting --------------------------------------------------------------------------


def test_a_visible_slash_counts_double_and_two_readings_agree():
    reading = vote_footer(["Illus 119/103 xx", "DLR 119/103", "noise"])
    assert (reading.number, reading.total) == ("119", 103)
    assert reading.votes == 4


def test_a_single_visible_slash_is_enough_but_a_single_weak_pair_is_not():
    assert vote_footer(["119/103"]).number == "119"
    assert vote_footer(["119 103"]) == FooterReading()  # slash lost: one weak vote only


def test_a_lost_slash_counts_when_two_readings_agree():
    assert vote_footer(["119 103", "J 119 103 **"]).number == "119"


def test_two_numbers_with_equal_weight_are_not_a_reading_but_the_total_can_survive():
    reading = vote_footer(["319/103", "119/103", "19 103"])
    assert reading.number == "" and reading.total == 103


def test_the_total_the_general_pass_saw_breaks_a_tie():
    readings = ["19/108", "119/103"]
    assert vote_footer(readings).number == ""
    assert vote_footer(readings, hint_total=103).number == "119"


@pytest.mark.parametrize(
    "text", ["", "Illus. Sban Graphics", "1/2", "999/9", "0/500", "12345/678"]
)
def test_nothing_plausible_is_no_reading(text):
    assert vote_footer([text]) == FooterReading()


def test_title_words_are_voted_in_reading_order_and_noise_is_dropped():
    name = vote_name(
        ["m Heat Rotom@x", "HeatiRotom@ne,", "Neat Roton xx SSA", "SSA", "Zork"]
    )
    assert name == "Heat Rotom"


def test_a_partial_name_is_still_a_result_and_a_single_reading_is_not():
    assert vote_name(["Rotom ex", "Rotom@x"]) == "Rotom"
    assert vote_name(["Heat Rotom"]) == ""


def test_the_same_text_read_twice_counts_once():
    assert vote_name(["Rotom ex", "Rotom ex"]) == ""


def test_settled_needs_a_clear_leader():
    assert foil.settled(["119/103", "x 119/103", "y 119/103"])
    assert not foil.settled(["119/103", "319/103", "119/103"])


# --- Images --------------------------------------------------------------------------


def test_footer_variants_turn_white_outlined_print_into_black_text_on_white():
    variants = footer_variants(foil_card())
    assert len(variants) == foil.FOOTER_READS_PER_ANGLE // 2
    left = variants[0]  # left box, whitest channel (a colour card has one)
    assert (
        len(footer_variants(foil_card(mode="L"))) == len(variants) // 2
    )  # grey: one channel
    pixels = np.asarray(left)
    dark = pixels == 0
    assert dark.any() and dark.mean() < 0.2
    columns = np.nonzero(dark.any(axis=0))[0]
    # The number sits between 17 % and 40 % of the card's width, i.e. inside the strip.
    assert (
        columns.min() > 0.15 * pixels.shape[1]
        and columns.max() < 0.70 * pixels.shape[1]
    )


def test_glare_is_clipped_before_binarizing():
    channel = np.full((40, 200), 120, np.uint8)
    channel[:, :10] = 255  # specular streak
    tamed = foil.tame_glare(channel)
    assert tamed.min() == 0 and tamed.max() == 255
    assert (tamed[:, 60:].max() - tamed[:, 60:].min()) <= 1


def test_variant_sets_have_distinct_sizes_so_a_test_double_can_tell_them_apart():
    card = foil_card()
    assert not {v.size for v in footer_variants(card)} & {
        v.size for v in title_variants(card)
    }


# --- Worker flow ---------------------------------------------------------------------


def prepared(card):
    return lambda image: PreparedCard(card, True, ["card_rectified"])


def run_worker(tmp_path, monkeypatch, card, answer):
    upload = tmp_path / "photo.png"
    Image.new("L", (1000, 1400), 120).save(upload)
    monkeypatch.setattr(worker, "prepare_card", prepared(card))
    calls = []

    def native(engine, path, languages, timeout, *, psm=11):
        with Image.open(path) as im:
            size = im.size
        calls.append((size, psm))
        return answer(size, psm)

    monkeypatch.setattr(worker, "_tesseract", native)
    return worker.recognize_file(upload, "image/png", "native", "eng", 5), calls


def test_a_foil_fraction_is_voted_over_noise_and_fixes_a_noisy_general_read(
    tmp_path, monkeypatch
):
    card = foil_card(mode="L")
    footer_sizes = {v.size for v in footer_variants(card)}
    title_sizes = {v.size for v in title_variants(card)}
    texts = iter(["Heat Rotom@x", "HeatiRotom", "Neat Roton", "Heat Rotom ex"] * 4)

    def answer(size, psm):
        if size in footer_sizes:
            return HEADER + row("DLR EN 119/103 **")
        if size in title_sizes:
            return HEADER + row(next(texts))
        # The general pass: noise that looks like a title and a wrong fraction.
        return (
            HEADER
            + row("er qusuoddo anok 40 st", conf=40, top=20)
            + row("9/94", conf=80, line=2, top=800)
        )

    result, _ = run_worker(tmp_path, monkeypatch, card, answer)
    assert (result.clues.local_number, result.clues.printed_total) == ("119", 103)
    assert result.clues.name == "Heat Rotom"
    assert "localization_conflict" not in result.warnings


def test_a_partial_name_with_the_total_is_kept_for_the_matching_step(
    tmp_path, monkeypatch
):
    card = foil_card(mode="L")
    footer_sizes = {v.size for v in footer_variants(card)}
    title_sizes = {v.size for v in title_variants(card)}

    def answer(size, psm):
        if size in footer_sizes:
            return HEADER + row("19 103") if psm == 7 else HEADER + row("J 119 103")
        if size in title_sizes:
            return HEADER + row("Rotom@x" if psm == 7 else "ee Rotom")
        return HEADER

    result, _ = run_worker(tmp_path, monkeypatch, card, answer)
    assert result.clues.name == "Rotom"
    assert (
        result.clues.printed_total == 103
    )  # the number was ambiguous, the total was not
    assert result.clues.local_number in {"", "119"}


def test_no_reading_at_all_changes_nothing_and_stays_bounded(tmp_path, monkeypatch):
    result, calls = run_worker(
        tmp_path, monkeypatch, foil_card(mode="L"), lambda size, psm: HEADER
    )
    assert result.clues.name == "" and result.clues.local_number == ""
    assert len(calls) <= 12 + foil.MAX_DEDICATED_READS


def test_a_clean_normal_card_never_runs_the_dedicated_passes(tmp_path, monkeypatch):
    card = foil_card(mode="L")
    dedicated = {v.size for v in footer_variants(card)} | {
        v.size for v in title_variants(card)
    }

    def answer(size, psm):
        return (
            HEADER
            + row("Dragonite", conf=96, top=30)
            + row("149/165", conf=95, line=2, top=800)
        )

    result, calls = run_worker(tmp_path, monkeypatch, card, answer)
    assert (
        result.clues.name,
        result.clues.local_number,
        result.clues.printed_total,
    ) == ("Dragonite", "149", 165)
    assert not any(size in dedicated for size, _ in calls)
