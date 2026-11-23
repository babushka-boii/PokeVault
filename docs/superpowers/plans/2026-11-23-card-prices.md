# Iteration 7 card prices implementation plan

> **For agentic workers:** Use test-driven development, one task at a time, and an
> independent final review. Implementation starts only after the student approves the
> spec and this plan. No commit or push without the student's explicit request.

**Goal:** Reference price per physical copy (by variant) → CLP/USD conversion →
collection, profile-top-5 and personal-box totals, never blocking the collection.

**Architecture:** New `backend/app/prices/` package. Pure normalization, variant
selection and conversion; persistent 24 h price snapshots and 24 h rates (migration
`0005`); `PriceService` with fresh/refresh/stale logic and a bounded refresh budget.
Separate price APIs so inventory, boxes and set completion are untouched.

**Stack:** Existing Python/FastAPI/SQLAlchemy/Alembic/PostgreSQL and
React/TypeScript/Vite. No new dependencies (`httpx2` already used, `Decimal` from stdlib,
`Intl.NumberFormat` in the browser).

**Spec:** `docs/superpowers/specs/2026-11-23-card-prices-design.md`.

## Audit and constraints

- Branch `feat/iteration-6-card-scanner` (PR to `main` pending, not merged). Iteration 7
  should start on a new branch `feat/iteration-7-card-prices` — from `main` after the
  merge, or from the scanner branch if the student prefers not to wait.
- Migration chain 0001 → 0004 (head). This iteration adds only `0005`.
- Reuse `CardProvider` transport/semaphore for TCGdex pricing; no second TCGdex client.
- Reuse existing sessions, CSRF, `no-store` middleware, ownership patterns (composite
  `(user_id, id)` keys) and 404-for-foreign semantics.
- Never read or output `backend/.env`. No private photos. Tests use only disposable
  PostgreSQL schemas and no real network.
- The Claude session cannot run the macOS `.venv`/`node_modules`: the student runs
  `bash scripts/check.sh` and migrations in Terminal.

## Decisions and alternatives

- **Snapshot table vs in-memory cache:** an in-memory TTL cache would lose the "last
  saved value with its date" after a restart, which the decisions require. A small
  PostgreSQL table is simpler than adding Redis.
- **Normalized columns vs raw JSON:** storing only the five selectable values makes
  `highPrice` impossible to use by accident and keeps the table auditable.
- **On-demand refresh vs scheduler:** no background job exists in the project; a bounded
  per-request refresh (40 snapshots) plus a "pending" state is enough for a personal
  collection and avoids a new process.
- **Conversion in backend:** totals must be exact and consistent across pages; the
  backend converts with `Decimal` and the frontend only formats.
- **ExchangeRate-API vs mindicador.cl:** mindicador.cl timed out from the student's
  network (2026-11-23), so ExchangeRate-API open access (no key) replaces it. Its terms
  require attribution and forbid redistribution, so only converted values and the rate
  date are exposed, with a discreet attribution link. Rates change once a day: 24 h
  cache and a 20-minute retry backoff because a 429 blocks the client for 20 minutes.

## Shared interfaces

- `normalize_pricing(raw: dict | None, variants: dict | None) -> PriceSnapshotData`
- `select_price(snapshot, variant: Variant) -> PriceQuoteRaw | NoPrice`
  (`PriceQuoteRaw`: `amount: Decimal`, `currency: EUR|USD`, `source`, `metric`,
  `updated_at`).
- `convert(amount: Decimal, source: EUR|USD, target: CLP|USD, rates) -> Decimal`;
  `round_for(currency, value) -> Decimal`.
- `CardProvider.card_pricing(card_id) -> RawPricing | None` (English endpoint; `None` on
  404; raises `CardsUnavailable` on transport failure).
