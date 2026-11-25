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

## Iteration 8A — "Unova Noir" visual system, shell and Home (planned 2026-11-23)

First phase of the visual redesign:
- 8A: tokens, shell and Home.
- 8B: quick save and animated scanner.
- 8C: easy Mi PC.
- 8D: favorites and carousel.
- 8E: 3×3 binder and master set.
- 8F: profile with trainer and team.

Spec and plan: `docs/superpowers/specs|plans/2026-11-23-visual-redesign-8a*`.

- [x] Spec and plan approved by the student (2026-11-23), with the recommended decisions
  D1–D7. Adjustments: the D4 debt note below, and the system status footer shown only
  to signed-in users and closed by default.
- [x] Tasks 0–6 implemented on `feat/iteration-8a-unova-noir` (fonts and tokens, UI
  primitives, shell, token migration of the 12 stylesheets, Home structure and Home data
  sections), one commit per task or group.
- [x] Task 7: self-review against the plan's review focus, documentation and the manual
  checklist below. The independent subagent review was not launched (no request for it).
- [x] `bash scripts/check.sh` exit 0 (latest counts in the plan's execution evidence).
- [x] Student fixes before closing 8A: no copy UUID in the personal-box picker, selected-copy
  panel or grid slot names (also the Home preview), guarded by tests; and a dark "Unova Noir" box wallpaper is the default for new boxes and the public
  catalog box (migration `0006`; existing boxes keep theirs; the 4 retro wallpapers remain).
- [ ] Student applies migration `0006` (`cd backend && .venv/bin/alembic upgrade head`).
- [ ] Manual acceptance in Safari (single pass, before push and PR).
- [ ] Student reviews the branch, pushes it and opens the PR.

### Manual acceptance checklist (pending — one pass, desktop and iPhone-size responsive mode)

Global, on every route:
- [ ] Text is legible and controls have a visible boundary; nothing looks like a light panel
  with light text.
- [ ] Tab shows a cyan focus ring on every link, button and field.
- [ ] Gold appears only on money/value and notices; cyan marks actions and selection.
- [ ] iPhone size: the bottom bar never hides content, the page has a side margin, and
  there is no horizontal page scroll.
- [ ] Network (Web Inspector): no request to `fonts.googleapis.com` or `fonts.gstatic.com`.
- [ ] macOS "Reduce motion" on: no card tilt, no scanner sweep, no pulsing.

Shell:
- [ ] ≥ 768px: header with logo, nav in order (Inicio, Pokédex, Cajas PC, Expansiones,
  Mi colección), "Escanear", CLP|USD, EN/ES and avatar; the active item is cyan with an
  underline, also on `/collection/:id`.
- [ ] < 768px: reduced header (logo, Explorar, CLP|USD, EN/ES) and a bottom bar
  (INICIO, CAJAS, ESCANEAR raised in the middle, COLECCIÓN, PERFIL). Never both navs.
- [ ] "Explorar" opens Pokédex and Expansiones; Escape and choosing a link close it.
- [ ] The first Tab stop is "Saltar al contenido" and it moves focus to the content.
- [ ] CLP|USD works signed out and signed in; ES/EN switches every label.

Routes (look at each one; the first is the redesigned page):
- [ ] `/` guest: "TU BÓVEDA TCG", sign-in, scanner card, public links; no private requests.
- [ ] `/` signed in: value hero (total, chips, "sin variante · indicar" link, attribution
  link opens exchangerate-api.com in a new tab), scanner card (scanline, one sweep on
  hover), most valuable cards (tilt/foil, prices in gold; horizontal scroll on iPhone),
  Mi PC (dotted screen, cyan cursor, arrows move it, side panel follows), expansions
  (cyan bars, "De tus copias más recientes"), closed "Estado del sistema" footer.
- [ ] `/` states: empty collection ("Tu primera caja te espera"), no boxes, price outage
  (stop the backend prices or network: the value section shows its retry while Mi PC and
  expansions keep working), loading skeletons without spinners.
- [ ] `/pokedex`, `/pokemon/:n/cards`, `/cards/:id` (card stage, price panel, tilt).
- [ ] `/boxes` catalog: opens with "Unova Noir" (dark dots, cyan cursor, empty slots
  visible); the 4 retro wallpapers keep their look inside the dark frame.
- [ ] `/boxes?mode=personal`: a new box starts in "Unova Noir"; existing boxes keep their
  wallpaper; the picker buttons read "Colocar aquí" with no UUID; grid, derived views,
  box value.
- [ ] `/sets`, `/sets/:id` (progress bars, owned/missing filters).
- [ ] `/collection` (filters, `?variant=unknown`, prices), `/collection/:id` (form).
- [ ] `/scanner` (upload, candidates, notices, confirmation) and the guest message.
- [ ] `/login`, `/profile` (guest and signed in, currency switch, value card).
- [ ] VoiceOver quick pass over the shell and Home (landmarks, link names, section names).

### Technical debt

- [ ] **Owned-sets endpoint.** A private endpoint should list the expansions in which
  the signed-in user owns at least one copy. In 8A, Home derives them from the 30 most
  recent copies (decision D4), which is honest but incomplete. 8E (3×3 binder and
  master set) needs the complete list.

## Iteration 8C — Binders ("Mis carpetas") (2026-11-24)

8C became binders (album-like storage with 9-pocket pages). This replaces the earlier
"easy Mi PC" placeholder. 8A was merged as PR #6.

Spec and plan: `docs/superpowers/specs|plans/2026-11-23-binders-8c*`. Reference:
`docs/BINDERS.md`.

- [x] Spec and plan approved (2026-11-24) with D1–D8. D6 adjustment: a moved copy
  announces where it came from.
- [x] Migration `0007`: binders and pockets; every personal box copied into a binder
  (page = ceil(pos/9), pocket = ((pos−1) mod 9)+1); the box tables are frozen.
- [x] Binders API (store in the next free pocket, place, move with `moved_from`, remove,
  tray, recent, locations), binder values, and the boxes API retired.
- [x] Frontend: shelf, binder view (spreads, pockets, tray, move, take out, status
  messages, motion with reduced-motion fallbacks), copy location, Home "Mis carpetas",
  navigation (D4), and the UUID-free scanner success.
- [x] `bash scripts/check.sh` exit 0 (counts in the plan's execution evidence).
- [ ] Student applies `0007` (`cd backend && .venv/bin/alembic upgrade head`).
- [ ] Manual acceptance in Safari (checklist below), then push and PR.

### Manual acceptance checklist (pending — desktop and iPhone-size responsive mode)

- [ ] After `alembic upgrade head`, existing boxes appear as binders with the same names
  and order, and each card sits on the expected page and pocket (slot 30 → page 4,
  pocket 3).
- [ ] Shelf: Noir covers, names, counts, gold values, empty state, create, rename,
  reorder and delete (the cards go back to the tray).
- [ ] Binder: two pages on desktop and one on iPhone, card images in sleeves, names and
  gold prices, page turn by buttons and Page Up / Page Down.
- [ ] Tray and actions:
  - Tapping stores a card in the next free pocket, with the drop animation and the
    status message.
  - "Elegir de la bandeja" fills the chosen pocket.
  - Move within the binder, to another binder ("Movida desde X a Y · pág. N · bolsillo
    M") and to the next free pocket.
  - "Sacar de la carpeta" returns the card to the tray.
  - All of it works by keyboard alone.
- [ ] Storing from the tray (also with the tray scrolled out of view, and from "Choose from
  the tray"): the card leaves from exactly where it was clicked, lifts, flies in a curve
  (slight tilt, slowing down at the end) and hovers just over the pocket's opening, then
  slides down into the sleeve behind the front plastic (visible through it), straightening
  from a slight tilt, and the sleeve shines, in about 1.35 s. No jump or flicker when the
  flying card becomes the real one. The tray card stays in place but invisible while it
  flies, so there is never a second card. A pocket on another page turns the page first; one out of view
  scrolls into view. Moving between pockets flies from the source pocket. Doing something
  else mid-flight cancels it and leaves no card floating.
- [ ] With "Reduce motion" on, there is no flight, drop or turn animation and changes are
  immediate.
- [ ] Copy detail: "¿Dónde está esta carta?" opens the right page and focuses the pocket.
- [ ] Home "Mis carpetas" shows a mini shelf of covers (name, count, gold value) linking to
  each binder, and "N cartas sin carpeta · guardar".
- [ ] Scanner success: no UUID; "Guardar en una carpeta" opens the binders.
- [ ] Navigation: desktop "Mis carpetas"; mobile "Carpetas"; "Cajas PC" under Explorar;
  catalog boxes unchanged; old `/boxes?mode=personal` links open the binders.
- [ ] Prices or TCGdex down: binders, inventory and expansions keep working (no images or
  prices only).
- [ ] VoiceOver: pocket and tray names, status messages, no UUIDs.

### Technical debt (8C)

- [x] **Drop the frozen box tables** (`personal_boxes`, `box_memberships`) — done by
  migration `0008` in 8C.1. Its downgrade must rebuild boxes from binders:
  one box per 30 pockets, with name suffixes " (2)", " (3)".
- [x] The copy detail page printed the copy UUID under the card id — removed in 8D Part 1:
  it shows the card and expansion (or the catalog id) and a safe way back to the binder.
- [ ] 8D: covers and stickers (the proposed `binder_stickers` shape is in the 8C spec,
  §5.5).

## Pending iteration — Pokédex visual redesign (Unova Noir)

- [ ] Redesign the Pokédex in the "Unova Noir" style. The look will be defined with a
  mockup before any spec is written. Scope to settle then: the species card, the list or
  grid layout, the search, and the way a species opens its TCG gallery. 8C.1 only adds
  30-per-page pagination and name/number search with the existing cards, so this redesign
  starts from that working base.

## Iteration 8C.1 — Retire the PC boxes (2026-11-24)

Spec and plan: `docs/superpowers/specs|plans/2026-11-24-retire-pc-boxes-8c1*`. The student said 8C
was merged, but `origin/main` did not contain it when checked, so this iteration is stacked on
`feat/iteration-8c-binders`.

- [x] Spec and plan approved with D1 = B and the `/boxes?pokemon=N` redirect (D5).
- [x] Migration `0008` drops `box_memberships` and `personal_boxes` (reversible: the downgrade
  rebuilds boxes from binders in boxes of 30 pockets).
- [x] Pokédex: 30 per page (`?page=1..35`) and search by name or number, before the boxes left.
- [x] Catalog boxes removed (grid, wallpapers, sound, menu icons, species panel, search, sprite
  mode); "Cajas PC" removed from the nav and the Explorar menu.
- [x] `/boxes?mode=personal` → `/binders`, `/boxes?pokemon=N` → that species' gallery, any other
  `/boxes` → `/pokedex`.
- [x] Return paths: `/boxes` no longer allowed; the gallery's back link returns to the same
  Pokédex page; stale `/boxes` returns fall back to the Pokédex.
- [x] Retired local preferences (`pokevault.audio`, `pokevault.spriteMode`) removed at start.
- [x] `bash scripts/check.sh` exit 0 (counts in the plan's execution evidence).
- [ ] Student backs up the development database and applies `0007`/`0008` (commands in
  `docs/DEVELOPMENT.md`).
- [ ] Manual acceptance in Safari (checklist below), then push and PR.

### Manual acceptance checklist (pending — desktop and iPhone-size)

- [ ] `/boxes` opens the Pokédex; `/boxes?box=19&pokemon=559&wallpaper=ocean` opens Scraggy's
  gallery and its back link returns to the Pokédex; `/boxes?pokemon=0` opens the Pokédex;
  `/boxes?mode=personal` opens the binders.
- [ ] Desktop nav: Inicio, Pokédex, Expansiones, Mis carpetas, Mi colección. Explorar menu:
  Pokédex, Expansiones. Neither says "Cajas PC".
- [ ] Pokédex: pages 1 to 35 with "Página N de 35", previous/next links, and #1025 on the last
  page; searching "pika" and "559" lists matches that open each gallery.
- [ ] Opening a gallery from page 12 and going back returns to page 12.
- [ ] A species gallery → card → back to the gallery → back to the Pokédex still works.
- [ ] Binders, shelf, Home "Mis carpetas" and the copy location are exactly as before.
- [ ] No sound, wallpaper or sprite-mode control exists anywhere.
- [ ] In the database: no `personal_boxes` or `box_memberships`; the inventory and binder
  counts are the same as before. Optional: `alembic downgrade 0007` and back up to head.

### Technical debt (8C.1)

- [ ] Redesign the Pokédex in the Unova Noir style (see the pending iteration above).
- [ ] The Pokédex search shows names and numbers only (the endpoint returns no sprite or
  types); richer results would need a backend change.

## Iteration 8D Part 1 — Open album and contextual actions (Safari checklist)

Open http://localhost:5173/binders. Part 2 (covers and stickers, migration 0011 after 9A's 0009 and 9B's 0010) is blocked
until this is approved.

- [ ] At 1280×720 and 1440×900 (100% zoom) the two pages, rings, arrows and the bottom tray
  fit without scrolling the document; sleeves keep the card proportion.
- [ ] On a phone-sized window: one page with rings, arrows, a swipe left/right turns the
  page, the tray sits above the tab bar, the safe area is clear.
- [ ] Click a corner pocket: the controls appear beside it and stay on screen; on a phone
  they are a bottom sheet. Escape and an outside press close them and return focus.
- [ ] Arrows only move focus; Enter or Space opens the controls; Page Up/Down turns pages.
- [ ] Choose from the tray, cancel, move to another page, move to another binder, remove.
- [ ] The card flight, entry and shine are unchanged; resizing the window mid-flight leaves
  no floating card; reduced motion shows no flight or page turn.
- [ ] A very short window or high zoom scrolls instead of shrinking the pockets.
- [ ] "Ver carta" opens the copy detail with no UUID and "‹ Volver a la carpeta" returns to
  the same pocket.
- [ ] VoiceOver and keyboard only.

### 8D Part 1 adjustments after the first review

- [ ] The header is one line with the gold value; "Detalles" opens the rest and the
  "Rates By Exchange Rate API" link is always visible. No keyboard help text under the album.
- [ ] Pockets are large (at least 140 px wide); on a short window the page scrolls instead.
- [ ] The tray folds to a thin bar (folded by default when empty).
- [ ] The ‹ › arrows are tall icon buttons at both sides of the album.
- [ ] Each pocket shows only the card name, one line, nothing clipped ("Toxtricity", "Eevee").
- [ ] "Sacar de la carpeta": the card rises out of the sleeve, flies to the tray (or its
  bar when folded); no duplicate card; another click mid-flight leaves nothing floating.
- [ ] Google login always asks which account to use.

## Iteration 9A — Home (Safari checklist)

Apply migration 0009 first (`docs/HOME.md`), then open http://localhost:5173/.

- [ ] Order: greeting/value/scanner → (guide) → Tus cartas → Mis carpetas → Expansiones → value chart.
- [ ] "Hola, {nombre}" with the picture in the trainer slot; the value in gold. After a week
  of records the change reads as an arrow, an amount, a percentage and "en 7 días", in soft green or red.
- [ ] One "Precios de referencia · actualizados hace N h" note next to "Rates By Exchange Rate API".
- [ ] Carousel: it drifts slowly and loops with no visible cut; hovering, focusing or touching
  pauses it; "Pausar"/"Reanudar" works; the ‹ › buttons move one card; hovering a card grows and
  tilts it; with "reducir movimiento" it stays still. Cards show only image, name and price.
- [ ] The three tabs (most valuable · favourites · recent) switch without a jump; favourites
  say "Marca cartas con ★…" when empty.
- [ ] ★ on a card's detail page and in a pocket menu; the card appears under Favoritas on Home.
- [ ] Bookcase: two wooden shelves, three covers each, name/count/value under each; one scrolling shelf on a phone.
- [ ] Chart: first day shows the "Empezamos a registrar…" note; after records, a gold line with a dot
  per record (days with no record are joined by the line); 7 d / 30 d / 1 año; CLP/USD follows the switch.
- [ ] Guide: steps get crossed out as you scan, store and star; "Cerrar guía" keeps it closed after a reload.
- [ ] Guest, empty account, prices offline and the catalog offline all keep the page usable.
- [ ] VoiceOver and keyboard only (tabs with arrow keys, the Pause button, the chart's summary and table).

### 9A after the first review

- [ ] The chart, the card ★ and the guide work with migration 0009 applied.
- [ ] The greeting's picture is a square with the cut corner and fills it; the same on Profile.
- [ ] The three hero chips have the same height and type; the "sin variante" one still underlines on hover.
- [ ] Clicking a carousel card opens its catalog page; "Volver al Inicio" returns to Home.
- [ ] Hovering a card shows a ★ at its top right; clicking it stars at once, the card does not open, the carousel keeps its Pause state. On a phone the ★ is always visible, smaller.
- [ ] Starring changes the Favoritas tab without reloading; an offline server puts the star back with a quiet notice.
- [ ] Turn the API off: each Home section says "No pudimos cargar … por ahora" with Reintentar, with no alarm.
- [ ] The guide shows your two finished steps crossed out; "Marca tu favorita ★" scrolls to the carousel and focuses its title.

## Iteration 9B — Collector's Pokédex (Safari checklist)

Back up and apply migration 0010 first: `pg_dump -Fc pokevault -f ~/pokevault-before-0010.dump`, then
`cd backend && .venv/bin/alembic upgrade head` (`alembic current` → 0010). `alembic downgrade 0009`
only loses the `card_species` cache (it is rebuilt on demand). The species list is a fixed JSON
(`backend/app/pokemon/data/species_index.json`); regenerate it with `backend/scripts/build_species_index.py`
(see the script header) and the test `test_species_index.py` validates it.

- [ ] `/pokedex`: 9 generation tabs, search by name (ES/EN) or number, type chips, owned/missing filter; owned species in colour with their card count, the rest dimmed; "Ver más" and going back restore the position.
- [ ] A species sheet (`/pokemon/25`): hero with artwork, description and ability "(oculta)"; previous/next with names; back returns to the grid.
- [ ] "Tu colección": copies, distinct cards and value (CLP/USD); "Ver solo las que me faltan" filters exactly, and pages stay full.
- [ ] Cards: "TENGO" label and gold border on owned ones; ★ flips at once; the card detail returns to the sheet with the same filters; `/pokemon/25/cards` redirects to the sheet.
- [ ] As a guest: public cards, owned filters disabled and a sign-in link; with the network cut, calm errors with "Reintentar".

## Iteration 10 — Trainer profile (Safari checklist)

Back up and apply migration 0011 first: `pg_dump -Fc pokevault -f ~/pokevault-before-0011.dump`, then
`cd backend && .venv/bin/alembic upgrade head` (`alembic current` → 0011). `alembic downgrade 0010` only
loses the chosen trainer and team. Design source: `docs/design/Profile.dc.html` (and `trainers-preview.png`).
Known gaps against the design: no city (the account has none), "Ver todas →" opens Home (there is no favourites page yet),
and the price note, rates attribution, currency switch and sign-out sit in a footer the design does not show.

- [ ] `/profile` beside the design capture: band with name, "Entrenador desde …", team (empty slots dotted, sprites with shadow), big trainer, the two buttons; same spacing, type and colours.
- [ ] "Cambiar entrenador" (4 sprites) and "Editar equipo" (search, up to 5, Guardar) persist after reloading; buttons are 44 px and the dialogs close with Escape.
- [ ] Value card: amount, 7 d / 30 d / 1 año; with fewer than 2 recorded days the message shows and no chart is invented.
- [ ] 2×2 counts (the gold one opens copies without variant), favourites row opens the card and returns to Perfil.
- [ ] "Valor por carpeta" and "Valor por expansión" bars; iPhone-size mode stacks the band and cards, and with Reduce Motion the sprites stand still.

## Scanner visual (Safari checklist)

`/scans/recognize` now returns the detected card `corners` (or `null`); the preview shows a cyan scanning beam and then crops to the card (see docs/SCANNER.md). No migration.

- [ ] A well-framed photo: the beam sweeps for at least 1.2 s inside the viewfinder corners, then the photo crops smoothly to the card, flat and 63:88.
- [ ] A tilted photo: the crop straightens the perspective; the clues and candidates are the same as before.
- [ ] A photo with no card visible (or a HEIC with no preview): the original photo stays, uncropped (HEIC shows only "Analizando carta…"), and nothing breaks.
- [ ] With Reduce Motion: no sweep and no transition, a static frame with the same text, and the crop appears at once.

## Iteration 8D Part 2 — Binder customization (Safari checklist)

Back up and apply migration 0012 first: `pg_dump -Fc pokevault -f ~/pokevault-before-0012.dump`, then
`cd backend && .venv/bin/alembic upgrade head` (`alembic current` → 0012). `alembic downgrade 0011` drops
stickers, resets covers to noir and the stored page count. Design source: `docs/design/BinderCustomize.dc.html`.
Known deviations: stickers also have rotation and size controls (the design shows none), the heart and creature
pixel colours are decorative tokens, and last save wins (no edit-conflict revision).

- [ ] Shelf → Gestionar → "Personalizar portada": the editor matches the design (preview with name plate, 5 covers, sticker grid, "Quitar todos", "Guardar portada") and each material looks right.
- [ ] Tap pixel stickers to stick them (with the short pop) and drag them on the cover; with the arrow keys / number fields too; a Pokémon sprite from the search also works, and a broken image shows a placeholder.
- [ ] Save, reload: shelf, Home and the open album show the same cover and stickers; closing with changes asks "¿Descartar…?".
- [ ] "+ Agregar hojas" at the end of the album adds 2 empty sheets that stay after reloading; at 40 it is disabled.
- [ ] iPhone-size mode: the editor is full screen, buttons are 44 px, and with Reduce Motion there is no pop.
## Collection polish — 2026-11-25
- [x] Point 1: whole-collection copy/distinct-card counts and reference value in the selected currency.
- Existing inventory/valuation endpoints; no migration or new backend endpoint.
- [x] Point 2: instant attribute chips and progressive name search over up to 500 copies / 100 distinct cards, four concurrent metadata reads shared with rendering.
- [x] Point 3: client ordering by most recent (default), localized name or expansion; unresolved names sort last and active edits keep their visible page stable.
- Pending: points 4–7 (album/list view, richer pagination/scroll restoration, premium states); metadata batch endpoint and highest-value ordering remain deferred. No backend changes.
- Safari acceptance pending: filtered totals, currency switching, price outage and 390 px layout.
