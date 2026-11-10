# Personal PC Boxes — Iteration 5C

Catalog Boxes remain public species discovery (#1–1025, 35 groups). My Boxes store
placements of the authenticated user's existing physical `InventoryCopy` records.
They share the classic 6×5 PC layout, original menu-icon adapter, supported CSS
wallpapers, audio preferences and sprite/reduced-motion behavior.

## Persistence and integrity

Alembic `0004` follows `0003`. `personal_boxes` has UUID identity, owner, trimmed
1–80-character name, nonnegative display order, wallpaper and timezone-aware
created/updated timestamps (box metadata/order, not a contents revision).
`(user_id, display_order)` is unique; order may have
gaps after deletion and is independent of slot positions. The API permits at most
100 boxes per owner and reordering supplies the complete owned-box permutation.

`box_memberships` relates a box and position to an existing copy. Its primary key
is `(box_id, position)`, with `position BETWEEN 0 AND 29`; `copy_id` is globally
unique. Composite foreign keys `(user_id,box_id)` and `(user_id,copy_id)` reference
unique `(user_id,id)` keys on their respective parents. A membership can therefore
never join different owners, even through direct SQL. Parent deletion cascades to
memberships. Deleting a box never deletes inventory; deleting a copy cleans its
placement. An unplaced copy needs no membership row. Moving only changes this
relation, retaining the original UUID, printing and physical attributes.

## API

All paths below begin `/api/v1/boxes` and require the existing session cookie.
Mutations additionally require an allowed Origin and `X-CSRF-Token`. There is no
client-writable owner field. Responses, including errors, are no-store/no-cache.

| Method | Path | Payload / response |
| --- | --- | --- |
| GET | (base) | `{results: BoxSummary[], total}` |
| POST | (base) | `{name, wallpaper?}` → summary, 201 |
| GET | `/{box_id}` | Summary plus occupied `slots: [{position, copy}]`, sorted by position |
| PUT | `/{box_id}` | Nonempty `{name?, wallpaper?}` → summary |
| PUT | `/order` | `{box_ids: UUID[]}` exact full permutation → list |
| DELETE | `/{box_id}` | 204; inventory retained |
| PUT | `/{box_id}/slots/{position}` | `{copy_id}` → destination detail; atomically place or move |
| DELETE | `/{box_id}/slots/{position}?copy_id={expected_uuid}` | 204; remove placement only |
| GET | `/views/{owned\|unassigned\|recent}` | `{results, total, offset, limit}` physical-copy page |

Summary fields: `id`, `name`, `display_order`, `wallpaper`, `created_at`, `updated_at`,
`copy_count`. `copy` uses the existing inventory response unchanged. Wallpapers:
`classic`, `forest`, `ocean`, `night`. Slots use zero-based API positions; the UI
labels them 1–30. Derived-view pagination accepts offset 0–1,000,000 and limit 1–100
(default 30); the PC client requests 30.

Invalid payloads/queries return 422; unauthenticated access 401; invalid Origin/CSRF
403; absent and foreign UUIDs both 404; occupied slots, stale removal or the box
limit return 409. Database failures return sanitized 503, integrity violations 409.
Unknown fields and null updates are rejected. Reorder errors do not reveal foreign
box identity. An empty-slot removal is idempotent; an occupied-slot removal requires
the expected copy UUID, preventing removal of a replacement occupant.

Every manual-box mutation locks the owner's user row before checking mutable state.
Different owners remain independent. Writes commit atomically; reordering temporarily
moves order values above the current range before assigning final values, preserving
immediate uniqueness throughout. Occupied destinations never overwrite or swap.
Placing a copy into its current position is idempotent. Concurrent moves of the same
copy serialize: the later successful command determines its sole final location.
No optimistic revision protocol or automatic swapping is provided in 5C.

Box detail and derived page/count reads use PostgreSQL REPEATABLE READ. Lists use
one grouped query, details one bounded join plus the owned-box lookup; neither
performs one inventory query per slot. Box operations never contact providers.

## Interface and derived views

Switch between Catalog Boxes and My Boxes on `/boxes`. Manual boxes support create,
rename, wallpaper selection, earlier/later ordering, deletion confirmation, previous/
next navigation and direct selection. Every position is keyboard-selectable, including
empty ones: arrows, Home and End navigate with roving focus. Select an empty position
and use Place copy here to open the paginated unassigned-copy picker. Select an occupied position to view
its UUID, printing, physical condition/language/variant/date/notes and links to card
details and `/collection/{copy_id}`. Move with the destination-box and position form;
remove placement to retain the copy in inventory. Dragging is not required.

Duplicate printings stay separate. Official multi-species associations show all
associated menu icons, with no invented primary species. Trainer/Energy categories
have accessible category representations. Unknown metadata uses a neutral fallback;
inventory operations still work when providers fail. Public printing metadata is
cached separately from private state, deduplicated by printing and locale, and
fetched only for bounded visible pages. Private inventory/placement data never goes
into browser storage. Session revalidation, logout and account switches unmount
private workspaces and abort obsolete requests.

Read-only smart views derive all owned, unassigned and recent copies. All/unassigned
sort by added timestamp and UUID descending. Recent sorts by acquisition date, falling
back to added date, then added timestamp/UUID; it is a recency ordering rather than a
fixed time window. Views never insert copies or memberships. Optional generation
grouping applies to the currently visible page using official `dex_ids` and National
Dex generation ranges. Cross-generation multi-species cards are explicitly mixed;
unavailable/absent associations are unknown. Trainer/Energy have category groups.
This is not a complete collection-wide generation index or a custom rule builder.

## Manual acceptance

1. Apply the additive migration as described in DEVELOPMENT.md. Start API/frontend
   and sign in with the existing Google configuration.
2. Add two physical copies of the same card from its existing details page. Give
   them different notes/condition. Create two personal boxes.
3. In the first box, place the copies into separate positions. Verify each UUID and
   physical metadata, and open each exact inventory record.
4. Move one copy to the other box, then to another position in that box. Attempt an
   occupied destination: expect a conflict with both copies intact. Test by keyboard.
5. Remove one placement. Verify it is in unassigned copies and still in inventory.
6. Rename, change wallpaper, reorder boxes, reload and verify persistence. Delete an
   occupied box and verify its cards survive in inventory/unassigned.
7. Sign out, sign in again and recover the same configuration. Switch accounts or
   revalidate in another tab: previous private content must disappear immediately.
8. Exercise owned/unassigned/recent views, pagination and generation fallbacks;
   inspect Trainer, Energy and multi-species cards when available in real inventory.
9. Test ES/EN, desktop/390 px, audio/mute, static/animated/reduced motion, focus,
   loading/empty/error/retry states, and all original public catalog controls.

Automated tests use simulated Google/provider boundaries and disposable PostgreSQL
schemas. They do not establish real Google consent, visual acceptance or audio quality.
Final gate evidence and the development migration revision are recorded in DEVELOPMENT.md.