- `RatesClient.fetch() -> ExchangeRates` (`usd_clp`, `eur_per_usd`, `updated_at`; raises on invalid/out-of-bounds data; honors the 20-minute backoff).
- `PriceService.quotes_for_cards(card_ids, budget) -> dict[card_id, SnapshotResult]`,
  `value_copies(copies, currency) -> Valuation`, `rates() -> RatesResult`.
- API and response shapes exactly as spec §10.

## Review focus

1. A copy is never priced with another variant's value; `0`/`null` never become prices.
2. Another user's copies or boxes never affect totals, top 5 or batch results.
3. Provider outages: collection/boxes/completion pages still load; stale values carry
   their date; no 5xx from price endpoints due to providers.
4. Decimal math: totals summed before rounding; EUR→CLP uses `CLP / EUR`, EUR→USD uses `1 / EUR`. Rates are never fetched per request.
5. Account switch/logout while prices are loading: private totals discarded, late
   responses ignored (same pattern as the scanner and boxes).

## Tasks

### Task 0: Evidence and fixtures

Files: `research/prices/` (README, samples); `backend/tests/fixtures/prices/`.

- [x] Add a short `research/prices/README.md` (source URLs, retrieval date,
  observations from spec §2). The sample itself is committed with the approved spec.
- [x] mindicador.cl did not respond (2026-11-23); replaced by ExchangeRate-API. Captured
  one real response with `research/prices/capture_exchangerate.py` as
  `research/prices/exchangerate_sample.json` (only `base_code`,
  `time_last_update_utc`, `rates.CLP`, `rates.EUR`).
- [x] Create test fixtures from the samples plus one labeled derived fixture without
  Cardmarket (USD fallback cases).

### Task 1: Pure price rules (no DB, no network)

Files: `backend/app/prices/{__init__,schemas,normalize,selection,conversion}.py`;
`backend/tests/test_price_rules.py`.

- [x] Write failing tests for every row of spec §6.2 and the sample table, `0`/`null`/
  negative/cap/unit handling, `highPrice` never read, missing `variants`.
- [x] Write failing tests for conversion (EUR/USD → CLP/USD), rounding and sum-then-round.
- [x] Implement until green; Ruff clean. (42 tests green; full backend suite without PostgreSQL: 563 passed.)

### Task 2: Migration 0005 and storage

Files: `backend/app/db/models.py`; `backend/migrations/versions/0005_create_prices.py`;
`backend/app/prices/store.py`; `backend/tests/integration/test_prices_postgres.py`.

- [x] Failing PostgreSQL tests: upgrade/downgrade in disposable schemas with existing
  0004 data intact, checks (status, currency, positive rates), upsert, freshness queries.
- [x] Add `CardPriceSnapshot`, `ExchangeRate` models and
  `UserSettings.preferred_currency`; write migration; implement store. (Also SQLite unit tests in `tests/test_price_store.py`; existing `head == 0004` assertions moved to `0005`. Backend suite incl. PostgreSQL: 673 passed.)
- [ ] Student runs `alembic upgrade head` on the development DB only after review.

### Task 3: Provider clients

Files: `backend/app/cards/provider.py` (new `card_pricing`); `backend/app/prices/rates.py`;
`backend/tests/test_price_provider.py`.

- [x] Failing tests with `httpx.MockTransport`: sample payloads, 404 → `None`, 5xx and
  timeout → unavailable, invalid JSON, oversized body (cap 256 KiB), non-HTTPS redirect.
- [x] Failing tests for rates: the real sample, missing fields, out-of-bounds values, 429 (`rate_limited`, exactly one request, no client retries). The 24 h cache and 20-minute backoff are `store.rates_refresh_allowed` (Task 2); the no-extra-request-within-24 h/20 min tests that compose client + store belong to Task 4.
- [ ] Frontend attribution link is covered in Task 6.
- [x] Implement using the existing semaphore and timeouts; English endpoint only.

