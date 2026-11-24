# PokéVault — Retire the PC boxes (8C.1)

**Date:** 2026-11-24

**Status:** Approved by the student on 2026-11-24 with the decisions in §11 (D1 = B, D5 =
the `?pokemon=N` alternative, the rest as recommended).

**Iteration:** 8C.1 — follows 8C (binders). The student said 8C was merged, but on
2026-11-24 `origin/main` ended at PR #6 (8A) and `origin/feat/iteration-8c-binders` was at
`af7760b`. The student chose to branch from that tip; this iteration stacks on 8C.

## 1. Purpose

Binders replaced the personal boxes in 8C. This iteration removes what is left of the
"PC boxes" idea:

1. **The catalog boxes** (`/boxes`): the 6×5 species grid with sprites, retro wallpapers,
   sound, menu icons, the selected-species panel and the species search.
2. **The frozen personal-box tables** (`personal_boxes`, `box_memberships`), through a
   reversible migration `0008`.

Success means:
- No screen, route, string, stylesheet, test or table remains for PC boxes.
- Old links keep working: `/boxes` goes to `/pokedex` and `/boxes?mode=personal` goes to
  `/binders`.
- The Pokédex and the TCG species galleries keep working.
- Migration `0008` can be applied and reverted without losing which copy sits where.

## 2. Evidence (audited on `feat/iteration-8c-binders` @ `af7760b`)

### What the catalog boxes are made of

`pages/BoxesPage.tsx` is the only importer of these modules, so they leave with it:

| Module | Role |
| --- | --- |
| `components/boxes/StorageGrid.tsx` | 6×5 species grid |
| `components/boxes/MenuIcon.tsx` (+ `services/menuIcons.ts`, `menuIconBounds.ts`) | Gen V menu icons and their fallback chain |
| `components/boxes/SelectedPokemon.tsx` | selected-species panel (details, abilities, measures) |
| `components/boxes/BoxSearch.tsx` | species search |
| `components/boxes/AudioControls.tsx`, `hooks/useRetroAudio.ts`, `audio/retroAudio.ts` | retro sound |
| `components/boxes/wallpapers.ts`, `components/boxes/boxes.css` | five wallpapers and the box styles |
| `hooks/useCatalogBox.ts`, `hooks/useSpriteMode.ts` | box paging and the static/animated sprite mode |

### What is shared and must stay

- `components/boxes/PokemonSprite.tsx` is also used by `PokemonCardsPage` (the species
  gallery). Its "missing sprite" marker uses the class `pc-missing`, styled in
  `boxes.css`.
- `components/boxes/pokemonLabels.ts` (`pokemonName`) is also used by `PokemonCardsPage`.
- `hooks/usePokemonDetails.ts` and `services/pokemonDetails.ts` are used by
  `PokemonCardsPage` as well.
- `services/pokemon.ts` (`fetchPokemon`, `fetchPokemonPage`, `searchPokemon`,
  `NATIONAL_DEX_TOTAL`, `BOX_SIZE`) serves the Pokédex and the galleries.
  `locatePokemon` is box-only.
- Backend `/api/v1/pokemon`, `/search` and `/{number}` also serve those pages.

### Navigation and links

- **Header nav:** "Cajas PC". **Explorar menu:** Pokédex, "Cajas PC", Expansiones.
- `services/cards.ts` `safeReturnTo` allows `/boxes`, and `TcgCardPage` offers a second
  "Volver a Cajas" origin link.
- The `/boxes?mode=personal` redirect already exists from 8C.

### Finding that needs a decision (D1)

**The Pokédex page shows only the first 20 species.** Its text says "Explora los primeros 20
Pokémon" and it calls `/api/v1/pokemon` once, with the default `limit=20`.
**The catalog boxes (35 boxes of 30, with search) are the only way to reach the other 1005
species**, and so their TCG galleries (`/pokemon/:n/cards`). The only two entrances to a
species gallery are the Pokédex card and the boxes page. Retiring the boxes while "the
Pokédex does not change" leaves species #21–#1025 with no path in the UI. See §6 and D1.

