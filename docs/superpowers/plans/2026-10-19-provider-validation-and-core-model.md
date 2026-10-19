# Provider Validation and Core Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dependency-free, reproducible validator for the fixed TCGdex and PokéAPI sample, record minimal evidence, and document PokéVault's initial logical data model.

**Architecture:** A checked-in manifest defines twelve fixed resources and stable invariants. Small standard-library modules isolate provider normalization, safe HTTPS retrieval, fixture integrity, cross-provider checks, and deterministic reporting; ordinary tests consume fixtures only and never access the network.

**Tech Stack:** Python standard library, `unittest`, JSON, Markdown, SHA-256, TCGdex REST v2, PokéAPI REST v2.

**Spec:** `docs/superpowers/specs/2026-10-19-provider-validation-and-core-model-design.md`

## Global Constraints

- Use only Python's standard library; add no product or development dependency.
- Use public HTTPS GET endpoints without API keys or secrets.
- Limit each response to 2 MiB before JSON parsing.
- Use a 10-second timeout, at most two attempts, and a one-second delay before retrying connection failures, HTTP 429, or HTTP 5xx.
- Send user agent `PokeVault-Provider-Validation/0.1 (+https://github.com/babushka-boii/PokeVault)`.
- Accept redirects only when the destination remains HTTPS on the original provider host.
- Use TCGdex English responses for canonical values; Spanish is localization evidence only.
- Keep the default test suite fully offline and deterministic.
- Commit no card image, sprite, complete catalog response, secret, or fabricated value.
- Use English code identifiers and document only behavior verified in this iteration.

## Review Focus

- Spanish TCGdex category `Pokémon` must normalize to canonical `pokemon`; pinned in Task 2.
- Oversized or malformed JSON must fail before promotion and preserve existing fixtures; pinned in Task 4.
- HTTP or cross-host redirects must be rejected; pinned in Task 4.
- A tampered payload must fail SHA-256 verification before use; pinned in Task 4.
- Null and absent price fields must remain distinct and never become zero; pinned in Tasks 2 and 5.

---

## Planned File Structure

- `research/__init__.py`, `research/providers/__init__.py`: importable research package.
- `research/providers/manifest.json`: twelve cases and stable invariants.
- `research/providers/validate_providers.py`: thin executable module.
- `research/providers/provider_validation/models.py`: shared enums and immutable records.
- `research/providers/provider_validation/manifest.py`: manifest parsing.
- `research/providers/provider_validation/tcgdex.py`: TCGdex normalization.
- `research/providers/provider_validation/pokeapi.py`: PokéAPI normalization and species checks.
- `research/providers/provider_validation/http.py`: bounded HTTPS and redirect policy.
- `research/providers/provider_validation/fixtures.py`: digest verification and safe promotion.
- `research/providers/provider_validation/report.py`: deterministic Markdown reporting.
- `research/providers/provider_validation/cli.py`: orchestration and exit codes.
- `research/providers/fixtures/*.json`, `research/providers/REPORT.md`, `research/providers/README.md`: evidence and instructions.
- `tests/research/providers/`: matching offline tests and small test samples.
- `docs/DATA_MODEL.md`: ERD, constraints, and deferred extensions.
- `README.md`, `docs/ROADMAP.md`, `Bitacora.md`, `Autoria.md`: factual iteration updates.

## Task 1: Fixed Manifest and Shared Records

**Files:**

- Create: `research/__init__.py`
- Create: `research/providers/__init__.py`
- Create: `research/providers/provider_validation/__init__.py`
- Create: `research/providers/provider_validation/models.py`
- Create: `research/providers/provider_validation/manifest.py`
- Create: `research/providers/manifest.json`
- Test: `tests/research/providers/test_manifest.py`

**Interfaces:**

- Produces: `CardCategory(str, Enum)` with `POKEMON`, `TRAINER`, `ENERGY`.
- Produces: frozen `ValidationCase(name, provider, resource_kind, language, url, expected)`.
- Produces: `load_manifest(path: Path) -> tuple[ValidationCase, ...]`.
- Produces: `ManifestError(ValueError)`.

