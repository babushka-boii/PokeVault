# Iteration 8D binder album, covers and stickers implementation plan

> **For agentic workers:** Use superpowers:executing-plans for task-by-task execution
> (or subagent-driven-development only if the student chooses it). Work test-first.
> The student approved D1–D7 and Part 1 on 2026-11-24. Commit each
> completed task only after its tests and lint pass; never push. Stop on unexpected
> failure or a new design decision. **Stop after Task 4 for the student's Part 1 Safari
> acceptance; no Part 2 code or migration before explicit approval to continue.**

**Goal:** Turn the existing binder into a viewport-fitted physical album with contextual
actions, then add explicit-save covers and stickers without changing copy placement.

**Architecture:** Keep BinderWorkspace's owner-scoped coordinator and existing flight
choreography. Extract tray and action surfaces; separate focus from activation. Part 2
adds a shared cover renderer and atomic appearance resource with revision checking.

**Tech Stack:** Existing React/TypeScript/Vite, CSS tokens, FastAPI/Pydantic,
SQLAlchemy/Alembic, PostgreSQL and SQLite tests. No new runtime dependency planned.

**Spec:** `docs/superpowers/specs/2026-11-24-binder-album-8d-design.md`.

## Audit and global constraints

- Read CLAUDE.md and the spec first. Baseline audited: `main` `f255ce7`, PR #7/#8 merged,
  `git pull --ff-only` up to date. Preserve pre-existing `AGENTS.md`.
- Planning writes only these two documents. No product code, commits, migrations or
  test success claims in this phase. D1–D7 were approved on 2026-11-24; only Part 1 may proceed.
- Approved visual direction: desktop two 3×3 pages, central three rings, cover surround,
  inner shadows, lateral arrows; mobile one page with rings and arrows/swipe.
- Proposed fit contract: 63:88 sleeve, >=64 CSS px wide, targets >=44×44, text >=12 px;
  no document scroll at 1280×720 and 1440×900, with accessibility fallback per D1.
- Preserve existing FLIP (150/550/150 ms), 500 ms entry/300 ms shine, page turn,
  cancellation, synchronous hand-off and reduced-motion behavior.
- ES/EN; code/commits/docs English, conversation Spanish. No UUID in visible or
  accessible content. IDs in internal keys, attributes that do not name controls and
  validated route parameters are permitted.
- CSS variables, no Tailwind. Palette values only in tokens.css; cyan actions,
  gold money/favourites. Material tokens are decorative only.
- Session/Origin/CSRF, no-store and owner isolation unchanged; no backend/.env or private
  photo reads; no development data mutations during implementation verification.
- All UI success follows server confirmation. No silent retries or cross-owner drafts.
- Part 2 values: covers noir/brown_leather/metallic/holographic/white; max 24 layers;
  pokemon 1–1025, pixel star/bolt/heart/creature/circle; x/y 0–100%, rotation −180..180,
  scale 0.5–2, order 0..23; canvas 3:4, base sticker square width 20% of canvas width.
- SQLite tests and PostgreSQL disposable-schema tests are both required. The current
  runtime is macOS; verify available tools rather than inheriting Claude's Linux caveat.

## Review focus

1. Height changes, browser chrome and zoom must not strand the tray or focus: Task 1
   sizing tests, Task 4 actual Safari geometry checks.
2. Arrows in move mode must not mutate: Task 2 explicit selection/activation tests.
3. Portal dismissal/resize during flight must not remove the origin or duplicate cards:
   Task 3 cleanup tests and Task 4 Safari choreography.
4. A lost appearance response or a concurrent tab must not duplicate layers/overwrite
   another edit: Task 6 stale replay/concurrency tests and Task 8 draft error tests.
5. Unknown artwork, invalid transforms or another owner's sticker ID must not become
   arbitrary image requests or private data: Tasks 5–8 validation/isolation tests.

## File map and shared interfaces

Keep `pages/BinderPage.tsx` as coordinator; do not invent a BinderView.tsx file.
Existing tests are `pages/BinderView.test.tsx`.

