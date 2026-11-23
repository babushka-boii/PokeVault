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
- Google production deployment, real credentials and live verification; OIDC/session implementation is recorded in Iteration 5A below.

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

## Iteration 5A — Secure Google authentication and identity (2026-10-24)

- [x] Implement backend Google authorization code flow, S256 PKCE, nonce and signed ID token validation.
- [x] Persist internal UUID users keyed by unique Google subject and extensible one-to-one settings.
- [x] Persist short-lived browser-bound single-use login transactions and digest-only expiring sessions.
- [x] Add credentialed `/auth/me`, Origin/CSRF-protected logout, session rotation and sanitized failures.
- [x] Add typed React session restoration, ES/EN login, real profile and logout; preserve public catalogs.
- [x] Document exact Google Cloud setup, localhost cookies and future backend-derived ownership boundaries.
- [ ] Configure real Google credentials and manually verify consent, callback and browser cookies.
- [ ] Review real desktop/mobile appearance and production HTTPS/proxy behavior.
- [ ] Implement owned cards, user boxes, collections and set completion in the next inventory slice.

Automated evidence is recorded in DEVELOPMENT.md and Bitacora.md after the final
gate. The earlier roadmap entries are historical records, not live completion claims.


## Iteration 5B — Persistent personal inventory (2026-11-07)

- [x] One PostgreSQL row per physical copy with condition/language/variant/date/notes.
- [x] Reversible 0003 migration, authenticated CRUD, CSRF and strict user isolation.
- [x] Add action in TCG details; personal collection with quantities, artwork,
  exact-card/condition/language filters, pagination and per-copy edits/deletion.
- [x] ES/EN states, offline provider fallback, automated persistence/concurrency tests.
- [ ] Configure local Google OAuth and complete live login/reload/logout/relogin acceptance.
- [ ] Student reviews changes before deciding on commit/push; none performed by Codex.

Personal boxes, owned/missing set completion, wishlist, trades, prices and scanner
are subsequent slices, outside 5B. This local implementation does not establish
compliance with weekly commit dates or a final academic delivery deadline.

## Iteration 5C — Persistent personal PC boxes (2026-11-07)

- [x] Audit the corrected clean 5C branch at `ad8279c`, including authentication,
  persistent inventory and migration `0003`; no Git history changes by Codex.
- [x] Implement separate manual boxes/memberships and reversible `0004`, composite
  same-owner foreign keys, 30-position bounds, unique physical-copy placement and cascades.
- [x] Add authenticated/CSRF-protected CRUD, ordering, transactional placement/movement/
  removal, collision rejection and derived owned/unassigned/recent views.
- [x] Preserve Catalog Boxes and add classic personal PC interactions, copy metadata,
  direct inventory record navigation, category/multi-species fallbacks and ES/EN.
- [x] Complete gate: 43 provider, 247 backend (42 PostgreSQL), 265 frontend tests;
  Ruff, ESLint, TypeScript, production build and whitespace checks pass.
- [x] Apply additive local `0004` and verify `0004 (head)` without development downgrade.
- [ ] Complete real-browser personal-box acceptance in BOXES.md; only catalog and
  pre-migration personal entry/error were inspected live in this session.
- [ ] Student reviews the implementation and decides on any future Git publication.

Generation grouping covers the bounded visible smart-view page using reliable official
species associations, with explicit mixed/unknown/category fallbacks. A collection-wide
generation index, automatic swaps, drag-and-drop and custom rule builder remain deferred.
Set completion is implemented in 5D below; the final global visual redesign remains postponed.

## Iteration 5D — Expansion explorer and derived completion (2026-11-09)

- [x] Audit clean completed 5C at `dc233c4`, one commit ahead of local main; create
  `feat/iteration-5d-set-completion` from that baseline without rewriting history.
- [x] Verify live EN/ES set contracts, punctuation, printed/provider counts, Pocket
  separation and representative artwork availability; retain compact dated evidence.
- [x] Extend shared CardProvider with bounded physical-set discovery, global search/
  series/date filters, canonical checklists and safe localized overlays.
- [x] Derive full-set distinct owned/missing/copy totals from existing inventory;
  no new progress tables, migrations or ownership flags.
- [x] Add public `/sets` and `/sets/:setId`, account-isolated progress, All/Owned/
  Missing filters, pagination, shared artwork/forms and context-preserving links.
- [x] Validate full backend/provider/PostgreSQL/UI regressions; exact final counts
  are recorded in DEVELOPMENT.md with the 5C comparison.
- [x] Verify migration remains `0004 (head)` read-only; no 5D development DB writes.
- [ ] Complete the real-browser acceptance checklist in SET_COMPLETION.md, including
  mobile, actual Google session transitions and artwork fallback inspection.
