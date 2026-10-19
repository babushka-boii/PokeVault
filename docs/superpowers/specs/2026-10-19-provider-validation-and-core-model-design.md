# PokéVault — Provider validation and core data model design

**Date:** 2026-10-19

**Status:** Approved for implementation planning on 2026-10-19

**Iteration:** 2 — provider feasibility and relational model

## 1. Purpose

This iteration must replace assumptions about TCGdex and PokéAPI with reproducible evidence before PokéVault creates its React, FastAPI, or PostgreSQL scaffold. It will also define the smallest relational model that safely supports a shared card catalog, per-user physical inventory, and classic PC-style boxes.

Success means another developer can run one explicit live validation, inspect its provenance, run all normal tests without network access, and explain which provider fields are usable, optional, localized, inconsistent, or still unsupported.

## 2. Confirmed product decisions

- Inventory is tracked per physical card copy, not only by aggregate quantity.
- A manual box contains references to owned physical copies; it never duplicates inventory records.
- The classic box UI groups owned cards by Pokémon species for sprite presentation. Selecting a species reveals the associated card printings and copies.
- Trainer and Energy cards have no fabricated Pokémon association. They use category icons and a card-list mode.
- A card printing can reference zero, one, or several Pokémon species.
- This iteration validates providers and documents the model. It does not create the application scaffold or database.

## 3. Scope

### Included

- Direct HTTPS GET validation against TCGdex v2 and PokéAPI v2.
- A dependency-free Python command using the standard library.
- Fixed sample cases covering a normal Pokémon card, a multi-species card, Trainer, Energy, localized data, a set with secret cards, prices, variants, and PokéAPI species/sprite data.
- Minimal versioned fixtures with source URL, retrieval time, and SHA-256 digest.
- Pure normalization functions and offline tests.
- A Markdown coverage report generated deterministically from the manifest and committed fixtures.
- An initial logical ERD and explicit integrity constraints.
- Updates to the roadmap, development log, and authorship record that describe only completed work.

### Excluded

- React, Vite, FastAPI, SQLAlchemy, Alembic, PostgreSQL, Docker, and authentication setup.
- Database migrations or runtime persistence.
- OCR, image upload, image downloads, and card-recognition scoring.
- Full-catalog synchronization or bulk downloading.
- Price history, currency conversion, portfolio calculations, or claims of complete pricing coverage.
- Wishlist, decks, transactions, smart boxes, and scanner tables.

## 4. Provider observations and integration rules

### 4.1 TCGdex

TCGdex v2 exposes cards, sets, categories, variants, images, optional pricing, and optional `dexId` arrays. A set distinguishes its printed official count from its total count, which includes secret cards.

Observed on 2026-10-19:

- `swsh3-136` is Furret and has `dexId: [162]`.
- `sm9-33` is Pikachu & Zekrom GX and has `dexId: [25, 644]`.
- `base1-88` is a Trainer card.
- `base1-99` is an Energy card.
- `swsh3` reports 189 official cards and 201 total cards.
- English and Spanish responses can translate categorical values, not only display text. For example, the category and detailed variant type differ between `/en/` and `/es/` responses.
- Current responses include `variants_detailed` and variant-level price information in addition to the simpler `variants` object.
- Prices can contain TCGPlayer USD and Cardmarket EUR observations, but provider, variant, timestamp, currency, and null values must all be preserved.

Therefore the canonical structural import uses the English endpoint. Spanish responses are treated as localization evidence and potential display-text overlays, never as the source of canonical enum values. The validator must not infer that documented optional fields are universally present.

### 4.2 PokéAPI

PokéAPI supplies National Dex species, localized names, generation references, types, and sprite URLs. Species metadata and sprite/type data live in separate resources, so the validator uses both the `pokemon-species` and `pokemon` endpoints for fixed National Dex identifiers.

PokéAPI is read-only, requires no authentication, and asks consumers to cache requested resources. PokéVault will request only the six fixed PokéAPI resources in the manifest during a live refresh and will not contact PokéAPI as part of its default test suite.

### 4.3 Provider boundary

Provider JSON is never the application's domain model. Network clients return raw dictionaries; pure normalizers convert only required fields into small internal records. Unknown extra fields are tolerated and recorded for analysis. Missing essential fields fail validation, while missing optional fields produce coverage results without fabricated values.

## 5. Fixed validation matrix

