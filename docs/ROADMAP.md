# PokéVault — Incremental roadmap (v0.1)

**Planning date:** 2026-10-08. Dates after week 1 are tentative and may change following technical validation and course guidance. The course expects a commit each Monday–Sunday week starting October 5, 2026; the rubric counts the best six weeks.

## Delivery 1: 2026-10-05 to 2026-10-11 — Foundation and requirements

**Scope:** documentation-only baseline.
- [x] Confirm theme, name, GitHub repository and visibility.
- [x] Record mandatory requirements and UX direction.
- [x] Document classic PC Box reference and product differentiators.
- [x] Propose preliminary stack and component boundaries.
- [x] Create roadmap, prompt log, authorship disclosure and README.
- [ ] Student reviews the published documentation and records corrections if needed.

**Acceptance:** one identifiable GitHub commit with versioned project documents, and no misleading claims of working functionality.

## Proposed iteration sequence

| Iteration | Focus | Demonstrable result | Main risks |
| --- | --- | --- | --- |
| 2 | Data-provider feasibility and relational model | Verified sample cards/sets/species/price availability; first ERD; schema decisions | External coverage, card variants, license terms |
| 3 | Project scaffold and database | Runnable frontend/API/database, health flow and ES/EN switch | Migrations, developer setup |
| 4 | Catalog, Pokédex and classic PC Boxes | Browse species and cards, navigate sprite boxes on desktop/mobile | Reliable sprites, responsive fidelity |
| 5 | Inventory and set completion | Add/edit copies, manual/smart boxes, check owned/missing by set | Copy-level bookkeeping, set checklist quality |
| 6 | Scanner end-to-end | Upload image, OCR match suggestion, correction and inventory registration | Recognition accuracy and demo test images |
| 7 | Prices, wishlist, trades and transaction history | Provenance-aware estimates, missing-card cost coverage and trade filters | Missing or stale provider prices |
| 8+ | Portfolio, deck builder and polish | Deck ownership gaps, selected animations/sounds, test and demo rehearsal | Time and feature creep |

## Delivery 2 — Provider feasibility and logical model

**Completed and evidenced:** 2026-10-19.

- [x] Validate five TCGdex cards, one TCGdex set, three PokéAPI species and three PokéAPI Pokémon resources.
- [x] Preserve category, zero/one/multiple species relations, variants, currencies, timestamps and null price metrics.
- [x] Store minimal SHA-256-verified fixtures and generate an offline deterministic report.
- [x] Define catalog provenance, localized names, owned copies, boxes and same-user membership integrity.
- [ ] Review provider terms and Pokémon asset licenses; validate broader catalog and price coverage.

## Delivery 3 — Executable project scaffold

**Completed and evidenced:** 2026-10-19.

- [x] Implement React/TypeScript/Vite routes for Home, Boxes, Pokédex and Profile with responsive navigation.
- [x] Implement persisted Spanish/English switching with safe Spanish fallback.
- [x] Implement FastAPI `GET /api/v1/health` with separate API/PostgreSQL states and sanitized HTTP 503 behavior.
- [x] Add native PostgreSQL wiring and reversible Alembic revision `0001` for technical metadata only.
- [x] Verify healthy and degraded flows manually at desktop and 390 px widths.
- [x] Add one offline gate covering 43 provider, 9 backend and 13 frontend tests plus lint, types and build.
- [ ] Implement Google SSO, domain schema, catalog synchronization and functional collection views.

**Next:** the initial Iteration 4 Pokédex slice is implemented below; the PC catalog preview is now implemented below, while owned-card boxes remain pending. Authentication remains a separate pending slice and must not be represented by fake state.

**Rule:** requirements first, then cohesive vertical slices. Optional features only after working mandatory flows.

## Weekly workflow

1. Define issue/scope and acceptance criteria.
2. Implement or document a reviewable increment.
3. Validate with a reproducible example or test.
4. Update **Bitacora.md** with prompts, revisions, obstacles, lessons and evidence.
5. Update **Autoria.md** if AI-assisted or borrowed content changes materially.
6. Make meaningful commits with English descriptive messages.
7. Document the next increment and outstanding blockers.

## Course evaluation alignment

- The course project allocates **70%** to incremental process and **30%** to a brief demo and technical questions.
- The process rubric explicitly assesses commit history, weekly documentation, AI authorship disclosure, and a final survey.
- At least one weekly commit is mandatory, ideally more as functionality evolves.
- The selected project is option **2: Pokémon card Pokédex**; all required functions stay visible in the product spec.

## Definition of done for later functional increments

- User-visible behavior works; validation and empty/error states addressed.
- Appropriate automated or manual test evidence is captured.
- ES/EN labels and responsive behavior checked.
- No secrets or unlicensed assets are introduced.
- Documentation, changelog/bitácora and code remain consistent.
- Commit is correctly attributed and message reflects real change.

## Known pending decisions

- Trainer avatar shortlist (10–15 approved selections from the student).
- Pixel-perfect box wireframe measurements and legal/reusable audiovisual assets.
- Production price-feed suitability and licensing; scanner OCR benchmark sample; deployment target.
- Google OpenID Connect design, credentials and secure session strategy.

