# Reference prices (Iteration 7)

PokéVault shows a **reference market price** for each physical copy and adds those
prices into collection, profile and binder totals. A price is an observation from
a named source on a named date. It is never an appraisal, never adjusted for condition
and never invented when the source has no value for the copy's exact variant.

Design: `docs/superpowers/specs/2026-11-23-card-prices-design.md`. Plan and execution
evidence: `docs/superpowers/plans/2026-11-23-card-prices.md`. Provider evidence:
`research/prices/`.

## Sources

| What | Source | Notes |
| --- | --- | --- |
| Card price (primary) | TCGdex `pricing.cardmarket`, `trend`, EUR | Updated daily by the provider |
| Card price (fallback) | TCGdex `pricing.tcgplayer.<finish>.marketPrice`, USD | Only when Cardmarket has no value for that variant |
| Exchange rates | ExchangeRate-API open access, `GET https://open.er-api.com/v6/latest/USD` | No key; `rates.CLP` and `rates.EUR` per USD |

- TCGdex prices are identical for `es` and `en`: they describe the printing, not the
  language. Prices are always read from the English endpoint.
- `highPrice` is never read (it contains outliers such as 4321 USD).
- mindicador.cl was the first choice for rates but did not respond on 2026-11-23.
- ExchangeRate-API terms: attribution is required and data must not be redistributed.
  Every view with converted amounts shows "Rates By Exchange Rate API" linking to
  https://www.exchangerate-api.com, and the API only returns converted amounts and the
  rate date, never the rates.

## Variant rules

| Copy variant | Price used |
| --- | --- |
| `normal` | Cardmarket `trend`, else TCGplayer `normal` |
| `reverse` | Cardmarket `trend-holo`, else TCGplayer `reverse-holofoil` |
| `holo`, holo-only card | Cardmarket `trend`, else TCGplayer `holofoil` |
| `holo`, card also has normal | TCGplayer `holofoil` only (Cardmarket does not separate them) |
| variant absent from the catalog | No price (`variant_not_in_catalog`) |
| `unknown` | No price (`variant_unknown`); the profile links to the copies to fix |
| `first_edition`, `other` | No price (`variant_unpriced`) |

`0`, `null`, negative or broken values (above 1 000 000) mean "no price". Values keep
four decimals so sub-cent prices such as 0.004 survive storage.

## Currency

- CLP by default; USD selectable. Signed out, the choice is stored in `localStorage`
  (`pokevault.currency`), like the ES/EN locale. Signed in, it is stored per account
  (`user_settings.preferred_currency`); on sign-in the account preference wins.
- USD → CLP = amount × CLP; EUR → CLP = amount × CLP / EUR; EUR → USD = amount / EUR.
- Decimal arithmetic; CLP rounds to whole pesos and USD to cents (half-even), totals are
  summed before rounding.
- Without any stored rate, amounts stay in EUR/USD with a notice, totals are shown per
  source currency and the top 5 is empty (EUR and USD are not comparable).

## Caching and failures

| Data | Cache | On failure |
| --- | --- | --- |
| Card snapshot | 24 h in `card_price_snapshots` | Last stored value with its date (`stale`), else `source_unavailable` |
| Unknown card (TCGdex 404) | 24 h in memory only, at most 2048 ids | — |
| Exchange rates | 24 h in `exchange_rates` | Last stored rates; no new attempt for 20 min (a 429 blocks for 20 min) |

- At most 40 snapshots are refreshed per request (missing first, then oldest), within a
  10-second deadline. The rest are `pending`; unfinished refreshes keep running and serve
  the next request. After a TCGdex failure, refreshes pause for 60 seconds.
- Inventory, binders and set completion never call the price service. Price endpoints only
  answer 503 when the database itself is unavailable.

## API

| Endpoint | Access | Returns |
| --- | --- | --- |
| `GET /api/v1/prices/cards/{card_id}?currency=` | Public | Price or reason for `normal`, `reverse`, `holo` |
| `GET /api/v1/prices/copies?copy_id=…&currency=` | Session, ≤100 ids | Owned copies only, in request order |
| `GET /api/v1/prices/collection?currency=` | Session | Total, counts by reason/source, stale/pending, top 5 |
| `GET /api/v1/binders/{binder_id}/value?currency=` | Session | Same totals for one owned binder; foreign binder → 404 (8C; replaces the box value) |
| `GET /api/v1/prices/binders?currency=` | Session | Every owned binder's totals from one evaluation (shelf) |
| `GET`/`PUT /api/v1/me/settings` | Session (PUT + CSRF) | `{preferred_currency}` |
| `GET /api/v1/inventory?variant=` | Session | Existing list, new optional filter |

`currency` defaults to the account preference (CLP when signed out). Private responses
are `no-store` and re-check the session after provider work.

## Isolation

Totals, top copies, copy batches and binder values are computed only from the session
owner's copies. Duplicates add value (each is a physical copy), unlike completion
percentage. Snapshots are shared catalog data: two users owning the same printing share
one snapshot and one provider request, never totals. PostgreSQL integration tests cover
this with two users owning the same card.

## Limitations

- No per-card price history (only the user's own daily collection total is recorded, see `docs/HOME.md`), no condition or language adjustment, grading or appraisal.
- Prices refresh on demand; there is no background job. Large collections may show some
  `pending` prices on the first visit.
- Exchange rates are daily references from a free API, not bank or Banco Central rates.
- Manual browser acceptance is listed in `docs/ROADMAP.md`.

## Collection value history (9A)

The Home chart reads `collection_value_days`: one total per user and day, recorded lazily when
the history is read and only from a complete valuation. Each record stores the original EUR and
USD totals, both converted totals and the day's rates for audit. Rates are never returned by the API
(ExchangeRate-API terms), and the attribution stays visible wherever a converted amount is shown.
`GET /prices/collection` also reports `prices_updated_at`, the age of the least fresh price used.
