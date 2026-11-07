# Iteration 5B — Personal inventory implementation plan

> Execute inline using superpowers:executing-plans and test-driven-development. The user explicitly authorized local implementation after inspection; no commits, pushes or merges.

**Goal:** Persist individual physical TCG card copies for authenticated collectors.
**Architecture:** One SQLAlchemy row per physical copy, referencing the stable TCGdex identifier. Existing session and CSRF dependencies determine ownership. Public card details remain in the existing provider, enriched lazily by the frontend so a provider outage never prevents inventory access or deletion.
**Tech stack:** Existing FastAPI, SQLAlchemy, Alembic, PostgreSQL, React and TypeScript; no new dependencies.
**Spec:** User request and iteration 5B acceptance criteria from the referenced conversation.

## Constraints and decisions

- Work in the existing clean `feat/iteration-5-auth-inventory` checkout as requested.
- Never change private environment files or expose configuration values.
- Store condition (mint/near_mint/excellent/good/played/poor/unknown), physical language (TCG language code), printing variant (normal/holo/reverse/first_edition/other/unknown), optional acquisition date and notes (2000 characters).
- Physical language is distinct from the ES/EN interface and provider text fallback.
- No unique constraint on user/card: duplicate physical copies have separate UUIDs.
- Immutable owner and card ID; PUT replaces editable copy attributes. Bound list pagination (24 default, 100 maximum), exact card/language/condition filters, total copy count and per-card quantities independent of pagination.
- Validate stable IDs through the existing provider on create only; sanitize missing/provider/database errors. GET/PUT/DELETE remain available during provider outages.
- No wishlist, trades, prices or personal boxes.

## Review focus

- Forged owners and another user's UUID: reject extra input and return indistinguishable 404s.
- Expired sessions/CSRF/origin failures: no writes; private responses use no-store.
- Provider failures after inventory is saved: retain copy management with stable-ID fallback.
- Logout, account switch, language switch and obsolete requests: clear private UI and ignore late responses.
- Duplicate submissions, per-copy edits and pagination: retain physical copies, show exact quantities, avoid stale forms.

## Tasks

- [x] 1. Backend: write route tests for CRUD, duplicates, isolation, validation, CSRF, pagination and safe failures; observe red. Add model, reversible `0003` migration, schemas and routes. Reuse session/CSRF, extend CORS/privacy protection. Verify tests green and real PostgreSQL migration/persistence/cascade.
- [x] 2. Frontend: write integration tests against real components and mocked HTTP; observe red. Add typed inventory service, localized copy form, catalog action and `/collection` view with artwork, quantities, filtering, paging, per-copy edits/deletion and explicit confirmation. Verify focused tests and existing auth/catalog suites.
- [x] 3. Docs and completion: update architecture, model, development, README, roadmap, Bitacora and Autoria; run complete quality gate, inspect diff/security boundaries and record exact evidence and pending manual checks. Leave changes uncommitted.


## Execution evidence

- Clean initial HEAD 0b7b2d2 on the requested existing feature branch; no dependency installation or environment edits.
- Backend HTTP tests: observed 17 failures for missing inventory routes, then 17 passes after implementation.
- Initial four frontend interactions: observed failures before feature implementation, then passes. Expanded to eight cases covering pagination, failed save, session/account changes and coordinated editing.
- Independent read-only review: three Important findings (revalidation privacy, parallel draft loss, inconsistent PostgreSQL snapshots). Each reproduced red and corrected; targeted regression tests green.
- Final quality gate: 43 provider tests, 179 backend tests (9 PostgreSQL integration), 240 frontend tests in 23 files; Ruff, ESLint, TypeScript, production build and whitespace checks pass.
- Local development database upgraded additively from 0002 to 0003; no downgrade of development data.
- Manual Google/browser acceptance remains pending because local OAuth configuration is incomplete. No fake development identity was introduced.
- No commits, pushes, merges or private credential changes.