## Delivery 4 — Initial functional National Pokédex

**Implementation date:** 2026-10-22.

- [x] Expose `GET /api/v1/pokemon` with entries 1–20 from PokéAPI.
- [x] Isolate provider requests, validate responses, bound time/concurrency and cache successful catalogs in memory.
- [x] Replace the Pokédex placeholder with a responsive ES/EN grid showing number, name, types and remote sprite.
- [x] Cover loading, empty, sanitized error, keyboard retry and missing-sprite states with offline mocked tests.
- [x] Preserve existing routes, PostgreSQL schema and Boxes page.
- [ ] Add species-to-TCG browsing, filtering, pagination and classic PC Boxes in later slices.

This delivery is a public reference catalog, without authentication or inventory simulation.
See `Bitacora.md` for validation evidence and limitations.

## Iteration 4 continuation — Classic PC catalog preview

**Implementation date:** 2026-10-22.

- [x] Implement 6×5 sprite slots, selection/details and keyboard navigation.
- [x] Extend the existing provider with bounded pagination while preserving the Pokédex defaults.
- [x] Add 35 catalog groups for species 1–1025, including a partial final box.
- [x] Add three original CSS wallpapers and responsive grid-first mobile layout.
- [x] Add reusable synthesized retro effects, persistent mute/volume and graceful audio failure.
- [x] Test pagination, selection, navigation boundaries, stale responses, localization and audio.
- [ ] Manually inspect desktop/390 px and listen to audio on real hardware (no connected browser in this session).
- [ ] Implement owned-card/manual/smart boxes, customization persistence and actual TCG interactions later.

## PC search refinement — 2026-10-22

- [x] Add compact header search with debounced name/partial/number suggestions.
- [x] Cache the bounded full species name index server-side; limit browser results to eight.
- [x] Locate the original box/slot, preserving the 30-slot layout and same-box cache.
- [x] Cover Scraggy → Box 19 / space 19, keyboard focus, errors, stale responses and localization.
- [x] Reuse original cursor/confirmation/transition/back sounds without overlapping playback.
- [ ] Manually review dropdown layout and sound at desktop and 390 px widths.
- [ ] Add localized aliases only when a reliable data source is integrated; canonical names remain the fallback.

## Definitive PC refinement — 2026-10-22

- [x] Verify Gen V menu icon paths, full coverage ranges, Pikachu APNG frames and later menu fallback families.
- [x] Replace grid battle sprites with menu-only sources and neutral terminal fallback.
- [x] Add persisted Static/Animated preference, live reduced-motion handling and stable image nodes.
- [x] Add selected-only cached localized details with units, normal/hidden abilities and real descriptions.
- [x] Remove the TCG placeholder; share original rectangular SVG/CSS badges across Cajas/Pokédex.
- [x] Add default Classic wallpaper and a continuous lighter 6×5 storage surface.
- [x] Preserve search placement/focus, navigation, audio, ES/EN and API compatibility with regression tests.
- [x] Record source/rights evidence without bundling Pokémon images or recordings.
- [ ] Manually inspect desktop/390 px, actual APNG playback and sound (no browser connected).
- [ ] Add sourced trivia/etymology only after a traceable provider is established.
- [ ] Implement owned/manual/smart boxes and TCG browsing in separate increments.

## Iteration 4 continuation — Public TCGdex catalog

**Implementation date:** 2026-10-22.

- [x] Verify exact species filtering, CardBrief limitations, pagination, set filtering and image conventions.
- [x] Add bounded cached FastAPI species-card and card-detail APIs with stable IDs and ES/EN fallback.
- [x] Preserve multiple species associations and exclude unverified Trainer/Energy links.
- [x] Add species galleries, official card details, expansion filtering, name/ID sorting and pagination.
- [x] Add explicit entry links from Cajas/Pokédex and preserve original browsing context on return.
- [x] Cover provider failures, optional fields, localization, navigation and regressions with mocked tests.
- [x] Record live provider evidence separately from offline verification and update authorship.
- [ ] Manually inspect desktop/390 px layout and artwork (no connected browser available).
- [ ] Define future inventory eligibility for physical versus Pocket records and durable catalog synchronization.
- [ ] Implement owned cards, authentication, trading, scanning and pricing in later slices.

## TCG visual and functional refinement — 2026-10-22

- [x] Diagnose null localized artwork and the single-attempt image failure path.
- [x] Add centralized official format/quality/same-printing language candidates and bounded visible loading.
- [x] Add metadata-only set caching and globally chronological ordering before pagination.
- [x] Replace raw expansion input with searchable names/logos/series/year and independent Other options.
- [x] Add reusable mouse/touch tilt, original simulated reflections, cleanup and live reduced motion.
- [x] Organize card details with full artwork, category, defenses, retreat and regulation metadata.
- [x] Preserve URL context, existing species associations, localization, PC search/sprites/audio and navigation.
- [ ] Review actual desktop/390 px artwork, lighting and Chromium touch on a connected browser/device.
- [ ] Add price sorting only after verified source/timestamp/currency normalization; no decorative price controls.