- [ ] **Step 1: Write failing manifest tests**

Assert the real manifest loads twelve uniquely named HTTPS cases: five TCGdex cards, one TCGdex set, three PokéAPI species, and three PokéAPI Pokémon. Add rejection tests for duplicate names, unknown providers, non-HTTPS URLs, and missing `expected` objects.

- [ ] **Step 2: Run tests and confirm failure**

Run `python -m unittest discover -s tests/research/providers -p 'test_manifest.py' -v`.

Expected: import failure because the manifest module does not exist.

- [ ] **Step 3: Define shared types and strict loading**

Implement the interfaces above. Allow providers `tcgdex`/`pokeapi`, kinds `card`/`set`/`species`/`pokemon`, require exact local types, unique names, and HTTPS URLs.

- [ ] **Step 4: Add the twelve fixed cases**

Encode TCGdex cards `swsh3-136` EN and ES, `sm9-33`, `base1-88`, `base1-99`, set `swsh3`, and PokéAPI species/Pokémon 162, 25, 644. Store only stable IDs, categories, `dexId` arrays, and set counts; never expected prices.

- [ ] **Step 5: Verify Task 1**

Run `python -m unittest discover -s tests/research/providers -p 'test_manifest.py' -v`.

Expected: all Task 1 tests pass.

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all discovered tests pass offline.

- [ ] **Step 6: Commit Task 1**

Run `git add research tests/research/providers/test_manifest.py`.

Run `git commit -m "test: define provider validation manifest"`.

## Task 2: TCGdex Normalization

**Files:**

- Modify: `research/providers/provider_validation/models.py`
- Create: `research/providers/provider_validation/tcgdex.py`
- Test: `tests/research/providers/test_tcgdex.py`
- Test samples: `tests/research/providers/samples/tcgdex_*.json`

**Interfaces:**

- Consumes: `CardCategory` from Task 1.
- Produces: frozen `PriceObservation(source, currency, updated_at, finish, metrics)`, with `metrics: tuple[tuple[str, Decimal | None], ...]`.
- Produces: frozen `VariantRecord(provider_id, finish, subtype, stamps, prices)`.
- Produces: frozen `CardRecord(external_id, local_id, name, category, set_external_id, dex_ids, image_url, variants, prices)`.
- Produces: frozen `SetRecord(external_id, name, official_count, total_count)`.
- Produces: `normalize_card(payload: Mapping[str, object], language: str) -> CardRecord`.
- Produces: `normalize_set(payload: Mapping[str, object]) -> SetRecord`.
- Produces: `ProviderDataError(ValueError)`.

- [ ] **Step 1: Write failing category and species tests**

Assert English `Pokemon` and Spanish `Pokémon` become `CardCategory.POKEMON`; Trainer and Energy have no `dex_ids`; Furret preserves `(162,)`; Pikachu & Zekrom preserves `(25, 644)` in provider order.

- [ ] **Step 2: Write failing variant and price tests**

Assert `variants_detailed` preserves `variantId`, finish, subtype, and stamps. Assert USD/EUR remain separate, JSON `null` becomes `None`, an absent metric is omitted, and neither becomes `Decimal("0")`.

- [ ] **Step 3: Write failing essential-field tests**

Assert `ProviderDataError` for missing card ID, category, set ID, local ID, malformed `dexId`, or non-integer set counts. Assert rarity, image, prices, and descriptive fields remain optional.

- [ ] **Step 4: Run tests and confirm failure**

Run `python -m unittest discover -s tests/research/providers -p 'test_tcgdex.py' -v`.

Expected: import failure because the TCGdex module does not exist.

- [ ] **Step 5: Implement TCGdex normalization**

Implement the exact interfaces. Map only known EN/ES category labels, parse money through `Decimal(str(value))`, preserve nulls, and tolerate unknown extra fields.

- [ ] **Step 6: Verify Task 2**

