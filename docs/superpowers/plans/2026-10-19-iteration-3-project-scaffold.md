# Iteration 3 Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable React–FastAPI–PostgreSQL slice with navigation, ES/EN switching, database-aware health reporting, tests, and Arch Linux setup documentation.

**Architecture:** A Vite React client calls one versioned FastAPI endpoint. FastAPI isolates configuration and database probing behind focused modules, while Alembic owns the initial technical schema. Frontend and backend remain independently testable inside one repository.

**Tech Stack:** React, TypeScript, Vite, React Router, Vitest, React Testing Library, FastAPI, Pydantic Settings, SQLAlchemy, Alembic, psycopg, pytest, Ruff, PostgreSQL.

**Spec:** `docs/superpowers/specs/2026-10-19-iteration-3-project-scaffold-design.md`

## Global Constraints

- Development and documentation commands must be compatible with Arch Linux.
- Use npm for frontend dependencies and a local Python `venv` plus pip requirements files for backend dependencies.
- PostgreSQL is native; do not add Docker, Podman, Poetry, or a monorepo orchestrator.
- Commit `package-lock.json`; never commit `node_modules`, `.venv`, `.env`, credentials, database files, caches, or build output.
- Store no Pokémon artwork, sprite, sound, font, or other protected binary asset.
- Google SSO stays unimplemented; do not introduce a fake user, token, or login state.
- Keep existing provider-validation tests offline and green.
- All application identifiers and code comments are English; visible copy exists in checked-in Spanish and English dictionaries.

## Review Focus

- Missing or malformed `DATABASE_URL`: configuration tests must prove startup/configuration fails with a concise message that does not echo secrets.
- PostgreSQL unavailable after API startup: health tests must prove HTTP 503 with the stable sanitized schema.
- Unsupported persisted locale: frontend tests must prove fallback to Spanish without crashing.
- API response malformed or network request rejected: frontend tests must prove a degraded state and working retry action.
- Direct navigation to every route at narrow widths: router/render tests and the production build must prove the shell does not depend on prior navigation.

---

### Task 1: Backend Configuration and Health Contract

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-dev.txt`
- Create: `backend/pyproject.toml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/app/db/__init__.py`
- Create: `backend/app/db/health.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/health.py`
- Create: `backend/app/main.py`
- Create: `backend/tests/test_config.py`
- Create: `backend/tests/test_health.py`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Settings(app_env: str, database_url: SecretStr, cors_origins: tuple[str, ...])` and cached `get_settings() -> Settings`.
- Produces: `DatabaseHealth(status: Literal["healthy", "unavailable"])` and `check_database(session_factory: Callable[[], ContextManager[Session]]) -> DatabaseHealth`.
- Produces: `HealthResponse(status, api, database, version)` at `GET /api/v1/health`; HTTP 200 when healthy and 503 when unavailable.
- Produces: `create_app(settings: Settings | None = None) -> FastAPI`.

- [ ] **Step 1: Add dependency manifests and ignore rules**

Pin compatible resolved versions in requirements files after installation, configure Ruff and pytest in `pyproject.toml`, document only placeholder local values in `.env.example`, and ignore `.venv`, `.env`, caches, coverage, and generated database artifacts.

- [ ] **Step 2: Install backend dependencies in a local environment**

Run `python -m venv backend/.venv`, then `backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt`.

Expected: dependency installation succeeds on the installed Python version; if a package is incompatible, stop and diagnose before changing Python or dependencies.

- [ ] **Step 3: Write failing configuration tests**

Test exact parsing of `APP_ENV=development` and comma-separated CORS origins. Test a missing/malformed `DATABASE_URL` and assert the error output does not contain a supplied password.

- [ ] **Step 4: Run configuration tests and confirm RED**

Run `backend/.venv/bin/python -m pytest backend/tests/test_config.py -v`.

Expected: import failure because `backend.app.core.config` does not exist.

- [ ] **Step 5: Implement configuration**

Implement the `Settings` and `get_settings` interfaces. Keep the URL secret in representations and normalize origins into an immutable tuple.

- [ ] **Step 6: Write failing health tests**

Assert exact 200/503 schemas, `SELECT 1` execution through an injected session factory, sanitized database exceptions, configured CORS origins, and application construction while the database is unavailable.

- [ ] **Step 7: Run health tests and confirm RED**

Run `backend/.venv/bin/python -m pytest backend/tests/test_health.py -v`.

Expected: import failure for the health modules.

- [ ] **Step 8: Implement the minimal API**

Implement database probing, the response models/router, and `create_app`. Do not connect to PostgreSQL during module import or application construction.

- [ ] **Step 9: Verify Task 1**

Run `backend/.venv/bin/python -m pytest backend/tests -v` and `backend/.venv/bin/python -m ruff check backend`.

Expected: all backend unit tests and Ruff checks pass without PostgreSQL.

- [ ] **Step 10: Commit Task 1**

Run `git add .gitignore backend` and `git commit -m "feat: add database-aware FastAPI health API"`.

---

