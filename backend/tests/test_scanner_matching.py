"""Scanner ranking uses verified checklist membership, never guessed card IDs."""

import asyncio

import httpx2 as httpx
import pytest
from test_scanner_provider import card_row, scanner_provider, scanner_set

from app.scanner.schemas import MatchRequest, ScanClues


def run_match(provider, **clues):
    from app.scanner.matching import match_candidates

    return asyncio.run(
        match_candidates(provider, MatchRequest(clues=ScanClues(**clues)))
    )


def test_selected_set_and_zero_padded_number_are_strong_without_details():
    provider, requests = scanner_provider()
    result = run_match(provider, set_id="sv03.5", local_number="25")
    assert result.status == "matches"
    assert [(c.card.id, c.quality) for c in result.candidates] == [
        ("sv03.5-025", "strong")
    ]
    assert result.candidates[0].evidence == ["set_exact", "number_exact"]
    assert result.limited is False
    assert not any("/cards" in r.url.path for r in requests)


@pytest.mark.parametrize(
    "name,expected", [("N", ["bw2-101"]), ("az", ["bw2-102"]), ("A", [])]
)
def test_selected_expansion_accepts_exact_short_names_without_fuzzy_guesses(
    name, expected
):
    provider, requests = scanner_provider(
        [
            scanner_set(
                "bw2",
                cards=[
                    card_row("bw2-101", "101", "N"),
                    card_row("bw2-102", "102", "AZ"),
                    card_row("bw2-103", "103", "Natu"),
                ],
                serie="bw",
            )
        ]
    )
    result = run_match(provider, set_id="bw2", name=name)
    assert [candidate.card.id for candidate in result.candidates] == expected
    assert all(candidate.quality == "possible" for candidate in result.candidates)
    assert not any("/cards" in request.url.path for request in requests)


@pytest.mark.parametrize("name", ["N", "AZ"])
def test_short_names_without_selected_expansion_do_not_start_global_discovery(name):
    provider, requests = scanner_provider()
    result = run_match(provider, name=name)
    assert result.status == "insufficient_clues"
    assert result.candidates == []
    assert requests == []


@pytest.mark.parametrize("number", ["TG 01", "tg-001", "TG.01"])
def test_special_prefix_numbers_are_normalized_without_identity_construction(number):
    row = scanner_set(cards=[card_row("opaque-official-printing", "TG01", "Furret")])
    provider, _ = scanner_provider([row])
    result = run_match(provider, set_id="sv03.5", local_number=number)
    assert result.candidates[0].card.id == "opaque-official-printing"
    assert result.candidates[0].quality == "strong"


@pytest.mark.parametrize(
    "clues",
    [
        {},
        {"name": "HP"},
        {"local_number": "O"},
        {"category": "Trainer"},
        {"printed_total": 165},
    ],
)
def test_weak_clues_abstain_without_requests(clues):
    provider, requests = scanner_provider()
    result = run_match(provider, **clues)
    assert result.status == "insufficient_clues"
    assert result.candidates == []
    assert requests == []


def test_conflicting_name_and_number_show_uncertain_alternatives():
    provider, _ = scanner_provider()
    result = run_match(provider, set_id="sv03.5", local_number="25", name="Raichu")
    assert [c.card.id for c in result.candidates] == ["sv03.5-025", "sv03.5-026"]
    assert all(c.quality == "uncertain" for c in result.candidates)
    assert "conflicting_clues" in result.warnings


def test_english_and_accented_spanish_aliases_match_independent_of_ui_language():
    provider, _ = scanner_provider(
        [scanner_set(cards=[card_row("sv03.5-001", "001", "Grass Energy")])],
        translations={"sv03.5-001": "Energía Planta"},
    )
    from app.scanner.matching import match_candidates

    result = asyncio.run(
        match_candidates(
            provider,
            MatchRequest(
                clues=ScanClues(set_id="sv03.5", name="energia planta"),
                language="en",
            ),
        )
    )
    assert result.candidates[0].card.name == "Grass Energy"
    assert result.candidates[0].evidence == ["set_exact", "name_exact"]
    assert result.candidates[0].quality == "possible"


def test_fuzzy_name_comparison_is_deterministic_but_not_strong():
    provider, _ = scanner_provider()
    result = run_match(provider, set_id="sv03.5", name="Pikchu")
    assert [(c.card.id, c.quality) for c in result.candidates] == [
        ("sv03.5-025", "uncertain")
    ]
    assert "name_similar" in result.candidates[0].evidence