Run `python -m unittest discover -s tests/research/providers -p 'test_tcgdex.py' -v`.

Expected: all Task 2 tests pass.

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all discovered tests pass offline.

- [ ] **Step 7: Commit Task 2**

Run `git add research/providers/provider_validation tests/research/providers`.

Run `git commit -m "feat: normalize TCGdex validation data"`.

## Task 3: PokéAPI Normalization and Cross-Provider Checks

**Files:**

- Modify: `research/providers/provider_validation/models.py`
- Create: `research/providers/provider_validation/pokeapi.py`
- Test: `tests/research/providers/test_pokeapi.py`
- Test samples: `tests/research/providers/samples/pokeapi_*.json`

**Interfaces:**

- Consumes: `CardRecord` from Task 2.
- Produces: frozen `SpeciesRecord(national_dex_number, slug, names, generation)`.
- Produces: frozen `PokemonRecord(national_dex_number, types, default_sprite_url)`.
- Produces: `normalize_species(payload: Mapping[str, object]) -> SpeciesRecord`.
- Produces: `normalize_pokemon(payload: Mapping[str, object]) -> PokemonRecord`.
- Produces: `validate_species_links(cards: Sequence[CardRecord], species_by_id: Mapping[int, SpeciesRecord]) -> tuple[str, ...]`.

- [ ] **Step 1: Write failing localization and sprite tests**

Assert species 162 yields slug `furret`, generation `generation-ii`, and EN/ES names; Pokémon 162 preserves type `normal` and its default sprite URL. Missing optional Spanish name or sprite yields an empty optional value, never guessed data.

- [ ] **Step 2: Write failing cross-provider tests**

Assert no violations for Furret `(162,)`, Pikachu & Zekrom `(25, 644)`, Trainer `()`, and Energy `()`. Assert a violation names the card and missing Dex ID when a linked species fixture is absent.

- [ ] **Step 3: Run tests and confirm failure**

Run `python -m unittest discover -s tests/research/providers -p 'test_pokeapi.py' -v`.

Expected: import failure because the PokéAPI module does not exist.

- [ ] **Step 4: Implement PokéAPI normalization and consistency checking**

Parse resource ID, slug, generation URL tail, EN/ES names, ordered types, and default sprite URL. Keep species facts and sprite/type facts as distinct records.

- [ ] **Step 5: Verify Task 3**

Run `python -m unittest discover -s tests/research/providers -p 'test_pokeapi.py' -v`.

Expected: all Task 3 tests pass.

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all discovered tests pass offline.

- [ ] **Step 6: Commit Task 3**

Run `git add research/providers/provider_validation tests/research/providers`.

Run `git commit -m "feat: normalize PokeAPI species evidence"`.

## Task 4: Safe Retrieval and Fixture Integrity

**Files:**

- Create: `research/providers/provider_validation/http.py`
- Create: `research/providers/provider_validation/fixtures.py`
- Test: `tests/research/providers/test_http.py`
- Test: `tests/research/providers/test_fixtures.py`

**Interfaces:**

- Produces: `FetchError(RuntimeError)` and `FixtureError(ValueError)`.
- Produces: `build_https_opener(origin_url: str) -> OpenerDirector`.
- Produces: `fetch_json(url: str, *, timeout: float = 10.0, attempts: int = 2, max_bytes: int = 2 * 1024 * 1024, opener_factory: Callable[[str], OpenerDirector] = build_https_opener, sleep: Callable[[float], None] = time.sleep) -> object`.
- Produces: `canonical_payload_bytes(payload: object) -> bytes` using UTF-8, sorted keys, and compact separators.
- Produces: `build_fixture(case: ValidationCase, payload: object, retrieved_at: datetime) -> dict[str, object]`.
- Produces: `verify_fixture(fixture: Mapping[str, object]) -> object`.
- Produces: `write_staged_fixture(staging_dir: Path, case_name: str, fixture: Mapping[str, object]) -> Path`.
- Produces: `promote_fixtures(staging_dir: Path, destination_dir: Path, expected_names: Collection[str]) -> None`.

