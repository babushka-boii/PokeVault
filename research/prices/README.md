# Price evidence (Iteration 7)

Evidence for `docs/superpowers/specs/2026-11-23-card-prices-design.md`. Public catalog
prices only; no user data.

| File | What it is |
| --- | --- |
| `tcgdex_sample.json` | Real TCGdex `pricing` + `variants` for 5 cards in `es` and `en`, retrieved 2026-11-23 (provider `updated` 2026-11-22). |
| `exchangerate_sample.json` | Real ExchangeRate-API open-access response reduced to `base_code`, `time_last_update_utc`, `rates.CLP`, `rates.EUR` (captured 2026-11-23). |
| `capture_exchangerate.py` | Stdlib script that captures that minimal response. Run it rarely: the endpoint updates once a day and a 429 blocks the client for 20 minutes. |

## Observations (from `tcgdex_sample.json`)

- `es` and `en` pricing is identical: prices are market references, not language-specific.
- Cardmarket (EUR) base fields describe the normal printing, or the holo printing when the
  card only exists in holo; `-holo` fields describe reverse holo.
- `trend-holo` is `0` (not `null`) when no reverse-holo data exists: treat `0` as no price.
- TCGplayer (USD) groups by finish: `normal`, `holofoil`, `reverse-holofoil`.
- `highPrice` has absurd outliers (4321 USD for Jamming Tower): never use it.
- Cardmarket and TCGplayer have separate `updated` timestamps.

Test fixtures derived from these files live in `backend/tests/fixtures/prices/`.

## Exchange-rate source

- **mindicador.cl failed (2026-11-23):** `https://mindicador.cl/api` did not answer from
  the student's network (`curl`: 0 bytes after 60 s) nor from the Claude session
  (timeout after 15 s). It was dropped; no sample of it exists.
- **Chosen source:** ExchangeRate-API open access, `GET https://open.er-api.com/v6/latest/USD`,
  no API key. `rates.CLP` = CLP per USD, `rates.EUR` = EUR per USD; EUR → CLP is
  `CLP / EUR`. Rate date = `time_last_update_utc`. Sample: CLP 1016.589577, EUR 0.911134
  (updated Mon, 23 Nov 2026 00:02:32 +0000), so 1 EUR ≈ 1115.7 CLP.
- **Terms** (https://www.exchangerate-api.com/terms): attribution is required (link
  "Rates By Exchange Rate API" to https://www.exchangerate-api.com in views with converted
  prices) and the data must not be redistributed (PokéVault shows only converted values).
- **Rate limits:** data refreshes once a day; a 429 blocks the client for 20 minutes, so
  PokéVault caches rates 24 h and never requests them per user request.
