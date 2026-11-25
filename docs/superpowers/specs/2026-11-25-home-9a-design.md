# PokéVault — Home, final version (9A)

**Date:** 2026-11-25

**Status:** D1–D16 approved by the student on 2026-11-25, with two changes: D10 (a continuous
loop instead of one card per step) and D12 (gaps do not break the chart line). Implementation
is authorized.

**Iteration:** 9A. The student said this is the last pass on the Home page, so every state is
specified here (§9). 8D Part 2 (covers and stickers) stays pending; its migration moves
to `0010` (§8.4).

## 1. Purpose

Make the signed-in Home a personal dashboard, in this order:

1. Greeting + collection value (with its 7-day change) + scanner.
2. "Tus cartas": a carousel with three views (most valuable · favourites · recent).
3. "Mis carpetas": a retro bookshelf.
4. "Expansiones": unchanged.
5. "Valor de tu colección": a value-over-time chart (Profile will reuse it later).

It also adds two features the page needs: **favourite cards** (per catalog card, per user)
and **daily value records** (the chart's only data source). A three-step guide helps new
users. A catalog printing, an owned physical copy and its pocket stay separate concepts.

## 2. Evidence (audited 2026-11-25)

- `git pull --ff-only` on `main`: already up to date at `f255ce7` (PR #8, 8C.1).
  **`origin/main` does not contain 8D Part 1**: `feat/iteration-8d-binder-album` (local tip
  `ce1b45d`) was never pushed. 9A depends on it (the pocket menu gets the ★, and the bookshelf
  reuses its covers), so this plan was written on `feat/iteration-9a-home`, branched from that
  local tip (D1).
- Update 2026-11-25: 8D Part 1 reached `origin/main` (PR #9, merge `84a8c30`), so 9A branches
  from `main` and D1 is moot.
- Home today (`pages/HomePage.tsx`): `ValueHero` (total, chips, reference note, attribution),
  `ScannerCard`, `TopCards` (the valuation's 5 `top` copies with `InteractiveCard` and
  `PriceOrReason`, which prints "Original: EUR…" and "Cardmarket"), `BinderShelf` (≤ 6 covers,
  one grouped value request, unassigned chip), `SetsProgress` (expansions of the 30 most recent
  copies, unchanged in 9A), `SystemStatusFooter`, `EmptyHome` (replaces the data sections when
  the user has no copies), and `GuestHome` (makes no private requests). Sections own their
  requests; the valuation is shared by the hero and the top cards.
- Prices (`app/prices`): `GET /prices/collection` returns `Valuation` (total in the display
  currency, original EUR/USD totals, counts, `top` = 5, `rates`). Snapshots are shared catalog
  data (`card_price_snapshots.fetched_at`). `exchange_rates` keeps **only the latest** rate row.
  Nothing stores history. ExchangeRate-API terms: attribution is required, and rates are never
  redistributed (the API returns converted amounts only).
- Copy views: `GET /binders/views/recent` orders by `coalesce(acquired_on, created_at)`, not by
  the date a copy was added. Home's Expansiones uses it.
- `user_settings` has `display_name`, `trainer_avatar_id`, `favorite_pokemon_id` and
  `preferred_currency`. `users.display_name` is Google's full name. The header `AvatarLink` shows
  the Google picture.
- `InteractiveCard` already does the hover tilt that follows the cursor, the touch tilt and
  reduced motion. `CardArtwork` loads lazily.
- There are no favourite tables or endpoints yet. The latest migration is `0008` (0009 was only
  planned for 8D Part 2). The frontend has no chart dependency, and none is needed (§6.6).

## 3. Approach

Keep the per-section structure: each section owns its request, skeleton and error, so one
outage never blanks the page. Add three small owner-scoped backend resources (favourites,
value history, guide), plus two additive options on existing endpoints. No new runtime
dependency. Alternatives considered:
- **One aggregated `/home` endpoint:** fewer requests, but a price outage would break the whole
  page, and Profile could not reuse its pieces. Not proposed.
- **A cron job for daily records:** more regular, but it adds infrastructure, and the student
  asked for lazy creation. Not proposed.
- **A chart library** (e.g. Recharts): faster to build, but it adds a dependency for one line
  chart. A small SVG component is enough and stays token-styled.

## 4. Page layout and order

Desktop (≥ 1024 px): a hero row (greeting + value on the left, scanner on the right), then
full-width sections in the order of §1. The guide (§6.7), when shown, sits right under the
hero row. Mobile: one column in the same order, with the scanner card after the value.
`SystemStatusFooter` stays last and closed. The page keeps its single `h1` (screen-reader only)
and one `h2` per section.

## 5. Data and API

All new routes: session required, owner-scoped, `Cache-Control: no-store`, Origin + CSRF on
writes, errors sanitized as today, and no other user's data in any query.

### 5.1 Favourites (per catalog card)

- `GET /api/v1/favorites/{card_id}` → `{card_id, favorite: bool}`. Used by the ★ toggles.
- `PUT /api/v1/favorites/{card_id}` → 200 `{card_id, favorite: true}` (idempotent).
- `DELETE /api/v1/favorites/{card_id}` → 200 `{card_id, favorite: false}` (idempotent).
- `GET /api/v1/favorites/cards?currency=&limit=12` →
  `{currency, total, results: [{card_id, favorited_at, price: Quote|null, reason|null}], rates}`,
  newest first. Prices come in one batched snapshot read (no per-card frontend requests).
  Which price a favourite shows is D7.
- `card_id` must match `IDENTIFIER_PATTERN` (the same rule as `/cards/{id}`). It is not checked
  against TCGdex on write: no provider call, and an outage cannot block the ★. An unknown id
  still renders through the existing artwork/name fallback. At most **500** favourites per user
  (409 `favorites_full`).

### 5.2 Daily value records and history

- Table `collection_value_days` (§8.1): one row per user and **calendar day** (D3).
- `GET /api/v1/collection/history?range=7d|30d|1y&currency=CLP|USD` → `{currency, range,
  started_on: date|null, points: [{day, total}], baseline: {day, total}|null}`.
  - **Lazy record:** before reading, if today has no row, it computes the valuation with the
    existing `PriceService.value` and inserts the row with insert-if-absent semantics
    (concurrent tabs cannot create two). The row is stored **only when the valuation is
    complete** (`pending_count == 0`). Otherwise nothing is stored on this request and the next
    load tries again. A partial total would invent a point.
  - Each row stores the original totals (EUR, USD), the counts, and the converted totals in
    **both** CLP and USD using that day's rate, with the rate kept internally for audit. With
    no rate available that day, the converted totals stay null and the day has no point in
    either currency. Rates are never returned.
  - `points` lists only recorded days inside the range whose total exists in the requested
    currency. The API never interpolates or carries forward; the chart joins the real points
    with a line.
  - `baseline` = the latest row dated **≤ today − 7 days** with a total in that currency
    (used for §6.2), else null.
  - `started_on` = the user's first recorded day, or null.
- `GET /prices/collection` gains two additive fields: an optional `top` query (1–20, default 5,
  so Profile is unchanged) and `prices_updated_at` (the **oldest** `fetched_at` among the
  snapshots used for priced copies, i.e. the age of the least fresh price; null if nothing
  is priced).

### 5.3 Recently added copies

`GET /binders/views/added` (a new `View` value): the owner's copies ordered by `created_at desc,
id desc`, with the same paging as the other views. `recent` keeps its order, so Expansiones does
not change (D8).

### 5.4 New-user guide

- `GET /api/v1/home/guide` → `{has_copy, has_stored, has_favorite, dismissed}`, each computed
  with one bounded `exists` query on the owner's data. When all three are true and the guide is
  not dismissed yet, it records `home_guide_dismissed_at` (insert-if-absent semantics), so a
  finished guide never comes back if a step is later undone.
- `PUT /api/v1/home/guide` `{dismissed: true}` → the same shape (the close button). There is
  no way to undismiss in 9A.

## 6. Sections

### 6.1 Greeting

"Hola, {nombre}" / "Hi, {name}". The name is `user_settings.display_name` if set, else the first
word of the Google name. With neither, the greeting is just "Hola" / "Hi". Beside it sits a
fixed **64 × 64 trainer slot** (`.pv-home__trainer`). Today it shows the current `Avatar`
(decorative, since the name is in the text); the Profile iteration replaces its content
without changing the layout. No new request: the data comes from the auth user and the
settings already loaded for the currency.

### 6.2 Collection value

- The total in gold (existing formatting). Under it, the 7-day change when `baseline` exists
  and both totals are numbers: "▲ $12.300 (4,2 %) en 7 días" / "▼ … in 7 days", or "= sin
  cambios en 7 días" when it is zero. Green for up and red for down, using soft tokens (new
  `--pv-up`, `--pv-down`, AA on the panel), always with the arrow **and** the word in the
  accessible name ("subió", "bajó"). Colour never carries the meaning alone. The percentage is
  hidden when the baseline total is 0. The change compares the live total with the baseline,
  so it **includes cards added or removed** in those days. A short note below says so (D5).
- The change is hidden while the history loads, when it fails, or when there is no baseline.
  The total itself never waits for the history.
- The existing chips stay (copies, priced, without variant, pending retry, stale).
- **One page-level price note**, shown once on the page (it moves out of the cards and
  sections): "Precios de referencia · actualizados hace N h" (from `prices_updated_at`: "hace
  menos de 1 h", "hace N h" up to 47 h, then "hace N d"), next to the visible "Rates By Exchange
  Rate API" link whenever a converted amount is on screen.

### 6.3 "Tus cartas" carousel

- **Segmented control** with three options: "Más valiosas · Favoritas · Recientes". It is a
  `tablist` with three `tab`s and arrow-key navigation, controlling one `tabpanel`. The
  default is "Más valiosas". The choice is not persisted.
- Sources (≤ 12 cards each):
  - **Más valiosas:** the shared valuation request with `top=12`, so the hero and this tab
    still share one request.
  - **Favoritas:** `GET /favorites/cards?limit=12`.
  - **Recientes:** `GET /binders/views/added?limit=12` plus one `/prices/copies` batch.
  Each tab fetches only when first selected, and the result is kept while the page is open
  (no duplicate requests when switching back). Metadata goes through `useCardMetadata` (cached,
  4 at a time).
- **Card:** the image, name and gold price only. Copies link to their copy detail; favourites
  link to the card detail. There is no "Original: EUR…", "Cardmarket", variant or date on the
  card. An unpriced card shows "Sin precio" in muted text. Hovering with a fine pointer grows the
  card (scale 1.06) and tilts it with the cursor through `InteractiveCard`. Touch keeps
  `InteractiveCard`'s explicit tilt toggle.
- **Movement (D10, revised):** the carousel scrolls **continuously and slowly, about 28 px per
  second**, in a seamless loop: the track holds the list twice and, when the offset reaches
  the width of one copy, it jumps back by exactly that width (invisible, since both halves are
  identical). The second copy is `aria-hidden`, `inert` and unfocusable, so assistive
  technology and keyboard users see each card once. The loop only runs when the cards are wider
  than the viewport; otherwise nothing moves. It pauses on hover, while focus is inside, during
  a touch or drag, while the tab is hidden and while it is off screen (IntersectionObserver). A
  visible **"Pausar" / "Reanudar"** button (WCAG 2.2.2) keeps the user's choice. The ‹ › buttons
  scroll by one card. On phones the user can also swipe: a touch pauses the drift and, once the
  finger lifts, it resumes from where it is after 3 s. With **reduced motion** there is no
  auto-advance and no Pause button, and the track is a plain scrollable row with the manual
  buttons. The drift is one `requestAnimationFrame` loop that changes one `scrollLeft` from
  elapsed time (no per-frame React state) and never moves focus or announces anything.
- **Empty states:**
  - Más valiosas: "Aún no tienes cartas con precio" plus a link to the collection.
  - Favoritas: "Marca cartas con ★ para verlas aquí".
  - Recientes: "Agrega tu primera carta" plus the scanner link.
  - A tab whose request fails shows its own inline retry. The other tabs keep working.

### 6.4 Favourite ★

- A toggle button with `aria-pressed`, named "Marcar como favorita" / "Quitar de favoritas",
  in two places: the **card detail page** (by the title) and the **pocket menu** of the binder
  (`PocketActions`, 8D), always for the copy's catalog card.
- It changes only after the server confirms, so there is no optimistic star. It is disabled
  while pending. An error keeps the previous state and shows an inline message. Guests do not
  see the button; the card detail shows "Inicia sesión para marcar favoritas" with a link instead.
- A successful toggle updates the Favoritas tab (if it is loaded) and the guide's third step,
  without a reload.

### 6.5 "Mis carpetas" bookshelf

- A retro **bookshelf with two dark-wood shelves**: 3 binders on the top shelf and 3 on the
  bottom (at most 6, in the user's order). It reuses the current `Cover`. Under each cover:
  the name (one line, ellipsis), the card count and the gold value (the existing grouped value
  request). "Ver todas" links to `/binders` when there are more than 6. The unassigned-cards
  chip and "+ Nueva carpeta" stay.
- The shelves are CSS only: new decorative material tokens `--pv-wood-*` in `tokens.css`, with
  a plank edge and soft shadows. They are aria-hidden and not interactive.
- Phone: one shelf with all ≤ 6 covers, scrolling horizontally with snap.
- States: loading (a shelf-shaped skeleton of the same height); no binders ("Crea tu primera
  carpeta" plus a button, with an empty shelf drawn); error (inline retry, other sections
  unaffected); values failing (covers without values).
- Once 8D Part 2 exists, saved covers and stickers show here with no Home change, because the
  Cover component is shared.

### 6.6 "Valor de tu colección" chart

- A reusable `ValueChart` component (Profile will mount it later) in its own section. Range
  buttons (7 d / 30 d / 1 año) form a segmented control. The chart uses the display currency
  (CLP/USD) and `GET /collection/history`.
- A hand-made **SVG**: a gold line (`--pv-gold`) over a subtle grid, y-axis ticks in the
  currency, and day labels on the x-axis. **Every real record is a dot**, and the line joins
  consecutive real records with a straight segment, **including across days with no record**
  (D12, revised). The only points are the recorded ones: no point or value is ever created for a
  missing day. A single recorded point shows as a dot alone.
- **Accessible:** the SVG is `role="img"` with a summary ("Del 18 al 25 de nov: de $120.000 a
  $132.300"), followed by a visually hidden table that lists **only the recorded days** and their
  values. A focusable point list with a tooltip is not needed in 9A.
- States:
  - No records yet: "Empezamos a registrar tu colección el {started_on o hoy}. Vuelve mañana
    para ver el gráfico."
  - Fewer than 2 points in the range: the dot plus the same honest note.
  - Rates unavailable: "Sin tasa de cambio para mostrar el valor en {moneda}".
  - Request error: inline retry.
  - Loading: a skeleton of the same height.
- The currency switch re-fetches. There are no animations beyond a 200 ms line fade, and none
  with reduced motion.

### 6.7 New-user guide

A list of three steps, each a link with a checkbox-like icon and text. The text is
**crossed out** and gets "(hecho)" in its accessible name when done:
1. "Escanea tu primera carta" → `/scanner` (done when the user owns at least 1 copy).
2. "Guárdala en una carpeta" → `/binders` (done when at least 1 copy is in a pocket).
3. "Marca tu favorita ★" → `/collection` (done when the user has at least 1 favourite).

The guide also has a "Cerrar guía" button (PUT). It shows only while `dismissed` is false.
It disappears when all three are done (the server records it, §5.4) or when closed. While it
loads, nothing is shown (no skeleton for an optional element). On error it is hidden
silently, since it is not essential.

## 7. Performance and accessibility

- Requests are deduplicated: the valuation is shared (hero + Más valiosas), tabs fetch on first
  use, the history is one request per range and currency, and favourite ★ states are one small
  GET per mounted toggle. The bookshelf keeps its single grouped value request. No section
  requests binder details per binder.
- Images stay lazy (`CardArtwork`). The carousel renders ≤ 12 items. Skeletons keep the
  loaded dimensions, so nothing shifts when data arrives.
- ES/EN for every string, including numbers and dates through the existing locale formatters.
  There is no UUID in visible text, accessible names, alt/title or live regions (anti-UUID
  tests per section).
- Keyboard: tabs, carousel buttons, Pause, ★, range buttons and guide links are all reachable
  with a visible focus. Auto-advance pauses while focus is inside. Touch targets are ≥ 44 × 44.
- Reduced motion: no auto-advance, hover growth or chart fade. `InteractiveCard` keeps its
  existing reduced-motion behaviour.
- Colours come only from `tokens.css`. The new tokens (`--pv-up`, `--pv-down`, `--pv-wood-*`)
  are checked by the style contract: AA for `--pv-up`/`--pv-down` text on panels, and the wood
  tokens are decorative only.

## 8. Migration `0009_home_favorites_history` (reversible)

### 8.1 Tables and columns

- `card_favorites`:
  - Columns: `user_id` UUID (FK `users.id` ON DELETE CASCADE), `card_id` String(100) (CHECK on
    length 1–100), `created_at` timestamptz not null.
  - PK `(user_id, card_id)`, index `(user_id, created_at desc)`.
- `collection_value_days`:
  - Keys: `user_id` (FK CASCADE) and `day` (date), PK `(user_id, day)`.
  - Original totals: `eur_total` and `usd_original_total`, Numeric(14,2) not null, ≥ 0.
  - Converted totals: `clp_total` Numeric(16,0) and `usd_total` Numeric(14,2), both nullable.
  - Rates: `usd_clp` and `eur_per_usd`, Numeric(14,6), both nullable.
  - Counts: `copy_count` and `priced_count`, integers ≥ 0, with `priced_count ≤ copy_count`.
  - `created_at` timestamptz.
  - CHECK all-or-none: the rates and the converted totals are either all null or all present
    and positive/non-negative.
- `user_settings.home_guide_dismissed_at` timestamptz null. The settings row is created on
  demand with the existing defaults, as the currency setting does today.

### 8.2 Upgrade and downgrade

- Upgrade only adds; no existing data changes.
- Downgrade drops both tables and the column. **This loses favourites, value history and the
  guide state.** It never touches inventory, binders, pockets or prices. Both directions work
  on PostgreSQL and SQLite.

### 8.3 Tests

- SQLite and PostgreSQL (disposable schema) tests with **two users**:
  - Isolation on every route (GET/PUT/DELETE favourites, favourite cards, history, guide).
  - A foreign or unknown id returns no data from the other user.
  - Cascade on user delete.
- Edge cases:
  - Concurrent first loads create one daily row.
  - A pending valuation creates no row.
  - Day boundaries in the configured timezone.
  - The 500-favourite limit.
  - Migration 0008 → 0009 → 0008 keeps inventory, binders and pockets intact.

### 8.4 8D Part 2 renumbered

8D Part 2's migration becomes **`0010_binder_appearance`** (down revision `0009`), and its plan
and spec are updated. 9A is expected to merge first. If 8D Part 2 were ever implemented first,
the two numbers swap, and the plans must be updated before writing either migration.

## 9. States (complete matrix)

| State | Greeting + value | Scanner | Guide | Tus cartas | Mis carpetas | Expansiones | Chart |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Guest | Public hero as today (sign-in button), no private request | shown | hidden | hidden | hidden | public link panel (as today) | hidden |
| Resolving session | skeleton | skeleton | — | — | — | — | — |
| Loading (signed in) | name + value skeleton | shown | hidden until loaded | card skeletons ×5 | shelf skeleton | bars skeleton | chart-height skeleton |
| Empty collection | greeting + "$0" + "Agrega tu primera carta" | prominent | shown (step 1 open) | Más valiosas/Recientes empty states; Favoritas may have cards | own state (binders may exist) | "Aún sin expansiones" | "Empezamos a registrar…" |
| No favourites | — | — | step 3 open | Favoritas empty state | — | — | — |
| No binders | — | — | step 2 open | — | empty shelf + create | — | — |
| Prices down | total → "Precios no disponibles" + retry; no change line | shown | works | cards without prices ("Sin precio") | covers without values | works | error/retry, or recorded history still shown |
| Rates down | original totals + "conversion unavailable" (existing) | shown | works | prices shown as unavailable in the currency | as today | works | "Sin tasa de cambio…" |
| TCGdex down | works | shown | works | names fall back to catalog id, artwork placeholder | works | existing error | works |
| One section's request fails | inline retry only in that section; the rest keeps working | | | | | | |

The empty collection no longer replaces the whole page with `EmptyHome`: the sections render
their own empty states, so the guide and the shelf are useful from the first visit.

## 10. Testing (acceptance)

- Backend (SQLite and PostgreSQL):
  - Favourites: CRUD, idempotency, limit, validation.
  - Favourite cards: price choice and batching (one snapshot read).
  - History: lazy record, pending → none, concurrency, timezone, ranges, baseline,
    no-rate days, never-invented points.
  - `top` bounds, `prices_updated_at`, the `added` view order, the guide (auto-dismiss,
    close).
  - Two-user isolation on every route, and the migration round trip.
- Frontend (Vitest):
  - Section order and every state in §9.
  - Greeting name rules.
  - Change line (up, down, zero, hidden, accessible words).
  - One page-level price note with the attribution.
  - Tabs (keyboard, lazy fetch, cache).
  - Carousel (the drift advances about 28 px/s with a fake clock, the seamless wrap, the
    duplicate hidden from assistive technology, pause on hover/focus/touch/button/hidden
    tab, reduced motion → no loop, manual buttons).
  - Sober card (no "Original"/"Cardmarket"), ★ after confirmation (pending, error).
  - Bookshelf (≤ 6, two shelves, "Ver todas"), chart (gaps break the line, the single-point
    and empty notes, the summary and table), the guide (strike-through, close, hidden when
    complete).
  - Anti-UUID per section, ES/EN, no duplicate requests (count calls), the style contract for
    the new tokens.
- jsdom is not layout evidence: geometry, motion and the chart's look are checked in Safari
  (§11).

## 11. Safari checklist (after implementation)

At http://localhost:5173/:
- [ ] Order: greeting/value/scanner → Tus cartas → Mis carpetas → Expansiones → chart.
- [ ] "Hola, {nombre}" with the avatar in the trainer slot. The value is in gold. The 7-day
  change appears only after 7 days of records, and reads as an arrow plus a word.
- [ ] One "Precios de referencia · actualizados hace N h" note and the attribution link.
- [ ] Carousel:
  - It drifts slowly and continuously, loops without a visible cut, and pauses on hover,
    focus and the button.
  - Hover grows and tilts a card.
  - It swipes on a phone.
  - It stays still with "reducir movimiento".
  - Cards show only image, name and price.
- [ ] ★ on a card detail page and in a pocket menu. The Favoritas tab and guide step 3 follow.
- [ ] Bookshelf: two wooden shelves, 3 + 3; one shelf that scrolls on a phone; "Ver todas"
  with more than 6 binders.
- [ ] Chart: the empty note on the first day; after records, a gold line with a dot per
  record, 7 d / 30 d / 1 año, CLP/USD; days without a record are joined by the line.
- [ ] Guide: steps get crossed out; closing it keeps it closed after a reload.
- [ ] Guest, empty account, prices offline and TCGdex offline all keep the page usable.
- [ ] VoiceOver and keyboard only.

## 12. Decisions for approval

| # | Proposal | Alternative / consequence |
| --- | --- | --- |
| D1 | Plan and implement 9A on `feat/iteration-9a-home`, stacked on the local 8D Part 1 branch (unpushed; `origin/main` lacks it). Push/merge 8D first if possible. | Branch from `main`: the ★ in the pocket menu and the bookshelf would target code that is not there |
| D2 | Name = settings display name, else the first word of the Google name, else just "Hola" | The full Google name (long) |
| D3 | A "day" is the calendar day in `America/Santiago` (config `HOME_TIMEZONE`) | UTC: days would change at 21:00/20:00 in Chile |
| D4 | Daily record: lazily on the history GET, only with a complete valuation, first complete one of the day, never updated that day; CLP and USD stored with that day's rate | Last-of-day upsert (more accurate "today", rewrites history); a cron job |
| D5 | The 7-day change = the live total minus the latest record ≥ 7 days old, in the display currency; it includes added/removed cards, with a note | Market-only change (needs per-copy history: much larger) |
| D6 | Favourites per catalog card, validated id format only, max 500, ★ after server confirmation | A provider check on write (outages block the ★); optimistic UI |
| D7 | A favourite's price: the highest-valued owned copy's quote if owned, else the first priced of normal → holo → reverse | Always the cheapest/most common variant; no price on favourites |
| D8 | Recientes = a new `added` view by creation date; `recent` (Expansiones) unchanged | Change `recent` itself (Expansiones' order shifts) |
| D9 | Más valiosas = valuation `top=12` (default stays 5 for Profile) | A separate endpoint (duplicate valuation work) |
| D10 | **Revised:** continuous slow drift (~28 px/s) in a seamless loop (duplicated list); pauses on hover/focus/touch/hidden/off screen; visible Pausar/Reanudar; reduced motion = no autoplay | One card every 5 s |
| D11 | Guide steps = owns a copy · a copy in a pocket · a favourite exists; completion and closing are stored per user; it does not come back | Literal "used the scanner" (needs scan history, which is not stored) |
| D12 | **Revised:** an SVG chart without a dependency; the line joins real records across gaps and each record is a dot; summary + hidden table list only recorded days | Recharts or similar (new dependency) |
| D13 | Bookshelf: 2 shelves × 3, name/count/gold value under covers, wood as decorative tokens | Spine-only books (names harder to read) |
| D14 | "actualizados hace N h" = the oldest price used (worst case) | The newest (looks fresher than it is) |
| D15 | Migration 0009 = favourites + daily records + guide column; downgrade loses them; 8D Part 2 → 0010 | Two migrations (more steps for the student) |
| D16 | The empty collection renders sections with their own empty states instead of `EmptyHome` | Keep `EmptyHome` (the guide and shelf are hidden for new users) |
