"""Hybrid evidence remains bounded, optional and subordinate to canonical identity."""

import asyncio
import json
from pathlib import Path

import pytest

from app.scanner.schemas import MatchResult, ScanCandidate, ScanClues


def candidate(identifier="me05-044", number="044", quality="uncertain"):
    return ScanCandidate(
        card={
            "id": identifier,
            "local_id": number,
            "name": "Cranidos",
            "language": "en",
            "image_url": None,
            "thumbnail_url": None,
            "image_language": "en",
            "image_sources": [],
        },
        set={"id": "me05", "name": "Pitch Black", "official_count": 84},
        quality=quality,
        evidence=["number_exact", "printed_total"],
    )


def result():
    return MatchResult(
        clues=ScanClues(name="noise", local_number="044", printed_total=84),
        status="matches",
        candidates=[candidate(), candidate("me05-086", "086")],
        warnings=["conflicting_clues"],
    )


def test_visual_support_cannot_override_number_conflict_or_invent_identity():
    from app.scanner.hybrid import combine_visual

    original = result()
    ranked = combine_visual(
        original,
        {
            "matches": [
                {"card_id": "invented-001", "inliers": 1000, "support": 1.0},
                {"card_id": "me05-086", "inliers": 200, "support": 0.8},
                {"card_id": "me05-044", "inliers": 60, "support": 0.4},
            ],
            "ambiguous": False,
        },
    )
    assert ranked.candidates[0].card.id == "me05-044"
    assert ranked.candidates[0].quality == "possible"
    assert ranked.candidates[0].evidence[-1] == "visual_features"
    assert ranked.candidates[1].quality == "uncertain"
    assert "visual_conflict" in ranked.warnings
    assert original.candidates[0].evidence == ["number_exact", "printed_total"]


def test_shared_artwork_stays_ambiguous():
    from app.scanner.hybrid import combine_visual

    original = result()
    ranked = combine_visual(
        original,
        {
            "matches": [
                {"card_id": "me05-044", "inliers": 60, "support": 0.4},
                {"card_id": "me05-086", "inliers": 59, "support": 0.4},
            ],
            "ambiguous": True,
        },
    )
    assert "visual_ambiguous" in ranked.warnings
    assert all(c.quality == "uncertain" for c in ranked.candidates)


def test_empty_visual_evidence_preserves_textual_ranking():
    from app.scanner.hybrid import combine_visual

    original = result()
    assert combine_visual(original, {"matches": [], "ambiguous": False}) == original


@pytest.mark.parametrize(
    "payload",
    [
        {"matches": "bad"},
        {"matches": [{"card_id": "me05-044", "inliers": -1, "support": 10}]},
        {"matches": [], "ambiguous": "false"},
    ],
)
def test_malformed_worker_evidence_is_not_trusted(payload):
    from app.scanner.hybrid import combine_visual

    with pytest.raises(ValueError):
        combine_visual(result(), payload)


def test_visual_worker_scratch_is_removed_and_no_private_data_cached(
    tmp_path, monkeypatch
):
    from app.scanner.hybrid import VisualService

    paths = []

    class Provider:
        async def scanner_artwork(self, card, set_id):
            assert set_id == "me05"
            return b"public-reference"

    async def capture(argv, timeout, limit, **kwargs):
        upload = Path(argv[-3])
        manifest = Path(argv[-1])
        paths.extend([upload, manifest])
        assert upload.read_bytes() == b"private-photo"
        assert len(json.loads(manifest.read_text())) == 2
        return 0, json.dumps(
            {
                "matches": [{"card_id": "me05-044", "inliers": 60, "support": 0.4}],
                "ambiguous": False,
            }
        ).encode()

    monkeypatch.setattr("app.scanner.hybrid._capture", capture)
    ranked = asyncio.run(
        VisualService(temp_root=tmp_path).rerank(
            Provider(), b"private-photo", "image/png", result()
        )
    )
    assert ranked.candidates[0].evidence[-1] == "visual_features"
    assert paths and not any(path.exists() for path in paths)
    assert list(tmp_path.iterdir()) == []


def test_optional_visual_failure_keeps_candidates(tmp_path, monkeypatch):
    from app.scanner.hybrid import VisualService

    class Provider:
        async def scanner_artwork(self, card, set_id):
            return b"public"

    async def fail(*args, **kwargs):
        raise TimeoutError

    monkeypatch.setattr("app.scanner.hybrid._capture", fail)
    ranked = asyncio.run(
        VisualService(temp_root=tmp_path).rerank(
            Provider(), b"private", "image/png", result()
        )
    )
    assert [c.card.id for c in ranked.candidates] == ["me05-044", "me05-086"]
    assert "visual_unavailable" in ranked.warnings
    assert list(tmp_path.iterdir()) == []


def test_cancellation_removes_scratch_and_propagates(tmp_path, monkeypatch):
    from app.scanner.hybrid import VisualService

    entered = asyncio.Event()

    class Provider:
        async def scanner_artwork(self, card, set_id):
            return b"public"

    async def capture(*args, **kwargs):
        entered.set()
        await asyncio.Event().wait()

    monkeypatch.setattr("app.scanner.hybrid._capture", capture)

    async def run():
        task = asyncio.create_task(
            VisualService(temp_root=tmp_path).rerank(
                Provider(), b"private", "image/png", result()
            )
        )
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert list(tmp_path.iterdir()) == []