### Database

- `personal_boxes` and `box_memberships` (0004, wallpaper 0006) are frozen since 0007: no
  code reads or writes them, and the ORM models are gone.
- **Trap:** `uq_inventory_owner_id` (unique `(user_id, id)` on `inventory_copies`) was
  created by `0004`, but **`binder_pockets` (0007) depends on it** through a composite
  foreign key. `0008` must not drop it, and `0004`'s downgrade is only safe because the
  binder tables are dropped first.
- The migration chain is 0001 → 0007 (head).

## 3. Confirmed direction (student, 2026-11-24)

- Remove the catalog boxes: route `/boxes`, wallpapers, audio, the sprite grid, and "Cajas
  PC" in the Explorar menu. The Pokédex does not change (see D1).
- Migration `0008` drops the frozen personal-box tables and is reversible.
- `/boxes?mode=personal` redirects to `/binders`, `/boxes?pokemon=N` to that species' gallery,
  and any other `/boxes` to `/pokedex` (§5.1).
- Every test that is removed is listed with its reason (§9).

## 4. Scope

### Included

- Frontend removal of everything in §2's first table, plus the nav entries, strings,
  styles and `safeReturnTo` entry.
- Redirects.
- Moving the shared pieces out of a folder that no longer describes them (D4).
- Migration `0008` and its tests.
- Docs and the test inventory.
- Depending on D1: a minimal Pokédex that can reach all species.
- Depending on D3: removal of the now-orphaned local preferences.

### Excluded

- Any change to binders, inventory, prices or set completion.
- Redesigning the Pokédex beyond what D1 requires.
- Removing the backend `/api/v1/pokemon*` endpoints (D2).
- A new species browser (could be a future iteration).

## 5. Frontend design

### 5.1 Routes

| Path | Behavior |
| --- | --- |
| `/boxes?mode=personal` | Redirects (`replace`) to `/binders`. It wins over every other parameter. |
| `/boxes?pokemon=N` | With `N` an integer from 1 to 1025, redirects to `/pokemon/N/cards?returnTo=%2Fpokedex`: the old box URL named the species the user was looking at. |
| any other `/boxes` | Redirects to `/pokedex`. This includes an invalid or out-of-range `pokemon` (`0`, `1026`, `1.5`, `abc`, repeated or empty) and old `box`, `wallpaper` parameters, which are dropped. |

A small `BoxesRedirect` component replaces `BoxesPage` in the router. It is the only code
that mentions `/boxes`, and it reuses `parsePokemonNumber` so nothing unvalidated reaches
the gallery route.

### 5.2 Removals

- **Files:**
  - `pages/BoxesPage.tsx`.
  - From `components/boxes/`: `StorageGrid`, `MenuIcon` (+ test), `SelectedPokemon` (+
    test), `BoxSearch`, `AudioControls`, `wallpapers.ts`, `boxes.css`.
  - `hooks/useCatalogBox.ts`, `hooks/useRetroAudio.ts`, `hooks/useSpriteMode.ts` (+ test).
  - `audio/` (module and test).
  - `services/menuIcons.ts` and `services/menuIconBounds.ts` (+ tests).
  - `locatePokemon` from `services/pokemon.ts`.
  - Test helper `test/pokemonDetails.ts` if no remaining test needs it.
- **Navigation:** "Cajas PC" in the desktop nav and the Explorar menu. The desktop nav
  returns to five links: Inicio, Pokédex, Expansiones, Mis carpetas, Mi colección.
  Explorar keeps Pokédex and Expansiones. Dictionary keys `shell.nav.boxes` and their
  uses are removed.
- **Card detail:** the "Volver a Cajas" origin link (`backBoxes`) and the `/boxes` branch
  of `origin` go away. `safeReturnTo` stops allowing `/boxes` (a stale `returnTo=/boxes…`
  falls back to `/pokedex`, the same destination as the redirect).