| File | Responsibility |
| --- | --- |
| `components/binders/AlbumFrame.tsx`, `albumLayout.ts` (new) | Cover shell, rings, spread/pager, pure fit calculation |
| `components/binders/BinderTray.tsx` (new) | Extracted bounded tray, horizontal presentation and fill cue |
| `components/binders/PocketActions.tsx` (new) | Anchored desktop controls/mobile sheet and dismissal |
| `components/binders/PageGrid.tsx` | Roving focus vs activation; original sleeve DOM |
| `components/binders/flight.ts` | Preserve behavior; only fix a demonstrated integration defect |
| `components/binders/AppearanceEditor.tsx`, `StickerPicker.tsx`, `StickerCanvas.tsx` (new) | Draft editor, search, gestures/keyboard controls |
| `components/binders/CoverArt.tsx`, `stickerAssets.ts` (new) | Shared bounded visual renderer and asset registry |
| `components/binders/Cover.tsx` | Existing cover link wrapper |
| `services/binderAppearance.ts` (new), `services/binders.ts` | Appearance wire types/validation/requests and enriched summaries |
| `backend/app/binders/appearance.py` (new) | Owner-scoped snapshot read/replace/revision/replay logic |
| `backend/app/binders/schemas.py`, `api/binders.py`, `db/models.py` | Contract, routes, persistence |
| `backend/migrations/versions/0009_binder_appearance.py` (new) | Extend covers, revision and sticker table |

Interfaces to settle exactly as the spec before implementation:
- `PocketRef = {page: number; pocket: number}` stays unchanged.
- PageGrid consumes `onSelect(target: PocketRef): void` and
  `onActivate(target: PocketRef): void`; onTurn/register/motion props retain semantics.
- `fitAlbum(input: {width; height; pages: 1|2; gap; pagePadding; spineWidth;
  framePadding; captionHeight; minSleeveWidth}): {sleeveWidth; sleeveHeight; overflow}`
  is pure; measurements exclude shell/header/status/tray and pager reservations.
- `PocketActions` consumes anchor element, PocketRef, card/copy/price facts and action
  callbacks; it owns overlay focus/dismissal, never placement requests.
- `Appearance = {cover: Cover; revision: number; stickers: Sticker[]}`;
  `SaveAppearance = {expected_revision: number; cover: Cover; stickers: Sticker[]}`.
- Sticker fields: id, kind, species_id, pixel_key, x, y, rotation, scale, display_order.
  Wire timestamps are not part of a layer. Only the backend stores created_at.
- `fetchAppearance(id, signal): Promise<Appearance>` and
  `saveAppearance(id, value: SaveAppearance, csrf, signal): Promise<Appearance>`.
- `CoverArt({appearance, decorative})` is noninteractive; editor overlays are separate.
  Summary → Appearance maps appearance_revision to revision, without a detail request.

## Tasks — Part 1

### Task 0: Establish the approved baseline

**Files:** read CLAUDE.md, both 8D documents, previous 8C/8C.1 test evidence.

- [x] Record approval of D1–D7 and the separate Safari gate. Revise both documents first
  if an answer changes the contract; do not silently choose an unapproved alternative.
- [x] Verify branch/worktree, create `feat/iteration-8d-binder-album` from updated main
  without resetting or staging unrelated files. Keep AGENTS.md unless separately included.
- [x] Inspect available Python/node tools and test configuration without opening secrets.
  Record baseline failures/skips honestly; stop on a failure rather than building on it.

### Task 1: Album geometry and fixed tray

**Create:** AlbumFrame.tsx, albumLayout.ts, albumLayout.test.ts, BinderTray.tsx under
`frontend/src/components/binders/`.
**Modify:** BinderPage.tsx, PageGrid.tsx, binders.css, i18n/dictionaries.ts;
route-scoped shell.css/AppShell.tsx only if required to reserve existing shell space.
**Tests:** BinderView.test.tsx, styles/styles.contract.test.ts.

- [x] Write fitAlbum cases for width/height-limited two-page fit, one page, 64 px minimum,
  63:88 ratio and explicit overflow fallback. Write tray tests proving 30-item paging,
  pending-disable, empty/retry, target highlight and consumed-item behavior survive.
- [x] Run `npm test --prefix frontend -- --run src/components/binders/albumLayout.test.ts
  src/pages/BinderView.test.tsx`; confirm new assertions fail for missing behavior.