| Case | Resource | Purpose |
| --- | --- | --- |
| Single species | TCGdex EN card `swsh3-136` | One `dexId`, variants, set relation, optional prices |
| Multi-species | TCGdex EN card `sm9-33` | Two `dexId` values and TAG TEAM metadata |
| Trainer | TCGdex EN card `base1-88` | Category with no species link |
| Energy | TCGdex EN card `base1-99` | Energy category and subtype with no species link |
| Localization | TCGdex ES card `swsh3-136` | Localized names and translated categorical values |
| Secret-card count | TCGdex EN set `swsh3` | `official` count differs from `total` |
| Species | PokéAPI species `162`, `25`, `644` | National Dex identity, localized names, generation |
| Sprite/type | PokéAPI Pokémon `162`, `25`, `644` | Default sprite URL and gameplay types |

The manifest contains these stable identifiers and expected invariants. It does not copy expected market prices because prices are time-dependent.

## 6. Validation architecture

The implementation has four separate responsibilities:

1. **Manifest:** declares provider, language, resource URL, case name, and stable invariants.
2. **Network client:** performs HTTPS GET requests with a 10-second timeout per attempt, at most two attempts per resource, and user agent `PokeVault-Provider-Validation/0.1 (+https://github.com/babushka-boii/PokeVault)`. Only connection failures, HTTP 429, and HTTP 5xx responses are retried, after a one-second delay.
3. **Normalizer:** pure functions convert raw responses into canonical records for cards, sets, species, variants, and price observations.
4. **Reporter:** summarizes field coverage, localization differences, provider timestamps, currencies, nulls, and cross-provider consistency.

Live validation refreshes a fixture only after all essential checks for that response succeed. Each response is limited to 2 MiB. The validator writes to a temporary file in the destination directory and atomically replaces the previous valid fixture only when the new content passes. A failed request or invalid response must never destroy known-good evidence.

The default test command reads committed fixtures only. It performs no DNS lookup or HTTP request.

## 7. Evidence and repository layout

The intended artifact layout is:

- `research/providers/README.md`: purpose, usage, evidence policy, and limitations.
- `research/providers/manifest.json`: fixed validation cases and invariants.
- `research/providers/validate_providers.py`: live validation entry point.
- `research/providers/provider_validation/`: focused network, normalization, fixture, and report modules.
- `research/providers/fixtures/`: minimal validated JSON fixtures plus provenance metadata.
- `research/providers/REPORT.md`: dated coverage findings produced from validated evidence.
- `tests/research/providers/`: offline unit, contract, and cross-provider tests.
- `docs/DATA_MODEL.md`: logical ERD, entity definitions, constraints, and deferred extensions.

Each fixture is a JSON object with `metadata` and `payload` keys. Metadata contains the case name, provider, source URL, UTC retrieval timestamp, and SHA-256 digest of the canonicalized `payload`. JSON is serialized with sorted keys. Fixtures contain only the fields required to demonstrate the contract and edge cases. Card images and sprites remain URLs; binary assets are not downloaded or committed.

## 8. Error model

The validator distinguishes three outcomes:

- **Valid:** required structure and stable invariants pass; the fixture is eligible for atomic refresh.
- **Valid with missing optional data:** processing continues and the report records the gap, including missing prices, rarity, image URL, localization, or optional descriptive fields.
- **Invalid:** timeout after retry budget, non-success HTTP status, non-JSON body, wrong top-level type, missing essential identifier/category/set relation, or broken stable invariant. The command exits unsuccessfully and retains the previous valid fixture.

Error messages identify the provider, case, URL, stage, and concise cause. They must not include secrets or entire third-party payloads.

## 9. Offline test strategy

### Unit tests

- Normalize English and Spanish category differences into canonical internal categories.
- Preserve zero, one, or many `dexId` values without inventing species.
- Normalize simple and detailed variants while retaining provider variant identifiers when supplied.
- Preserve price provider, currency, update timestamp, finish, and nullable values.
- Reject malformed essential fields and accept absent optional fields.

### Fixture contract tests

- Every fixture has provenance metadata, retrieval timestamp, source URL, and a SHA-256 digest matching its canonicalized `payload`.
- Fixed identifiers and resource types match the manifest.
- No fixture contains downloaded binary content or an unbounded full-catalog response.

### Cross-provider consistency tests

- TCGdex `dexId` 162 resolves to Furret in PokéAPI.
- TCGdex `dexId` values 25 and 644 resolve to Pikachu and Zekrom.
- Trainer and Energy fixtures create no species associations.
- The `swsh3` total count is greater than its official count.

