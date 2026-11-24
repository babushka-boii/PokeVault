# Iteration 8C.1 retire the PC boxes implementation plan

> **For agentic workers:** Work test-first, one task at a time, and finish with a final
> review. Approved 2026-11-24: commit at the end of each task if tests and lint pass, no
> push, and stop only on a failure or a new design decision. Run the suites **before**
> committing and never commit with a red test.

**Goal:**
- Remove the catalog boxes (`/boxes`, sprite grid, wallpapers, audio, menu icons, species
  panel and box search) and "Cajas PC" from the navigation.
- Drop the frozen personal-box tables with a reversible migration `0008`.
- Redirect `/boxes` to `/pokedex` and `/boxes?mode=personal` to `/binders`.
- Keep the Pokédex and the TCG species galleries working.

**Architecture:**
- Backend: one migration. Upgrade drops two tables; downgrade recreates the 0006 schema
  and rebuilds the boxes from the binders. No API or service change.
- Frontend: delete the box modules, add a tiny redirect, move the two shared pieces to
  `components/pokemon/`, and (if D1 = B) give the Pokédex pagination and search.

**Stack:** the existing FastAPI, SQLAlchemy, Alembic, PostgreSQL, React and Vitest. No new
dependencies.

**Spec:** `docs/superpowers/specs/2026-11-24-retire-pc-boxes-8c1-design.md`.

## Audit and constraints

- Base: `feat/iteration-8c-binders` @ `af7760b` (8C complete, `check.sh` exit 0: 43
  provider, 831 backend, 526 frontend tests). The student said 8C was merged, but
  `origin/main` ended at PR #6 (8A) when checked, so the branch starts from the 8C tip.
- Chain 0001 → 0007 (head). This iteration adds only `0008`.
- **Do not drop `uq_inventory_owner_id`.** It belongs to `inventory_copies` and the 0007
  composite foreign key needs it. `0004`'s downgrade drops it, which is safe only because
  the binder tables are gone by then.
- `PokemonSprite`, `pokemonLabels`, `usePokemonDetails`, `pokemonDetails` and
  `services/pokemon.ts` (minus `locatePokemon`) are shared with the Pokédex and the
  species galleries. They must not be deleted.
- Never read `backend/.env`. Tests use disposable PostgreSQL schemas and no real network.
- The student applies the migration on the development database.

## Decisions and alternatives

Approved answers to spec §11 (2026-11-24).

| Decision | Assumed | Affects |
| --- | --- | --- |
| D1 | **B**: Pokédex gets 30-per-page pagination and name/number search | Task 2 |
| D2 | Keep the backend `/api/v1/pokemon*` endpoints | none |
| D3 | Remove `pokevault.audio` and `pokevault.spriteMode` once at start | Task 6 |
| D4 | Shared pieces move to `components/pokemon/`; class `pv-sprite-missing` | Task 4 |
| D5 | `/boxes?mode=personal` → `/binders`; `/boxes?pokemon=N` (1–1025) → `/pokemon/N/cards?returnTo=%2Fpokedex`; any other `/boxes` → `/pokedex` | Task 3 |
| D6 | New branch from the 8C tip (`main` lacks 8C) | Task 0 |
| D7 | Backup, then `alembic upgrade head` at the end | Task 8 |

**Rejected alternatives:**
- **Delete the box tables in `0007` instead of a second migration:** `0007` is already
  reviewed and its downgrade is exact thanks to the frozen tables. A separate `0008`
  keeps each step reversible on its own.
- **Copying the box data somewhere before dropping:** the binders already hold every
  placement, so a copy would only create a second source of truth.
- **Rebuilding boxes in SQL on downgrade:** the splitting and naming rules (30-pocket
  chunks, name suffix and truncation, sequential order) are clearer and easier to test in
  Python. The data volume is small.

## Review focus

1. **Data safety:** the upgrade only drops the two box tables and never touches
   `inventory_copies` or the binder tables, and the downgrade recreates every key, check
   and cascade of 0006 (compared by inspection) and preserves each copy's placement.
2. **No dead ends:** after the removal, every previous entry point still lands somewhere
   sensible (`/boxes`, `/boxes?mode=personal`, stale `returnTo` values, bookmarks).
3. **Species reachability** (D1): all 1025 species stay reachable if D1 = B.
4. **Nothing orphaned:** no import of `components/boxes/`, no `/boxes` outside the
   redirect, no unused string, style class, stored key or test helper.
5. **Test honesty:** every removed test maps to the table in spec §9, and no remaining
   test was weakened to pass.

