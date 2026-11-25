# Home (Iteration 9A)

The signed-in Home is a personal dashboard. Spec: `docs/superpowers/specs/2026-11-25-home-9a-design.md`;
plan: `docs/superpowers/plans/2026-11-25-home-9a.md`. Migration `0009`.

## Order

1. **Hero:** "Hola, {first name}" beside a fixed 64 px trainer slot (the account picture
   today; Profile fills it later), the collection value in gold, its change against the
   latest record at least seven days old, the counts, the single price note and the scanner.
2. **New-user guide** (only while open): three steps, each crossed out when done.
3. **Tus cartas:** a segmented control (most valuable · favourites · recent) over a drifting carousel.
4. **Mis carpetas:** a bookcase of two dark-wood shelves, three covers each.
5. **Expansiones:** unchanged (derived from the 30 most recent copies).
6. **Valor de tu colección:** the value chart.

Guests see the public hero and links; they make no private requests. Each section owns its
request, skeleton and error, so one outage never blanks the page.

## Value and change

- The change compares the live total with the latest record at least seven days old, in the
  display currency, so it **includes cards added or removed** (a note says so). It is drawn
  with an arrow and a word, never only a colour, and hidden without a baseline, without
  exchange rates, or while the history loads or fails. The percentage is hidden when the old
  total was zero.
- One page note: "Precios de referencia · actualizados hace N h", where N is the age of the
  **least fresh** price used (`prices_updated_at`), next to the "Rates By Exchange Rate API"
  attribution (shown only when a converted amount is on screen).

## Tus cartas

- **Most valuable** reuses the hero's valuation request (`top=12`); **favourites**
  (`/favorites/cards`) and **recent** (`/binders/views/added` plus one `/prices/copies`) are
  fetched when first selected and kept while the page is open.
- Cards show image, name and gold price only (copies link to their detail, favourites to the
  card). Hovering grows and tilts a card through `InteractiveCard`.
- **Drift:** about 28 px/s, continuous, in a seamless loop (the list is rendered twice and the
  offset wraps by exactly one copy; the second copy is `aria-hidden` and `inert`). One
  `requestAnimationFrame` loop moves one scroll offset from elapsed time. It pauses on hover,
  while focus is inside, during touch (resuming 3 s after the finger lifts), while the tab is
  hidden and while off screen; a visible Pause/Resume button keeps the user's choice; the
  ‹ › buttons move one card. It runs only when the cards are wider than the viewport. With
  reduced motion it never starts, and the row scrolls by hand.

## Favourites (per catalog card)

`GET/PUT/DELETE /api/v1/favorites/{card_id}` (idempotent, owner-scoped, CSRF on writes, at most
500, no provider call), `GET /api/v1/favorites/cards`. The ★ (a pressed-state button named
"Favorita") appears on the card detail page and in a pocket's menu; it changes only after the
server confirms. Home reads favourites and the guide on mount, so a change shows when you
return to it.

## Value history

`GET /api/v1/collection/history?range=7d|30d|1y&currency=`. Reading it records today's value
if missing: only a complete valuation (nothing pending or unavailable), only with copies, once
per **Santiago calendar day** (`HOME_TIMEZONE`), never rewritten that day, with both CLP and
USD totals and that day's rates (never returned). The API returns only recorded days. The chart
draws a dot for each and joins consecutive records with a line, **including across days with no
record**; nothing is invented, and the summary and hidden table list only recorded days.

## Guide

`GET/PUT /api/v1/home/guide`. Steps: owns a copy · a copy is in a pocket · has a favourite.
When all three are done (or the user closes it) the server records it and it never returns.

## Migration 0009 (applying it)

Make a backup first, with your own connection data (the session never reads `backend/.env`):

```bash
pg_dump -Fc pokevault -f ~/pokevault-before-0009.dump
cd backend && .venv/bin/alembic upgrade head
.venv/bin/alembic current   # 0009 (head)
```

Going back (`.venv/bin/alembic downgrade 0008`) **drops favourites, the value history and the
guide state**; inventory, binders, pockets and prices are untouched. 8D Part 2's migration is now `0010`.
