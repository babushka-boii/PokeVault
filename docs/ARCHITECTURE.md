# PokéVault — Incremental architecture (v0.2)

**Status:** The Iteration 3 scaffold and Iteration 4 initial Pokédex are implemented. Domain modules below remain planned unless explicitly marked as current.

## 1. System overview

```text
Browser (React / TypeScript / Vite)
          |
          | HTTPS, JSON REST API
          v
FastAPI (Python)
  |-- Health API (implemented)
  |-- National Pokédex API / PokéAPI adapter (implemented, default 1–20; bounded pagination)
  |-- Configuration and database session boundary (implemented)
  |-- Auth and profiles (Google OpenID Connect)
  |-- Reference catalog (species, card printings, sets)
  |-- Inventory and box membership
  |-- Wishlist / trade / purchase-sale ledger
  |-- Decks and completion analytics
  |-- Scanner: image processing + OCR + candidate ranking
          |
          +---- PostgreSQL (durable application records and reference cache)
          +---- Pokémon reference provider (PokéAPI, initial runtime integration)
          +---- TCG catalog provider (candidate: TCGdex)
          +---- Market-price source (availability to be validated)
```

Prefer a **modular monolith** over microservices for a single-developer academic project. Deploying frontend and API separately remains possible without adding distributed architecture complexity.

## 2. Stack status

- **Frontend implemented:** React + TypeScript + Vite + React Router, with original CSS and typed ES/EN dictionaries.
- **Frontend implemented:** typed backend Pokédex client, responsive species grid, loading/empty/error/retry and missing-sprite states.
- **Frontend pending:** card/inventory data fetching, component libraries and charts; Tailwind CSS, shadcn/ui, TanStack Query and Recharts are not installed.
- **Backend implemented:** Python + FastAPI + Pydantic Settings + SQLAlchemy + Alembic.
- **Database implemented:** native PostgreSQL connection, health probe and reversible technical migration `0001`; domain tables are pending.
- **Auth:** Google OAuth 2.0 / OpenID Connect for SSO. Prefer a secure HTTP-only server-side session strategy; final mechanism to be defined and reviewed.
- **Language:** checked-in ES/EN translation dictionaries; no automatic translation service.
- **Scanning:** restricted image upload, preprocessing (OpenCV candidate), OCR engine to be selected, extract number/name/set, rank catalog matches, manual confirmation.

## 3. Current and proposed backend modules

```text
backend/
  app/
    api/          # current health route
    core/         # current configuration
    db/           # current health/session/model baseline
    auth/
    users/
    pokemon/
    cards/
    sets/
    inventory/
    boxes/
    wishlist/
    decks/
    transactions/
    prices/
    scanner/
    analytics/
    core/
  tests/
  migrations/
```

`api`, `core`, `db`, and `pokemon` exist today. The `pokemon` module contains response schemas and an isolated PokéAPI adapter. The remaining domain directories are conceptual boundaries for later vertical slices.

## 4. Domain model directions (NOT a final ERD)

| Concept | Purpose |
| --- | --- |
| User / UserSettings | Account identity and personalized preferences, including chosen trainer avatar. |
| PokemonSpecies | National Dex ID, generation, type and sprite metadata. |
| TcgSet | Official TCG expansion and catalog card checklist. |
| CardPrinting | Official printing identified by stable provider ID + set + local card number and variant when needed. |
| CardPokemon | Many-to-many relationship for multiple species per card; Trainer/Energy may have zero species. |
| OwnedCardCopy or InventoryBatch | User-owned cards and condition/price metadata; granularity requires final decision. |
| Box / BoxMembership | User-defined grouping without duplicating inventory; smart rule boxes may be computed. |
| WishlistEntry | Wanted official printing with priority and potential target quantity. |
| Deck / DeckCard | Deck list and card quantity; format validation separate from storage. |
| Transaction | Buy/sell record, per-card quantity and monetary amounts. |
| PriceSnapshot | Provider, date, currency and unit price; nullable missing-price support. |
| ScanAttempt | Optional image recognition metadata, candidate IDs and user confirmation. |

**Key constraint:** inventory copies must be owned by a specific user; a public catalog card is shared across users. Do not infer that all Pokémon TCG cards map to exactly one species.

## 5. External data integration strategy

