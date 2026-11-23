# PokéVault — Card prices design

**Date:** 2026-11-23

**Status:** Approved by the student on 2026-11-23 with the decisions in §12

**Iteration:** 7 — reference prices and collection value

## 1. Purpose

Show an honest **reference market price** for every physical copy the user owns, and
aggregate those prices into collection, profile and personal-box totals. A price is a
reference observation from a named source on a named date. It is never an appraisal,
never adjusted for condition, and never invented when the source has no value for the
exact variant of the copy.

Success means a user can see, for each copy, which source and date produced its price
(or why it has none), see totals in CLP or USD, and keep using the collection normally
when TCGdex or mindicador.cl are unavailable.

## 2. Evidence

`research/prices/tcgdex_sample.json` contains real TCGdex `pricing` objects retrieved on
2026-11-23 (provider `updated` 2026-11-22) for five owned cards in `es` and `en`:
Scorbunny `me02.5-036`, Misdreavus `me02.5-085`, Galarian Zigzagoon `me02.5-130`,
Jamming Tower `me02.5-261` and Cranidos `me05-044`.

Observed facts that shape this design:

- `es` and `en` pricing is identical for every card (same `idProduct`, same values).
  Prices are market references for the printing, **not** language-specific.
- `pricing.cardmarket` (EUR) has base fields (`avg`, `low`, `trend`, `avg1/7/30`) and
  reverse-holo fields with a `-holo` suffix (`trend-holo`, …).
- When a card has no reverse-holo market data, `trend-holo` is `0` while the other
  `-holo` fields are `null` (Scorbunny, Misdreavus, Zigzagoon, Jamming Tower).
  **`0` must be treated as "no price", not as a free card.**
- For a holo-only card (Jamming Tower: `variants.holo = true`, `normal = false`), the
  Cardmarket base fields describe the holo printing (`trend` 0.83 EUR).
- `pricing.tcgplayer` (USD) groups values by finish key: `normal`, `holofoil`,
  `reverse-holofoil`. Keys are present only when TCGplayer has that finish.
- `highPrice` contains absurd outliers (Jamming Tower `holofoil.highPrice` = 4321 USD
  against `marketPrice` 0.66). It is never read or stored.
- Cardmarket and TCGplayer carry separate `updated` timestamps.

No real mindicador.cl response is committed yet; Task 0 of the plan captures one.

## 3. Confirmed product decisions

- **Primary source:** TCGdex `pricing.cardmarket`, value `trend`, EUR (updated daily).
- **Fallback:** TCGdex `pricing.tcgplayer.<finish>.marketPrice`, USD, only when the
  Cardmarket value for that variant is missing.
- Always show the source used and its `updated` date.
- The UI states that prices are equal for Spanish and English cards: they are market
  references, not language-specific.
- Price is chosen by the copy's physical `Variant`; a missing variant price is
  "no price" — never another variant's price.
- `highPrice` is never used.
- No condition adjustment. Labeled "reference price", not appraisal.
- Display currency: CLP by default; the user can switch to USD (stored preference).
- Exchange rates from `https://mindicador.cl/api` (`dolar.valor`, `euro.valor`, in CLP,
  Banco Central de Chile). USD from EUR = `euro.valor / dolar.valor`.
- Cache: prices 24 h, rates 12 h, persisted in migration `0005`.
- If a provider fails: show the last stored value with its date, or "no price". Never
  block the collection.
- Views: card detail, per copy in My collection, profile total + top 5, per personal box.
- All totals are isolated per user. Duplicates add value (each copy is a physical
  object), unlike set-completion percentage.
- ES/EN for all new UI. Backend and frontend tests use no real network; fixtures come
  from the committed sample.

## 4. Scope

### Included

- Normalization of TCGdex `pricing` into a minimal stored snapshot per card printing.
- Pure, deterministic variant → price selection.
- mindicador.cl rate client and conversion EUR/USD → CLP/USD with `Decimal`.
- Persistent caches (migration `0005`) and stale-value fallback.
- User currency preference (CLP/USD) with an authenticated settings endpoint.
- Price APIs: card detail, copy batch, collection valuation, box valuation.
- Frontend: card detail price panel, per-copy price in My collection, profile value
  card with top 5, personal-box total, currency switch, ES/EN copy.

### Excluded

- Price history, charts or trends over time (only the latest snapshot is kept).
- Condition, grading or language adjustments; appraisal claims.
- Acquisition cost, profit/loss, transactions, sales or trades.
- Other sources (direct Cardmarket/TCGplayer APIs, eBay) and API keys.
- Background schedulers or full-catalog price sync; prices refresh on demand only.
- Pricing for `first_edition`, `other` and `unknown` copies (see §6.3 and §12).
- Visual redesign beyond fitting the new elements into existing pages.

