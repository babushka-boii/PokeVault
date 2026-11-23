"""Optional bounded visual corroboration of already verified metadata candidates."""

import asyncio
import json
import sys
import time
from pathlib import Path
from tempfile import TemporaryDirectory

from pydantic import BaseModel, ConfigDict, Field

from app.cards.provider import CardProvider, CardsUnavailable
from app.cards.schemas import Identifier
from app.scanner.errors import ScanError
from app.scanner.normalization import number_key
from app.scanner.ocr import _capture
from app.scanner.schemas import MatchResult


class _VisualMatch(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    card_id: Identifier
    inliers: int = Field(ge=0, le=1200)
    support: float = Field(ge=0, le=1, allow_inf_nan=False)


class _VisualResult(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    matches: list[_VisualMatch] = Field(max_length=16)
    ambiguous: bool


def combine_visual(result: MatchResult, payload: dict) -> MatchResult:
    """Visual features support a suggestion, never override conflicting numbers.

    Shared artwork cannot prove an exact printing. Qualities never exceed possible
    from visual evidence alone; stronger metadata proof keeps its existing label.
    """
    visual = _VisualResult.model_validate(payload)
    by_id = {item.card_id: item for item in visual.matches}
    if len(by_id) != len(visual.matches):
        raise ValueError("Duplicate visual identities")
    output = result.model_copy(deep=True)
    if visual.ambiguous and "visual_ambiguous" not in output.warnings:
        output.warnings.append("visual_ambiguous")
    ranked = []
    for index, candidate in enumerate(output.candidates):
        match = by_id.get(candidate.card.id)
        eligible = False
        if match is not None:
            candidate.evidence.append("visual_features")
            conflict = bool(
                (
                    output.clues.local_number
                    and number_key(output.clues.local_number)
                    != number_key(candidate.card.local_id)
                )
                or (
                    output.clues.printed_total is not None
                    and candidate.set.official_count is not None
                    and output.clues.printed_total != candidate.set.official_count
                )
                or (
                    output.clues.set_id is not None
                    and output.clues.set_id != candidate.set.id
                )
            )
            if conflict:
                candidate.quality = "uncertain"
                if "visual_conflict" not in output.warnings:
                    output.warnings.append("visual_conflict")
            elif not visual.ambiguous:
                eligible = True
                if candidate.quality == "uncertain":
                    candidate.quality = "possible"
            if visual.ambiguous and candidate.quality != "strong":
                candidate.quality = "uncertain"
        ranked.append(
            ((not eligible, -(match.inliers if eligible else 0), index), candidate)
        )
    ranked.sort(key=lambda row: row[0])
    output.candidates = [candidate for _, candidate in ranked]
    output.warnings = output.warnings[:16]
    return output


def _unavailable(result: MatchResult) -> MatchResult:
    output = result.model_copy(deep=True)
    if "visual_unavailable" not in output.warnings:
        output.warnings = [*output.warnings, "visual_unavailable"][:16]
    return output


class VisualService:
    def __init__(self, *, temp_root: str | Path | None = None):
        self._temp_root = temp_root

    async def rerank(
        self,
        provider: CardProvider,
        data: bytes,
        mime: str,
        result: MatchResult,
        *,
        budget: float = 8,
    ) -> MatchResult:
        if not result.candidates:
            return result
        if budget <= 0:
            return _unavailable(result)
        try:
            async with asyncio.timeout(min(8, budget)):
                return await self._run(provider, data, mime, result)
        except TimeoutError, CardsUnavailable, ScanError, ValueError, OSError:
            return _unavailable(result)

    async def _run(self, provider, data, mime, result):
        # No more than eight canonical returned candidates and eight MiB of public
        # reference data; CardProvider enforces per-asset bounds and caching.
        async def fetch(candidate):
            try:
                return candidate.card.id, await provider.scanner_artwork(
                    candidate.card, candidate.set.id
                )
            except CardsUnavailable:
                return None

        with TemporaryDirectory(
            prefix="pokevault-visual-", dir=self._temp_root
        ) as directory:
            root = Path(directory)
            started = time.monotonic()
            references = await asyncio.gather(
                *(fetch(candidate) for candidate in result.candidates[:8])
            )
            available = [item for item in references if item is not None]
            if not available:
                return _unavailable(result)
            upload = root / "upload.bin"
            upload.write_bytes(data)
            manifest = []
            for index, (card_id, contents) in enumerate(available):
                path = root / f"reference-{index}.webp"
                path.write_bytes(contents)
                manifest.append({"card_id": card_id, "path": str(path)})
            manifest_path = root / "references.json"
            manifest_path.write_text(json.dumps(manifest))
            code, output = await _capture(
                [
                    sys.executable,
                    "-m",
                    "app.scanner.visual_worker",
                    str(upload),
                    mime,
                    str(manifest_path),
                ],
                timeout=max(0.05, min(4, 8 - (time.monotonic() - started))),
                limit=32768,
                cwd=Path(__file__).resolve().parents[2],
                temp_root=directory,
            )
            if code != 0:
                raise ValueError("Visual worker unavailable")
            ranked = combine_visual(result, json.loads(output))
            if len(available) != len(result.candidates):
                ranked = _unavailable(ranked)
            return ranked
