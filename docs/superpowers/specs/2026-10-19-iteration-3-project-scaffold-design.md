# Iteration 3: Executable Project Scaffold

**Date:** 2026-10-19  
**Status:** Approved design  
**Environment:** Arch Linux

## 1. Goal

Create the first executable PokéVault application slice: a React frontend calls a FastAPI health endpoint, and the API verifies a local PostgreSQL connection. The result must be reproducible, tested, responsive, and honest about its limited scope.

This iteration establishes development infrastructure and component boundaries. It does not implement the card catalog, user inventory, classic PC Boxes behavior, or real authentication.

## 2. Scope

### Included

- React, TypeScript, and Vite frontend.
- FastAPI backend with SQLAlchemy and Alembic.
- Local PostgreSQL development database on Arch Linux.
- Frontend-to-API health flow with database status.
- Minimal routes for Home, Boxes, Pokédex, and Profile.
- Checked-in Spanish and English dictionaries with a language selector.
- Responsive shell styled with original CSS and a restrained classic Pokémon-inspired palette.
- Automated tests, linting, type checking, production build, migration verification, and setup documentation.

### Excluded

- Google OpenID Connect or any simulated login.
- Catalog synchronization, inventory, boxes, decks, prices, scanning, and transactions.
- Production deployment and hosted infrastructure.
- Pokémon artwork, sprites, sounds, fonts, or other protected binary assets.
- Full implementation of the logical model in `docs/DATA_MODEL.md`.

## 3. Repository Structure

```text
frontend/
  src/
    app/
    components/
    i18n/
    pages/
    services/
  tests/
  package.json

backend/
  app/
    api/
    core/
    db/
    main.py
  migrations/
  tests/
  requirements.txt
  requirements-dev.txt
  alembic.ini
```

The repository remains a modular monorepo. Frontend and backend have independent dependency manifests and test commands. No workspace orchestrator is introduced in this iteration.

## 4. Runtime Architecture

```text
Browser
  -> Vite/React frontend
  -> HTTP GET /api/v1/health
  -> FastAPI
  -> SQLAlchemy connection check
  -> local PostgreSQL
```

The frontend depends only on PokéVault's API contract, not directly on TCGdex or PokéAPI. The backend owns database access and future provider integration.

## 5. Backend Design

Configuration is loaded from environment variables:

- `APP_ENV`: runtime environment label.
- `DATABASE_URL`: SQLAlchemy PostgreSQL connection URL.
- `CORS_ORIGINS`: comma-separated allowed development origins.

`.env.example` documents safe local values. `.env` remains ignored and no credentials are committed.

`GET /api/v1/health` returns a versioned JSON object containing overall status, API status, database status, and API version. A successful database probe returns HTTP 200. A database connection failure returns HTTP 503 with a stable response schema and no connection string, credentials, traceback, or internal exception text.

The application should start even when PostgreSQL is unavailable so the degraded contract can be inspected. Database access is isolated behind a focused health-check dependency that tests can replace without network or database access.

Alembic owns schema evolution. The initial migration creates only a small technical table sufficient to prove migration and persistence wiring. Domain tables from the logical model are deferred to their functional iterations.

## 6. Frontend Design

The frontend contains four routes:

- Home: system status and iteration scope.
- Boxes: placeholder explaining that classic PC Boxes arrive in iteration 4.
- Pokédex: placeholder for species and card browsing.
- Profile: placeholder for future settings and authentication.

The shared shell includes the PokéVault name, route navigation, and ES/EN selector. Dictionaries are checked into the repository; no translation service is used. The selected locale persists in browser storage and defaults predictably to Spanish when no supported selection exists.

The Home page requests the health endpoint and renders loading, healthy, and degraded/unreachable states. Users can retry a failed request. The API base URL comes from a Vite environment variable documented in `frontend/.env.example`.

Styling uses original CSS only. The visual direction may use red, cream, blue, rounded panels, borders, and compact game-like labels, but no third-party Pokémon assets are bundled. The shell must remain usable on narrow mobile and desktop widths.

## 7. Database and Local Development

PostgreSQL is installed and operated natively on Arch Linux. Docker, Podman, Poetry, and globally installed Python application dependencies are not required.

The backend uses a local `venv` and pip requirements files. PostgreSQL credentials are developer-local. Setup documentation covers package installation, database/user creation, environment files, migrations, backend startup, and frontend startup without embedding real credentials.

SQLite may be used only for isolated unit tests where PostgreSQL-specific behavior is not under test. At least one explicit integration check must run against the configured local PostgreSQL database and prove that migrations and the health query work.

## 8. Error Handling and Security

- Database failures produce HTTP 503 and a stable public message.
- Frontend fetch failures produce a visible state and retry action.
- CORS accepts only configured development origins.
- Secrets and `.env` files remain ignored.
- Logs and API responses never expose `DATABASE_URL` or raw database errors.
- No fake authentication state, hard-coded user, or placeholder token is introduced.

## 9. Testing and Quality Gates

### Frontend

- Vitest and React Testing Library cover shell rendering, route navigation, ES/EN switching, locale persistence, and health loading/healthy/degraded states.
- TypeScript type checking, ESLint, and a Vite production build pass.

### Backend

- pytest covers configuration parsing, health response schemas, successful database checks, and failure sanitization.
- Ruff formatting/lint checks pass.
- Alembic upgrades a configured local PostgreSQL database from an empty schema.

### Repository

- Existing provider-validation tests remain green and offline.
- `git diff --check` reports no whitespace errors.
- No `.env`, credentials, binary assets, or generated dependency directories are committed.

## 10. Documentation and Records

The root README documents prerequisites, setup, startup, testing, and current limitations. `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` are updated from proposed to implemented only for components actually verified. `Bitacora.md` records prompts, problems, evidence, and learning prompts without inventing student reflection. `Autoria.md` records AI assistance and external tools.

Google SSO remains the next security integration after the scaffold is stable. Documentation may define its future boundary but must not claim that authentication exists.

## 11. Acceptance Criteria

1. The frontend and backend start through documented Arch Linux-compatible steps.
2. PostgreSQL accepts the initial Alembic migration.
3. The frontend calls the real `/api/v1/health` endpoint and displays API and database state separately.
4. Healthy and degraded flows are both automated-test covered.
5. Home, Boxes, Pokédex, and Profile routes render through the shared responsive shell.
6. Spanish and English switching works and persists locally.
7. Frontend tests, lint, type checking, and production build pass.
8. Backend tests, Ruff checks, migration verification, and the existing offline provider suite pass.
9. Repository documentation and authorship records accurately describe the implemented scaffold and its exclusions.
10. No authentication claim, secret, protected Pokémon binary asset, or unimplemented domain behavior is introduced.