## 5. Architecture

New package `backend/app/prices/`:

| Module | Responsibility |
| --- | --- |
| `schemas.py` | Pydantic models: `PriceSnapshot`, `PriceQuote`, `NoPrice`, `ExchangeRates`, API responses |
| `normalize.py` | Pure: raw TCGdex `pricing` + `variants` → `PriceSnapshot` (drops `0`, `null`, negatives, `highPrice`) |
| `selection.py` | Pure: `select_price(snapshot, variant) -> PriceQuote \| NoPrice` |
| `conversion.py` | Pure: `convert(amount, source_currency, target, rates) -> Decimal`, rounding rules |
| `rates.py` | mindicador.cl client with timeout, size cap and validation |
| `store.py` | Read/write snapshots and rates in PostgreSQL; freshness checks |
| `service.py` | `PriceService`: fresh-or-refresh-or-stale logic, bounded refresh, valuation |

TCGdex pricing is fetched through `CardProvider` (new method `card_pricing(card_id)`),
reusing its transport, timeout and five-request semaphore. No second TCGdex client.
Pricing is always requested from the **English** endpoint (canonical structure, §2 shows
identical values).

New routers: `backend/app/api/prices.py` and settings endpoints in `api/auth.py` (or a
new `api/settings.py`). Frontend: `services/prices.ts`, `hooks/usePrices.ts`,
`components/prices/*`, dictionary keys under `prices`.

Existing inventory, box and set-completion code is **not** modified to compute prices.
Price data is fetched by separate requests so a price failure never breaks those pages.

## 6. Price rules

### 6.1 Normalized snapshot

Per card printing (`card_id`), store only selectable values:

| Field | Source | Currency |
| --- | --- | --- |
| `cm_trend` | `cardmarket.trend` | EUR |
| `cm_trend_reverse` | `cardmarket["trend-holo"]` | EUR |
| `cm_updated` | `cardmarket.updated` | — |
| `tp_normal` | `tcgplayer.normal.marketPrice` | USD |
| `tp_holofoil` | `tcgplayer.holofoil.marketPrice` | USD |
| `tp_reverse` | `tcgplayer["reverse-holofoil"].marketPrice` | USD |
| `tp_updated` | `tcgplayer.updated` | — |
| `has_normal`, `has_holo`, `has_reverse` | TCGdex `variants` (nullable when absent) | — |

Values that are `null`, `0`, negative, non-numeric or above a sanity cap (10 000 per
unit, logged as rejected) become `NULL`. A unit other than `EUR`/`USD` respectively
rejects that source. A card with no `pricing` object, or a TCGdex 404, stores a snapshot
with all values `NULL` (status `no_data`) so it is not re-fetched for 24 h.

### 6.2 Variant selection

| Copy variant | Precondition | 1st choice (EUR) | Fallback (USD) |
| --- | --- | --- | --- |
| `normal` | `has_normal` is true | `cm_trend` | `tp_normal` |
| `reverse` | `has_reverse` is true | `cm_trend_reverse` | `tp_reverse` |
| `holo` | `has_holo` true **and** `has_normal` false (holo-only card) | `cm_trend` | `tp_holofoil` |
| `holo` | `has_holo` true and `has_normal` true | — (Cardmarket does not separate holo) | `tp_holofoil`; if missing, no price |
| any | catalog says the variant does not exist | no price, `variant_not_in_catalog` | — |
| any | `variants` missing in TCGdex | Cardmarket skipped | only the TCGplayer key of that finish |
| `first_edition`, `other` | — | no price, `variant_unpriced` | — |
| `unknown` | — | no price, `variant_unknown` | — |

Missing values in both columns → no price, `no_market_data`.

Expected results from the sample (become unit tests):

| Card | Copy variant | Result |
| --- | --- | --- |
| Scorbunny `me02.5-036` | normal | 0.03 EUR, Cardmarket |
| Scorbunny `me02.5-036` | reverse | no price (`trend-holo` = 0, no TCGplayer reverse) |
| Cranidos `me05-044` | normal | 0.03 EUR, Cardmarket |
| Cranidos `me05-044` | reverse | 0.07 EUR, Cardmarket |
| Jamming Tower `me02.5-261` | holo | 0.83 EUR, Cardmarket (holo-only) |
| Jamming Tower `me02.5-261` | normal | no price, `variant_not_in_catalog` |
| Galarian Zigzagoon `me02.5-130` | holo | no price, `variant_not_in_catalog` |
| any card, TCGplayer has 4321 `highPrice` | — | `highPrice` never appears in results |

