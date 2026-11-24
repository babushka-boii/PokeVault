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
- **Actions** (no drag & drop):
  - Tapping a tray card stores it in the next free pocket.
  - "Elegir de la bandeja" stores a card in the selected empty pocket.
  - "Mover" moves to a chosen empty pocket, another binder, or the next free pocket.
  - "Sacar de la carpeta" returns the card to the tray.
  - Results are announced in a polite status region, and conflicts in an alert.
- **Motion:**
  - On store or move, the card flies (FLIP) as a floating `position: fixed` clone, animated
    with the Web Animations API (300 ms) from its tray thumbnail or source pocket to just
    above the destination. Then the pocket plays its 600 ms drop with a bounce and a
    sleeve shine (about 900 ms in total).
  - A destination on another page turns the page first (280 ms leaf turn). A destination
    out of view is scrolled into view before the flight.
  - The clone is always removed, and a newer action cancels a pending arrival.
  - With `prefers-reduced-motion` there is no flight, drop or turn: the change is direct.
- **Elsewhere:**
  - The copy detail answers "¿Dónde está esta carta?".
  - Home shows "Mis carpetas": a mini shelf of the first six covers (name, card count,
    gold value), each linked to its binder, plus "N cartas sin carpeta · guardar".
  - The scanner success screen links to binders.