Live connectivity is intentionally excluded from the default tests. A separate explicit validation command refreshes evidence when Internet access is available.

## 10. Initial logical data model

### Catalog and provenance

- `DataProvider`: provider code, base URL, terms URL, and last review time.
- `PokemonSpecies`: internal identity, unique National Dex number, canonical slug, generation, sprite URL, provider, and provider external ID.
- `SpeciesName`: species, language code, and localized name; unique per species and language.
- `TcgSet`: internal identity, provider, external ID, release date, official count, and total count; provider plus external ID is unique.
- `SetName`: set, language code, and localized name; unique per set and language.
- `CardPrinting`: internal identity, set, provider external ID, local number, canonical category, rarity, and image URL; provider plus external ID is unique.
- `CardName`: card, language code, and localized name; unique per card and language.
- `CardSpecies`: card, species, and display order; the card/species pair is unique.

### User inventory

- `AppUser`: internal identity and unique external authentication subject.
- `UserSettings`: one-to-one user preferences, including display name, locale, avatar key, and optional favorite species.
- `OwnedCardCopy`: one physical copy owned by one user, linked to one card printing, with condition, language, finish, acquisition date, and notes. The pair `(id, user_id)` is unique for ownership-safe references.
- `CollectionBox`: user-owned manual box with name, display position, and wallpaper key. The pair `(id, user_id)` is unique for ownership-safe references.
- `BoxMembership`: stores `user_id`, `box_id`, `owned_copy_id`, and position. Composite foreign keys `(box_id, user_id)` and `(owned_copy_id, user_id)` enforce same-user membership. The box/copy pair is unique.

### Integrity rules

- Catalog records are shared; user inventory is always user-scoped.
- Deleting a box removes memberships, never owned copies.
- A membership cannot link a copy and box belonging to different users; composite foreign keys enforce this in the database rather than relying only on application code.
- Trainer and Energy cards have no `CardSpecies` rows. A Pokémon card with a missing `dexId` is recorded as an unresolved provider-data gap and is never assigned a guessed species.
- Species grouping for the classic box is a query/view concern, not a duplicate storage entity.
- Localized labels never become canonical enum identifiers.
- Monetary values are not added to this ERD until the price and transaction model is designed with currency and timestamp constraints.

## 11. Deferred extensions

The core identifiers allow later tables for price snapshots, transactions and transaction lines, wishlist entries, decks and deck cards, scans and candidates, smart-box rules, trade state, and sale state. These are intentionally not specified in this iteration.

Physical-copy identity remains stable when those extensions arrive. Acquisition cost will be related through the future transaction model rather than duplicated as an unstructured amount on the copy.

## 12. Security, licensing, and operational constraints

- Only public GET endpoints are used; no API keys or secrets are required for this validation.
- HTTPS is mandatory.
- Requests are limited to the fixed manifest, and successful responses are cached as minimal evidence to respect provider resources.
- Each response is capped at 2 MiB before JSON parsing.
- Redirects are accepted only when the destination remains HTTPS and uses the same provider host.
- Image and sprite URLs are evidence; copyrighted binaries are not committed.
- Provider terms and documentation URLs are recorded with the review date. This technical check does not make a legal ownership claim over Pokémon assets.

## 13. Acceptance criteria

The iteration is complete when all of the following are true:

1. The live validator processes every fixed case and produces traceable evidence.
2. Offline tests pass without network access or third-party Python packages.
3. The report states observed coverage and gaps for identity, categories, species links, variants, sets, localization, images, and prices.
4. Missing optional values are represented as missing, never fabricated.
5. A failed live refresh leaves previous valid fixtures unchanged and returns a non-zero status.
6. `docs/DATA_MODEL.md` documents every entity and integrity rule in section 10.
7. No frontend, backend server, database, binary Pokémon asset, or secret is introduced.
8. README, roadmap, `Bitacora.md`, and `Autoria.md` accurately describe what was implemented and how AI assisted.
9. The student can explain why canonical structured data uses TCGdex English responses, why cards and copies are separate, and why boxes reference copies rather than duplicating inventory.

## 14. Sources reviewed

- TCGdex REST overview: https://tcgdex.dev/rest
- TCGdex card reference: https://tcgdex.dev/reference/card
- TCGdex set endpoint: https://tcgdex.dev/rest/set
- PokéAPI v2 documentation and fair-use policy: https://pokeapi.co/docs/v2
- Live public responses for the fixed cases, retrieved on 2026-10-19.
