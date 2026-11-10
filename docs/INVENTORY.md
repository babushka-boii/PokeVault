# Personal TCG inventory — Iteration 5B

Each record represents one physical card, owned by the authenticated internal user.
The same stable TCGdex card ID may appear many times with independent properties.
Catalog Boxes remain public species discovery. Iteration 5C adds separate My Boxes
for placements of these same physical records; see [BOXES.md](BOXES.md).

## API contract

| Method | Route | Result |
| --- | --- | --- |
| GET | /api/v1/inventory | Filtered/paginated copies, total and per-card quantities |
| POST | /api/v1/inventory | Create a physical copy, 201 |
| GET | /api/v1/inventory/{uuid} | Read your copy |
| PUT | /api/v1/inventory/{uuid} | Replace editable attributes |
| DELETE | /api/v1/inventory/{uuid} | Delete your copy, 204 |

All endpoints require the existing opaque session cookie. Mutations additionally
require an allowed Origin and the current X-CSRF-Token from auth/me. Ownership is
never accepted from request data. Missing/foreign UUIDs both return 404. Inventory
responses are no-store; expired sessions return 401; invalid CSRF returns 403;
invalid payload/query parameters return 422; database failures return a sanitized 503.

POST requires card_id and accepts condition, language, variant, acquired_on and notes.
Editable defaults are unknown / en / unknown / null / empty string, respectively.
PUT replaces all editable attributes, using those same defaults for omitted fields;
card_id and user_id are forbidden. Notes allow 2000 characters; dates must be valid
YYYY-MM-DD calendar dates. Enumerations are in DATA_MODEL.md. Creation verifies the
identifier with TCGdex: missing cards return 404 and provider failure returns 503.
Physical attributes are collector-supplied, not assertions that the provider has
verified that finish/language combination. Use unknown/other when appropriate.

GET query parameters: offset 0–1,000,000 (default 0), limit 1–100 (default 24), and
optional exact card_id, condition and physical language. Ordering is newest created
first with UUID tie-breaker. Response fields: results, total, quantities (card ID to
copy count across the entire filtered collection), offset and limit. Quantities are
independent of the page limit; PostgreSQL reads them and page rows from one snapshot.
Concurrent changes become visible on the next fetch. Edits use last-write-wins;
optimistic conflict resolution across separate tabs is not implemented.

## Frontend

The `/collection` navigation entry requires sign-in to show private data. Add a copy
from `/cards/:id`, then manage each physical copy separately. Filter by exact stable
card ID, condition or physical language. One editor/confirmation is active at a time;
other writes, filters and page controls remain disabled until save/cancel. Deletion
requires explicit confirmation. Successful writes refetch persisted state; removing
or editing on a later page returns to the first page to avoid an empty trailing page.

Only public card data comes from TCGdex. Card artwork and text can use another
verified language of the same printing; the UI explicitly separates that from your
copy's physical language/finish. Provider errors show stable IDs and retry while
keeping edit/delete available. No private inventory is stored in browser storage.
Logout, session revalidation and account switching hide private content and abort
obsolete requests. Revalidation may close an unsaved form to protect account privacy.

## Manual acceptance

1. Configure ignored local OAuth variables using AUTHENTICATION.md; never paste
   credentials into chat or commit them. Apply 0003 and start both servers.
2. Sign in with Google. Browse a real TCG card, add two copies with different
   condition/language/variant/date/notes, and open My collection.
3. Check quantities and individual copies. Edit one, cancel a deletion, then confirm
   deletion of the other. Change ES/EN and test filters and pagination.
4. Reload, sign out and sign in again: the same surviving copy must retain its UUID
   and attributes. A different Google account must see only its own collection.
5. Simulate TCGdex failure after saving: inventory remains manageable by stable ID.
   Simulate DB failure: show translated errors without exposing connection details.
6. At desktop and 390 px, inspect artwork proportions, keyboard/focus, touch controls,
   overflow, loading/empty/error states and public catalog/Boxes/Pokédex regression.
7. Switch accounts or log out in another tab, return, and confirm private data is
   hidden during revalidation. Confirm no private inventory in localStorage.

Automated tests mock only provider boundaries. PostgreSQL tests exercise migration
reversal, foreign keys/checks/cascade, concurrent insertion snapshots and inventory
survival across real application sessions/restarts with simulated Google identity.
This evidence does not establish live Google login or visual browser acceptance.

## Iteration 5C integration

`/collection/:copyId` opens an exact physical record and reuses the existing edit/
delete form, even during provider failure. Personal PC slots link to this route and
the existing printing details. Moving/removing a placement never changes a copy's
UUID or attributes. Deleting inventory cascades its optional placement; deleting a
manual box removes placements while retaining every copy. Counts and smart views
remain derived from the original `inventory_copies` table.
