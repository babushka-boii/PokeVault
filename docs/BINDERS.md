# Binders — Iteration 8C

Binders replace personal boxes. A binder is an album of 9-pocket pages that stores the
signed-in user's physical `InventoryCopy` records. The catalog boxes (Pokédex species
grid, sprites, retro wallpapers) were a separate feature, removed in 8C.1 (`docs/BOXES.md`).

Spec: `docs/superpowers/specs/2026-11-23-binders-8c-design.md`.
Plan and evidence: `docs/superpowers/plans/2026-11-23-binders-8c.md`.

## Persistence (migration `0007`)

**`binders`**
- Columns: UUID id, owner, trimmed name (1–80), `display_order` (≥ 0, unique per
  owner), `cover`, `created_at` and `updated_at`.
- `cover` defaults to `noir` and is checked against `('noir')`. 8D widens that check
  when it adds covers and stickers.
- The API allows at most 100 binders per owner.

**`binder_pockets`**
- The primary key is `(binder_id, page, pocket)`, so a pocket holds at most one copy.
- `page` is 1–40 and `pocket` is 1–9.
- `copy_id` is unique: a copy is in at most one binder.
- Composite foreign keys `(user_id, binder_id)` and `(user_id, copy_id)` make
  cross-owner pockets impossible, even through direct SQL.
- `placed_at` is set on every place or move.
- Deleting a binder deletes only its pockets, so its copies return to the tray.
  Deleting a copy frees its pocket.

**Pages are implicit.** A binder shows as many pages as needed: the last used page plus
one spare, rounded up to whole two-page spreads. The minimum is 2 pages and the maximum
is 40 (360 cards).

**Migration from boxes.** Each personal box became a binder with the same id, name,
order and timestamps, and the `noir` cover. A zero-based slot position `p` maps to
page `p // 9 + 1` and pocket `p % 9 + 1`. In 1-based terms that is page = ceil(pos/9)
and pocket = ((pos − 1) mod 9) + 1. For example, slot 30 lands on page 4, pocket 3.

**The box tables are frozen.** `personal_boxes` and `box_memberships` still exist, so
downgrading to `0006` is exact, but no code reads or writes them. Binder changes made
after the upgrade are discarded by a downgrade. A later migration drops the box tables
(see ROADMAP).

## API

Every path starts with `/api/v1/binders` and needs the session cookie. Mutations also
need an allowed Origin and `X-CSRF-Token`. Responses are `no-store`. Missing and foreign
ids both return 404.

| Method | Path | Request → response |
| --- | --- | --- |
| GET | (base) | `{results: BinderSummary[], total}` in shelf order |
| POST | (base) | `{name, cover?}` → summary, 201 (`binder_limit_reached` 409) |
| PUT | `/order` | `{binder_ids}` exact permutation → list |
| GET | `/views/{owned\|unassigned\|recent}` | `{results, total, offset, limit}` (the tray is `unassigned`) |
| GET | `/locations?copy_id=…` | 1–100 unique ids → `{results: [{copy_id, binder_id, binder_name, page, pocket}]}` |
| GET | `/{id}` | Summary + `pockets: [{page, pocket, copy, placed_at}]` |
| PUT | `/{id}` | Non-empty `{name?, cover?}` → summary |
| DELETE | `/{id}` | 204; the copies return to the tray |
| POST | `/{id}/pockets` | `{copy_id}` → `StoreResult` in the **lowest free pocket** (`binder_full` 409) |
| PUT | `/{id}/pockets/{page}/{pocket}` | `{copy_id}` → `StoreResult` (`pocket_occupied` 409, never swaps) |
| DELETE | `/{id}/pockets/{page}/{pocket}?copy_id=` | 204 (`pocket_changed` 409 if another copy is there) |

`BinderSummary` adds `copy_count`, `page_count` and `last_placed_at` to the stored
fields.

`StoreResult` is `{page, pocket, moved_from, binder}`:
- `moved_from` is `null` when the copy came from the tray or was already in that pocket.
- Otherwise it names the previous binder, page and pocket, so the UI can say "Movida
  desde Repetidas a Tesoros · pág. 1 · bolsillo 5".

