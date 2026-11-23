"""Regression coverage for card-relative text and conservative OCR titles."""

import asyncio
from pathlib import Path

from PIL import Image

from app.scanner import worker
from app.scanner.extraction import OCRLine, extract_clues, normalize_text
from app.scanner.ocr import OCRService
from app.scanner.worker import _lines


def test_two_letter_noise_does_not_become_an_identifying_name():
    result = extract_clues([OCRLine("se", top=0.10, confidence=91)])
    assert result.name == ""


def test_low_confidence_header_noise_does_not_hide_a_legible_title():
    result = extract_clues(
        [
            OCRLine("BASIC", top=0.02, confidence=94),
            OCRLine("llmmm", top=0.04, confidence=28),
            OCRLine("Cranidos", top=0.10, confidence=95),
        ]
    )
    assert result.name == "Cranidos"


def test_footer_coordinates_remain_below_the_name_region_after_crop_upscaling():
    output = (
        b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"
        b"5\t1\t1\t1\t100\t40\t95\tIllustrator\n"
        b"5\t2\t1\t1\t100\t220\t95\t025/165\n"
    )
    lines = _lines(output, (1000, 400), region=(0.0, 0.76, 1.0, 1.0))
    assert lines[0].top == 0.784
    assert lines[0].left == 0.1
    clues = extract_clues(lines)
    assert clues.name == ""
    assert clues.local_number == "025"


def test_literal_quote_token_does_not_consume_later_tesseract_rows():
    output = (
        b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"
        b'5\t1\t1\t1\t10\t10\t80\t"\n'
        b"5\t2\t1\t1\t20\t40\t95\tPikachu\n"
        b"5\t3\t1\t1\t20\t380\t95\t025/165\n"
    )
    clues = extract_clues(_lines(output, (300, 420)))
    assert clues.name == "Pikachu"
    assert clues.local_number == "025"


def test_title_pass_omits_low_confidence_background_words():
    output = (
        b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"
        b"5\t1\t1\t1\t20\t10\t86\t(Dragonite,\n"
        b"5\t1\t1\t1\t150\t20\t42\tGa\n"
    )
    clues = extract_clues(_lines(output, (300, 100), minimum_confidence=55))
    assert clues.name == "Dragonite"


def test_ocr_decoration_at_title_edges_is_not_part_of_the_card_name():
    assert (
        extract_clues([OCRLine("‘Slowpoke", top=0.04, confidence=72)]).name
        == "Slowpoke"
    )


def test_unproductive_quad_retains_a_full_photograph_ocr_path(tmp_path, monkeypatch):
    image = Image.new("L", (1000, 1000), 20)
    image.paste(Image.new("L", (300, 420), 245), (400, 350))
    upload = tmp_path / "border.png"
    image.save(upload)

    def native_output(engine, path, languages, timeout, *, psm=11):
        # Only the original frame carries identifying output. This substitutes
        # the external engine while exercising real geometry/crop/fallback code.
        header = b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"
        with Image.open(path) as pixels:
            if pixels.size == (1000, 1000):
                return header + (
                    b"5\t1\t1\t1\t20\t40\t95\tDragonite\n"
                    b"5\t2\t1\t1\t20\t900\t95\t149/165\n"
                )
        return header

    monkeypatch.setattr(worker, "_tesseract", native_output)
    result = worker.recognize_file(upload, "image/png", "native", "eng", 5)
    assert result.clues.name == "Dragonite"
    assert result.clues.local_number == "149"
    assert result.clues.printed_total == 165


def test_actual_ocr_finds_title_on_a_small_card_low_in_a_dark_photo(tmp_path):
    source = (
        Path(__file__).resolve().parents[2] / "research/scanner/samples/upright-en.png"
    )
    image = Image.new("L", (2400, 2400), 25)
    with Image.open(source) as card:
        image.paste(card.resize((600, 840)), (900, 1000))
    upload = tmp_path / "ordinary-framing.png"
    image.save(upload)

    async def run():
        service = OCRService()
        capabilities = await service.capabilities()
        if set(capabilities.languages) != {"eng", "spa"}:
            import pytest

            pytest.skip("Optional native Tesseract eng+spa data unavailable")
        return await service.recognize(upload.read_bytes(), "image/png")

    result = asyncio.run(run())
    assert normalize_text(result.clues.name) == "pikachu"
    assert result.clues.local_number == "025"
    assert result.clues.printed_total == 165


def test_trainer_recovery_uses_wide_title_region_without_extra_retries(
    tmp_path, monkeypatch
):
    from app.scanner.geometry import PreparedCard

    upload = tmp_path / "trainer.png"
    Image.new("L", (600, 800), 200).save(upload)
    monkeypatch.setattr(
        worker, "prepare_card", lambda image: PreparedCard(image, False, [])
    )
    calls = []
    header = b"level\tblock_num\tpar_num\tline_num\tleft\ttop\tconf\ttext\n"

    def native(engine, path, languages, timeout, *, psm=11):
        calls.append(psm)
        if psm == 6:
            return header + b"5\t1\t1\t1\t30\t25\t96\tWind Stadium\n"
        return header + b"5\t1\t1\t1\t30\t10\t96\tTRAINER\n"

    monkeypatch.setattr(worker, "_tesseract", native)
    result = worker.recognize_file(upload, "image/png", "unused", "eng", 5)
    assert result.clues.name == "Wind Stadium"
    assert calls.count(6) == 1
    assert len(calls) <= 7
