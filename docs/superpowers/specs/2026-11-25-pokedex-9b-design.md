# PokéVault — Collector's Pokédex (9B)

**Date:** 2026-11-25

**Status:** D1–D14 approved by the student on 2026-11-25, with D2 changed: the species index is a
**fixed, versioned JSON** generated once by a reproducible script (no runtime PokéAPI index).
Implementation is authorized.

**Iteration:** 9B. This is the final pass on the Pokédex: every state is specified (§8). Out of
scope: Pokémon team/trainer (Profile), master set per species.

## 1. Purpose

The Pokédex becomes another view of **your collection, organized by Pokémon**, not one more
encyclopedia. It has two pages:

- `/pokedex`: a living-dex grid by generation. Species you own a card of are lit up and
  animated; the rest are dimmed.
- `/pokemon/:n`: the species sheet. It has a large hero, your collection for that species, and
  every catalog card with owned/missing filters. `/pokemon/:n/cards` redirects here.

The approved mock-up is the reference for the layout (spec items 1–9 from the student's brief).

## 2. Evidence (audited 2026-11-25)

- `git pull --ff-only` on `main` → `51246fc` (PR #10, 9A merged). Branch
  `feat/iteration-9b-pokedex` was created from it. The latest migration is `0009`. 8D Part 2 had
  reserved `0010` (see §9.4).
- **Frontend: Pokédex grid.**
  - `pages/PokedexPage.tsx` pages the dex 30 species at a time (`?page=1..35`).
  - Tiles: `components/PokemonCard.tsx` uses old classes (`panel`, `pokemon-card`,
    `tcg-action`, `eyebrow`), `TypeBadge` chips and the static PokéAPI sprite.
  - Loading is a plain text, and the error uses `system-status--degraded`.
  - The pager is already a labelled group, not a `<nav>`.
- **Frontend: search.** `components/PokedexSearch.tsx` sends a debounced
  `GET /pokemon/search` (≤ 8 matches with **only number and name**) and links to
  `/pokemon/:n/cards`.
- **Frontend: species cards page.** `pages/PokemonCardsPage.tsx`:
  - It has a small species header (sprite, name, types), the expansion selector, sort and
    `CardPreview` cards.
  - It paginates with **a second `<nav>`** (`tcg-pagination`, bug 12).
  - It uses `panel`, `system-status--degraded` and a text-only loading state (bug 13).
  - The cards link to `/cards/:id?returnTo=…`, through `safeReturnTo`.
- **Frontend: services.**
  - `services/pokemon.ts` validates `Pokemon {national_dex_number, name, types, sprite_url}`
    and the 18 types.
  - `services/pokemonDetails.ts` (+ `usePokemonDetails`, a 5-minute cache) gives the localized
    name, height, weight, abilities (hidden flag) and description.
  - `services/cards.ts` has `fetchPokemonCards(number, locale, {page, sort, setId})`, plus
    `safeReturnTo` (pokedex, sets, scanner, `/pokemon/:n/cards`, `/`) and `cardPath`.
- **Backend: Pokémon (`app/pokemon`).**
  - `PokemonProvider.list_pokemon` fetches **one PokéAPI request per species** (30 per page),
    with a 5-minute cache.
  - `SpeciesIndex` loads the 1025 species names in one request (1-hour cache) and answers the
    search.
  - `PokemonDetailsService` serves the details.
  - Nothing knows the types of all species without 1025 requests, and the species list carries
    English names only.
- **Backend: cards (`app/cards/provider.py`).**
  - `list_for_pokemon` uses a **verified complete English species index** (`dexId=eq:n`, up
    to 2000 briefs, 5-minute cache) and enriches only the current page.
  - So the number of catalog cards of a species (English catalog) is known exactly, or the
    request fails. It is never guessed.
- **Ownership.**
  - `inventory_copies` stores only `card_id`. A card's species (`dex_ids`) exists only in the
    TCGdex card detail, which is not stored.
  - Counting your copies per species for 1025 species therefore needs a stored association
    (§6.2).
- **9A pieces to reuse:**
  - `FavoriteStar` (optimistic) and `GET /favorites/status` (≤ 50 per request).
  - The carousel's shared star state, `useFavoriteWrite` and `cardPath`.
  - The calm `InlineError` (`role=status`), `CutPanel`, skeletons, `PriceService`, and the
    gold money style.

## 3. Approach

The plan rests on one fixed data file, one cache and a few new or changed endpoints:

- **A species index for all 1025 species** (number, Spanish and English names, types), kept as
  a **versioned JSON in the repo** (`backend/app/pokemon/data/species_index.json`). A
  reproducible script (`backend/scripts/build_species_index.py`) builds it once from PokéAPI;
  the API serves it from memory with a long HTTP cache. Visits never call PokéAPI for it, it
  survives restarts and works offline, and it is validated by a test (D2, revised).
- **Sprite and artwork URLs** are derived from the number on the client (§5.4), never sent per
  row.
- **The grid filters on the client.** It loads the index once (one ~45 KB JSON, cacheable)
  and filters by generation, type, owned and query in the browser. It renders incrementally.
  No per-tile or per-page requests.
- **A stored card→species association** (`card_species`, shared catalog data like price
  snapshots) is filled lazily from TCGdex with a refresh budget. It feeds the per-species
  counts in one owner-scoped request (D3).
- **The species sheet** combines:
  - the existing details;
  - a new owner-scoped "your collection" summary (count, value, owned card ids);
  - an owner-scoped species card list that can filter owned/missing on the server, over the
    verified species index.

Alternatives considered:

| Alternative | Why not |
| --- | --- |
| Keep pagination and fetch types per species | 1025 PokéAPI calls for the type filter |
| Build the index at runtime from PokéAPI (19 requests, cached in memory) | The species list has English names only (Spanish needs 1025 more requests), and the cache is lost on restart or without network. Rejected by the student (D2) |
| Compute ownership by fetching every owned card's detail on each visit | Slow for big collections and hammers TCGdex |

## 4. Grid `/pokedex`

### 4.1 Header and progress

- Title "Tu Pokédex" / "Your Pokédex".
- For a signed-in user: "N de 1025 especies con al menos una carta", with a gold bar
  (`role="progressbar"`, aria-valuenow N, aria-valuemax 1025).
- While cards are still being resolved (§6.2 `pending`): "Calculando… (N cartas por revisar)",
  and N is shown as at least the known value, never estimated.
- Guests see "Inicia sesión para ver qué especies tienes" with a link instead of the bar.

### 4.2 Generations, filters and URL state

- **Generation tabs** (a `tablist` with arrow keys): "I Kanto 1–151", "II Johto 152–251",
  "III Hoenn 252–386", "IV Sinnoh 387–493", "V Teselia/Unova 494–649", "VI Kalos 650–721",
  "VII Alola 722–809", "VIII Galar 810–905", "IX Paldea 906–1025". The ranges are fixed
  constants. Each tab shows "n/total owned" for signed-in users.
- **Search** by name or number. Results show the sprite, number, name and type dots, and link
  to the species sheet. It runs on the client over the loaded index: no request while typing,
  normalized like `SpeciesIndex` (accents, ♀/♂). It searches all generations (D6).
- **Show:** "Todas / Tengo / Me faltan" (a radio-group segmented control). "Tengo" and "Me
  faltan" are disabled, with an explanation, for guests and when ownership failed.
- **Type chips:** 18 toggle buttons (`aria-pressed`) showing a coloured **dot** plus the name.
  One type at a time (D5).
- **URL state:** `?gen=1..9&type=<type>&show=all|owned|missing&q=<text>`. Invalid values are
  replaced (with `replace`) by defaults: gen 1, all, no type, empty q. Every change uses
  `replace` for the query and q, and `push` for the generation tab.
- **Coming back keeps everything** (D7). The number of rendered tiles and the scroll position
  are saved in `sessionStorage` per URL when you leave, and restored after the index loads.

### 4.3 Tiles and incremental loading

- The list (`ul`, labelled "Especies de {región}") renders the first 60 matching tiles. A
  sentinel (IntersectionObserver) adds 60 more near the end, and a visible "Ver más (N
  restantes)" button does the same for keyboard and assistive technology.
- Changing a filter resets to 60. The count of results is announced politely ("42 especies").
- **Tile:** a single link to `/pokemon/:n` (one tab stop). It shows:
  - the number in pixel (`#025`), the sprite, the name, and type dots (colour + the type's
    name in the accessible text);
  - for an owned species, full colour, the animated sprite (§5.4) and a gold label "N cartas"
    (copies, D4);
  - for a species not owned, a dimmed tile (opacity about .45, grayscale sprite, no label), like
    a living dex.
- Accessible name: "#025 Pikachu, eléctrico, 3 cartas" (or "sin cartas"; guests get neither).
- Never a UUID. Focus is visible, and hover/focus lifts the tile slightly (no motion under
  reduced motion).

### 4.4 States

| State | What shows |
| --- | --- |
| Loading the index | Header and tabs, a skeleton grid of the same tile size (60), status text |
| Index error | A calm `InlineError` ("No pudimos cargar la Pokédex por ahora") with Reintentar; header and filters stay |
| Guest | Grid fully usable, every tile in colour without labels (D8); the owned filters are disabled with a sign-in hint; no ownership request |
| Ownership loading | Tiles in neutral colour (not dimmed), the progress skeleton |
| Ownership error | Calm note with Reintentar; the grid works as for a guest; Tengo/Me faltan disabled |
| Ownership pending (cards still being resolved) | Note "Calculando… N cartas por revisar" and a retry after 5 s (at most 3 automatic retries, then a button) |
| No results for the filters | "Ningún Pokémon con esos filtros" + "Quitar filtros" |
| Search with no match | "No encontramos ese Pokémon" |
| Sprite fails | The pixel "◇" placeholder in the same box |

## 5. Species sheet `/pokemon/:n`

### 5.1 Route

- `/pokemon/:n` is the sheet.
- `/pokemon/:n/cards?…` **redirects** (`replace`) to `/pokemon/:n?…`, keeping `set_id`, `sort`,
  `page` and `returnTo`.
- An invalid `n` shows "Ese número no está en la Pokédex Nacional" plus a link to the Pokédex.
- `safeReturnTo` accepts `/pokemon/:n` with its query, so card pages can come back.

### 5.2 Hero

- The **official artwork** at a large size (lazy, contain). The animated B/W sprite sits in a
  corner (static with reduced motion or above #649).
- In pixel: the number, "Generación I · Kanto". Then the localized name, type badges, the
  description, height, weight and abilities. A hidden ability is marked "(oculta)". Text comes
  from the existing details endpoint in the chosen language, with the existing English fallback
  note.
- **‹ #N−1 Name · Name #N+1 ›** links, with the names taken from the index. At #1 and #1025
  only one side shows.
- **"Volver a la Pokédex"** goes to the stored grid URL (generation, filters and scroll, §4.2).
  Without one, it goes to the species' generation.
- Details error: a calm note with Reintentar. The index still provides the name and types, so
  the hero is never empty.

### 5.3 "Tu colección" box (signed in)

- "Tienes N copias de M cartas distintas de {Pokémon}" and the value of those copies in gold.
  It uses the existing valuation in the display currency, with the "Precios de referencia"
  note and attribution when converted.
- "Ver solo las que me faltan" sets `show=missing` below.
- **Catalog total:** when the verified species index is available, add "· El catálogo (inglés)
  tiene T cartas de {Pokémon}" (D9). Otherwise only your cards are shown, and no total is
  invented.
- Guest: "Inicia sesión para ver tus cartas de {Pokémon}". Error: a calm note with Reintentar.
  Zero cards: "Aún no tienes cartas de {Pokémon}" plus the missing filter.

### 5.4 Sprites and artwork

URLs are built **only from the validated integer** n:

- static: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{n}.png`
- animated (1–649): `…/sprites/pokemon/versions/generation-v/black-white/animated/{n}.gif`
- artwork: `…/sprites/pokemon/other/official-artwork/{n}.png`

Rules:

- All images are `loading="lazy"` and `referrerPolicy="no-referrer"`, with explicit
  width/height.
- Pixel sprites use `image-rendering: pixelated`.
- **Animate only what is visible:** a tile shows the static PNG and swaps to the GIF only
  while it is in view (a shared IntersectionObserver), only for owned species, and never with
  reduced motion.
- A failed GIF falls back to the PNG, and a failed PNG to the placeholder.

### 5.5 "Cartas de {Pokémon}"

- Filters: "Todas / Tengo / Me faltan" (signed in), the expansion (the existing selector) and
  the sort (the existing options). All of them live in the URL (`show`, `set_id`, `sort`,
  `page`).
- Paging is **a labelled group, not a `<nav>`** (bug 12), with "Anterior/Siguiente" and
  "Página N".
- Cards:
  - Owned cards get a gold border and a "TENGO" label (text, not only colour).
  - The others are dimmed (opacity) but fully readable and clickable.
  - The **★ is optimistic**, reusing 9A's star state with one `/favorites/status` request
    per page.
  - A click leads to `/cards/:id?returnTo=/pokemon/:n?…`, so the back link returns to the
    sheet with its filters.
- States:
  - loading: card skeletons;
  - error: a calm `InlineError` with Reintentar;
  - empty (with a filter): "No hay cartas con esos filtros" + "Quitar filtros";
  - empty (species): "El catálogo aún no tiene cartas de {Pokémon}";
  - guest: Todas only, plus a sign-in hint.
- Show filters for signed-in users go through the owner-scoped endpoint (§6.3). The Todas
  view for guests keeps using the public endpoint.

## 6. Backend

### 6.1 Species index (a fixed JSON, no runtime PokéAPI)

- **File:** `backend/app/pokemon/data/species_index.json`:
  `{"source": ..., "generated_on": "YYYY-MM-DD", "species": [{"number", "name_en", "name_es",
  "types": [...]}]}` with 1025 rows, committed to the repo.
- **Script:** `backend/scripts/build_species_index.py` (run by hand, never at runtime):
  - one request to `pokemon-species/{n}/` per species for `names` (Spanish `es`, falling back
    to `en`, and the script prints how many fell back, so the student can judge);
  - the 18 `type/{name}/` lists for the types: each `pokemon` entry with id ≤ 1025 maps to
    `(slot, type)`, and forms with ids above 10000 are ignored;
  - it validates the result before writing (below), writes the JSON deterministically (sorted
    by number, stable key order, trailing newline), and documents its sources in its header;
  - it is polite (at most 5 concurrent requests, a User-Agent that names the project, retries
    with backoff) and fails loudly instead of writing a partial file.
- **Validation** (shared by the script, the loader and a test): exactly 1025 entries; numbers
  1–1025 each once; 1–2 types from the 18 valid names, without repeats; non-empty names with
  no control characters.
- **Loader:** `SpeciesCatalog` reads and validates the file once at start (a bad file is a
  startup error, never a silent partial index). `SpeciesIndex` (search) now reads from it too,
  so searching never calls PokéAPI and works offline.
- **`GET /api/v1/pokemon/index`** → `{results: [{national_dex_number, name_en, name_es,
  types}]}` (1025 rows), with `Cache-Control: public, max-age=604800` and an `ETag` (a hash of
  the file) that answers `If-None-Match` with 304. It cannot fail at runtime.
- **`GET /api/v1/pokemon/search`** keeps its shape and gains `types` and `sprite_url` per match
  (the static URL from the number, D10), and matches Spanish and English names. It is additive,
  and the 8D Part 2 sticker picker benefits too.
- `GET /api/v1/pokemon` (the paged list) and the details endpoint stay (the details still
  come from PokéAPI, cached as today). The grid stops using the list.
- **Regenerating** (a new generation appears): raise `NATIONAL_DEX_TOTAL`, run
  `cd backend && .venv/bin/python scripts/build_species_index.py`, review the diff, update the
  generation ranges and tests. This is documented in `docs/POKEDEX.md`.

### 6.2 Card→species association and per-species ownership

- **Migration `0010_card_species`** (D3):
  - table `card_species (card_id String(100) PK, dex_ids JSON array of ints 1..1025 (may be
    empty: trainers/energy), fetched_at timestamptz)`;
  - shared catalog data, with no user column;
  - a CHECK on the card id length.
  - Downgrade drops it; only cached data is lost.
- **Filling it:** `CardSpeciesStore.resolve(card_ids)`:
  - It reads the stored rows.
  - Missing or stale (older than 30 days) rows are fetched through
    `CardProvider.get_card(id, "en")` and their `dex_ids` are taken, with at most 40 per
    request and 5 concurrent.
  - The rest are reported as `pending`.
  - A card TCGdex does not know is stored as `dex_ids = []`, with a short 1-day retry window,
    so it never retries in a loop.
- **`GET /api/v1/collection/species`** (owner-scoped, no-store) →
  `{counts: {"25": 3, …}, species_owned: N, pending: P}`.
  - `counts` holds the user's **copies** per national number. A card with two `dex_ids` counts
    for both.
  - There is one SQL query for the user's `card_id`s, then `resolve`.

### 6.3 Species collection and owner-aware card list

- **`GET /api/v1/collection/species/{n}?currency=`** →
  `{copies, distinct_cards, owned_card_ids: [...], value: Valuation subset (total,
  original_totals, priced_count, copy_count, pending_count, rates, prices_updated_at),
  catalog_total: int|null, pending}`.
  - It uses the user's copies whose card resolves to n.
  - `catalog_total` comes from the provider's verified English species index. It is null when
    that is unavailable (never guessed).
- **`GET /api/v1/collection/species/{n}/cards?show=owned|missing&set_id&sort&page&language`**
  → the same `CardPage` shape as today, plus `owned_ids` on the page.
  - It uses a new provider entry `list_for_pokemon(…, only=set|None, exclude=set|None)`, which
    filters the verified brief index **before** pagination, so pages are exact.
  - "Owned" means a card id in the user's inventory, whatever the copy count.
- Both are owner-scoped and no-store, and are tested with **two users on SQLite and
  PostgreSQL**.

## 7. Bugs fixed

12. `PokemonCardsPage`'s second `<nav>` becomes `role="group"` with a label (one navigation
    landmark per page; a test counts `navigation` landmarks).
13. Pokédex and species pages use the Unova Noir system:
    - tokens, `CutPanel`, skeletons and the calm `InlineError` with Reintentar;
    - no `panel`, `tcg-action`, `pokemon-card`, `system-status--degraded`, `eyebrow`, `status-retry`;
    - a style contract keeps these legacy classes out of both pages.

## 8. Cross-cutting requirements

- **ES/EN** for every string. Region names: "Teselia" (ES) / "Unova" (EN). Type names come from
  the existing labels.
- **Accessibility:**
  - one `h1` per page; tabs with arrow keys; the type chips as toggle buttons; the show filter
    as a radio group;
  - tiles are links with full names, and the count of results is announced;
  - "Ver más" is a button; visible focus everywhere; targets ≥ 44 px;
  - type colour is never the only cue (the name is in the accessible text, the dot is
    `aria-hidden`);
  - "TENGO" is text.
- **Performance:**
  - The grid makes 1 index request (cached by the browser) plus 1 ownership request (signed
    in).
  - The sheet makes the details, the collection summary, one card page and one
    favourite-status request.
  - There are no duplicate requests (count tests), and images are lazy.
  - The GIF is only on visible owned tiles, and nothing animates with reduced motion.
- **Privacy:** no UUID anywhere visible or accessible; ownership endpoints are owner-scoped.

## 9. Data, migration and dependencies

### 9.1–9.3

- Migration `0010_card_species` only (see §6.2). It needs no data backfill: the table fills
  lazily.
- PostgreSQL round trip 0009 → 0010 → 0009, keeping the inventory, binders, favourites and
  history intact.
- No new runtime dependency.

### 9.4 8D Part 2 renumbered again

8D Part 2's migration moves to **`0011_binder_appearance`** (down revision `0010`). Its plan,
spec and ROADMAP are updated in the same planning commit. If 8D Part 2 were implemented first,
the numbers swap again before writing either migration.

## 10. Testing and Safari checklist

**Backend:**

- The species JSON: 1025 entries, numbers 1–1025 unique, 1–2 valid types, non-empty names;
  the validator rejects each kind of corruption; the script's pure functions (name choice with
  the English fallback, type mapping, forms above 10000 ignored) with a fake transport.
- The index endpoint (rows, cache headers, ETag and 304); search in both languages with types
  and sprite, and with no network at all.
- Card species: budget, pending, the 1-day retry for unknown cards, stale refresh, two dex ids.
- Ownership counts and the species collection (value, catalog_total null when unknown).
- Owner-aware list with exact pages for owned and missing.
- Two-user isolation on SQLite and PostgreSQL; the migration round trip.

**Frontend:**

- Index parser; generation ranges; URL state (valid, invalid, defaults); filters
  (type/show/query) combined; incremental render (60, sentinel, "Ver más"); scroll and count
  restoration.
- Tiles (owned vs dimmed, labels, accessible names, no UUID); the animated swap only when
  visible, owned and not reduced.
- Progress and pending.
- Every state in §4.4 and §5.
- The redirect from `/cards`; prev/next names; back to the same grid.
- The collection box (value, catalog total present or absent); the card filters; "TENGO"; the
  optimistic ★.
- The single `navigation` landmark; a style contract against legacy classes; ES/EN; request
  counts.

**Safari** (after implementation; also in `docs/ROADMAP.md`):

- [ ] `/pokedex`: "Tu Pokédex" with the gold bar and "N de 1025"; nine generation tabs; the type
  chips with dots; "Tengo/Me faltan"; a search showing sprites and types.
- [ ] Owned tiles in colour and animated, the others dimmed and grey; with reduced motion nothing
  animates; scrolling loads more and "Ver más" works.
- [ ] Open a species and go back: the same generation, filters and scroll.
- [ ] Species sheet: the artwork with the sprite in a corner; number, generation and region;
  description, height, weight and abilities; ‹ › with names.
- [ ] "Tu colección": copies and gold value; "Ver solo las que me faltan".
- [ ] Cards: "TENGO" with a gold border; the others dimmed; the ★ changes at once; a card's back
  link returns to the sheet.
- [ ] An old `/pokemon/25/cards?sort=newest` link opens the sheet with that sort.
- [ ] VoiceOver: one navigation landmark, tabs with arrows, tiles read "#025 Pikachu, eléctrico,
  3 cartas".
- [ ] Offline PokéAPI or TCGdex: calm notes with Reintentar; the rest keeps working.

## 11. Decisions for approval

| # | Proposal | Alternative / consequence |
| --- | --- | --- |
| D1 | Branch `feat/iteration-9b-pokedex` from `main` `51246fc` | — |
| D2 | **Revised:** a versioned JSON in the repo (number, Spanish and English names, types) generated once by a reproducible script and validated by a test; served at `/pokemon/index` with a long HTTP cache | Runtime index from PokéAPI (English names only, lost on restart) |
| D3 | Store card→species (`card_species`, migration 0010), filled lazily with a budget; 8D Part 2 → 0011 | Fetch each owned card's detail per visit (slow, many TCGdex calls) |
| D4 | The "N cartas" label counts **copies** (two Pikachu copies = 2); the progress counts species with ≥ 1 copy | Count distinct cards |
| D5 | One type at a time (a toggle chip); it combines with generation, show and search | Multi-type (more URL and UI states) |
| D6 | Search covers all generations; results link to the sheet; the grid filter `q` applies within the current generation | Search only the current tab |
| D7 | Back restores generation, filters, rendered count and scroll (sessionStorage per URL) | Restore filters only |
| D8 | Guests see every tile in colour (nothing is "missing" for them) and no labels; the owned filters are disabled | Show guests a dimmed grid |
| D9 | Show the catalog total only from the verified English index ("El catálogo (inglés) tiene T cartas"); otherwise only your cards | Never show a total |
| D10 | Sprites, animated GIFs and artwork are built on the client from the number (raw.githubusercontent PokeAPI sprites); the search returns `sprite_url` too | Proxy images through the backend |
| D11 | Animate only visible owned tiles (swap PNG→GIF in view); static under reduced motion or above #649 | Always animate (CPU/battery) |
| D12 | 60 tiles at first, +60 by sentinel or the "Ver más" button | Render a whole generation at once (up to 156 tiles + GIFs) |
| D13 | The owner-aware species card list filters owned/missing on the server over the verified index (exact pages) | Filter on the client per page (wrong page sizes) |
| D14 | `/pokemon/:n/cards` redirects to `/pokemon/:n` keeping its query; card pages return to the sheet | Keep two pages |