- Avoid frontend direct dependence on external card providers. The backend exposes a stable internal API and caches reference data appropriately.
- Store source IDs and timestamps so imported rows can be reconciled and refreshed.
- Validate provider coverage: multilingual names, image URLs, set IDs, variants, rarity, Trainer/Energy classifications, pricing and rate limits.
- Plan for fallback when providers are unavailable or price fields are absent; never display fabricated quotes or historical change.
- Prices: track currency **per snapshot**. Any CLP conversion requires timestamped FX data and explicit estimate labeling; defaulting to currency conversion without provenance is not acceptable.

## 6. API surface

Implemented and versioned:

```text
GET    /api/v1/health
GET    /api/v1/pokemon
```

The health endpoint returns HTTP 200 with healthy API/database states or sanitized HTTP 503 while PostgreSQL is unavailable. The Pokédex endpoint returns entries 1–20 independently of PostgreSQL (see `DEVELOPMENT.md` for the contract). Other domain endpoints remain illustrative and unimplemented:

```text
GET    /api/v1/pokemon/{nationalDexNumber}/cards
GET    /api/v1/cards
GET    /api/v1/cards/{cardId}
GET    /api/v1/sets
GET    /api/v1/sets/{setId}
GET    /api/v1/me/cards
POST   /api/v1/me/cards
GET    /api/v1/me/boxes
POST   /api/v1/me/boxes
GET    /api/v1/me/wishlist
POST   /api/v1/scans
GET    /api/v1/me/decks
GET    /api/v1/me/transactions
GET    /api/v1/me/portfolio
```

APIs need response schemas, pagination, auth scopes, mutations and error contracts in a future increment.

## 7. Security and engineering principles

- Validate login tokens/session on backend; authorize every user-scoped mutation.
- Protect browser session against XSS/CSRF depending on chosen session mechanism; secure cookies and HTTPS.
- Reject unsupported/oversized/malicious image uploads; validate MIME and actual file content; strip image metadata where appropriate.
- Database migrations and constrained relations; rollback/error paths for inventory and transactions.
- Automated tests around owned quantity, set completion, role-less user isolation, matching and price coverage.
- Never commit secrets, .env values, personal datasets, private keys, licensed sprites/music, or uploaded user pictures.
- Modular code, English identifiers, linting/formatting and repository instructions as implementation begins.

## 8. Architecture decisions still open

1. Hosted database and storage options appropriate to available academic resources.
2. Per-copy versus batch-based inventory representation; transaction effects on quantity.
3. Modeling automatic rule-based boxes versus manual membership and cross-box views.
4. Provider ID normalization, variants, and ambiguous OCR matches.
5. Actual sound/artwork licensing and whether assets can be bundled or must be user supplied / public-domain alternatives.
6. Price sources and historical series viability; never claim live estimates without proven integration.
7. Google OpenID Connect session design and deployment configuration.

## 9. Iteration 4 runtime catalog boundary

`api/pokemon.py` handles HTTP and a generic HTTP 503 error; `pokemon/provider.py`
handles upstream requests, validation and normalization; `pokemon/schemas.py`
defines the public contract. Default Pokémon IDs 1–20 correspond to the first
20 National Dex entries; this assumption must be revisited before adding forms.
The provider uses the existing HTTPX2 dependency, promoted from development to
runtime, with five concurrent requests, five-second request timeouts and a
15-second total refresh deadline. A lock coalesces concurrent cache refreshes.
Complete successful catalogs are cached in memory for 300 seconds per app/process;
failed or partial refreshes are never cached or returned. No stale fallback is
served after expiry. There is no persistent catalog cache or schema change.

React requests only the internal catalog endpoint. Provider sprite URLs are
loaded remotely by the browser, with a localized fallback on null/broken images;
no sprite binaries are bundled. Species names are canonical PokéAPI names (shared
by ES/EN for this initial range); UI copy and type names use the local dictionaries.
The grid uses semantic lists/headings; existing navigation, language switching
and retry remain keyboard accessible with visible focus. Species detail routes,
TCG browsing and filters are deferred. Catalog-only Boxes behavior is described below.

## 10. PC Storage preview and synthesized audio

The existing Pokémon adapter now accepts bounded offset/limit parameters. The
versioned endpoint preserves its no-query response (first 20) and shape. The
catalog is explicitly bounded to default species IDs 1–1025, with at most 30 per
request and 16 cached pages per process. There are no database changes.