A synthetic fixture (clearly labeled as derived) covers the USD fallback: Cranidos with
Cardmarket removed → normal 0.19 USD, reverse 0.25 USD; Jamming Tower without Cardmarket
→ holo 0.66 USD.

### 6.3 Why unknown is not priced

`unknown` is the default variant of a new copy. Pricing it with the normal value would
be a guess, which the decisions forbid. The UI shows "Indicate the variant to see a
price" with a link to edit the copy, and totals count these copies as unpriced.

The profile value card shows how many copies have no variant (`variant_unknown`) with a
link to My collection filtered to those copies (`?variant=unknown`). This needs one
additive change outside the price package: an optional `variant` query filter on
`GET /api/v1/inventory` (same pattern as the existing `language`/`condition` filters)
and the matching filter in `CollectionPage`.

## 7. Currency

- Rates: `euro.valor` and `dolar.valor` (CLP per unit) plus their `fecha`.
- Validation: both positive, within sanity bounds (`dolar` 300–3000, `euro` 300–3500
  CLP), otherwise the response is rejected and the previous rates kept.
- Conversion with `Decimal`:
  - EUR → CLP: `amount × euro`; USD → CLP: `amount × dolar`.
  - EUR → USD: `amount × euro / dolar`; USD → USD: unchanged.
- Rounding: only at presentation and on final totals (`ROUND_HALF_EVEN`): CLP to whole
  pesos, USD to cents. Totals are summed from unrounded converted values.
- Every converted value carries the rate date. Original amount and currency are always
  returned alongside (e.g. "$ 29 · 0.03 € Cardmarket").
- With no rates stored at all, converted values are `null` and the UI shows the original
  EUR/USD amount with a "conversion unavailable" notice. Totals are then shown per source
  currency (e.g. "1.20 € + 0.66 US$") instead of a single converted figure.
- Preference: `user_settings.preferred_currency` (`CLP` | `USD`, default `CLP`).
  Signed-out visitors use `localStorage` (default CLP), the same way the ES/EN locale is
  stored. After sign-in the account preference wins and overwrites the local value;
  changing the currency while signed in updates both.

## 8. Caching and failure behavior

- Snapshot is **fresh** if `fetched_at` < 24 h; rates are fresh if < 12 h.
- Stale or missing → refresh attempt. Success replaces the row atomically (upsert).
- Refresh failure (timeout, 5xx, invalid JSON, validation) → keep the old row and return
  it with `stale: true` and its date. No row at all → no price, `source_unavailable`.
- Concurrent refreshes of the same card coalesce (one in-flight request per key).
- Bounded refresh per request: at most **40** card snapshots are refreshed during one
  valuation/batch request. Others use their stale value or are reported as `pending`.
  The UI shows "N prices still updating" and can retry. This bounds latency for large
  collections without a background job.
- Price endpoints never return 5xx because of a provider failure; they degrade per item.
  Database unavailable keeps the existing 503 behavior.

## 9. Data model (migration `0005`)

- `card_price_snapshots`: `card_id` (PK, string 100), fields from §6.1 as
  `NUMERIC(12,2)`, `cm_updated`/`tp_updated` timestamptz nullable, `has_*` booleans
  nullable, `status` (`ok`/`no_data`, checked), `fetched_at` timestamptz not null.
  Shared catalog data, no `user_id`.
- `exchange_rates`: `source` (PK, `mindicador`), `usd_clp`, `eur_clp`
  `NUMERIC(12,4)` positive checks, `observed_on` date, `fetched_at` timestamptz.
- `user_settings.preferred_currency`: `VARCHAR(3)` not null, default `'CLP'`, check
  `IN ('CLP','USD')`.

Downgrade drops both tables and the column. Inventory, boxes and memberships are not
altered. No price is stored per copy: copy price is always derived.

## 10. API contracts

All price responses are `Cache-Control: no-store` when user-scoped. Currency query param
`currency=CLP|USD` (optional; default = user preference, or CLP signed-out).

- `GET /api/v1/prices/cards/{card_id}` (public): per-variant quotes for the printing
  (`normal`, `reverse`, `holo`), each `PriceQuote | NoPrice`, plus `rates` info and the
  language note flag.
- `GET /api/v1/prices/copies?copy_id=…` (auth, max 100 ids): `{results: {copy_id,
  quote | no_price}[]}`. Foreign/missing ids are omitted (same response as nonexistent).
- `GET /api/v1/prices/collection` (auth): `{total, currency, priced_count,
  unpriced_count, unpriced_by_reason, pending_count, stale_count, sources: {cardmarket,
  tcgplayer}, top: CopyQuote[≤5], rates}`.