- [ ] Student reviews 5D changes and decides on publication; no Codex commit/push.

5C is recorded in commit `dc233c4` and its local remote branch reference. Its full
manual acceptance markers remain pending because this does not establish specific
browser/OAuth checks. Earlier roadmap entries remain historical rather than claims
that now-implemented authentication/inventory/boxes are still missing.

Coverage is the recognized physical English catalog with explicit exclusions, not
worldwide/all-language completeness. Partial English checklists never produce a
percentage; Spanish gaps preserve canonical membership. Official-numbered subsets,
variant master sets, prices, scanning, trading and the final visual redesign remain
deferred. The personal-box scroll issue is outside 5D unless it blocks acceptance.


## Iteration 6 — OCR-assisted card scanner (2026-11-10–11)

- [x] Audit clean `feat/iteration-6-card-scanner` at `9f2854c`, containing merged 5A–5D;
  verify migration `0004 (head)` read-only and preserve all resumed local changes.
- [x] Implement local Tesseract/Pillow validation, bounded isolated workers, cancellation,
  conservative extraction and explicit unavailable/manual fallback.
- [x] Reuse CardProvider for bounded physical EN/verified ES candidate matching, honest
  ambiguity, editable clues and expansion selection; no fake confidence percentages.
- [x] Add localized `/scanner`, native capture/upload, preview, human selection and shared
  physical-copy confirmation with replay protection, exact copy/card/set destinations.
- [x] Preserve inventory, derived completion, personal boxes and account isolation;
  no scanner migration or photo/history persistence.
- [x] Record final full-gate and real synthetic OCR evaluation evidence in DEVELOPMENT.md:
  43 provider fixtures, 508 backend (75 PostgreSQL), 379 frontend; no skips or failures.
- [ ] Complete real-photo, Google, camera and Safari/Chromium manual acceptance in SCANNER.md.
- [ ] Student reviews/understands the implementation and decides on publication.

The previous 5D future-work references are historical. Scanner functionality is now
implemented; real-photo accuracy remains unverified. Wishlist, trades, prices, decks,
bulk scanning, cloud photo storage and full visual redesign remain deferred.


### Scanner checkpoint — 2026-11-23

- [x] Milestone A: direct HEIC/HEIF processing and reproducible real-photo baseline verified.
- [x] Original HEIC and baseline-identical PNG inputs produce the same current clues/ranks;
  both authorized photos rank the correct printing first, without automatic registration.
- [x] Focused gate: 66 backend + 20 frontend service tests; scoped lint/type checks pass.
- [ ] Next milestone B: finish and validate safe recognition fallback with uncertain framing.
- [ ] Later: finish pending hybrid/UI integration review, full project gate and real-browser acceptance.


### Scanner Milestone B — 2026-11-23

- [x] Restore bounded original-image OCR after an accepted but unproductive crop.
- [x] Select coherent evidence deterministically; disclose conflicting paths without changing catalog quality labels.
- [x] Preserve both real-photo identifications and the 14-image synthetic benchmark.
- [x] Focused validation: 172 backend tests, no skips; scoped lint, TypeScript and whitespace pass.
- [ ] Next isolated milestone: finish/review the existing consecutive-scanning UI and session lifecycle regressions.

Hybrid integration, full project gate and browser acceptance remain separate pending work.


### Scanner Milestone C — 2026-11-23

- [x] Finish cancellable automatic recognition scheduling and next-scan keyboard focus.
- [x] Validate fresh registration identities for repeated and different printings.
- [x] Validate logout during recognition/save alongside existing session lifecycle coverage.
- [x] 98 focused frontend tests passed; scoped ESLint, TypeScript and whitespace checks.
- [ ] Next: real-device consecutive-scanning acceptance, including uncertain saves and account changes.

Stop at Milestone C. Hybrid recognition, redesign and full integration gate remain separate.

### Milestone D — final validation (2026-11-23)

Real Zen browser acceptance completed with existing Google OAuth, local FastAPI,
PostgreSQL, Tesseract 5.5.4 and pillow-heif 1.8.1. Original HEIC Cranidos → me05-044
and Armarouge → me05-086 ranked first as possible matches. Explicit selection and
save created exactly two acceptance copies, retained in the development database.
Both collection detail pages and read-only PostgreSQL queries confirmed persistence;
migration remains 0004. Spanish/English flow, next-scan reset and focus were observed.
Race/failure scenarios have automated coverage, not browser fault-injection evidence.

Final bash scripts/check.sh exited 0: 43 unittest cases, 586 backend cases (including
75 PostgreSQL integration cases), 406 frontend cases across 32 files; zero failures
or skips. Provider validation, Ruff, ESLint, TypeScript, build and whitespace passed.
Earlier gate attempts found one copied-patch false positive in existing unintegrated
visual code and 25 scanner lint violations. Fixed without enabling hybrid recognition
or weakening tests. Focused runs: 43 backend, 98 frontend and 15 visual tests passed.