### Task 2: PostgreSQL and Alembic Integration

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/migrations/env.py`
- Create: `backend/migrations/script.py.mako`
- Create: `backend/migrations/versions/0001_create_app_metadata.py`
- Create: `backend/app/db/base.py`
- Create: `backend/app/db/models.py`
- Create: `backend/tests/integration/test_postgres.py`
- Create: `backend/tests/integration/__init__.py`

**Interfaces:**
- Consumes: Task 1 `Settings`, `get_settings`, and health-check interfaces.
- Produces: SQLAlchemy `Base`, `AppMetadata(id: int, schema_version: str, created_at: datetime)`, and `create_session_factory(database_url: str)`.
- Produces: Alembic revision `0001` with reversible `upgrade()` and `downgrade()`.

- [ ] **Step 1: Install and initialize native PostgreSQL only with user approval**

Use Arch Linux packages and service tooling. Create a dedicated local role and database using values the user places in `backend/.env`; do not capture the password in terminal output or repository files.

- [ ] **Step 2: Write the failing PostgreSQL integration test**

The test requires an explicitly configured integration URL, runs Alembic to `head`, asserts the technical table exists, inserts/reads one `AppMetadata` row in a rolled-back transaction, and asserts the real health probe is healthy. It must skip with a precise reason when the integration URL is absent, never silently fall back to SQLite.

- [ ] **Step 3: Run integration test and confirm RED**

Run `backend/.venv/bin/python -m pytest backend/tests/integration/test_postgres.py -v`.

Expected: failure because Alembic configuration and model do not exist.

- [ ] **Step 4: Implement SQLAlchemy and Alembic wiring**

Add the declarative base, technical model, session factory, environment-driven Alembic configuration, and reversible initial migration. Do not create domain tables.

- [ ] **Step 5: Apply migration and confirm GREEN**

Run `cd backend` followed by `.venv/bin/alembic upgrade head`, then `.venv/bin/python -m pytest tests/integration/test_postgres.py -v`.

Expected: revision `0001` applies and the real PostgreSQL integration test passes.

- [ ] **Step 6: Verify rollback safety**

Against a disposable test database, run Alembic downgrade to `base` and upgrade to `head`; then rerun the integration test.

Expected: both migration directions succeed and the test passes after re-upgrade.

- [ ] **Step 7: Verify Task 2**

Run `backend/.venv/bin/python -m pytest backend/tests -v` and `backend/.venv/bin/python -m ruff check backend`.

Expected: unit and PostgreSQL integration tests pass.

- [ ] **Step 8: Commit Task 2**

Run `git add backend` and `git commit -m "feat: add PostgreSQL migration baseline"`.

---

### Task 3: Responsive Frontend Shell and Localization

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/package-lock.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/eslint.config.js`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/app/App.tsx`
- Create: `frontend/src/app/router.tsx`
- Create: `frontend/src/components/AppShell.tsx`
- Create: `frontend/src/i18n/dictionaries.ts`
- Create: `frontend/src/i18n/LocaleProvider.tsx`
- Create: `frontend/src/pages/HomePage.tsx`
- Create: `frontend/src/pages/BoxesPage.tsx`
- Create: `frontend/src/pages/PokedexPage.tsx`
- Create: `frontend/src/pages/ProfilePage.tsx`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/app/App.test.tsx`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Locale = "es" | "en"`, `useLocale()`, and `LocaleProvider` with local-storage key `pokevault.locale`.
- Produces: browser routes `/`, `/boxes`, `/pokedex`, and `/profile` rendered inside `AppShell`.
- Produces: Vite variable `VITE_API_BASE_URL`, documented in `.env.example`.

- [ ] **Step 1: Create the minimal Vite dependency manifest**

Include React, React DOM, React Router, TypeScript, Vite, Vitest, jsdom, ESLint, and Testing Library only. Install with `npm install --prefix frontend` and commit the generated lockfile.

- [ ] **Step 2: Write failing localization and routing tests**

Test direct render of all four paths, exact ES/EN navigation labels, persistence under `pokevault.locale`, fallback from an unsupported stored value to Spanish, and a semantic mobile navigation landmark.

- [ ] **Step 3: Run tests and confirm RED**

Run `npm test --prefix frontend -- --run`.

Expected: failure because the frontend modules do not exist.

- [ ] **Step 4: Implement dictionaries, provider, routes, and shell**

Keep dictionaries typed against the same keys. Use original CSS with no images or external fonts. Route placeholders must state their deferred iteration accurately.

- [ ] **Step 5: Verify responsive shell**

Run `npm test --prefix frontend -- --run`, `npm run lint --prefix frontend`, `npm run typecheck --prefix frontend`, and `npm run build --prefix frontend`.

Expected: tests, lint, type checking, and production build pass.

- [ ] **Step 6: Commit Task 3**

Run `git add .gitignore frontend` and `git commit -m "feat: add localized responsive app shell"`.

---

### Task 4: Frontend Health Flow

**Files:**
- Create: `frontend/src/services/health.ts`
- Create: `frontend/src/components/SystemStatus.tsx`
- Create: `frontend/src/components/SystemStatus.test.tsx`
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: Task 1 `GET /api/v1/health` schema and Task 3 localization context.
- Produces: `HealthResponse`, `HealthClientError`, and `fetchHealth(signal?: AbortSignal) -> Promise<HealthResponse>`.
- Produces: `SystemStatus` with loading, healthy, degraded/unreachable, and retry states.

- [ ] **Step 1: Write failing client contract tests**

Assert the configured base URL and exact endpoint path, accepted 200 and 503 schemas, rejection of malformed JSON/schema, and a sanitized error that does not render response bodies.

- [ ] **Step 2: Write failing component tests**

Assert loading text, separate API/database labels, healthy rendering, degraded/unreachable rendering, retry invoking a second request, and no state update after unmount/abort.

- [ ] **Step 3: Run focused tests and confirm RED**

Run `npm test --prefix frontend -- --run src/components/SystemStatus.test.tsx`.

Expected: import failure because the health client and component do not exist.

- [ ] **Step 4: Implement the client and status component**

Validate the small runtime response shape before use, support aborting, and expose no provider/database internals beyond the public message.

- [ ] **Step 5: Integrate Home page and verify Task 4**

Run `npm test --prefix frontend -- --run`, `npm run lint --prefix frontend`, `npm run typecheck --prefix frontend`, and `npm run build --prefix frontend`.

Expected: all frontend quality gates pass with both success and failure flows covered.

- [ ] **Step 6: Commit Task 4**

Run `git add frontend` and `git commit -m "feat: show API and database health in frontend"`.

---

### Task 5: End-to-End Development Verification

**Files:**
- Create: `scripts/check.sh`
- Create: `docs/DEVELOPMENT.md`
- Modify: `backend/tests/integration/test_postgres.py`
- Modify: `frontend/.env.example`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: all prior task commands and runtime interfaces.
- Produces: `scripts/check.sh`, a non-interactive repository quality gate that excludes network installation but includes existing provider tests, backend tests/lint, frontend tests/lint/typecheck/build, and whitespace checks.

- [ ] **Step 1: Write the verification script and documentation draft**

Document prerequisites, safe environment setup, PostgreSQL lifecycle, migrations, two development servers, the health URL, tests, and common unavailable-database behavior. The script must use `set -eu` and stop on the first failed gate.

- [ ] **Step 2: Exercise the healthy runtime manually**

Start PostgreSQL, apply migrations, start FastAPI and Vite, request `/api/v1/health`, and confirm the Home status is healthy at desktop and narrow widths. Record commands and results, not screenshots containing secrets.

- [ ] **Step 3: Exercise the degraded runtime manually**

Stop or point away from PostgreSQL, confirm the API remains running, returns sanitized HTTP 503, and the frontend displays a retryable degraded state. Restore PostgreSQL afterward.

- [ ] **Step 4: Run the complete quality gate**

Run `bash scripts/check.sh`.

Expected: provider validation, backend unit/integration tests, Ruff, frontend tests/lint/typecheck/build, and whitespace checks all pass.

- [ ] **Step 5: Commit Task 5**

Run `git add scripts docs/DEVELOPMENT.md backend/.env.example frontend/.env.example backend/tests/integration/test_postgres.py` and `git commit -m "test: verify executable project scaffold"`.

---

### Task 6: Project Records and Final Review

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/ROADMAP.md`
- Modify: `Bitacora.md`
- Modify: `Autoria.md`