- **Dictionaries:** the whole `boxes` section (title, slots, wallpapers, audio, sprite
  modes, search, terminal) in ES and EN, and `cards.backBoxes`.
- **Stored preferences (D3):** `pokevault.audio` and `pokevault.spriteMode`.

### 5.3 What moves (D4)

`components/boxes/` is deleted. What stays is renamed to match what it is:
- `PokemonSprite.tsx` and `pokemonLabels.ts` → `components/pokemon/`.
- The missing-sprite marker class `pc-missing` → `pv-sprite-missing`, with its rule moved
  to `components/cards/cards.css`, because `boxes.css` is deleted.

### 5.4 Pokédex reachability (D1)

If the student agrees with the recommendation (B), the Pokédex gets two additions that
reuse existing endpoints and components:
- **Pagination:** 30 species per page (35 pages) with `?page=N`, previous and next links,
  and a "page N of 35" label. This uses `fetchPokemonPage(offset)`, which already exists
  and is validated for up to 30 results.
- **Search by name or number** with the existing `searchPokemon` (`/pokemon/search`):
  the endpoint returns only a name and a number (at most 8 matches), so the results are a
  list of links such as "#559 Scraggy", each opening the species' TCG gallery, not full
  cards. The pager is a labelled group, not a second `<nav>`, because the shell requires a
  single navigation landmark.

The grid, cards and "Ver cartas TCG" action do not change. The description changes from
"first 20" to the full National Pokédex. Tests are in §9.

### 5.5 Style contract

`styles.contract.test.ts` loses `boxes.css` from its expected-sheets list. The wallpaper
allow-listed color block disappears with the file. The other allow-listed blocks (type
badges, holo effect) stay.

## 6. Migration `0008`

### Upgrade

```
DROP TABLE box_memberships;
DROP TABLE personal_boxes;
```

- Their indexes, constraints and foreign keys go with them.
- **Not touched:** `uq_inventory_owner_id` and every other `inventory_copies` constraint.
- No data is copied: binders (0007) hold the arrangement.
- The migration does not need a guard for "0007 not applied": `alembic upgrade head`
  applies 0007 first, which copies the boxes before 0008 drops them.

### Downgrade (rebuilds the boxes from the binders)

1. Recreate `personal_boxes` exactly as it was at 0006 (columns, defaults, `wallpaper`
   check with `noir`, owner-id and owner-order uniques, name and order checks) and
   `box_memberships` (primary key, both composite foreign keys with cascades, unique
   copy, position check, owner index).
2. Rebuild the rows in Python with the migration connection (the data is small, and the
   rules are easier to read and test than a recursive SQL query).
   - **Per owner**, binders in `display_order`. For each binder:
     - Each pocket gets a flat index `i = (page − 1) × 9 + (pocket − 1)`.
     - The binder is split into boxes of 30 pockets: box number `i // 30`, position
       `i % 30`. The first box (number 0) is always created, even when the binder is
       empty.
     - The box with number 0 **keeps the binder's id**, so a box that was migrated and
       not rearranged gets its original UUID back. The other boxes get new UUIDs.
     - Name: the binder's name for the first box; `"<name> (N)"` for box number N−1, with
       `<name>` truncated so the result fits 80 characters and has no trailing space.
     - Wallpaper `noir`; `created_at` and `updated_at` copied from the binder.
   - `display_order` is assigned sequentially from 0 per owner, following binder order and
     then box number, so the `(user_id, display_order)` uniqueness holds.
3. A binder can hold up to 360 pockets, so one binder yields at most 12 boxes. A user with
   many large binders can end up with more than the 100 boxes that the old API allowed on
   creation. The database itself has no such limit, and the removed API cannot be reached
   anyway; this is noted, not blocked.

### What a round trip preserves