**Concurrency.** Every write locks the owner's user row first. Concurrent stores
therefore take distinct pockets, a copy moved twice ends up in exactly one pocket, and
an occupied pocket is never overwritten.

**Values** (prices router):
- `GET /api/v1/binders/{id}/value` returns one binder's value.
- `GET /api/v1/prices/binders` returns every binder's value from a single evaluation.

Binder endpoints never call TCGdex or the price service, so outages only hide images and
prices.

## UI

- **Navigation:**
  - Desktop: "Mis carpetas".
  - Mobile tab bar: "Carpetas"; the Explorar menu has the Pokédex and the expansions.
  - `/boxes?mode=personal` redirects to `/binders` (8C.1 removed the "Cajas PC" entries).
- **Shelf (`/binders`):**
  - Each binder shows its Noir cover, name, card count and value in gold (one request).
  - Create, rename, reorder and delete with confirmation.
  - Empty state: "Tu primera carpeta te espera".
  - A chip "N cartas sin carpeta · guardar".
- **Binder (`/binders/:id?page=&pocket=`):**
  - Two pages on desktop, one on phones.
  - 3×3 pocket grids with arrow keys, plus Page Up / Page Down to turn.
  - Pockets show the official card image in a sleeve, the name and the copy price.
  - Pocket names read "Página 2, bolsillo 5: Pikachu · Team Up; Holográfica, Casi
    impecable" and never contain a UUID. If card data fails, the card id is used.
- **Open album (8D Part 1):** two pages side by side with a central spine of three rings
  (one page and rings along the edge on a phone), sleeves at the real 63:88 proportion
  sized to the whole available height (`fitAlbum`, 140 px minimum: a window too short for
  that scrolls vertically instead of shrinking them; width still limits down to 64 px, e.g.
  on phones), tall `‹ ›` icon arrows (with an aria-label) on each side of the album (below it
  on phones), and the "Sin carpeta" tray pinned at the bottom as a horizontal strip (still 30
  cards per page) that folds to a thin bar, folded by default when empty and forced open
  while choosing for a pocket. The header is one line: name · N cartas · gold value, with the
  totals folded into "Detalles" and the "Rates By Exchange Rate API" attribution always
  visible. The keyboard help is for screen readers only. A pocket shows only the card name
  on one line (ellipsis); price, page, pocket and details are in its menu. On a phone, swiping a page
  horizontally (48 px, at least 1.5× more horizontal than vertical; touch and pen only) turns
  it; it never writes anything.
- **Actions in context** (no drag & drop, no side panel). Arrow keys, Home/End and Page
  Up/Down only move focus and the selection; a click, Enter or Space activates:
  - An occupied pocket opens a dialog anchored to it (right of the pocket, else left,
    clamped to the viewport; a modal bottom sheet on a phone) with the card, expansion,
    page, pocket, physical facts and price (or "Precio no disponible"). Escape, "Cerrar" or
    a press outside closes it and gives focus back to the pocket; that press never
    activates the pocket underneath.
  - "Ver carta" opens the copy detail with a validated way back to this pocket.
  - "Mover a otro bolsillo" starts an explicit move mode (banner with Cancel, Escape also
    cancels): only an empty pocket places the card, never an occupied one, and arrows never
    place anything. "Mover a otra carpeta" picks the binder inline and uses the next free pocket.
  - "Sacar de la carpeta" returns the card to the tray, playing the entry in reverse: the
    card slides up out of its sleeve behind the plastic (400 ms) and a clone flies in an arc
    (600 ms) to the tray's first slot, or to its bar when folded. It starts only after the
    server confirms, hides the original, is cancelled by a new action or leaving the page
    (the pocket then empties at once) and is skipped with reduced motion.
  - An empty pocket offers "Elegir de la bandeja"; that second, explicit step enters tray
    choice for that pocket and moves focus to the first tray card.
  - Tapping a tray card stores it in the next free pocket (or in the chosen pocket).
  - Results are announced in a polite status region, and conflicts in an alert.