`useCatalogBox` owns request cancellation, page identity, retry and a small memory
cache. `BoxesPage` owns page/selection/wallpaper UI state. Focus movement lives in
`StorageGrid`; `SelectedPokemon`, `PokemonSprite` and `AudioControls` have separate
presentation responsibilities. Wallpaper presets and CSS remain independent of
future owned-card box models. No preview state is presented as ownership.

`RetroAudio` synthesizes original oscillator sweeps with gain envelopes, one voice
at a time and a 75 ms retrigger guard. The hook owns its lifetime, closes its context
on unmount, and persists validated mute/volume preferences with storage failure
fallback. Audio defaults off at 15% volume and is initialized only by a user action.
Unsupported contexts and rejected resume promises become a localized UI status.
Selection, box switching and wallpaper application use different effects. Back and
invalid effects exist in the reusable module but are not connected to absent actions.
No recordings, game assets, new packages, authentication or inventory were added.

## 11. Search locates the original catalog slot

`GET /api/v1/pokemon/search?q=Scraggy&limit=8` returns bounded name/number
suggestions across the supported 1–1025 range. `pokemon/search.py` owns a single
validated species-name index fetched from PokéAPI's paginated species list, cached
for one hour per process and protected by a refresh lock. It does not request
1025 individual resources. Refreshes have a five-second HTTP timeout and ten-second
total deadline; incomplete/failed refreshes are not cached, and errors are sanitized.
Queries are limited to 40 characters and result counts to 1–8. Matching ignores
case, accents and separators; numbers may include `#`. Exact names rank first,
then matches follow National Dex order. Only canonical upstream names are available
in this index: no independent Spanish aliases are fabricated.

`BoxSearch` owns the compact combobox/listbox, 300 ms debounce, abort handling,
loading/empty/error/retry states and Escape/clear behavior. The browser receives
only suggestions. `locatePokemon` computes page=floor((number−1)/30) and
slot=(number−1)%30. Boxes loads the normal page through `useCatalogBox`, selects the
slot and focuses it after loading, leaving all peers visible. Same-page lookup
changes selection without another page fetch. A consumed focus request cannot
steal focus repeatedly. Search does not affect ownership or persistence.

## 12. Menu icons and selected-only details

`services/menuIcons.ts` centralizes menu-only URLs and verified coverage ranges:
Gen V #001–#649 (static/APNG), Gen VII #650–#809 (static), Sword/Shield #810–#898
(static), Scarlet/Violet #899–#1025 (static). Runtime failures follow a menu-only
chain, ending in a neutral placeholder. `MenuIcon` is separate from the large
`PokemonSprite` portrait so a battle sprite cannot silently enter the grid.
`useSpriteMode` owns persistence and live reduced-motion subscription. Frames run
natively in the image decoder, with no per-frame React work. Unchanged icon nodes
survive selection updates. `TypeBadge` independently owns all original type symbols,
geometry and localized labels and is shared by Cajas and Pokédex.

`GET /api/v1/pokemon/{number}?language=es|en` is registered after `/search`; the
existing list/search schemas are unchanged. `PokemonDetailsService` fetches only
the selected Pokémon/species and its distinct ability resources. Height dm and
weight hg convert to m/kg by division by ten. Normal/hidden abilities retain
provider classification. Names choose requested language, then English, then the
canonical species/ability name. Descriptions choose the first nonempty entry in
provider order for the requested language, then English, then null. Whitespace,
newlines and form feeds are normalized. Metadata records the actual language.
No game-recency claim or invented translation/trivia is inferred.

Details have an LRU cache of 128 number/language entries for 300 seconds; validated
ability resources have a 256-entry, 3600-second cache. Refresh locks coalesce work,
upstream concurrency is at most five, each HTTP timeout is five seconds and a
refresh deadline is 15 seconds. Resource identities and references are checked;
errors return sanitized 503 and failed details never enter the cache. This does
not add species/ability requests for every grid slot.

The frontend `pokemonDetails.ts` validates the detail response. `usePokemonDetails`
maintains at most 32 number/language entries for five minutes, aborts obsolete
requests and keys displayed state by selection/language/retry. Late requests cannot
replace a newer selected panel; cached repeated selections avoid duplicate detail
fetches. `SelectedPokemon` renders facts without owning external HTTP integration.
No database model, migration, authentication or inventory change is required.