- [ ] **Step 1: Write failing request-policy tests**

With an injected fake `opener_factory` and local response objects, assert HTTPS enforcement, exact user agent and timeout, one retry after a transient connection error, no retry for HTTP 404, rejection of cross-host and HTTPS-to-HTTP redirects, and acceptance of a same-host HTTPS redirect.

- [ ] **Step 2: Write failing size and parse tests**

Assert a response of exactly 2 MiB may be read, one extra byte raises `FetchError` before JSON parsing, malformed JSON raises `FetchError`, and response objects close on success and failure.

- [ ] **Step 3: Write failing fixture-integrity tests**

Assert deterministic canonical bytes, correct SHA-256, rejection after payload tampering, refusal to promote an incomplete twelve-case stage, and preservation of existing fixtures when validation fails before promotion.

- [ ] **Step 4: Run tests and confirm failure**

Run `python -m unittest discover -s tests/research/providers -p 'test_http.py' -v`.

Run `python -m unittest discover -s tests/research/providers -p 'test_fixtures.py' -v`.

Expected: import failure because retrieval and fixture modules do not exist.

- [ ] **Step 5: Implement bounded HTTPS retrieval**

Use `urllib.request` with a redirect handler comparing destination scheme and hostname to the original URL. Read at most `max_bytes + 1`, decode JSON as UTF-8, and wrap transport, status, or parsing failures without including response bodies.

- [ ] **Step 6: Implement fixture hashing and promotion**

Use the spec's metadata/payload envelope. Write staged JSON with sorted keys, UTF-8, and a final newline. Validate every expected name before using `os.replace` on destination files.

- [ ] **Step 7: Verify Task 4**

Run `python -m unittest discover -s tests/research/providers -p 'test_http.py' -v`.

Run `python -m unittest discover -s tests/research/providers -p 'test_fixtures.py' -v`.

Expected: all Task 4 tests pass.

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all discovered tests pass offline.

- [ ] **Step 8: Commit Task 4**

Run `git add research/providers/provider_validation tests/research/providers`.

Run `git commit -m "feat: add safe provider evidence storage"`.

## Task 5: CLI Orchestration and Deterministic Report

**Files:**

- Create: `research/providers/provider_validation/report.py`
- Create: `research/providers/provider_validation/cli.py`
- Create: `research/providers/validate_providers.py`
- Test: `tests/research/providers/test_report.py`
- Test: `tests/research/providers/test_cli.py`

**Interfaces:**

- Consumes: all interfaces from Tasks 1–4.
- Produces: `build_report(cases: Sequence[ValidationCase], fixtures: Mapping[str, Mapping[str, object]]) -> str`.
- Produces: `run(argv: Sequence[str] | None = None) -> int`.
- CLI `refresh`: fetch all twelve cases, validate, stage, cross-check, promote, and generate the report.
- CLI `report`: verify committed fixtures and regenerate the report without network access.

- [ ] **Step 1: Write failing report tests**

Assert stable section ordering and exact coverage for categories, single/multiple/zero species links, `swsh3` counts, EN/ES differences, variants, provider currencies/timestamps, null price metrics, image/sprite URL presence, and limitations. Assert identical inputs produce byte-identical Markdown.

- [ ] **Step 2: Write failing CLI success tests**

Inject a fake fetcher and temporary directories. Assert `refresh` requests exactly the twelve manifest URLs, promotes only after every case validates, writes the report, returns `0`, and never downloads referenced images or sprites.

- [ ] **Step 3: Write failing CLI failure tests**

Assert a failed seventh request returns `1`, names case/provider/stage on standard error, leaves prior fixtures and report byte-identical, and removes staging. Assert `report` returns `1` for a tampered fixture without network access.

- [ ] **Step 4: Run tests and confirm failure**

Run `python -m unittest discover -s tests/research/providers -p 'test_report.py' -v`.

Run `python -m unittest discover -s tests/research/providers -p 'test_cli.py' -v`.