- **Motion:**
  - Each pocket is a real sleeve: the card (`.pv-pocket__card`) sits behind a see-through
    front plastic (`.pv-pocket__front`, with a marked top edge) that carries the shine. The
    sleeve does not clip, so an arriving card can start above its opening.
  - On store or move, the card moves like a hand carrying it (FLIP): a floating
    `position: fixed` clone, one Web Animations API animation with keyframe offsets, from
    where the user picked it (tray thumbnail, "Choose from the tray" item or source pocket,
    measured at the click, before anything closes, and kept in document coordinates so a
    scroll since then does not move its start) to the sleeve's opening:
    1. **Lift** (150 ms): it rises a little (scale × 1.06) and its shadow grows.
    2. **Flight** (550 ms): a curved path elevated above the straight line in proportion to
       the distance, a slight tilt toward the direction of travel, and a deceleration at
       the end (`cubic-bezier(.22, .61, .36, 1)`). It ends hovering just over the opening,
       in line with the pocket.
    3. **Descent** (150 ms): down to the opening at the real card's size, tilted −2°,
       without shadow: exactly the first frame of the real card's entry (one card height
       above its place, `translateY(-100%) rotate(-2deg)` around its bottom centre).
    4. **Hand-off**: in the same task the clone is removed and the real card shows (a
       synchronous React commit), so no frame has two cards or none.
    5. **Entry** (500 ms, CSS): the real card slides down behind the front plastic,
       decelerating, straightens and settles minimally; then the sleeve shines (300 ms).
       About 1.35 s in total.
  - While it flies the original (the tray thumbnail or the source pocket) is invisible
    (`visibility: hidden`) but keeps its place in the layout, so there is never a second
    card and nothing shifts. The tray drops the stored card at the hand-off and reloads
    when the flight ends.
  - A destination on another page turns the page first (280 ms leaf turn). A destination
    out of view is scrolled into view, and the flight waits until the scroll has stopped
    (Safari's smooth scroll is longer than a fixed wait).
  - A newer action, or leaving the page, cancels the flight: the clone is removed and the
    original is visible again.
  - With `prefers-reduced-motion` there is no flight, drop or turn: the change is direct.
- **Elsewhere:**
  - The copy detail answers "¿Dónde está esta carta?".
  - Home shows "Mis carpetas": a mini shelf of the first six covers (name, card count,
    gold value), each linked to its binder, plus "N cartas sin carpeta · guardar".
  - The scanner success screen links to binders.

## Customization (8D Part 2, migration `0012`)

- **Covers:** `cover` is one of `noir`, `brown_leather`, `metallic`, `holographic`, `white` (closed list, check constraint). The materials are CSS tokens in `styles/tokens.css`; `CoverArt` draws the same cover on the shelf, Home, the editor and (as the outer cover) the open album.
- **Stickers:** table `binder_stickers`, at most 24 per binder, owner-scoped (composite FK, cascade). A sticker is `pokemon` (only the species number 1–1025; the image URL is built client-side from it, PokéAPI official artwork) or `pixel` (`star`, `bolt`, `heart`, `creature`, `circle`: original SVG paths, no files). `x`/`y` are percent of the 3:4 cover, rotation −180..180, scale 0.5–2; list order is the layer order. No URLs are ever stored or accepted.
- **API:** `PUT /binders/{id}/appearance` replaces cover and stickers in one transaction under `lock_owner` (404 for another owner's binder, 422 for anything outside the catalogues, last save wins, no revision). `BinderSummary` now carries `stickers`, fetched in one query for the whole list.
- **Pages:** `binders.page_count` is stored (even, 2–40). `POST /binders/{id}/pages` adds two ("+ Agregar hojas"; 409 `binder_max_pages` at 40); placing a card beyond the stored pages grows them; nothing ever shrinks them, so a page with a card can never be removed.
- **Downgrade `0012`** drops the stickers, sets every cover to `noir` and removes `page_count` (the derived rule applies again); pockets, copies, names and prices are untouched. Back up first: `pg_dump -Fc pokevault -f ~/pokevault-before-0012.dump`.