def test_common_name_discovery_retains_expansion_ambiguity_and_explicit_limit():
    rows = [scanner_set("old"), scanner_set("new")]
    discovery = [
        card_row("new-025", "025", "Pikachu"),
        card_row("old-025", "025", "Pikachu"),
    ]
    provider, _ = scanner_provider(rows, discoveries={"en": discovery})
    result = run_match(provider, name="Pikachu")
    assert [c.card.id for c in result.candidates] == ["new-025", "old-025"]
    assert all(c.quality == "possible" for c in result.candidates)
    assert result.limited is True
    assert "search_limited" in result.warnings


def test_discovery_cannot_smuggle_a_card_absent_from_the_checklist():
    provider, _ = scanner_provider(
        discoveries={
            "en": [card_row("sv03.5-999", "999", "Mewtwo")],
        }
    )
    result = run_match(provider, name="Mewtwo")
    assert result.status == "no_match"
    assert result.candidates == []
    assert result.limited is True


def test_printed_total_narrows_number_only_search_before_six_expansion_cap():
    rows = [scanner_set(f"s{n}", official=1 if n == 7 else 2) for n in range(8)]
    provider, requests = scanner_provider(rows)
    result = run_match(provider, local_number="25", printed_total=1)
    assert [c.card.id for c in result.candidates] == ["s7-025"]
    assert result.candidates[0].quality == "possible"
    assert "printed_total" in result.candidates[0].evidence
    assert not any("/sets/s0" in r.url.path for r in requests)


def test_number_alone_does_not_sample_arbitrary_expansions():
    provider, requests = scanner_provider()
    result = run_match(provider, local_number="25")
    assert result.status == "insufficient_clues"
    assert result.limited is True
    assert not any("/sets/" in r.url.path for r in requests)


def test_exact_set_hint_uses_only_verified_catalog_names():
    provider, _ = scanner_provider()
    result = run_match(provider, set_hint="English sv03.5", local_number="25")
    assert result.candidates[0].card.id == "sv03.5-025"
    assert result.candidates[0].quality == "strong"
    assert "set_exact" in result.candidates[0].evidence


def test_pocket_or_unknown_selected_set_never_falls_back_to_a_physical_guess():
    provider, _ = scanner_provider([scanner_set("A1", serie="tcgp"), scanner_set()])
    result = run_match(provider, set_id="A1", name="Pikachu", local_number="25")
    assert result.status == "no_match"
    assert result.candidates == []


def test_incomplete_checklist_returns_known_members_without_strong_claim():
    row = scanner_set()
    row["cardCount"]["total"] = 3
    provider, _ = scanner_provider([row])
    result = run_match(provider, set_id="sv03.5", local_number="25")
    assert result.candidates[0].card.id == "sv03.5-025"
    assert result.candidates[0].quality == "possible"
    assert result.limited is True
    assert "partial_checklist" in result.warnings


@pytest.mark.parametrize(
    "category,name", [("Trainer", "Professor Oak"), ("Energy", "Grass Energy")]
)
def test_trainer_and_energy_do_not_invent_species_or_category_evidence(category, name):
    provider, _ = scanner_provider(
        [scanner_set(cards=[card_row("base1-88", "88", name)])]
    )
    result = run_match(provider, set_id="sv03.5", name=name, category=category)
    assert result.candidates[0].card.id == "base1-88"
    assert result.candidates[0].quality == "possible"
    assert "category_unverified" in result.warnings
    assert result.candidates[0].evidence == ["set_exact", "name_exact"]


def test_expansion_and_result_caps_are_honest_and_deterministic():
    rows = [
        scanner_set(
            f"s{n}", cards=[card_row(f"s{n}-{j}", str(j), "Pikachu") for j in range(4)]
        )
        for n in range(9)
    ]
    discovery = [card_row(f"s{n}-0", "0", "Pikachu") for n in range(9)]
    provider, requests = scanner_provider(rows, discoveries={"en": discovery})
    result = run_match(provider, name="Pikachu")
    assert len(result.candidates) == 8
    assert result.limited is True
    set_paths = {
        r.url.path.rsplit("/", 1)[-1] for r in requests if "/sets/" in r.url.path
    }
    assert len(set_paths) == 6
    assert not any("/cards/" in r.url.path for r in requests)


def test_failed_optional_spanish_overlay_preserves_verified_english_result():
    def alter(request):
        if request.url.path == "/v2/es/sets/sv03.5":
            return httpx.Response(500)

    provider, _ = scanner_provider(alter=alter)
    result = run_match(provider, set_id="sv03.5", local_number="25", name="Pikachu")
    assert result.candidates[0].card.name == "Pikachu"
    assert result.limited is True
    assert "provider_partial" in result.warnings