Expected: import failure because report and CLI modules do not exist.

- [ ] **Step 5: Implement deterministic reporting**

Generate Markdown only from verified payloads and the manifest. Keep manifest case order and lexicographic metric order. Show missing/null coverage explicitly; never convert currencies or invent a combined price.

- [ ] **Step 6: Implement CLI orchestration**

Use `argparse` subcommands `refresh` and `report`. Dispatch explicitly by provider and resource kind, validate stable invariants before staging, run species cross-checks before promotion, and write the report only after successful promotion.

- [ ] **Step 7: Add the executable module**

Make `python -m research.providers.validate_providers refresh` and `python -m research.providers.validate_providers report` exit with the integer returned by `run()`.

- [ ] **Step 8: Verify Task 5**

Run `python -m unittest discover -s tests/research/providers -p 'test_report.py' -v`.

Run `python -m unittest discover -s tests/research/providers -p 'test_cli.py' -v`.

Expected: all Task 5 tests pass.

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all tests pass offline and no test opens a network connection.

- [ ] **Step 9: Commit Task 5**

Run `git add research/providers tests/research/providers`.

Run `git commit -m "feat: orchestrate provider validation report"`.

## Task 6: Live Evidence, Data Model, and Project Records

**Files:**

- Create: `research/providers/fixtures/*.json`
- Create: `research/providers/REPORT.md`
- Create: `research/providers/README.md`
- Create: `docs/DATA_MODEL.md`
- Modify: `README.md`
- Modify: `docs/ROADMAP.md`
- Modify: `Bitacora.md`
- Modify: `Autoria.md`

**Interfaces:**

- Consumes: the completed validator from Task 5.
- Produces: committed evidence, logical ERD, usage instructions, and accurate iteration records.

- [ ] **Step 1: Verify offline before live access**

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all tests pass without network access.

- [ ] **Step 2: Perform the explicit live refresh**

Run `python -m research.providers.validate_providers refresh`.

Expected: exit `0`; twelve fixtures and `research/providers/REPORT.md` exist; no binary image or sprite is downloaded.

- [ ] **Step 3: Prove offline report determinism**

Record the SHA-256 of `REPORT.md`, run `python -m research.providers.validate_providers report`, and record the digest again.

Expected: both digests are identical.

- [ ] **Step 4: Document provider validation**

In `research/providers/README.md`, document both commands, offline defaults, fixed-case scope, fixture envelope, refresh policy, exit codes, provider URLs, retrieval date, and why technical feasibility is not asset-license approval.

- [ ] **Step 5: Document the logical model**

In `docs/DATA_MODEL.md`, add a Mermaid ERD and prose for every entity and rule in spec section 10, including same-user composite foreign keys, localized-name uniqueness, provider/external-ID uniqueness, card-species cardinality, deletion semantics, and deferred extensions.

- [ ] **Step 6: Update project records factually**

Record completed iteration-2 behavior, AI assistance, evidence date, key findings, test evidence, unresolved price/licensing limits, and the next scaffold iteration. Do not claim a frontend, backend, database, or authentication implementation.

- [ ] **Step 7: Run final verification**

Run `python -m unittest discover -s tests -p 'test_*.py' -v`.

Expected: all tests pass offline.

Run `python -m research.providers.validate_providers report`.

Expected: exit `0` and no report diff.

Run `git diff --check`.

Expected: no whitespace errors.

Run `git status --short`.

Expected: only intended Task 6 evidence and documentation are changed.

- [ ] **Step 8: Commit Task 6**

Run `git add README.md Bitacora.md Autoria.md docs research/providers`.

Run `git commit -m "docs: record provider feasibility evidence"`.

## Final Review Gate

- [ ] Map every approved-spec acceptance criterion to passing output or a document section.
- [ ] Confirm `git status --short --branch` is clean and six implementation commits follow this plan.
- [ ] Review the branch diff for secrets, binaries, catalog dumps, invented prices, and unsupported claims.
- [ ] Use the required verification and code-review skills before reporting completion.