- Which copy sits in which binder or box, and the pocket-to-position mapping.
- Binder ids, names, order and timestamps for the first box of every binder.
- **Not preserved:** a binder's **cover** (boxes have wallpapers; all become `noir`).
  Binders with more than 30 pockets become several boxes with numbered names. These are
  inherent to going backward from a larger model, and the data is not lost.
- `upgrade → downgrade → upgrade` leaves the binders identical, because nothing in the
  binder tables is touched by 0008.
- Going all the way back to `0006` and forward again keeps every copy placed. A binder
  whose pockets all fall within its first 30 comes back to **exactly the same pockets**.
  A larger binder returns as several binders (`Name`, `Name (2)`, …) because each rebuilt
  box becomes its own binder when 0007 runs again; the copies are the same, but they no
  longer share a binder.

### Student safety (D7)

The migration drops tables in the development database. The student should make a backup
first and applies `0007` and `0008` at the end, as in 8C. The plan gives the commands.

## 7. Backend

- No endpoint, schema or service changes (D2: `/api/v1/pokemon*` stay).
- `app/db/models.py`: delete the "frozen tables" comment.
- `CLAUDE.md` and docs: migration `0008`, box tables gone.

## 8. Preferences and privacy (D3)

After the change nothing reads `pokevault.audio` or `pokevault.spriteMode`. Recommended: on
application start remove both keys (a small `try/catch` effect), so no orphan data lingers
in browsers that used the boxes.

## 9. Testing and the test inventory

Every removed or changed test is listed with its reason.

### 9.1 Frontend: removed with their feature

| File (blocks) | Reason |
| --- | --- |
| `pages/BoxesPage.test.tsx` (6): 30 slots and keyboard, retry and empty slots, sound preferences, late responses, final box, menu-icon mode | The page, grid, audio and sprite modes are gone |
| `pages/BoxSearch.test.tsx` (5 blocks, 9 cases): search arrival, clear and Escape, `locatePokemon` table, errors and retry, debounce | Box search and `locatePokemon` are gone. The generic search behavior (errors, debounce, obsolete responses) returns as Pokédex tests if D1 = B |
| `components/boxes/MenuIcon.test.tsx` (6) | The menu icon component and its fallback chain are gone |
| `components/boxes/SelectedPokemon.test.tsx` (5) | The selected-species panel is gone. Species details are still covered by `TcgCatalog`/`PokemonCardsPage` tests |
| `hooks/useSpriteMode.test.ts` (5) | The static/animated sprite preference no longer exists |
| `audio/retroAudio.test.ts` (3) | Retro audio is gone |
| `services/menuIcons.test.ts` (3 blocks, 9 cases) | Menu-icon sources are gone |
| `services/menuIconBounds.test.ts` (3) | Icon footprint detection is gone |
| `pages/CardEntrypoints.test.tsx`: 6 blocks (box URL state, slot clicks and history, box changes, Noir default and wallpapers, search arrival, URL state table) | Box URL state, wallpapers and arrival focus are gone. Its last block ("Pokédex cards expose a localized TCG link") stays |
| `pages/CardJourney.test.tsx`: "Boxes → species gallery → card → gallery → original selected box and wallpaper" | The journey started at a box. Its Pokédex twin (the other block) stays |

### 9.2 Frontend: adapted, same intent

| Test | Change |
| --- | --- |
| `app/App.test.tsx`: direct route `/boxes` → "Cajas"; "old personal-box links…" | Replaced by redirect tests (§9.4) |
| `components/AppShell.test.tsx`: nav order and English labels; Explorar menu; live layout swap | "Cajas PC" is removed from the nav and from Explorar; the swap test uses "Expansiones" as its marker |
| `pages/Auth.test.tsx`: "keeps the public Pokédex accessible…" | It asserted the "Cajas PC" link; it asserts "Expansiones" |
| `pages/TcgCatalog.test.tsx` (2 blocks) and `pages/TcgRefinement.test.tsx` (3 blocks) | `returnTo` values that pointed at `/boxes…` now use `/pokedex…`, with the same assertions on the return link and the full gallery link. The "Volver a Cajas" assertion is removed |
| `services/cards.test.ts`: safe return targets | `/boxes?…` moves from "allowed" to "falls back to `/pokedex`" |
| `styles/styles.contract.test.ts` | `boxes.css` leaves the expected-sheets list |
| `pages/Binders*.test.tsx`, `BinderView.test.tsx`, home tests | Unchanged |