def test_set_hint_does_not_guess_missing_punctuation_in_an_expansion_code():
    provider, _ = scanner_provider()
    result = run_match(provider, set_hint="sv035", local_number="25")
    assert result.status == "insufficient_clues"
    assert result.candidates == []


def test_colliding_set_names_remain_possible_instead_of_becoming_unique_identity():
    rows = [scanner_set("first"), scanner_set("second")]
    for row in rows:
        row["name"] = "Shared Expansion"
    provider, _ = scanner_provider(rows)
    result = run_match(provider, set_hint="Shared Expansion", local_number="25")
    assert [c.card.id for c in result.candidates] == ["first-025", "second-025"]
    assert all(c.quality == "possible" for c in result.candidates)


def test_verified_empty_checklist_is_an_honest_no_match():
    provider, _ = scanner_provider([scanner_set(cards=[])])
    result = run_match(provider, set_id="sv03.5", name="Pikachu")
    assert result.status == "no_match"
    assert result.limited is False
    assert "partial_checklist" not in result.warnings


def test_malformed_or_missing_one_expansion_does_not_erase_other_verified_matches():
    def alter(request):
        if request.url.path == "/v2/en/sets/broken":
            return httpx.Response(200, json={"id": "broken", "cards": []})

    provider, _ = scanner_provider(
        [scanner_set("good"), scanner_set("broken")],
        alter=alter,
        discoveries={
            "en": [
                card_row("good-025", "025", "Pikachu"),
                card_row("broken-025", "025", "Pikachu"),
            ]
        },
    )
    result = run_match(provider, name="Pikachu")
    assert [c.card.id for c in result.candidates] == ["good-025"]
    assert result.limited is True
    assert "provider_partial" in result.warnings


def test_cross_expansion_duplicate_identity_is_excluded_instead_of_arbitrarily_chosen():
    rows = [
        scanner_set("first", [card_row("shared-id", "25", "Pikachu")]),
        scanner_set("second", [card_row("shared-id", "25", "Pikachu")]),
    ]
    for row in rows:
        row["name"] = "Shared"
    provider, _ = scanner_provider(rows)
    result = run_match(provider, set_hint="Shared", name="Pikachu")
    assert result.status == "no_match"
    assert result.limited is True
    assert "ambiguous_identity" in result.warnings


def test_letter_prefix_is_not_indiscriminately_replaced_with_a_digit():
    provider, _ = scanner_provider()
    result = run_match(provider, set_id="sv03.5", local_number="O25")
    assert result.status == "no_match"


def test_adversarial_name_filters_abstain_without_network():
    provider, requests = scanner_provider()
    result = run_match(provider, name="eq:Pikachu|not:Furret*")
    assert result.status == "insufficient_clues"
    assert requests == []


@pytest.mark.parametrize("selected", [True, False])
def test_verified_colon_in_type_null_is_a_name_not_a_filter_operator(selected):
    row = scanner_set(cards=[card_row("sv03.5-001", "001", "Type: Null")])
    provider, requests = scanner_provider(
        [row],
        discoveries={"en": row["cards"]},
    )
    result = run_match(
        provider, name="Type: Null", **({"set_id": "sv03.5"} if selected else {})
    )
    assert [c.card.id for c in result.candidates] == ["sv03.5-001"]
    assert "name_exact" in result.candidates[0].evidence
    for request in requests:
        if request.url.path.endswith("/cards"):
            assert request.url.params["name"] in ("like:Null", "like:Nul")


@pytest.mark.parametrize(
    "clue,official,prefix,quality",
    [
        ("Pikchu", "Pikachu", "Pik", "uncertain"),
        ("Flabebe", "Flabébé", "Fla", "possible"),
    ],
)
def test_bounded_token_fallback_reaches_fuzzy_and_accented_catalog_names(
    clue,
    official,
    prefix,
    quality,
):
    row = scanner_set(cards=[card_row("sv03.5-001", "001", official)])

    def alter(request):
        if request.url.path in ("/v2/en/cards", "/v2/es/cards"):
            return httpx.Response(
                200,
                json=row["cards"]
                if request.url.params.get("name") == f"like:{prefix}"
                else [],
            )

    provider, requests = scanner_provider([row], alter=alter)
    result = run_match(provider, name=clue)
    assert [(c.card.id, c.quality) for c in result.candidates] == [
        ("sv03.5-001", quality)
    ]
    assert result.limited is True
    pages = [r for r in requests if r.url.path.endswith("/cards")]
    assert len(pages) <= 4
    assert any(r.url.params["name"] == f"like:{prefix}" for r in pages)


