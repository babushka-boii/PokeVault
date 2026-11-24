# PokéVault — Binders 8C design ("Mis carpetas")

**Date:** 2026-11-23

**Status:** Approved by the student on 2026-11-24 with the recommended decisions D1–D8,
plus a D6 adjustment: when a stored copy came from another binder, the status message
names where it moved from (for example "Movida desde Repetidas a Tesoros · pág. 1 · bolsillo 5").

**Iteration:** 8C. It replaces the earlier "easy Mi PC" placeholder. 8A (visual system,
shell, Home) is merged (PR #6); 8B (quick save + animated scanner) is independent.

## 1. Purpose

Replace **personal boxes** with **binders** that feel like a real card album: pages of
9 pockets, with the official card image in a plastic sleeve, and the name and reference
price of the physical copy.

**Catalog boxes do not change.** The Pokédex species boxes keep their sprites, retro
wallpapers and species exploration.

Success means:
- Every existing personal box arrangement survives as a binder, and nothing is lost.
- A user can store, move and remove copies with keyboard, mouse or touch, without drag &
  drop.
- A user can see where any copy lives ("Carpeta X · pág. N · bolsillo M").
- A TCGdex or price outage never breaks `/inventory`, `/sets` or the binders.

## 2. Evidence: what exists today (`main` @ `e2c1866`)

### Data

- `personal_boxes` (migrations `0004` and `0006`) holds an id, owner, name (1–80,
  trimmed), `display_order` (≥ 0, unique per owner) and a `wallpaper` (`noir` by
  default) plus timestamps. Owners are limited to 100 boxes.
- `box_memberships` has the primary key `(box_id, position)` with position 0–29.
  `copy_id` is globally unique. Composite foreign keys `(user_id, box_id)` and
  `(user_id, copy_id)` make cross-owner rows impossible, and deleting either parent
  cascades.
- Every write locks the owner row first (`lock_owner`).

### API

`/api/v1/boxes` provides:
- List, create, reorder, get, update and delete boxes.
- Place or move a copy into a slot (`PUT /{id}/slots/{position}`), atomically. An
  occupied slot returns 409 and never swaps.
- Remove a copy from a slot. The request must carry the expected `copy_id`.
- Copy views `views/{owned|unassigned|recent}`.

Absent and foreign ids both return 404. Responses are `no-store`.

### Prices

`GET /api/v1/boxes/{id}/value` calls `PriceService.value(refs, currency, top=0)`. The
service evaluates a list of `CopyRef`, sums before rounding, and only answers 503 when
the database is down.

### Frontend

- **`/boxes` has a catalog/personal switch.** `?mode=personal` renders
  `PersonalBoxesPage`: the 6×5 `PersonalGrid`, the `PersonalDetails` panel, a move form,
  the unassigned-copy picker, derived views with grouping, and the box editor (rename,
  wallpaper, order, delete). It also shows `BoxValue`.
- **Home** "Mi PC" (`PcPreview`) previews the first box and the count of copies without a
  box. "Expansiones" uses `/boxes/views/recent`.
- **Copy detail** (`InventoryCopyPage`) links to `/boxes?mode=personal`, but does not say
  where the copy is.
- **The scanner success screen** still prints the saved copy UUID
  (`ScannerPage.tsx:116`).

### Navigation

- **Desktop nav:** Inicio, Pokédex, Cajas PC, Expansiones, Mi colección.
- **Mobile tab bar:** Inicio, Cajas, ESCANEAR, Colección, Perfil.
- **"Explorar" menu:** Pokédex, Expansiones.

In both bars, "Cajas" opens `/boxes`, where personal boxes sit behind the mode switch.

### Tests that depend on personal boxes

- Backend: `test_boxes.py` (13), `integration/test_boxes_postgres.py` (18), the `0006`
  wallpaper tests, box-value cases in `test_prices_api.py` and `test_prices_postgres.py`,
  and `test_scanner_postgres.py`, which seeds a `PersonalBox`.
- Frontend: `PersonalBoxes.test.tsx` (16), personal parts of `CardEntrypoints` and
  `BoxesPage`, `services/boxes.test.ts`, the Mi PC cases in `HomeData.test.tsx` and
  `homeFixtures.ts`.

## 3. Confirmed direction (student, 2026-11-23)

**Shelf ("Mis carpetas").** Each binder shows:
- Its name and number of cards.
- Its value, in gold.
- Its cover. Every binder uses the default "Unova Noir" cover in 8C; the cover and
  sticker UI is 8D.

**Inside a binder:**
- Two pages side by side on desktop, one on mobile.
- Each page is a 3×3 grid of pockets in a plastic sleeve.
- Each pocket shows the **official card image** (TCGdex, as used today), with the card
  name and the copy's price.

**"Sin carpeta" tray.** It lists owned copies that are in no binder.
- Tapping a copy stores it in the next free pocket of the open binder.
- A copy can also go into a chosen pocket, move to another pocket or binder, or be taken
  out (it returns to the tray).
- There is no drag & drop: everything works with the keyboard and on a phone.

**"¿Dónde está esta carta?"**
- The copy detail shows "Carpeta X · pág. N · bolsillo M" with a link.
- Storing a copy announces the result through `role="status"`.

**Motion:**
- Storing a copy: the card drops in from above, settles with a small bounce, and the
  sleeve shines (about 600 ms).
- Turning a page: a short leaf turn.
- With `prefers-reduced-motion`, there is no animation and the change is immediate.

**Home.** "Mi PC" becomes "Mis carpetas": a preview of the most recent binder plus
"N cartas sin carpeta · guardar". "Cajas PC" keeps leading to the catalog boxes.

**Data (migration `0007`, reversible, nothing lost):**
- Each personal box becomes a binder with the same name and order.
- Position 1–30 maps to page = ceil(pos / 9) and pocket = ((pos − 1) mod 9) + 1.
- One copy lives in at most one binder; one pocket holds at most one copy.

**Prepared for 8D (no UI):** a cover with a default value, and stickers per cover.
Stickers would be either a "pokemon" with a species id (PokéAPI official artwork with a
CSS die-cut effect) or a "pixel" sticker from our own set, each with position, rotation
and scale.

**Quality bar:**
- Per-user isolation everywhere, tested with two users on SQLite and PostgreSQL.
- Integrity checks like today's boxes.
- Binder value through the existing price service.
- ES/EN complete.
- Pockets with an accessible name (card, expansion, page and pocket), never a UUID.
- Skeletons, and empty states with personality ("Tu primera carpeta te espera").

**Also in 8C:** remove the UUID from the scanner success message.

**Out of 8C:**
- The cover and sticker UI (8D).
- Automatic binders (Favoritas, By expansion).
- Master set.
- Drag & drop.

## 4. Scope

### Included

**Backend:**
- Migration `0007` creates `binders` and `binder_pockets`, copies every box and slot, and
  keeps the box tables frozen (decision D1).
- Models.
- The `/api/v1/binders` router: CRUD, order, place or move, next free pocket, remove, the
  tray and recent views, and copy locations.
- Binder value, and all binder values in one request.
- Removal of the `/api/v1/boxes` router and `/boxes/{id}/value`.

**Frontend:**
- Routes and pages:
  - Shelf `/binders` and binder view `/binders/:binderId`.
  - `/boxes?mode=personal` redirects to `/binders`.
  - `/boxes` becomes catalog only, with no mode switch.
- Navigation changes (D4).
- The tray and the pocket actions.
- Status announcements.
- Animations with reduced-motion fallbacks.
- Copy location in the copy detail.
- Home "Mis carpetas".
- The scanner success message without a UUID.

**Retirement:** the personal-box frontend (page, grid, details panel, box value, Home
preview, services) and its tests. The equivalent behaviour is re-specified and re-tested
for binders.

**Tests and docs:** new `docs/BINDERS.md` (replacing `docs/BOXES.md` for personal
storage) plus the usual docs.

### Excluded

- Cover and sticker UI (8D). Whether 8C ships the sticker table is decision D3.
- Automatic binders, master set, drag & drop, and swapping two occupied pockets.
- Box wallpapers inside binders: binders use covers; wallpapers stay a catalog-box
  feature.
- Changes to catalog boxes, the Pokédex, inventory semantics or set completion. Duplicate
  copies still never raise completion.
- New external providers. Images keep coming from TCGdex through the existing card
  metadata path.

## 5. Data model (migration `0007`)

### 5.1 `binders`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | UUID PK | **Reuses the source box id** when migrated, so nothing has to be remapped |
| `user_id` | UUID | FK `users.id` ON DELETE CASCADE |
| `name` | varchar(80) | 1–80 characters, `name = trim(name)` (`ck_binders_name`) |
| `display_order` | int | ≥ 0 (`ck_binders_order`); `uq_binders_owner_order (user_id, display_order)` |
| `cover` | varchar(16) | Default `'noir'`; `ck_binders_cover: cover IN ('noir')`. 8D widens the check |
| `created_at`, `updated_at` | timestamptz | Server defaults; `updated_at` on update |

`uq_binders_owner_id (user_id, id)` is the target for composite foreign keys. The API
enforces at most **100 binders per owner**, as with boxes today.

### 5.2 `binder_pockets`

| Column | Type | Rules |
| --- | --- | --- |
| `user_id` | UUID | Part of both composite FKs |
| `binder_id` | UUID | PK part; FK `(user_id, binder_id)` → `binders(user_id, id)` ON DELETE CASCADE |
| `page` | smallint | PK part; `ck_binder_pockets_page: page BETWEEN 1 AND 40` (D2) |
| `pocket` | smallint | PK part; `ck_binder_pockets_pocket: pocket BETWEEN 1 AND 9` |
| `copy_id` | UUID | `uq_binder_pockets_copy` (one binder per copy); FK `(user_id, copy_id)` → `inventory_copies(user_id, id)` ON DELETE CASCADE |
| `placed_at` | timestamptz | Server default `now()`, refreshed on every place or move. It drives "most recent binder" (D7) |

Primary key: `(binder_id, page, pocket)`, so a pocket holds at most one copy. Index
`ix_binder_pockets_owner (user_id)`.

Consequences:
- Deleting a binder deletes its pockets only, and those copies return to the tray.
- Deleting a copy frees its pocket.
- A pocket can never join two owners, even through direct SQL.

**Pages are implicit; there is no `page_count` column (D2).** A binder shows as many
**spreads** as needed: the last occupied page, plus the next page, rounded up to a full
spread. The minimum is one spread (pages 1–2). The hard cap is 40 pages, which is 360
pockets, like a common 360-card binder.

### 5.3 Data migration (upgrade)

1. Create both tables and their constraints.
2. `INSERT INTO binders (id, user_id, name, display_order, cover, created_at, updated_at)
   SELECT id, user_id, name, display_order, 'noir', created_at, updated_at FROM
   personal_boxes`. The box wallpaper is not carried over, because binders have covers,
   and the box row keeps it (D1).
3. Copy every membership. The zero-based `position` p is the user's 1–30 position minus
   one, so `page = p / 9 + 1` (integer division) and `pocket = p % 9 + 1`. This equals
   ceil(pos / 9) and ((pos − 1) mod 9) + 1. Examples: p 0 → (1, 1); p 8 → (1, 9);
   p 9 → (2, 1); p 29 → (4, 3). `placed_at` is set to `now()`, because memberships had
   no timestamp.
4. The constraints guarantee the result: same owner, unique copies, positions in range.

### 5.4 What happens to the box tables (decision D1)

**Recommended: keep `personal_boxes` and `box_memberships` frozen in `0007`, and drop
them in a later migration (`0008`) once 8C has passed manual acceptance.**

- `0007` downgrade only drops the binder tables. The original boxes are still there
  untouched, so going back to `0006` is exact and loses nothing. Any rearrangement made
  in binders after the upgrade is discarded, and the spec says so.
- The ORM models and the `/api/v1/boxes` router are removed in 8C. Nothing reads or
  writes the frozen tables except the cascade when a copy is deleted.
- `0008` (in a later iteration) drops them. Its downgrade rebuilds boxes from binders: one
  box per 30 pockets in page order, with name suffixes " (2)", " (3)" when a binder needs
  more than one box. That conversion is lossless, but it is complex enough that it should
  run only once the data is known to be right.

**Alternative: drop the box tables inside `0007`.** The downgrade would then need that
box-splitting reconstruction immediately, inside the riskiest migration of the iteration.
It is also harder to recover from a mistake found during the first Safari pass.

### 5.5 Stickers for 8D (decision D3)

**Recommended: 8C ships only `binders.cover` (default `'noir'`) and leaves the sticker
table entirely to 8D.**

Without a UI, the sticker shape is a guess: coordinates, z-order, pixel-set keys, maybe
per-page stickers. A table without an API would still need its own constraints,
isolation and migration tests, and 8D might have to alter it anyway. Adding a table later
is cheap and non-breaking.

The intended 8D shape is recorded here so 8D starts from it:

`binder_stickers`:
- `id`, `user_id`, `binder_id`, with a composite FK to `binders`.
- `kind`: `'pokemon' | 'pixel'`.
- `species_id`: 1–1025, required only for `pokemon`.
- `pixel_key`: our own set, required only for `pixel`.
- Position: `x` and `y` as 0–1 fractions of the cover.
- `rotation`: −180 to 180°.
- `scale`: 0.25–3.
- `z`, and `created_at`.
- A check ties `kind` to the right identifier.
- The API limits stickers to 24 per cover.

**Alternative:** add `binder_stickers` in `0007` with these constraints and its tests,
but no API.

## 6. API (`/api/v1/binders`)

All endpoints require the session; mutations also require the allowed Origin and the
`X-CSRF-Token`. All responses are `no-store`. Absent and foreign ids both return 404.

Status codes:
- 422 invalid input.
- 409 conflicts.
- 503 sanitized database errors.
- Every write locks the owner row first, as boxes do today.

| Method | Path | Request → response |
| --- | --- | --- |
| GET | `` | `{results: BinderSummary[], total}` sorted by `display_order` |
| POST | `` | `{name, cover?}` → summary, 201. `binder_limit_reached` 409 at 100 |
| PUT | `/order` | `{binder_ids}` exact full permutation → list |
| GET | `/views/unassigned` | Tray: `{results: copy[], total, offset, limit}`, newest first (offset 0–1,000,000, limit 1–100, default 30) |
| GET | `/views/recent` | Same shape and ordering as today's `/boxes/views/recent`, for Home "Expansiones" |
| GET | `/locations?copy_id=…` | 1–100 unique owned ids → `{results: [{copy_id, binder_id, binder_name, page, pocket}]}` for placed copies only. Foreign ids are absent from the results, not errors |
| GET | `/{id}` | Summary plus `pockets: [{page, pocket, copy, placed_at}]`, sorted. At most 360 rows |
| PUT | `/{id}` | Non-empty `{name?, cover?}` → summary |
| DELETE | `/{id}` | 204. Its copies return to the tray; the inventory is untouched |
| POST | `/{id}/pockets` | `{copy_id}` → `StoreResult {page, pocket, moved_from, binder: detail}`. Stores in the **next free pocket**, the lowest (page, pocket), chosen on the server under the owner lock. Moves the copy if it is elsewhere. `binder_full` 409 at 360 |
| PUT | `/{id}/pockets/{page}/{pocket}` | `{copy_id}` → `StoreResult`. Place, or move from any pocket or binder, atomically. Occupied by another copy → `pocket_occupied` 409 (no swap). Same copy → idempotent |
| DELETE | `/{id}/pockets/{page}/{pocket}?copy_id=` | 204. The expected `copy_id` is required; a different occupant → `pocket_changed` 409. Removing from an empty pocket is idempotent |

`StoreResult.moved_from` is `null` for a copy that came from the tray (or was already in
that pocket); otherwise `{binder_id, binder_name, page, pocket}` of its previous pocket,
read under the owner lock before the move (D6 adjustment).

`BinderSummary` fields:
- `id`, `name`, `display_order`, `cover`.
- `copy_count`.
- `page_count`: the visible pages, derived as in §5.2.
- `last_placed_at`: null when empty.
- `created_at`, `updated_at`.

**Prices** (new, in the prices router):
- `GET /api/v1/binders/{id}/value?currency=` replaces `/boxes/{id}/value`. It returns the
  same `Valuation` with `top=0`.
- `GET /api/v1/prices/binders?currency=` returns
  `{currency, results: [{binder_id, total, original_totals, copy_count, priced_count, pending_count}], rates}`
  for **all** of the owner's binders in **one** service pass.
  `PriceService.values_by_group()` reuses `_evaluate` once over the union of copies,
  keeps the 40-refresh budget and sums each binder before rounding. The shelf makes one
  request instead of one per binder.
- Per-pocket prices use the existing `GET /api/v1/prices/copies` (≤ 100 ids) for the
  visible spread only (≤ 18).

**Failure isolation:**
- Binder endpoints never call TCGdex or the price service.
- `/inventory`, `/sets` and the binder endpoints keep working during TCGdex or
  exchange-rate outages.
- Price endpoints answer 503 only when the database fails, as in Iteration 7.

## 7. Frontend

### 7.1 Routes and navigation (decision D4)

**Routes:**
- `/binders` is the shelf.
- `/binders/:binderId?page=N&pocket=M` is a binder. `page` picks the spread that
  contains page N; `pocket` focuses that pocket.
- `/boxes?mode=personal` redirects with `replace` to `/binders`.
- `/boxes` drops the mode switch and shows only the catalog.

**Recommended navigation:**
- **Desktop nav (6 links):** Inicio, Pokédex, Cajas PC, Expansiones, **Mis carpetas**,
  Mi colección. The wordmark already hides below 1100px, and the nav scrolls as a last
  resort at 768–1023px.
- **Mobile tab bar:** Inicio, **Carpetas**, ESCANEAR, Colección, Perfil.
- **"Explorar" menu:** Pokédex, **Cajas PC**, Expansiones.

**Why:** the tab bar holds the user's own daily tasks (store, scan, review). Catalog
boxes are exploration, like the Pokédex. Binders are what a collector opens every day,
so they earn the bottom-bar slot. "Cajas PC" stays one tap away under Explorar and keeps
its desktop link.

### 7.2 Shelf (`/binders`)

- A grid of binder spines or covers: the "Unova Noir" cover (a token gradient with a
  subtle dot pattern and a cut corner), the name, `N cartas`, and the value in gold. The
  value comes from one `/prices/binders` request, with a skeleton until it arrives.
- Actions: "+ Nueva carpeta" (name form), plus rename, reorder (earlier/later) and delete
  with confirmation. These carry over from today's box editor; deleting returns the
  copies to the tray.
- A chip "N cartas sin carpeta · guardar" opens the first binder with the tray expanded.
- **Empty state:** "Tu primera carpeta te espera", with a short line, "+ Nueva carpeta"
  and "Escanear carta".

### 7.3 Binder view (`/binders/:id`)

**Spread:**
- Desktop (≥ 768px): two pages side by side (odd page on the left).
- Mobile: one page at a time.
- Page navigation: "‹ Anterior" and "Siguiente ›", plus PageUp/PageDown, and a
  "pág. N–N+1 de P" label.

**Pockets:**
- Each page is a `role="grid"` 3×3 with a roving tab index and arrow keys, the same
  pattern as today's `PersonalGrid`.
- A pocket is a button.
- **Filled pocket:** the official card image (`CardArtwork`, thumbnail, lazy) inside a
  sleeve (an inset border, a glossy gradient and a corner reflection). Below it, the name
  and the copy price in gold.
- **Empty pocket:** an outlined sleeve with the pocket number.
- **Accessible name:**
  - Filled: "Página 2, bolsillo 5: Pikachu · Team Up; Holográfica, Casi impecable".
  - Empty: "Página 2, bolsillo 5: vacío".
  - Never a UUID. When card metadata fails, the card id (for example `sm9-33`) is the
    fallback, never the copy UUID.

**Selection panel** (side on desktop, below on mobile). It shows the selected pocket and
its actions:
- **Filled:** "Ver copia" (`/collection/:id`), "Mover", "Sacar de la carpeta".
  - "Mover" opens move mode. A target binder `<select>` (current by default), then
    choosing an **empty** pocket in the visible spread, or "Siguiente bolsillo libre".
    Escape or "Cancelar" exits.
  - "Sacar" sends the DELETE with the expected `copy_id` and returns the copy to the tray.
- **Empty:** "Elegir de la bandeja" filters the tray into "place into this pocket" mode.

**Tray "Sin carpeta":**
- A collapsible panel: right column on desktop, a bottom section on mobile.
- Paginated 30 at a time, with a search-free list.
- Each item shows a thumbnail, name, expansion, variant, language and condition. There
  is no UUID anywhere.
- **Default mode:** tapping an item sends POST next-free into the open binder.
- **"Place into page N pocket M" mode** (entered from an empty pocket): tapping an item
  sends PUT to that pocket.
- Item buttons are named "Guardar Pikachu · Team Up en esta carpeta" or "Guardar
  Pikachu · Team Up en página 2, bolsillo 5".

**Announcements:**
- A polite `role="status"` live region reports the result, using `moved_from`:
  - From the tray: "Guardada en Kanto · pág. 2 · bolsillo 5".
  - From another binder: "Movida desde Repetidas a Tesoros · pág. 1 · bolsillo 5".
  - Within the same binder: "Movida a pág. 3 · bolsillo 1".
  - Taken out: "Devuelta a la bandeja".
- Errors use the existing sanitized messages: occupied pocket, binder full, session
  expired.
- After a mutation, focus goes to the affected pocket; when the copy leaves the binder,
  it goes to the tray heading.

**Data loading:**
- Binder detail: one request.
- Card metadata: only for the visible spread (≤ 18 ids) through `usePersonalMetadata`.
- Copy prices: one `/prices/copies` request for those ids.
- If metadata or prices fail, the pockets still render their name fallback and position,
  with no price.

**Mutation safety:** the same patterns as today's boxes.
- Abort on unmount or account switch.
- Ignore stale responses.
- A 401 calls `retrySession`.
- A 409 refetches the binder and shows the conflict message.

### 7.4 Motion

**Store:**
- The arriving pocket gets `data-arrived` for one render.
- CSS `pv-pocket-drop`, 600 ms: translateY(−120%) to 0 with a 6% overshoot and settle.
- A sleeve shine sweep (opacity/gradient) on the last 200 ms.

**Page turn:**
- The spread gets `data-turn="next|prev"`.
- `pv-page-turn`, 280 ms: a short `rotateY` around the spine with perspective, plus a
  fade. It is never auto-played.

**Reduced motion:**
- `@media (prefers-reduced-motion: reduce)` removes both animations: the change is
  immediate.
- The global `base.css` rule already applies.
- The style contract gains a check that `binders.css` neutralizes both keyframes, and
  that no animation is `infinite`.

### 7.5 "¿Dónde está esta carta?"

- The copy detail calls `GET /binders/locations?copy_id=<id>`.
- **Placed:** "Carpeta Kanto · pág. 2 · bolsillo 5", linking to
  `/binders/<binderId>?page=2&pocket=5`.
- **Not placed:** "Sin carpeta · guardar", linking to the first binder with the tray
  open, or to `/binders` when the user has none.
- If the location request fails, the line is simply omitted. The copy detail never
  breaks.

### 7.6 Home

- "Mi PC" becomes **"Mis carpetas"**.
- **Preview:** the most recent binder, meaning the greatest `last_placed_at`, or the
  first by order when none has placements (D7). It shows the page that holds its most
  recent placement as a read-only 3×3 with images.
- **Links:** "Abrir carpeta" and "N cartas sin carpeta · guardar" (from
  `/binders/views/unassigned` `total`).
- **Empty state:** "Tu primera carpeta te espera".
- **Expansiones** switches from `/boxes/views/recent` to `/binders/views/recent`, with
  the same behaviour.

### 7.7 Scanner success

- Remove the "UUID de copia: …" line.
- Show "Ver copia" (`/collection/:id`) and "Guardar en una carpeta" (`/binders`, which
  will be quick-save in 8B).
- The anti-UUID tests extend to this screen.

### 7.8 Copy (ES / EN)

There is a new `binders` dictionary section, and `shell` gets new keys. The full strings
are in the plan. Representative keys:

| Key | ES | EN |
| --- | --- | --- |
| `shell.nav.binders` / `shell.tabs.binders` | Mis carpetas / Carpetas | My binders / Binders |
| `binders.empty` | Tu primera carpeta te espera | Your first binder is waiting |
| `binders.tray` | Sin carpeta | Not in a binder |
| `binders.pocketName` | Página {page}, bolsillo {pocket}: {card} | Page {page}, pocket {pocket}: {card} |
| `binders.stored` | Guardada en {binder} · pág. {page} · bolsillo {pocket} | Stored in {binder} · p. {page} · pocket {pocket} |
| `binders.location` | Carpeta {binder} · pág. {page} · bolsillo {pocket} | Binder {binder} · p. {page} · pocket {pocket} |
| `binders.unassigned` | {count} cartas sin carpeta · guardar | {count} cards not in a binder · store |

## 8. Accessibility

- Every interactive element is at least 44px.
- The focus ring is cyan, and pockets use the inward offset.
- Grids use roving tab index; page change keys are announced in the help text.
- Status messages are polite; errors use `role="alert"`.
- Images inside pocket buttons are decorative (`alt=""`), because the button name
  carries the identity.
- No information is conveyed only by color, animation or position.

## 9. Isolation and failure behavior

- Every query filters by `user_id`, and the composite FKs make cross-owner pockets
  impossible.
- Foreign binder, pocket and copy ids return 404, or are absent from location results.
- Two-user tests run on SQLite and PostgreSQL, with both owners holding the same card:
  - Listing, detail, tray, recent, locations, values.
  - Every mutation.
- Outages:
  - Binder pages render pockets without images or prices when TCGdex fails.
  - Price failures only hide prices and values.
  - `/inventory`, `/sets` and `/binders` never depend on the price service. The existing
    "never depend on prices" API test is extended to the binder endpoints.

## 10. Migration safety

- `0007` upgrade and downgrade run on PostgreSQL in disposable schemas, with seeded
  boxes. The seed covers p 0, 8, 9 and 29, two owners, an empty box, and an unplaced
  copy.
- After the upgrade, the binders equal the boxes (ids, names, order, timestamps) and the
  pockets equal the mapped positions.
- After the downgrade, the box tables are byte-for-byte unchanged and the binder tables
  are gone.
- A second full cycle is clean.

## 11. Testing

### Backend

- **Model and constraint unit tests (SQLite):**
  - Page 1–40, pocket 1–9.
  - Unique copy, the pocket primary key, cover check, name and order.
- **API tests:**
  - CRUD and order.
  - Next free pocket: lowest gap, `binder_full` at 360.
  - Place and move within a binder and across binders.
  - Occupied 409, same-copy idempotency, remove with the expected copy and 409 on
    change.
  - Tray and recent views, locations.
  - Auth, CSRF and Origin.
  - 404 for foreign ids.
  - Owner lock serialization, like today's box race tests.
- **Prices:**
  - Binder value.
  - `values_by_group`: per-group sums before rounding, one evaluation, shared refresh
    budget.
  - Outages.
- **PostgreSQL integration:** the migration tests (§10), the two-user isolation suite,
  and constraint enforcement through raw SQL.
- **Retired:** the box API tests (the router is gone). The 0006 tests remain, because the
  migration still exists. `test_scanner_postgres.py` seeds a binder instead of a box.

### Frontend

- Shelf:
  - Values in one request.
  - Empty state.
  - Create, rename, reorder, delete with confirmation.
- Binder view:
  - Desktop spread versus one mobile page (`stubMedia`).
  - Pocket names.
  - Arrow keys and page keys.
  - Every tray mode and pocket action, each with its request body and status message.
  - Conflict refetch.
  - Account switch.
  - TCGdex and price failures.
- Anti-UUID across shelf, binder, tray, selection panel, copy detail location, Home
  preview and scanner success: visible text and every `aria-label`.
- Motion:
  - `data-arrived` and `data-turn` are applied.
  - With reduced motion, the CSS contract proves the animations are removed.
- Navigation: desktop 6 links, the mobile tab "Carpetas", "Cajas PC" in Explorar, the
  `/boxes?mode=personal` redirect, and catalog boxes unchanged.
- Home "Mis carpetas" states, and Expansiones on the new recent view.
- **Retired:** `PersonalBoxes.test.tsx`, `services/boxes.test.ts`, the personal parts of
  `BoxesPage` and `CardEntrypoints`, and the Mi PC cases in `HomeData.test.tsx`. Each is
  replaced by an equivalent binder test where the behaviour still exists.

### Full validation

`bash scripts/check.sh` exits 0.

## 12. Acceptance criteria

**Automated:**
- `check.sh` passes.
- The migration upgrades and downgrades cleanly on the student's database.
- Nothing is lost.

**Manual (Safari, desktop and iPhone-size):**
- The existing boxes appear as binders with the same order.
- Storing a copy by tap, by chosen pocket, moving it and taking it out all work by
  keyboard and by touch.
- Animations play, and disappear with "Reduce motion".
- The copy detail location is correct.
- The Home preview shows the right binder.
- No UUID appears anywhere in those views.

## 13. Decisions (approved 2026-11-24)

**D1. Box tables.**
- **Recommended:** keep them frozen in `0007` and drop them in a later `0008` (§5.4).
- **Alternative:** drop them in `0007`, with a box-splitting downgrade.

**D2. Page capacity.**
- **Recommended:** implicit pages with a hard cap of 40 pages (360 pockets, a common
  real binder size). The view always shows one spare page; there is no page count to
  manage.
- **Alternatives:**
  - An explicit, user-editable page count, which needs another column and a UI.
  - A cap of 20 or 30 pages.

**D3. Stickers.**
- **Recommended:** only `cover` in 8C; the sticker table, with the shape in §5.5, lands
  with its UI in 8D.
- **Alternative:** create the table now without an API.

**D4. Navigation.**
- **Recommended:** desktop "Mis carpetas" between Expansiones and Mi colección; the
  mobile tab "Carpetas" replaces "Cajas"; "Cajas PC" moves into Explorar.
- **Alternative:** keep the mobile tab "Cajas" and reach binders from Home and the
  desktop nav only.

**D5. Binder ids.**
- **Recommended:** reuse the source box UUIDs when migrating.

**D6. Placing a copy that is already in another binder.**
- **Approved:** move it atomically, as boxes do today, and announce where it came from
  (`moved_from`).
- **Alternative:** refuse it and require taking it out first.

**D7. "Most recent binder" for Home.**
- **Recommended:** the greatest `last_placed_at` (new `placed_at` per pocket), falling
  back to display order.
- **Alternative:** always the first binder by order.

**D8. Shelf values.**
- **Recommended:** one `GET /prices/binders` request (grouped service pass).
- **Alternative:** one `/binders/{id}/value` request per binder, which is simpler but
  makes N requests.

## 14. Risks

- **Retiring a working feature:** personal boxes go away in one iteration. This is
  mitigated by frozen tables (D1), a lossless reversible `0007`, and the equivalent
  binder test coverage listed in §11.
- **Image volume:** one spread is at most 18 thumbnails, loaded lazily. The shelf shows
  no card images in 8C (covers only).
- **Value cost:** a large collection grouped by binder is one pass with the existing
  40-refresh budget. Pending prices show the usual "pending" counts.
- **Safari:** 3D `rotateY` with `backface-visibility` needs the `-webkit-` prefix on older
  Safari. It is verified manually, and reduced motion avoids it entirely.
- **The 8B quick-save** will call the same `POST /binders/{id}/pockets` (next free), so
  8C defines it as a stable contract.