### 9.3 Backend: removed or adapted

| File | Change and reason |
| --- | --- |
| `tests/integration/test_boxes_postgres.py` (7 raw-SQL tests of the frozen tables; the 8th, the `0003` inventory round trip, stays) | **Ported, not deleted.** The tables only exist after `0008` is downgraded, so the same assertions run against the rebuilt tables (new file `test_box_tables_rebuild_postgres.py`). This proves the downgrade recreates every key, check and cascade. The `0003` round trip stays and now crosses 0008 |
| `tests/integration/test_box_wallpaper_postgres.py` (3) | Pinned to revision `0006` (they assumed the box tables exist at head) |
| `tests/integration/test_binders_migration_postgres.py` (4, 15 cases) | Pinned to revision `0007` (the "frozen tables are unchanged" assertions only hold there); the head assertion moves |
| `test_prices_postgres.py`, `test_set_completion_postgres.py` | Head `0007` → `0008`; the table list drops `personal_boxes` and `box_memberships` |

### 9.4 New tests

**Frontend**
- `/boxes` redirects to `/pokedex`, query parameters dropped.
- `/boxes?mode=personal` redirects to `/binders`, even with `pokemon=N` present.
- `/boxes?box=19&pokemon=559&wallpaper=ocean` redirects to `/pokemon/559/cards?returnTo=%2Fpokedex`.
- `/boxes?pokemon=` followed by `0`, `1026`, `1.5`, `abc`, an empty value or a repeated
  parameter redirects to `/pokedex`; `wallpaper` or `box` alone also go to `/pokedex`.
- The router has no other `/boxes` route.
- Nav and Explorar have no PC-boxes link in either language.
- `safeReturnTo` rejects `/boxes`.
- `PokemonSprite` fallback keeps its marker without `boxes.css`.
- Stale local keys (`pokevault.audio`, `pokevault.spriteMode`) are removed, and the others
  (`pokevault.locale`, `pokevault.currency`) are not.
- A source-level contract test: no module imports from `components/boxes/`, and no source
  file other than the redirect mentions `/boxes`.
