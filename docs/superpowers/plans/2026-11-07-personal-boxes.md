# Persistent Personal PC Boxes Implementation Plan

> **For agentic workers:** Use test-driven implementation and parallel work within the file boundaries below. The user explicitly authorized proceeding and prohibited commits, pushes, merges, resets and rebases.

**Goal:** Persist authentic physical inventory copies in classic personal PC boxes while preserving the public catalog.

**Architecture:** `PersonalBox` owns 30 possible positions; `BoxMembership` relates an existing `InventoryCopy` to one position. Composite ownership foreign keys, slot/copy uniqueness and checks enforce integrity. Authenticated APIs reuse server sessions and CSRF. Owner-row locking serializes box writes, collisions return 409, and no automatic swap is implemented.

**Tech Stack:** Existing React/TypeScript, FastAPI/Pydantic, SQLAlchemy/PostgreSQL/Alembic; no new dependencies.

**Spec:** User-supplied Iteration 5C request (2026-11-07); docs/INVENTORY.md defines the existing inventory boundary.

## Global constraints

- Work in the prepared `feat/iteration-5c-personal-boxes` branch; no Git history changes.
- Preserve public catalog UI, sprites, audio, localization and inventory identities.
- Never read/output private credentials or mutate the populated development database.
- All downgrade/concurrency/constraint tests run in disposable test schemas.
- No set completion, scanner, pricing, wishlist, trading or deck features.

## Contracts

- `GET /api/v1/boxes`: `{results: BoxSummary[], total}`; at most 100 manual boxes per user. Summary: `id,name,display_order,wallpaper,created_at,updated_at,copy_count`.
- `POST /api/v1/boxes`: `{name,wallpaper?}` -> summary, 201. Names trimmed, 1–80 characters; wallpapers classic/forest/ocean/night.
- `GET /api/v1/boxes/{uuid}` -> summary fields plus `slots: {position,copy: InventoryCopy}[]`, occupied positions only (0–29), ordered by position.
- `PUT /api/v1/boxes/{uuid}`: `{name?,wallpaper?}` -> summary; forbidden extra/empty/null fields.
- `PUT /api/v1/boxes/order`: `{box_ids: UUID[]}` exact full permutation -> list response.
- `DELETE /api/v1/boxes/{uuid}` -> 204, cascades memberships only.
- `PUT /api/v1/boxes/{uuid}/slots/{position}`: `{copy_id: UUID}` -> full destination box; moves an existing placement atomically, same target idempotent, occupied other copy -> 409.
- `DELETE /api/v1/boxes/{uuid}/slots/{position}?copy_id=UUID` -> 204; expected copy prevents removing a replacement occupant (409 mismatch).
- `GET /api/v1/boxes/views/{owned|unassigned|recent}?offset=0&limit=30` -> `{results: InventoryCopy[],total,offset,limit}`. Recent uses acquisition date or added date descending, stable timestamp/UUID tie-breaks. Views never write inventory.
- Private requests use no-store and existing opaque sessions; mutations use existing Origin + CSRF. Missing/foreign resources share 404, invalid data 422, conflicts 409, database unavailable 503.

## Review focus

- Concurrent movement to one slot and movement of one copy to different slots must preserve a single placement.
- Logout/revalidation/account switching must immediately hide private boxes and ignore obsolete responses.
- Duplicate printings must remain identifiable by UUID and physical metadata, including provider failure.
- Multi-species/Trainer/Energy/missing metadata must not fabricate species or generation.
- Stale removal, partial reordering and box deletion must not lose inventory.

## Tasks

### Task 1: Data model and authenticated API

Files: backend/app/db/models.py; migration 0004; backend/app/boxes/schemas.py; backend/app/api/boxes.py; main.py; privacy middleware; backend/tests/test_boxes.py.

- [x] Write and run failing API tests for ownership, CSRF, CRUD, exact reorder, movement, collisions, bounds and derived views.
- [x] Implement model/migration and APIs per contracts, using composite `(user_id,id)` keys for boxes/copies and separate display order/slot positions.
- [x] Run backend tests and Ruff. Integrity failures roll back and return sanitized conflicts.

### Task 2: PostgreSQL integration evidence

Files: backend/tests/integration/test_boxes_postgres.py; safe existing fixture adjustments only if needed.

- [x] Test DB-level ownership/unique/range constraints, box/copy cascades, full capacity and transactional concurrency.
- [x] Upgrade/downgrade 0004 in disposable schemas with surviving 0003 inventory records.
- [x] Test persistence across sessions/application restart and bounded read behavior.

### Task 3: Classic personal PC interface

Files: frontend services/boxes.ts; personal box components/hooks/tests; BoxesPage.tsx catalog wrapper; dictionaries.ts; inventory direct-copy route/link.

- [x] Add failing tests for catalog/personal switching, signed-out state, manual box CRUD/order, 30-position navigation, placement/movement/removal, errors and ES/EN.
- [x] Implement classic grid/left details, metadata adapters, bounded per-printing provider cache, accessible non-drag actions and all persistence APIs.
- [x] Implement owned/unassigned/recent read-only views; generation grouping only from reliable official species associations, with explicit ambiguous/unavailable fallback.
- [x] Add a directly addressable inventory-copy editor using the existing OwnedCopy component.
- [x] Run frontend tests, lint and TypeScript checks.

### Task 4: Integration, review and traceability

- [x] Run baseline/full gate and targeted fixes; independently review security, constraints, UI races and regressions.
- [x] Verify Alembic head and current development revision read-only; never downgrade/delete user data.
- [x] Update ROADMAP, DATA_MODEL, ARCHITECTURE, DEVELOPMENT, UX_UI, INVENTORY, Bitacora and Autoria with exact evidence and manual checklist.
- [x] Run `bash scripts/check.sh` and report exact counts, limitations and migration command. No unsupported browser claims.

## Execution record

Final gate exit 0: 43 provider, 247 backend (42 PostgreSQL), 265 frontend/27 files,
Ruff/ESLint/TypeScript/build/whitespace passed. Independent review found no critical
or important defect. Empty derived header corrected; empty-position picker instructions
aligned; in-flight mutation/account-change regression added. Development inspected
at 0003, additive upgrade applied, read-only current confirms 0004 (head). Browser
evidence is limited to public catalog and pre-migration personal entry/error; full
manual acceptance remains pending. No Git history changes or dependency additions.