## Tasks

### Task 0: Branch and baseline

- [x] Create `feat/iteration-8c1-retire-pc-boxes` from the tip of
  `feat/iteration-8c-binders` (D6; the student confirmed this after `main` turned out not to
  contain 8C).
- [ ] Record the baseline: 43 provider, 831 backend, 526 frontend tests.
- [ ] Re-count the tests to be removed and adapted against spec §9, and fix the spec if any
  count has drifted.

### Task 1: Migration 0008 and its tests (backend)

**Files:**
- `backend/migrations/versions/0008_drop_personal_boxes.py`
- `backend/app/db/models.py`: delete the "frozen tables" comment.
- `backend/tests/integration/test_drop_box_tables_postgres.py` (new)
- `backend/tests/integration/test_box_tables_rebuild_postgres.py` (ported from
  `test_boxes_postgres.py`)
- Adapted: `test_box_wallpaper_postgres.py`, `test_binders_migration_postgres.py`,
  `test_prices_postgres.py`, `test_set_completion_postgres.py`.

**Steps:**
- [x] Write the failing PostgreSQL tests from spec §9.4:
  - `0008` follows `0007` and is the head.
  - Upgrade drops both tables, keeps `uq_inventory_owner_id`, leaves inventory and binders
    byte-identical, and a binder foreign key to inventory still works.
  - Downgrade rebuild:
    - Flat indexes 0, 29, 30 and 359 yield boxes 0, 1 and 11 with positions 0, 29, 0, 29.
    - The first box reuses the binder id.
    - An empty binder yields one empty box.
    - Names get `(2)` and `(12)` suffixes, truncated at 80 characters with no trailing
      space.
    - `display_order` is sequential and unique per owner.
    - Two owners stay isolated.
    - Wallpaper is `noir`.
  - Constraint fidelity: after the downgrade the rebuilt tables have the same keys,
    foreign keys, checks and indexes as 0006 (this is the ported box-table suite).
  - `upgrade → downgrade → upgrade` leaves the binders identical.
  - `downgrade 0006 → upgrade head` keeps every copy in its pocket.
- [x] Pin the tests that assumed the box tables exist at head:
  - `test_box_wallpaper_postgres.py` to revision `0006`.
  - `test_binders_migration_postgres.py` to revision `0007`.
  - Head assertions `0007` → `0008`.
  - The table list in `test_set_completion_postgres.py` drops the two box tables.
- [x] Implement the migration until green; Ruff clean; the full backend suite passes,
  including the existing full-chain test down to `0003` and back.
- [x] Commit.
- Evidence:
  - `0008_drop_personal_boxes.py`: upgrade drops `box_memberships` and `personal_boxes` only;
    downgrade recreates both exactly as 0006 left them and rebuilds the boxes in Python.
  - `test_drop_box_tables_postgres.py` (7 tests): head and parent, upgrade keeps
    `uq_inventory_owner_id`, inventory and binders byte-identical and the binder foreign key
    still rejects forged owners, 30-pocket splitting (indexes 0, 29, 30, 100, 359 → boxes
    1, 2, 4, 12), the first box reuses the binder id, an empty binder yields one empty box,
    name truncation with and without a trailing space, per-owner isolation and sequential
    order, `upgrade → downgrade → upgrade`, and a trip back to 0006.
  - Planted bugs were all caught: a fresh id for the first box, no space trimming, and
    positions shifted by one.
  - `test_box_tables_rebuild_postgres.py` (22 cases): the old frozen-table constraint tests
    now run against the rebuilt tables, plus a new test that names, checks, uniques, foreign
    keys, the index, the `noir` default and primary keys match 0006.
  - Pinned to a revision (they assumed the box tables exist at head):
    `test_box_wallpaper_postgres.py` → 0006, `test_binders_migration_postgres.py` → 0007.
    Heads moved to 0008 in the prices and set-completion tests, and the set-completion table
    list lost the two box tables.
  - Backend: 839 passed; Ruff clean.
  - The student said 8C was merged into `main`, but `origin/main` still ended at PR #6, so
    this branch starts from the 8C tip (`af7760b`).

### Task 2: Pokédex reachability (D1 = B)

**Files:**
- `frontend/src/pages/PokedexPage.tsx`
- `frontend/src/pages/PokedexPage.test.tsx`
- `frontend/src/i18n/dictionaries.ts`: Pokédex strings (ES/EN).
- `frontend/src/components/pokemon/PokedexSearch.tsx`