- **If D1 = B (Pokédex):**
  - Page 1 and page N request `offset = (N − 1) × 30`.
  - Pagination bounds (1 to 35).
  - Invalid `?page` falls back to 1.
  - Previous and next links.
  - Search by name and by number shows results that link to the species gallery.
  - Debounce, obsolete responses, no results and retry with a sanitized error.
  - The species of page 35 (#1021–#1025) are reachable.
  - The existing Pokédex tests (loading, empty, error and retry, abort on navigation) are
    kept.

**Backend (PostgreSQL, disposable schemas)**
- `0008` follows `0007`, and it is the head.
- Upgrade drops both box tables, keeps `uq_inventory_owner_id`, and the binders and
  inventory are untouched (row counts and values).
- A binder foreign key to inventory still works after the upgrade.
- Downgrade recreates both tables with the **same constraint names, keys and checks** as
  0006 (compared by inspection, not by assumption).
- Downgrade rebuild: the first box reuses the binder id; a binder with pockets at flat
  indexes 0, 29, 30, 359 yields boxes 0, 1 and 11 with positions 0, 29, 0, 29; an empty
  binder yields one empty box; names `(2)`, `(12)` with truncation at 80 characters and
  no trailing space; `display_order` is sequential and unique per owner; two owners stay
  isolated; wallpaper `noir`.
- Full cycle `upgrade → downgrade → upgrade` leaves the binders identical, and `downgrade
  to 0006 → upgrade head` keeps every copy placed: exact pockets for a binder within its
  first 30, and the split binders described above for a larger one.
- Full chain down to `0003` and back to head (existing test) passes.

### 9.5 Full validation

`bash scripts/check.sh` exits 0.

## 10. Documentation

- `docs/BOXES.md`: becomes a historical record of both box features (catalog and personal),
  marked retired.
- `docs/ARCHITECTURE.md`, `UX_UI.md`, `DATA_MODEL.md` (`0008`), `BINDERS.md`, `DEVELOPMENT.md`,
  `INVENTORY.md`, `ROADMAP.md` (8C.1 section, manual checklist, closes the debt item
  "drop the frozen box tables").
- `Bitacora.md`, `Autoria.md`, `CLAUDE.md` (migration `0008`; the domain rule about
  catalog boxes versus binders is rewritten).

## 11. Decisions (approved 2026-11-24)

**D1. Pokédex reachability — approved: B.** The Pokédex shows #1–#20 and the
boxes were the only way to reach the rest.
- **A — as requested:** leave the Pokédex unchanged. Species #21–#1025 and their TCG
  galleries become unreachable from the UI (only by typing `/pokemon/N/cards`).
- **B — recommended:** minimal Pokédex growth (§5.4): 30-per-page pagination and search by
  name or number, using endpoints that already exist. One extra task (Task 5) and no
  backend change.
- **C:** do the removal now and plan a proper species browser as its own iteration. The
  interim leaves the same gap as A.

**D2. Backend `/api/v1/pokemon*`.** Recommended: keep all three endpoints (list, search,
details). The Pokédex, the galleries and (if D1 = B) the search use them. Removing any of
them would be a separate cleanup.

**D3. Orphan local preferences.** Recommended: remove `pokevault.audio` and
`pokevault.spriteMode` once, on application start.

**D4. Where the shared sprite and label code lives.** Recommended: `components/pokemon/`
(not `components/boxes/`), with the `pv-sprite-missing` class (§5.3).

**D5. Redirect detail — approved: the alternative.** `/boxes?pokemon=N` goes to that
species' gallery, any other `/boxes` goes to `/pokedex`, and `/boxes?mode=personal` goes to
`/binders` (§5.1).

**D6. Branch — approved, adjusted.** The student asked for a branch from updated `main`,
but `main` does not contain 8C (see Status). The student chose to branch from the 8C tip:
`feat/iteration-8c1-retire-pc-boxes` from `feat/iteration-8c-binders` @ `af7760b`. The PR is
stacked on 8C and needs only a rebase if 8C changes before it merges.

**D7. Safe application of `0008`.** Recommended order, as in 8C: back up first, then `alembic
upgrade head` (which applies 0007 and then 0008 if you have not applied 0007 yet), then
the manual check. The plan gives the exact commands without reading `backend/.env`.

## 12. Acceptance criteria

**Automated:** `check.sh` passes; both migration directions pass on PostgreSQL; the
inventory and binder data are unchanged by the upgrade.

**Manual (Safari, desktop and iPhone-size):**
- `/boxes` opens the Pokédex, and `/boxes?mode=personal` opens the binders.
- Neither the nav nor Explorar shows "Cajas PC".
- Pokédex works. With D1 = B it pages through all 35 pages and finds species by name and
  number.
- A species gallery, a card and the way back to the Pokédex still work.
- The binders are exactly as they were.
- Nothing in the app plays sound or offers wallpaper or sprite settings.

## 13. Risks

- **Removing data-bearing tables.** Mitigated by the backup step, by `0008` copying
  nothing (binders are the source of truth), and by a downgrade that is tested against
  the same constraints as 0006.
- **Silent loss of species access (D1).** Mitigated by making the decision explicit.
- **Orphaned references** (a style class, a string, a route). Mitigated by the contract
  test on imports and `/boxes` mentions, plus the style-contract run.
- **Large rebuild on downgrade.** Bounded: at most 360 pockets per binder and 100 binders,
  done in Python in one transaction.
