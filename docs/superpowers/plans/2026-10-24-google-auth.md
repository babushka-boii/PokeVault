# Google authentication implementation plan

> **For agentic workers:** Use test-first implementation and independent review. Do not commit, push, merge, reset, create branches, or modify tool folders.

**Goal:** Implement the supplied Iteration 5A request: real backend Google OIDC and persistent identity, with no inventory implementation.

**Architecture:** Keep the existing modular monolith. FastAPI owns Google authorization code/PKCE/nonce validation, short-lived PostgreSQL authorization transactions, and opaque session cookies. React uses credentialed requests and displays real profile data. No provider token reaches frontend state.

**Tech stack:** Existing Python 3.14/FastAPI/SQLAlchemy/Alembic/PostgreSQL and React/TypeScript; maintained Authlib for OAuth/OIDC.

**Spec:** User attachment, “PokéVault — Iteration 5A: Secure Google Authentication & Persistent User Foundation”.

## Global constraints

- Work exclusively on `feat/iteration-5-auth-inventory`; preserve existing work and `.superpowers/`.
- No commits, pushes, merges, resets, fake accounts, real credentials, or inventory features.
- Preserve public Pokédex/Boxes/search/TCG, audio, sprites and ES/EN.
- Only `openid email profile`; stable Google `sub`, unique DB constraint, internal UUID.
- Single-use, browser-bound state; S256 PKCE; nonce and signature/issuer/audience/expiry validation.
- Digest-only opaque sessions; HttpOnly, SameSite=Lax, Secure in production; expiry, rotation and logout invalidation.
- Exact localhost origins: frontend `http://localhost:5173`, backend `http://localhost:8000`.

## Review focus

- Replay/concurrent callbacks consume a transaction once, including failures; verify with endpoint tests.
- Different browser cannot use a captured state; callback must require bound cookie.
- Invalid signatures and claims never persist a user or session; signed local JWT fixtures exercise real validation.
- Expired sessions and overlapping frontend requests cannot restore stale identities.
- Missing configuration/upstream/DB failures expose only stable sanitized codes.

## Task 1: Backend identity and authentication

**Files:** `backend/app/auth/`, `backend/app/api/auth.py`, `backend/app/db/models.py`, `backend/app/core/config.py`, `backend/app/main.py`, migration `0002`, `backend/requirements.txt`, `backend/tests/test_auth*.py`.

**Interfaces:** Four endpoints at `/api/v1/auth`: GET `/google/login`, GET `/google/callback`, GET `/me`, POST `/logout`. Login responds with a redirect for navigation or `{authorization_url: string}` for `Accept: application/json`. Me returns `{user: {id, display_name, email, email_verified, picture_url}, csrf_token: string}` or 401. Logout uses `X-CSRF-Token` plus exact trusted Origin and returns 204. Callback success redirects to configured frontend `/profile`; failures redirect to `/login?error=<stable_code>`. Fixed redirects only.

- [x] Write and run failing deterministic tests for flow, identity, replay, cookies, configuration and CSRF.
- [x] Implement models/migration, validated configuration, Authlib adapter, auth routes and reusable current-user dependency.
- [x] Run backend suite and Ruff; report actual evidence.

## Task 2: Frontend session and profile

**Files:** `frontend/src/auth/`, `frontend/src/services/auth.ts`, login/profile pages, router/App integration, dictionaries, scoped styles, auth tests.

**Interfaces:** Consume Task 1 contract. Callback error codes: `configuration`, `cancelled`, `invalid_state`, `invalid_token`, `provider_unavailable`, `database_unavailable`. Display unknown errors safely. Never persist credentials.

- [x] Write and run failing tests for loading, authentication, localization, logout, errors and public route access.
- [x] Implement typed service/provider and responsive integrated login/profile.
- [x] Run frontend tests, ESLint, type checking and build.

## Task 3: PostgreSQL evidence and documentation

**Files:** `backend/tests/integration/test_auth_postgres.py`, existing environment examples, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/DEVELOPMENT.md`, `docs/ROADMAP.md`, `docs/UX_UI.md`, `Bitacora.md`, `Autoria.md`.

- [x] Test real PostgreSQL migration reversibility, uniqueness, persistence and referential integrity on dedicated test DB.
- [x] Document exact Google Console setup, local and production cookie strategy, lifecycle and future authorization boundary.
- [x] Obtain independent security/code review; address material findings.
- [x] Run `bash scripts/check.sh`, record exact counts and remaining credential/browser checks.

## Execution record

- Initial branch verified; only pre-existing untracked `.superpowers/`; baseline gate running.
- User explicitly requested direct implementation; no design approval or branch integration steps apply.

- Task 1 complete: backend implementation and independent security review clean after fixes; no commits.
- Task 2 complete: frontend implementation and independent review clean after optional-name regression fix; no commits.
- Task 3 complete: dedicated PostgreSQL checks and documentation; no commits.
- Final full gate exit 0: 43 provider tests, 155 backend tests (all 6 PostgreSQL integration tests), 232 frontend tests in 22 files; Ruff, ESLint, TypeScript, production build and whitespace passed.
- Independent review corrected optional-name handling, optional-picture URL normalization, configuration-error secret representation, exceptional callback query redaction and cookie-path documentation. No unresolved critical/important findings.
- Known manual work: real Google credentials/consent/callback, browser desktop/mobile/cookie verification and production HTTPS/proxy review. No browser connected; no live Google success claimed.