- [x] Implement pure sizing and measured available space, desktop spine/three rings,
  lateral arrows and mobile rings; extract tray without changing request semantics.
  Keep original sleeve/card/front nodes and flight overflow clear. Add ES/EN strings.
- [x] Test shell height, status wrapping and tray-height changes; cleanup observers and
  resize handlers. Add skeletons with the same reserved space and reduced-motion styles.
- [x] Run task tests, `npm run lint --prefix frontend`, `npm run typecheck --prefix frontend`.
  Commit only the task's files on green: `feat(binders): fit the open album and bottom tray`.

### Task 2: Contextual controls and safe selection modes

**Create:** PocketActions.tsx and PocketActions.test.tsx.
**Modify:** BinderPage.tsx, PageGrid.tsx, BinderTray.tsx, binders.css, dictionaries.ts.
**Tests:** BinderView.test.tsx, PocketActions.test.tsx.

- [x] Add tests: occupied click opens named facts/actions, empty click offers tray;
  desktop flips/clamps at each edge; mobile modal traps focus; Escape/outside restores
  focus; outside pointer does not activate underlying pocket; no UUID in names/text.
- [x] Add a failing regression: in move mode ArrowRight/Down and Home/End cause zero
  placement requests; Enter on an empty destination causes exactly one. Occupied
  destination does not overwrite. Paging selects the new page without saving.
- [x] Separate onSelect/onActivate. Remove the aside; use one portal-based action surface.
  Implement idle/fill/move/other-binder states from spec §4.4 and explicit cancellation.
  Empty-pocket activation opens controls; only Choose from tray enters fill and moves
  focus to the tray. Test both steps separately.
- [x] Add multi-page move, target tray fill, cross-binder next-free, 409 refresh,
  failed-request retained identity and auth-unmount tests using existing API fixtures.
- [x] Run `npm test --prefix frontend -- --run src/pages/BinderView.test.tsx
  src/components/binders/PocketActions.test.tsx src/services/binders.test.ts`, then
  frontend lint/typecheck. Commit: `feat(binders): place pocket actions in context`.

### Task 3: Paging gestures and preserved choreography

**Modify:** AlbumFrame.tsx, BinderPage.tsx, BinderTray.tsx, PageGrid.tsx, binders.css.
**Tests:** BinderView.test.tsx, components/binders/flight.test.ts, albumLayout.test.ts.

- [x] Add tests for 48 px/1.5× swipe criteria, vertical/multitouch/control/tray exclusion,
  suppressed click after swipe, bounds and reduced motion. No gesture mutates inventory.
- [x] Add resize-during-flight, page-then-arrival, popover closure before source capture,
  horizontal tray scroll, rapid second action, unmount/auth abort and missing animation
  API cases. Assert no stale focus, floating clone, duplicate card or hidden origin.
  Distinguish visible-source full flight from unmounted/offscreen-source sleeve entry:
  no stale origin is reused after paging and neither case animates before success.
- [x] Implement gesture handling and geometry cancellation around existing arrival tokens.
  Capture visible origins at destination activation; otherwise pass no origin to the
  existing sleeve-entry fallback. Keep current flight keyframes/timings and synchronous
  hand-off. Do not replace animation with a second mechanism.
- [x] Run the three test files plus frontend lint/typecheck. Commit:
  `feat(binders): support touch paging without changing card flight`.

### Task 4: Copy identity, Part 1 evidence and mandatory pause

**Modify:** InventoryCopyPage.tsx, InventoryCopyPage.test.tsx, services/cards.ts (only
if validated binder return context needs extending), related tests, dictionaries.ts;
docs/BINDERS.md, docs/UX_UI.md, docs/ROADMAP.md, Bitacora.md, Autoria.md.

- [x] Test copy name/expansion plus catalog-ID fallback; neither loaded, failed, editing,
  deleting nor accessible content exposes a copy UUID. Preserve owner/revalidation tests.
- [x] Remove the UUID node, reuse metadata/identity helpers, add validated binder/page/
  pocket return context from View card; reject external and malformed return targets.
- [x] Run `npm test --prefix frontend -- --run src/pages/InventoryCopyPage.test.tsx
  src/services/cards.test.ts src/pages/BinderView.test.tsx
  src/components/binders/flight.test.ts src/styles/styles.contract.test.ts`, lint/typecheck.