- `GET /api/v1/boxes/{box_id}/value` (auth): same shape as collection without `top`;
  foreign box → 404.
- `GET /api/v1/inventory?variant=…` (existing endpoint, new optional filter; same
  validation as `Variant`).
- `GET /api/v1/me/settings` / `PUT /api/v1/me/settings` (auth, PUT needs CSRF):
  `{preferred_currency}`; extra fields forbidden.

`PriceQuote`: `amount` (converted, decimal string or null), `currency`, `original_amount`,
`original_currency` (EUR/USD), `source` (`cardmarket`/`tcgplayer`), `metric`
(`trend`/`marketPrice`), `updated_at`, `stale`, `rate_date`. `NoPrice`: `reason` in
`variant_unknown`, `variant_unpriced`, `variant_not_in_catalog`, `no_market_data`,
`source_unavailable`, `pending`.

Top 5 orders by converted amount desc, ties by `copy_id`; duplicates of the same card
may all appear. Totals include every copy of the user, each duplicate counted.

## 11. UI

- **Card detail** (`TcgCardPage`): "Reference price" panel with one row per catalog
  variant, source and date, plus note: "Market reference, same for Spanish and English
  cards. Not an appraisal; condition is not considered."
- **My collection** (`CollectionPage`): price per copy row; prices load after the list
  (skeleton → value / "no price" with reason tooltip). The list never waits for prices.
- **Profile** (`ProfilePage`): collection value card — total, "X of Y copies priced",
  copies without variant (with edit link), pending/stale notices, top 5 most valuable
  copies with links to the copy.
- **Personal boxes** (`PersonalBoxesPage`): box total and priced/unpriced counts.
- **Currency switch** CLP/USD in profile (persisted per account, or in `localStorage`
  when signed out) and reachable from the value card.
- **Copies without variant:** profile shows their count with a link to
  `My collection?variant=unknown`.
- Formatting with `Intl.NumberFormat` (`es-CL` / `en-US`), dates localized. ES/EN keys in
  `dictionaries.ts`. Stale values are labeled with their date, not hidden.
- Accessible: reasons are text, not color-only; works at 390 px.

## 12. Resolved decisions (student, 2026-11-23)

1. `unknown` variant → no price (`variant_unknown`). Profile shows how many copies lack a
   variant, with a link to edit them (§6.3).
2. Holo copy of a card that also has normal → only TCGplayer `holofoil` (USD); if it is
   missing, no price.
3. No exchange rate available → show the original EUR/USD price with a notice (§7).
4. Signed out → CLP/USD stored in `localStorage` like ES/EN; on sign-in the account
   preference wins (§7).
5. Refresh budget of 40 snapshots per request with a `pending` state: accepted (§8).
6. `research/prices/` is committed together with this spec and the plan.

## 13. Testing

- Unit (no network): normalization (0/null/negative/highPrice/unit), the §6.2 table,
  conversion and rounding, rates validation, freshness boundaries (exactly 24 h / 12 h
  with an injected clock).
- Provider tests with `httpx.MockTransport` serving the sample and the derived fixture;
  timeouts, 404, 5xx, oversized body, invalid JSON.
- API tests: auth, CSRF on settings, isolation (another user's copies/boxes never
  counted), duplicates summed, partial failure → stale/pending, no 5xx from providers.
- PostgreSQL: `0005` upgrade/downgrade in disposable schemas, constraints, upsert,
  isolation of totals across users.
- Frontend (Vitest): currency switch, formatting ES/EN, all `NoPrice` reasons, stale
  label, collection renders without prices, profile top 5 and no-variant count/link,
  box total, signed-out `localStorage` currency and account preference winning on
  sign-in, account switch discards private totals.

## 14. Acceptance criteria

1. Every displayed price shows source, metric and date; every missing price shows why.
2. No price is taken from another variant, `highPrice`, or condition guesses.
3. Totals equal the sum of priced copies of the signed-in user only, duplicates included.
4. Collection, boxes and set completion work identically with providers offline.
5. CLP default and USD switch persist per user; conversions match §7.
6. `bash scripts/check.sh` exits 0; migration `0005` upgrades and downgrades cleanly.
7. Docs (DATA_MODEL, ARCHITECTURE, ROADMAP, UX_UI, DEVELOPMENT, new PRICES.md),
   `Bitacora.md` and `Autoria.md` describe only what was implemented.

## 15. Sources

- TCGdex card reference and pricing: https://tcgdex.dev/reference/card
- mindicador.cl API: https://mindicador.cl/api
- `research/prices/tcgdex_sample.json` (retrieved 2026-11-23).