@pytest.mark.parametrize("change", ["revision", "local_number"])
def test_refresh_between_language_views_cannot_attach_an_unverified_alias(change):
    row = scanner_set()
    row["cards"][0]["name"] = "Before Refresh"
    clock = [0.0]
    canonical_reads = 0

    def advance():
        clock[0] = 301
        if change == "revision":
            row["cards"][1] = card_row("sv03.5-999", "999", "New Member")
        else:
            row["cards"][0]["localId"] = "999"

    def wrap(handle):
        async def refresh_after_read(request):
            nonlocal canonical_reads
            response = handle(request)
            if request.url.path == "/v2/en/sets/sv03.5":
                canonical_reads += 1
                if canonical_reads == 1:
                    asyncio.get_running_loop().call_soon(advance)
            return response

        return refresh_after_read

    provider, _ = scanner_provider(
        [row],
        translations={"sv03.5-025": "Pikachu"},
        wrap=wrap,
        clock=lambda: clock[0],
    )
    result = run_match(provider, set_id="sv03.5", local_number="25", name="Pikachu")
    assert result.candidates[0].card.name == "Before Refresh"
    assert result.candidates[0].card.language == "en"
    assert result.candidates[0].quality == "uncertain"
    assert "provider_partial" in result.warnings


@pytest.mark.parametrize("outcome", ["timeout", "cancel"])
def test_match_budget_and_cancellation_stop_provider_work(monkeypatch, outcome):
    from app.scanner import matching

    entered = asyncio.Event()
    exited = asyncio.Event()

    def wrap(handle):
        async def delayed(request):
            if request.url.path == "/v2/en/sets/sv03.5":
                entered.set()
                try:
                    await asyncio.Event().wait()
                finally:
                    exited.set()
            return handle(request)

        return delayed

    provider, _ = scanner_provider(wrap=wrap)
    monkeypatch.setattr(
        matching, "MATCH_BUDGET_SECONDS", 0.02 if outcome == "timeout" else 20
    )

    async def run():
        task = asyncio.create_task(
            matching.match_candidates(
                provider,
                MatchRequest(
                    clues=ScanClues(set_id="sv03.5", local_number="25"),
                ),
            )
        )
        await entered.wait()
        if outcome == "cancel":
            task.cancel()
        with pytest.raises(
            TimeoutError if outcome == "timeout" else asyncio.CancelledError
        ):
            await task
        assert exited.is_set()
        assert provider._set_locks == {}

    asyncio.run(run())


@pytest.mark.parametrize(
    "category,title",
    [
        ("Pokemon", "Regional Sample"),
        ("Trainer", "Torre del Viento"),
    ],
)
def test_localized_discovery_survives_noisy_foreign_prefix_budget(category, title):
    from app.cards.provider import ScannerNameDiscovery

    rows = [
        scanner_set(f"sv{i}", cards=[card_row(f"sv{i}-1", "1", "Unrelated")])
        for i in range(1, 8)
    ]
    rows.append(scanner_set("sv99", cards=[card_row("sv99-9", "9", title)]))
    provider, requests = scanner_provider(rows)

    async def discover(name, language):
        return ScannerNameDiscovery(
            [f"sv{i}" for i in range(1, 8)] if language == "en" else ["sv99"]
        )

    provider.scanner_name_discovery = discover
    result = run_match(provider, name=title, language="es", category=category)
    assert result.candidates[0].card.id == "sv99-9"
    assert result.candidates[0].quality == "possible"
    assert "number_exact" not in result.candidates[0].evidence
    assert result.limited
    loaded = {r.url.path for r in requests if "/en/sets/" in r.url.path}
    assert len(loaded) <= 6


def test_incomplete_regional_title_keeps_verified_number_candidate_with_conflict():
    provider, _ = scanner_provider(
        [scanner_set(cards=[card_row("sv03.5-130", "130", "Galarian Zigzagoon")])]
    )
    result = run_match(provider, name="Zigzagoon", local_number="130", set_id="sv03.5")
    assert result.candidates[0].card.id == "sv03.5-130"
    assert "number_exact" in result.candidates[0].evidence
    assert result.candidates[0].quality == "uncertain"


def test_secret_trainer_number_above_official_total_is_not_rejected():
    provider, _ = scanner_provider(
        [scanner_set(cards=[card_row("sv03.5-261", "261", "Wind Stadium")], official=1)]
    )
    result = run_match(
        provider,
        name="Wind Stadium",
        local_number="261",
        printed_total=1,
        category="Trainer",
    )
    assert result.candidates[0].card.id == "sv03.5-261"
    assert result.candidates[0].quality == "possible"
    assert "printed_total" in result.candidates[0].evidence