Notes: no new settings were needed (URL/timeouts are module constants; `RatesClient` and
`CardProvider` accept a transport for tests). `card_pricing` skips the global card lock,
refuses redirects and returns `None` for identifiers that do not match the catalog pattern.
Backend suite incl. PostgreSQL: 732 passed.

### Task 4: Price service and APIs

Files: `backend/app/prices/service.py`; `backend/app/api/prices.py`;
`backend/app/api/inventory.py` (optional `variant` filter); settings endpoint
(`api/auth.py` or new `api/settings.py`); box value route in `api/boxes.py`; `main.py`
wiring; privacy middleware; `backend/tests/test_prices_api.py`.

- [x] Failing tests: fresh/stale/missing paths with injected clock, refresh budget of 40
  and `pending`, coalesced concurrent refresh, provider failure → stale/`source_unavailable`.
- [x] Failing API tests: public card prices, auth on copies/collection/box/settings, CSRF
  on PUT settings, foreign ids omitted, foreign box 404, duplicates summed, top 5 order
  and ties, currency param vs preference, `no-store`, inventory `variant` filter
  (isolation preserved, invalid value 422).
- [x] Implement until green.

Notes (implementation decisions, no spec change in behavior):
- Refresh deadline of 10 s per request: unfinished refreshes keep running in the
  background and serve the next request; the caller gets stale values or `pending`.
- After a TCGdex failure, no refresh is attempted for 60 s (stale values or
  `source_unavailable`), so an outage never means 40 timeouts per request.
- Rates info is reported once per response (`rates.updated_at`), not per quote; the
  rates themselves are never returned (no redistribution).
- Without rates, `top` is empty (EUR and USD amounts are not comparable).
- Private price endpoints re-check the session after provider work (logout/switch).
- Backend suite incl. PostgreSQL: 787 passed.

### Task 5: Isolation and integration evidence

Files: `backend/tests/integration/test_prices_postgres.py`.

- [ ] Two users with overlapping cards: totals, top 5 and box values never mix.
- [ ] Inventory, boxes and set-completion endpoints return identical results with price
  providers failing (regression guard).

### Task 6: Frontend

Files: `frontend/src/services/prices.ts`; `frontend/src/hooks/usePrices.ts`;
`frontend/src/components/prices/*`; `TcgCardPage.tsx`, `CollectionPage.tsx`,
`ProfilePage.tsx`, `PersonalBoxesPage.tsx`; `i18n/dictionaries.ts`; tests next to each.

- [ ] Failing tests first: price panel per variant with source/date/language note; each
  `NoPrice` reason text; stale label; collection list renders before prices; profile
  value card with counts, no-variant count linking to `?variant=unknown`, and top 5
  links; collection `variant` filter; box total; CLP/USD switch persisted via settings,
  `localStorage` when signed out, account preference wins on sign-in; ES/EN formatting; logout/account switch
  discards totals and ignores late responses.
- [ ] Implement with `Intl.NumberFormat`; accessible at desktop and 390 px. Show the discreet "Rates By Exchange Rate API" link (https://www.exchangerate-api.com) wherever converted prices appear; test it is present with converted values and absent with original-only amounts.
- [ ] Vitest, ESLint, TypeScript green.

### Task 7: Review, validation and docs

- [ ] Independent review of the whole diff against Review focus; fix findings with
  regression tests.
- [ ] Student runs `bash scripts/check.sh` (expect exit 0) and `alembic upgrade head`.
- [ ] New `docs/PRICES.md`; update DATA_MODEL, ARCHITECTURE, UX_UI, DEVELOPMENT,
  ROADMAP, `Bitacora.md`, `Autoria.md` with exact evidence and limitations.
- [ ] Manual acceptance on the development Mac: the five sample cards show the expected
  prices from spec §6.2 (values may have moved since 2026-11-22; check source/date),
  CLP/USD switch, profile total and top 5, box total, behavior with network off.

## Execution evidence

_Empty until implementation starts._