Ready for final user acceptance. Mobile camera/touch, narrow-screen and VoiceOver
remain manual: http://localhost:5173/scanner on the development Mac. No private images
stored in the repository, secrets changed, database resets, commits or pushes.
See docs/SCANNER.md for copy identifiers and detailed browser evidence.

### Acceptance regression follow-up — 2026-11-23

Recovered the two absent candidates in the five-photo sample with bounded fallback
framing, layout-aware Trainer title OCR and language-aware discovery budget ordering.
All five expected cards now rank first, as do the prior Cranidos/Armarouge HEICs.
Jamming Tower and Zigzagoon numbers remain unreadable: same-name printings remain
ambiguous, requiring explicit confirmation. This is not a general accuracy claim.
Scorbunny retains a partial OCR title and uncertain confidence. See docs/SCANNER.md
and research/scanner/acceptance_regression_{before,after}.json for measured evidence.

Validation: 100 focused tests; one complete scripts/check.sh run passed with 43
unittest, 593 backend and 406 frontend tests, zero skips/failures. Ruff, ESLint,
TypeScript, production build and whitespace passed. Seven general regression cases
cover bounded localized discovery, incomplete regional names, secret numbering,
Trainer headers/title regions and interrupted geometric boundaries. No private
images committed, inventory writes, credentials changes, commits or pushes.
Remaining: improve outlined footer OCR using independent evidence; do not infer a
printing solely from first rank. No hybrid recognition or Iteration 7 work.

### Outlined collector numbers — 2026-11-23

- [x] Added one bounded footer pass for numbers printed as a dark fill inside a light
  outline (full-art and reverse-holo footers). Runs only after the plain and
  thresholded footer passes find no number; worst case is now twelve native calls.
- [x] Local A/B on 14 synthetic samples and 7 real photos: only Galarian Zigzagoon
  (now 130/217) and Jamming Tower (now 261/217) changed; the other 19 are identical.
- [x] Readings stay OCR evidence: matching still marks name/number conflicts as uncertain.
- [ ] Re-run `bash scripts/check.sh` and real-browser acceptance on the development Mac.

### Manual acceptance — 2026-11-23

- [x] `bash scripts/check.sh` passed (exit code 0) on the development Mac.
- [x] Safari on desktop and in responsive mode at iPhone size: scanner OK with
  Galarian Zigzagoon (130/217) and Jamming Tower (261/217).
- [ ] Real phone camera: pending, because Google OAuth only works on localhost.

Limitation: the italic flagged "1" of this typeface is fragile in Tesseract (some
preprocessing variants read 430 or 730). Never correct it from catalog expectations.

## Iteration 7 — Reference card prices (2026-11-23)

Scope reduced from the original row 7: reference prices and collection/box value only.
Wishlist, trades, transactions and missing-card cost stay deferred.

- [x] Spec and plan approved (`docs/superpowers/specs|plans/2026-11-23-card-prices*`);
  real TCGdex and ExchangeRate-API evidence in `research/prices/`.
- [x] Pure variant selection and Decimal conversion; migration `0005` (price snapshots,
  exchange rates, `user_settings.preferred_currency`), applied on the development DB.
- [x] TCGdex pricing and ExchangeRate-API clients; price service with 24 h caches,
  40-refresh budget, 10 s deadline, 60 s TCGdex pause and 20 min rate backoff.
- [x] Card, copy, collection, box-value and currency-setting APIs; inventory `variant`
  filter; isolation proven with two PostgreSQL users owning the same card.
- [x] UI: card price panel, price per copy, profile value + top 5 + copies without
  variant, box total, CLP/USD switch, ES/EN, exchange-rate attribution.
- [x] Review fix: unknown card ids are no longer stored (public endpoint abuse).
- [x] `bash scripts/check.sh` exit 0: 43 provider, 790 backend, 421 frontend tests.
- [x] Manual acceptance on the development Mac, Safari (2026-11-23; two checks remain, see below).
- [x] Student reviewed the branch and merged it into `main` (PR #5).

### Manual acceptance — 2026-11-23 (Safari, development Mac)

- [x] Card detail: reference prices by variant shown OK.
- [x] A copy in `reverse`: its price shows OK in My collection.
- [x] Profile: collection value card OK.
- [x] CLP/USD switch OK both signed in and signed out.
- [x] Personal box: box value OK.
- [ ] Attribution link opens https://www.exchangerate-api.com in a new tab (not checked).
- [ ] Network off (or API down): collection, boxes and expansions still work; prices
  show the last saved value or "no price" (not checked manually; covered by automated
  tests).