This task comes **before** the removal, so no commit leaves species #21–#1025 without a
path.

**Steps:**
- [x] Write failing tests (spec §9.4): offsets by page, bounds 1–35, invalid `?page`,
  previous and next links, page 35 shows #1021–#1025, search by name and by number with
  links to the species gallery, debounce, obsolete responses, no results, sanitized error
  with retry, abort on navigation.
- [x] Implement pagination with `?page=` and `fetchPokemonPage(offset)`, and the search
  with `searchPokemon`. The grid, cards and "Ver cartas TCG" action stay as they are, and
  the description text changes.
- [x] Keep every existing Pokédex test green without edits except the description text.
- [x] Commit.
- Evidence:
  - `PokedexPage` requests `?offset=(page-1)*30&limit=30` (it used the default 20 before),
    with `?page=` limited to 1..35 (anything else is page 1), previous and next links, and
    "Página N de 35". `PokedexSearch` searches by name or number with a 300 ms pause, ignores
    obsolete responses, and shows loading, empty and error states with retry. Every species
    card keeps its "Ver cartas TCG" action.
  - 11 new tests and 1 adapted: the first-page request URL in the existing test changed from
    `/pokemon` to `/pokemon?offset=0&limit=30` (that is the intended behavior change). The
    other Pokédex tests (loading, translated types, sanitized error with keyboard retry,
    empty, malformed data, abort on navigation) pass unedited. `fetchPokemon`, now unused,
    was removed.
  - The pager is a labelled group instead of a `<nav>`: the first version tripped the
    shell's "exactly one navigation landmark" test, which was kept strict.
  - Frontend: 41 files / 541 tests green; lint and typecheck clean.

### Task 3: Redirects, navigation and removal of the catalog boxes

**Files:**
- `frontend/src/app/router.tsx`, `frontend/src/pages/BoxesRedirect.tsx`
- Delete the modules listed in spec §5.2.
- `frontend/src/components/shell/{Headers,ExploreMenu}.tsx`,
  `frontend/src/i18n/dictionaries.ts` (the `boxes` section, `shell.nav.boxes`).
- `frontend/src/services/pokemon.ts`: remove `locatePokemon`.
- `frontend/src/styles/styles.contract.test.ts`.
- Tests: delete the files and blocks in spec §9.1, adapt those in §9.2.

**Steps:**
- [x] Write failing tests: the redirects (`/boxes` → `/pokedex`; `?mode=personal` →
  `/binders`, also with `pokemon`; `?pokemon=N` → the gallery for 1–1025; invalid, empty,
  repeated or out-of-range `pokemon` → `/pokedex`), the router has no other `/boxes` route,
  nav and Explorar have no PC-boxes link in ES and EN, and a source-level contract test
  (no import from `components/boxes/`, no `/boxes` outside the redirect).
- [x] Remove the code and tests. For each removed test file or block, tick it off against
  spec §9.1.
- [x] Adapt the tests in spec §9.2 (`App`, `AppShell`, `Auth` and the style contract).
- [x] Commit.
- Evidence:
  - `BoxesRedirect` (22 test cases): `?mode=personal` → `/binders` (it wins over `pokemon`),
    `?pokemon=N` for 1–1025 → `/pokemon/N/cards?returnTo=%2Fpokedex`, and everything else
    (`0`, `1026`, `-1`, `1.5`, `abc`, empty, `01`, `25abc`, repeated, `box`, `wallpaper`) →
    `/pokedex`.
  - Removed: `BoxesPage`, `StorageGrid`, `MenuIcon`, `SelectedPokemon`, `BoxSearch`,
    `AudioControls`, `wallpapers`, `boxes.css`, `useCatalogBox`, `useRetroAudio`,
    `useSpriteMode`, `audio/retroAudio`, `menuIcons`, `menuIconBounds`, the `pokemonDetails`
    test helper, `locatePokemon`, the `boxes` and `boxSearch` dictionary sections, the
    "Cajas PC" nav entries, and the dead Home "Mi PC" CSS left by 8C.
  - Moved to `components/pokemon/` (the species gallery uses them): `PokemonSprite` (its
    marker class is now `pv-sprite-missing`, styled in `cards.css`) and `pokemonLabels`.
    `components/boxes/` no longer exists.
  - The auth page and profile note no longer promise "Cajas" ("expansiones" instead).
  - Tests removed or adapted exactly as in spec §9.1 and §9.2 (the full table is in the
    execution evidence at the end). The old box journey became "an old box link → species
    gallery → card → gallery → back to the Pokédex".
  - New contract tests: no module imports from `components/boxes/`, and no leftover box,
    wallpaper, retro-audio or menu-icon code or styles. They caught real leftovers (the dead
    Home CSS) on their first run.
  - Frontend: 35 files / 511 tests green; lint, typecheck and build clean.
  - Order change: the `/boxes` mention contract moves to Task 4, where the two remaining
    mentions (`safeReturnTo`, the card detail origin link) are removed.

