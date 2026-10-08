# PokéVault — Preliminary architecture (v0.1)

**Status:** Proposed, not implemented. Technical decisions will be validated incrementally.

## 1. System overview

```text
Browser (React / TypeScript / Vite)
          |
          | HTTPS, JSON REST API
          v
FastAPI (Python)
  |-- Auth and profiles (Google OpenID Connect)
  |-- Reference catalog (species, card printings, sets)
  |-- Inventory and box membership
  |-- Wishlist / trade / purchase-sale ledger
  |-- Decks and completion analytics
  |-- Scanner: image processing + OCR + candidate ranking
          |
          +---- PostgreSQL (durable application records and reference cache)
          +---- Pokémon reference provider (candidate: PokéAPI)
          +---- TCG catalog provider (candidate: TCGdex)
          +---- Market-price source (availability to be validated)
```

Prefer a **modular monolith** over microservices for a single-developer academic project. Deploying frontend and API separately remains possible without adding distributed architecture complexity.

## 2. Proposed stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, shadcn/ui, React Router, TanStack Query, Recharts for charts.
- **Backend:** Python + FastAPI + Pydantic + SQLAlchemy + Alembic.
- **Database:** PostgreSQL for referential integrity, transactional inventory changes and collection queries.
- **Auth:** Google OAuth 2.0 / OpenID Connect for SSO. Prefer a secure HTTP-only server-side session strategy; final mechanism to be defined and reviewed.
- **Language:** checked-in ES/EN translation dictionaries; no automatic translation service.
- **Scanning:** restricted image upload, preprocessing (OpenCV candidate), OCR engine to be selected, extract number/name/set, rank catalog matches, manual confirmation.

## 3. Proposed backend modules

```text
backend/
  app/
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

Module boundaries are conceptual; they will be introduced as functional code arrives.

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

## 6. Proposed API surface (illustrative, unimplemented)

```text
GET    /api/v1/pokemon
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