- [x] Record actual automated outcomes and pending browser checks; commit:
  `fix(inventory): show card identity and preserve binder return context`.
- [ ] Hand off spec §10 Part 1 checklist for Safari at http://localhost:5173/binders.
  **STOP. Wait for the student's explicit approval after Safari review.** Fix feedback
  with focused tests/commits before continuing. Do not apply or create 0009 yet.

## Tasks — Part 2 (blocked until the Safari approval)

### Task 5: Appearance schema and reversible migration

**Create:** backend/migrations/versions/0009_binder_appearance.py;
backend/tests/test_binder_appearance_models.py;
backend/tests/integration/test_binder_appearance_migration_postgres.py.
**Modify:** backend/app/db/models.py, backend/app/binders/schemas.py.

- [ ] Write SQLite/raw SQL tests for five covers, kind/reference exclusivity, finite
  bounded transforms, order uniqueness/range, two-owner composite FK and cascades.
  With 24 distinct order values all slots are used; a 25th row cannot pass constraints.
- [ ] Write PostgreSQL migration tests 0008→0009→0008 in disposable schemas: preserve
  inventory, pocket placements and binder identity; default revision 0/no stickers;
  downgrade loses only appearance, maps covers to noir, restores check and keeps FKs.
- [ ] Run tests to observe the absent schema fail; implement migration/model/checks.
  Numeric storage contract: x/y Numeric(5,2), rotation Numeric(5,1), scale Numeric(3,2).
  Reject excess precision at the API so DB rounding cannot silently change the draft.
  Test trailing-zero equivalence, finite numeric JSON types and canonical decimal
  comparison for identical-content replay; preserve numeric JSON responses.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_binder_appearance_models.py
  backend/tests/integration/test_binder_appearance_migration_postgres.py -q` and
  `backend/.venv/bin/python -m ruff check backend`.
- [ ] Commit `feat(binders): persist cover materials and sticker layers`. Do not migrate
  the development database; supply student commands at final handoff.

### Task 6: Atomic appearance API and bounded summary data

**Create:** backend/app/binders/appearance.py; backend/tests/test_binder_appearance.py;
backend/tests/integration/test_binder_appearance_postgres.py.
**Modify:** backend/app/api/binders.py, backend/app/binders/schemas.py; existing binder
fixtures/tests as required by additive summary fields.

**Interfaces:** GET/PUT /binders/{binder_id}/appearance, spec §7.2; summary adds
appearance_revision/stickers, including detail and placement mutation responses.

- [ ] Test validation rejects unknown keys/URLs, invalid references, boolean/string
  numeric inputs, NaN/Infinity, overprecision, duplicate IDs/order, gaps and >24 layers.
- [ ] Test SQLite and PostgreSQL two-user GET/PUT/list/detail isolation; unknown and
  foreign binder 404; unauthorized/CSRF errors; no-store; no external calls.
- [ ] Test atomic replacement rollback, retained created_at, deletion cascade, borrowed
  sticker UUID rejection, concurrent revision conflict, identical stale replay without
  another increment and generic UpdateBinder cover edits invalidating the revision.
- [ ] Implement locked appearance snapshot replacement. For order swaps, avoid transient
  uniqueness collisions by transactional replacement after validated ownership; restore
  retained created_at. Keep inventory and pockets untouched.
- [ ] Batch-load summary layers in one query (test bounded query count for 100 binders).
  No N+1 detail calls in list or Home. Ensure all existing response paths supply fields.
- [ ] Run `backend/.venv/bin/python -m pytest backend/tests/test_binders.py
  backend/tests/test_binder_appearance.py backend/tests/integration/test_binders_postgres.py
  backend/tests/integration/test_binder_appearance_postgres.py -q` and Ruff.
  Commit `feat(binders): save appearance atomically with revision checks`.

### Task 7: Shared covers, sticker assets and frontend contracts

**Create:** services/binderAppearance.ts/.test.ts, components/binders/CoverArt.tsx,
stickerAssets.ts/.test.ts, five original SVGs in frontend/src/assets/stickers/.
**Modify:** services/binders.ts/.test.ts, Cover.tsx, BindersPage.tsx, BinderShelf.tsx,
AlbumFrame.tsx, tokens.css, binders.css, dictionaries.ts, test/binderFixtures.ts.
**Tests:** Binders.test.tsx, HomeData.test.tsx, styles.contract.test.ts.

- [ ] Add strict parser tests matching backend bounds and valid material/layer payloads.
  Contract checks reject arbitrary image URLs or SVG content in response data.
- [ ] Implement shared Appearance types and request functions, deterministic Pokémon URL
  builder from integer 1–1025, original pixel registry and fallback artwork treatment.
- [ ] Add material tokens and CoverArt; all shelf/Home/album render saved appearance.
  Preserve Home's six-cover maximum and grouped price requests; test zero per-binder
  detail/appearance fetches. Reuse actual summary data, not a second cache/storage system.
- [ ] Test all five covers, 24 layers, no-artwork fallback, decorative alt handling,
  no UUID, skeleton sizing and reduced-motion contract.
- [ ] Run named service/component/page tests plus frontend lint/typecheck.
  Commit `feat(binders): render shared covers and bounded sticker artwork`.

### Task 8: Accessible explicit-save cover editor

**Create:** AppearanceEditor.tsx/.test.tsx, StickerPicker.tsx, StickerCanvas.tsx;
frontend/src/pages/BinderAppearance.test.tsx for integrated flow.
**Modify:** BindersPage.tsx, BinderPage.tsx, binders.css, dictionaries.ts,
hooks/useBinderMutations.ts only to map appearance_changed safely.

- [ ] Test opening from shelf/header, isolated draft, picker debounce/abort, default
  placement, 24-layer limit, invalid numbers, reorder and delete. Search failures leave
  pixel choices and existing layers operable; no arbitrary remote request is allowed.
- [ ] Test pointer capture/cancel and normalized positions; keyboard x/y/rotation/scale
  controls produce the same transforms. Tiny/overlapping/clipped stickers remain
  selectable through the layer list. Announce bounded completed changes, not every move.
- [ ] Implement draft UI, 180 ms insertion-only plop, reduced-motion, dirty-close/navigation
  confirmation and explicit atomic Save. Name controls in ES/EN; no UUID in any label.
- [ ] Test pending double-save guard, validation/network errors retaining same-owner draft,
  uncertain response replay, 409 requiring reload, logout/revalidation/account switch
  clearing draft/portals, late responses ignored and clean reopen from persisted state.
- [ ] Run `npm test --prefix frontend -- --run src/components/binders/AppearanceEditor.test.tsx
  src/pages/BinderAppearance.test.tsx src/pages/Binders.test.tsx
  src/pages/BinderView.test.tsx src/pages/HomeData.test.tsx`, lint/typecheck.
  Commit `feat(binders): edit covers with accessible controls and explicit save`.

### Task 9: Final regression gate, documentation and student handoff

**Modify:** docs/BINDERS.md, ARCHITECTURE.md, DATA_MODEL.md, DEVELOPMENT.md, UX_UI.md,
ROADMAP.md; CLAUDE.md current state; Bitacora.md and Autoria.md; this plan's evidence.

- [ ] Review spec coverage and all D1–D7 decisions. Preserve existing tests or document
  exact assertion-equivalent replacements. Do not claim layout from jsdom snapshots.
- [ ] Document API, migration/downgrade loss, asset attribution, geometry/focus behavior,
  Safari feedback and test counts/skips. Correct stale current-state branch statements.
- [ ] Run `bash scripts/check.sh` once when ready. If it fails, stop, report the precise
  failure, fix with targeted evidence when authorized, and rerun final verification.
- [ ] Commit the final task only on green: `docs(binders): record album acceptance and migration safety`.
  No push. Provide a concise change list, test evidence and outstanding manual checks.
- [ ] Give the student the following migration procedure; **do not execute it on the
  development database as part of tests**. Secrets stay in the student's local setup.

## Student migration procedure (Part 2 only)

Use real connection parameters locally, never paste credentials into chat or commit
backup files. Following the existing DEVELOPMENT convention (replace placeholders):

1. Stop writes to the development app and record current revision/counts.
2. `pg_dump "postgresql://USER@HOST:PORT/DBNAME" -Fc -f ~/pokevault-before-0009.dump`
3. `pg_restore --list ~/pokevault-before-0009.dump` and verify a restore into a separate
   empty scratch database before any destructive rollback. Keep backup outside repo.
4. `cd backend` then `.venv/bin/alembic current`; if it is not the expected existing
   revision, stop and reconcile. Do not assume prior migrations were applied.
5. `.venv/bin/alembic upgrade head`, then `.venv/bin/alembic current` → 0009.
6. Check binder/pocket/inventory counts and sample placements unchanged. Restart API and
   use http://localhost:5173/binders for the Part 2 Safari checklist in spec §10.
7. Optional rollback only after a **new** backup: `.venv/bin/alembic downgrade 0008`.
   This deletes stickers, removes revision and resets non-noir covers; pockets/copies
   remain. Never restore a dump over a populated database without a separate recovery plan.

## Decisions and execution evidence

D1–D7: approved by the student on 2026-11-24; Part 1 execution authorized.
Part 1 Safari approval: **pending**.
Implementation tests/full gate/migration/Safari: **not executed in this planning task**.
Planning checks: source audit, main fast-forward pull, spec/plan cross-check and whitespace.

### Execution checkpoint — 2026-11-24

- Branch created from main: `feat/iteration-8d-binder-album`.
- Approval/spec/plan/AGENTS commit: `75834d4`.
- Baseline: backend pytest 839 passed; frontend 538 passed; ESLint and TypeScript passed.
- Task 1 is in progress, not complete: AlbumFrame, fitAlbum and extracted BinderTray
  are implemented locally. Geometry regression assertions were observed failing before
  implementing the calculation, then passing.
- Latest frontend suite: 541 passed in 38 files. Focused geometry/binder/style checks:
  76 passed; lint/typecheck passed. Subsequent lateral-pager CSS passed lint but still
  requires its final focused verification.
- Pending before Task 1 commit: finish measured layout/overflow and tray-state coverage,
  reconcile pocket box sizing with the fit calculation, and verify lateral controls.
  The current action panel still consumes document height until Task 2 replaces it;
  viewport-fit acceptance is not established yet.
- Tasks 2–4 are not started; no application-code commit, full check.sh, migration,
  Safari acceptance, or Part 2 work has been performed.
- Task 0 and Task 1 complete (2026-11-24): branch, approval and baseline recorded; album
  geometry (fitAlbum, three rings, lateral arrows, fixed bottom tray) committed with
  541 frontend tests, lint and typecheck green. The tray keeps its 30-item paging, retry,
  fill cue and consumed-item tests in BinderView.test.tsx. Real viewport fit is still a
  Safari check (jsdom proves no layout).
- Task 2 complete (2026-11-24): `PocketActions` (portal popover / modal phone sheet) replaces
  the side panel; `PageGrid` now has `onSelect` (arrows, focus only) and `onActivate`
  (click/Enter/Space). Move mode has an explicit banner with Cancel and Escape, never
  overwrites an occupied pocket, and navigation causes zero placement requests (checked by
  planting a bug that made arrows activate). 552 frontend tests, lint and typecheck green.
  Cross-binder move uses the inline chooser and `storeNext`; 409/401/outage cases keep their
  existing tests. Real anchoring and the sheet are Safari checks.
- Task 3 complete (2026-11-24): swipe paging (touch/pen only, 48 px and 1.5×, ignored with
  multi-touch, an open sheet, a pending write or a flight; the click that ends a swipe is
  swallowed and a new touch cancels that swallow), and a window resize or rotation during a
  flight cancels it (clone removed, original restored, the card still enters its pocket).
  The flight keyframes, timings and hand-off are untouched. Source geometry is measured at the
  activating click and only when the source is mounted and in the viewport, else the sleeve
  entry plays alone. Planted bugs (resize ignored, arrows activating, outside click not
  swallowed) each failed tests. 560 frontend tests, lint and typecheck green.
- Task 4 complete (2026-11-24): the copy detail names the card and expansion (catalog id as fallback), no UUID in any state; `safeBinderReturn` accepts only `/binders/<uuid>` with an optional valid `?page=&pocket=`; the pocket's "Ver carta" link carries it. Safari approval for Part 1: pending; Part 2 and 0009 not started.