**Interfaces:**
- Consumes: verified evidence from Tasks 1–5.
- Produces: accurate setup/status documentation and iteration record; no new runtime interface.

- [ ] **Step 1: Update public project documentation**

Document only the verified scaffold: prerequisites, structure, startup, health endpoint, PostgreSQL migration, ES/EN routes, test command, and explicit exclusions. Change proposed architecture wording only where implementation now exists.

- [ ] **Step 2: Update roadmap, log, and authorship**

Record exact test/build/migration evidence, AI assistance, encountered compatibility decisions, and Google SSO/catalog as pending. Do not invent personal learning reflections.

- [ ] **Step 3: Audit repository contents**

Confirm no `.env`, database credentials, `node_modules`, `.venv`, build output, caches, binaries, or protected Pokémon assets are tracked. Review dependency licenses at the package level without claiming approval for Pokémon assets.

- [ ] **Step 4: Run final verification**

Run `bash scripts/check.sh`, `git diff --check`, and `git status --short`.

Expected: all gates pass and only intended Iteration 3 source, lockfiles, migrations, tests, scripts, and documentation are changed.

- [ ] **Step 5: Commit Task 6**

Run `git add README.md Bitacora.md Autoria.md docs` and `git commit -m "docs: record executable scaffold iteration"`.

## Final Review Gate

- [ ] Map each acceptance criterion in the approved spec to a test, command output, or documentation section.
- [ ] Review the complete branch diff for secrets, generated directories, binaries, fake authentication, unsupported implementation claims, and accidental provider-test regressions.
- [ ] Confirm six implementation commits follow the plan and the branch worktree is clean.
- [ ] Use the verification and code-review skills before integration.
