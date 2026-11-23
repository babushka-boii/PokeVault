"""Bounded, explainable matching of editable clues to verified physical cards."""

import asyncio
from collections import Counter
from difflib import SequenceMatcher

from app.cards.provider import CardProvider, CardsUnavailable, SetNotFound
from app.cards.set_schemas import SetSummary
from app.scanner.normalization import name_key, number_key, useful_name
from app.scanner.schemas import MatchRequest, MatchResult, ScanCandidate

MATCH_BUDGET_SECONDS = 20
MAX_EXPANSIONS = 6
MAX_RESULTS = 8


async def match_candidates(
    provider: CardProvider, request: MatchRequest
) -> MatchResult:
    """A timeout/cancellation propagates so the API can cancel and report it."""
    async with asyncio.timeout(MATCH_BUDGET_SECONDS):
        return await _match(provider, request)


async def _match(provider: CardProvider, request: MatchRequest) -> MatchResult:
    clues = request.clues
    warnings = []
    limited = False

    def warn(code: str) -> None:
        if code not in warnings:
            warnings.append(code)

    def result(candidates=None, status="no_match") -> MatchResult:
        return MatchResult(
            clues=clues,
            candidates=candidates or [],
            status=status,
            limited=limited,
            warnings=warnings,
        )

    # Short official titles such as N/AZ are useful inside a selected checklist.
    # They never open broad discovery and cannot meet the fuzzy-name threshold.
    short_selected_name = (
        clues.set_id is not None and 1 <= len(clues.name) <= 2 and clues.name.isalpha()
    )
    name = (
        name_key(clues.name) if useful_name(clues.name) or short_selected_name else ""
    )
    number = number_key(clues.local_number)
    if clues.category is not None:
        # Checklist briefs do not contain category. A clue is not catalog proof.
        warn("category_unverified")
    if not name and not number:
        return result(status="insufficient_clues")
    if clues.name and not name:
        warn("invalid_name")
    if clues.local_number and not number:
        warn("invalid_number")

    catalog = {item.id: item for item in await provider.scanner_catalog("en")}
    selected = []
    if clues.set_id is not None:
        if clues.set_id not in catalog:
            warn("unsupported_set")
            return result()
        selected = [clues.set_id]
    elif clues.set_hint:
        hint = name_key(clues.set_hint)
        localized = []
        try:
            localized = await provider.scanner_catalog("es")
        except CardsUnavailable:
            limited = True
            warn("provider_partial")
        selected = sorted(
            {
                item.id
                for item in [*catalog.values(), *localized]
                if clues.set_hint.casefold() == item.id.casefold()
                or hint == name_key(item.name)
            }
        )

    exact_set = len(selected) == 1
    if not selected:
        counted = sorted(
            item.id
            for item in catalog.values()
            if clues.printed_total is not None
            and item.official_count == clues.printed_total
        )
        discovered = set()
        if name and (not counted or len(counted) > MAX_EXPANSIONS):
            successful = False
            for language in ("en", "es"):
                try:
                    discovery = await provider.scanner_name_discovery(
                        clues.name, language
                    )
                    discovered.update(discovery.set_ids)
                    successful = True
                    limited |= discovery.limited
                except CardsUnavailable:
                    limited = True
                    warn("provider_partial")
            if not successful and not counted:
                raise CardsUnavailable
            warn("search_limited")
        if counted:
            # A known printed count can support fuzzy names without a REST hit.
            selected = sorted(counted, key=lambda key: (key not in discovered, key))
        elif discovered:
            selected = sorted(discovered & catalog.keys())
        elif not name:
            limited = True
            warn("search_limited")
            return result(status="insufficient_clues")
        if not selected:
            limited = True
            return result()

    if len(selected) > MAX_EXPANSIONS:
        limited = True
        warn("search_limited")
    selected = selected[:MAX_EXPANSIONS]

    async def load(set_id):
        try:
            english = await provider.get_set_checklist(set_id, "en")
        except CardsUnavailable, SetNotFound:
            return None
        try:
            spanish = await provider.get_set_checklist(set_id, "es")
        except CardsUnavailable, SetNotFound:
            spanish = None
        if spanish is not None and (
            spanish.metadata.checklist_revision != english.metadata.checklist_revision
            or {card.id: card.local_id for card in spanish.cards}
            != {card.id: card.local_id for card in english.cards}
        ):
            # The canonical snapshot can expire between these awaits. An alias
            # verified against a different snapshot is not proof for this one.
            spanish = None
        return english, spanish

    views = await asyncio.gather(*(load(set_id) for set_id in selected))
    if all(view is None for view in views):
        raise CardsUnavailable
    ranked = []
    for view in views:
        if view is None:
            limited = True
            warn("provider_partial")
            continue
        english, spanish = view
        if spanish is None:
            limited = True
            warn("provider_partial")
        complete = english.metadata.checklist_status == "verified"
        if english.metadata.checklist_status == "incomplete":
            limited = True
            warn("partial_checklist")
        spanish_by_id = {card.id: card for card in spanish.cards} if spanish else {}
        metadata = (
            spanish.metadata
            if request.language == "es" and spanish
            else english.metadata
        )
        summary = SetSummary.model_validate(metadata.model_dump())
        total_exact = (
            clues.printed_total is not None
            and clues.printed_total == english.metadata.official_count
        )
        total_conflict = (
            clues.printed_total is not None
            and english.metadata.official_count is not None
            and not total_exact
        )
        for original in english.cards:
            translated = spanish_by_id.get(original.id)
            aliases = [name_key(original.name)]
            if translated is not None:
                aliases.append(name_key(translated.name))
            similarity = (
                max(
                    (
                        SequenceMatcher(None, name, alias, autojunk=False).ratio()
                        for alias in aliases
                    ),
                    default=0,
                )
                if name
                else 0
            )
            name_exact = bool(name and name in aliases)
            name_similar = bool(name and len(name) >= 4 and similarity >= 0.78)
            number_exact = bool(number and number == number_key(original.local_id))
            if not (name_exact or name_similar or number_exact):
                continue
            conflict = bool(
                (name and not (name_exact or name_similar))
                or (number and not number_exact)
                or total_conflict
            )
            if conflict:
                warn("conflicting_clues")
            evidence = []
            if exact_set:
                evidence.append("set_exact")
            if number_exact:
                evidence.append("number_exact")
            if name_exact:
                evidence.append("name_exact")
            elif name_similar:
                evidence.append("name_similar")
            if total_exact:
                evidence.append("printed_total")
            quality = "uncertain"
            if not conflict:
                if exact_set and number_exact and complete:
                    quality = "strong"
                elif name_exact or number_exact:
                    quality = "possible"
            score = (
                1000 * (exact_set and number_exact)
                + 400 * name_exact
                + 250 * number_exact
                + 150 * (name_similar and not name_exact)
                + 60 * total_exact
                - 500 * conflict
            )
            selected_card = (
                translated if request.language == "es" and translated else original
            )
            ranked.append(
                (
                    (-score, -similarity, summary.id, original.id),
                    ScanCandidate(
                        card=selected_card,
                        set=summary,
                        quality=quality,
                        evidence=evidence,
                    ),
                )
            )
    duplicate_ids = {
        key
        for key, count in Counter(item.card.id for _, item in ranked).items()
        if count > 1
    }
    if duplicate_ids:
        limited = True
        warn("ambiguous_identity")
        ranked = [
            (key, item) for key, item in ranked if item.card.id not in duplicate_ids
        ]
    ranked.sort(key=lambda row: row[0])
    if len(ranked) > MAX_RESULTS:
        limited = True
        warn("search_limited")
    candidates = [item for _, item in ranked[:MAX_RESULTS]]
    return result(candidates, "matches" if candidates else "no_match")