### Task 4: Shared pieces, return paths and strings

**Files:**
- Move `PokemonSprite.tsx` and `pokemonLabels.ts` to `components/pokemon/` and update
  imports.
- `frontend/src/components/cards/cards.css`: the `pv-sprite-missing` rule.
- `frontend/src/services/cards.ts` (`safeReturnTo`), `frontend/src/pages/TcgCardPage.tsx`
  (`origin` and the second back link), dictionary `cards.backBoxes`.
- Tests: `TcgCatalog`, `TcgRefinement`, `services/cards.test.ts`, `CardEntrypoints`,
  `CardJourney` (spec §9.1 and §9.2).

**Steps:**
- [ ] Write the failing tests: `safeReturnTo` rejects `/boxes`; a stale `returnTo=/boxes…`
  falls back to `/pokedex`; the card detail shows only the Pokédex origin link; the sprite
  fallback keeps its marker.
- [ ] Implement, adapt the listed tests with the same assertions on a `/pokedex` origin,
  and delete the leftover `components/boxes/` directory.
- [ ] Commit.

### Task 5: Orphan local preferences (D3)

**Files:** `frontend/src/main.tsx` or `AppShell`, plus a small module and test.

- [ ] Write failing tests: a one-time cleanup removes `pokevault.audio` and
  `pokevault.spriteMode`, leaves `pokevault.locale` and `pokevault.currency`, and survives
  blocked storage.
- [ ] Implement and commit.

### Task 6: Review, validation and docs

- [ ] Review against the review focus; fix what is confirmed. Grep proves no
  `components/boxes`, `/boxes` (outside the redirect), `wallpaper`, `retroAudio`,
  `spriteMode`, `menuIcon` or `pc-` leftovers.
- [ ] Run `bash scripts/check.sh` and record the counts.
- [ ] Docs per spec §10, plus the removed-test table in the execution evidence below.
- [ ] Commit.

## Student steps at the end (D7)

1. **Back up the development database first.** Replace the placeholders with your own
   connection data (the session does not read `backend/.env`):
   ```bash
   pg_dump "postgresql://USER@HOST:PORT/DBNAME" -Fc -f ~/pokevault-before-0008.dump
   ```
   To restore it, create an empty database and run
   `pg_restore -d "postgresql://USER@HOST:PORT/NEWDBNAME" ~/pokevault-before-0008.dump`.
2. Apply the migrations (this applies `0007` and then `0008` if you have not applied
   `0007` yet):
   ```bash
   cd "/Users/naimsalas/Documents/ChatGPT/Naim 3/PokeVault/backend" && .venv/bin/alembic upgrade head
   ```
3. Check the result: `.venv/bin/alembic current` shows `0008 (head)`.
4. To go back one step (rebuilds the boxes from the binders): `.venv/bin/alembic downgrade 0007`.

## Manual acceptance checklist (Safari, desktop and iPhone-size)

- [ ] `/boxes` opens the Pokédex; `/boxes?box=19&pokemon=559&wallpaper=ocean` opens the
  gallery of #559 with a way back to the Pokédex; `/boxes?pokemon=0` opens the Pokédex;
  `/boxes?mode=personal` opens the binders.
- [ ] The desktop nav has Inicio, Pokédex, Expansiones, Mis carpetas and Mi colección; the
  Explorar menu has Pokédex and Expansiones; neither has "Cajas PC".
- [ ] Pokédex (D1 = B): pages 1 to 35, previous and next, search by name and by number,
  and the last page ends at #1025. Each card still opens its TCG gallery.
- [ ] A species gallery → card → back returns to the Pokédex.
- [ ] Binders, shelf, Home "Mis carpetas" and the copy location are exactly as before.
- [ ] No sound, wallpaper or sprite-mode controls exist anywhere.
- [ ] The database has no `personal_boxes` or `box_memberships`, and the inventory and
  binder counts are the same as before the migration.
- [ ] Optional: `alembic downgrade 0007` and back up to head.

## Execution evidence

(Filled in during implementation.)
