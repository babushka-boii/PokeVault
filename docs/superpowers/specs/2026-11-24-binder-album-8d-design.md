# PokéVault — Binder album, covers and stickers (8D)

**Date:** 2026-11-24

**Status:** D1–D7 approved by the student on 2026-11-24. Implementation is
currently authorized for Part 1 only. Part 2 and migration 0011 require separate
approval after the Part 1 Safari checkpoint.

**Iteration:** 8D, following merged 8C and 8C.1.

## 1. Purpose

Make a binder feel like an open physical album: a horizontal spread, contextual
pocket actions, a bottom tray, and personalized covers. Keep the working physical-copy
placement and hand-to-sleeve motion. A catalog printing, an owned physical copy and
its pocket remain separate concepts.

Delivery has two parts:
1. Open album and contextual actions, including the copy-detail UUID cleanup.
2. Covers and stickers, **only after the student reviews Part 1 in Safari and approves
   continuing**. This pause remains mandatory even if all automated tests pass.

## 2. Evidence and existing implementation

Audited local `main` at `f255ce7` after `git pull --ff-only` reported already up to date.
PR #7 (8C) and PR #8 (8C.1) are merged. Some CLAUDE/roadmap history still describes
unmerged branches; those historical statements are not the current Git baseline.
The only pre-existing working-tree addition was `AGENTS.md`; preserve it.
No secrets or development database state were read. Migration head in source is 0008;
that does not establish which revision is applied on the student's database.

- `frontend/src/pages/BinderPage.tsx` contains `BinderWorkspace`, `Tray`, `MoveTargets`
  and the distant `.pv-selection` aside. There is no `BinderView.tsx`; the test file
  is `pages/BinderView.test.tsx`.
- `Mode` already supports idle, fill and move. Writes reuse `storeNext`,
  `placeInPocket`, `removeFromPocket`, `useBinderMutations` and owner isolation.
- `PageGrid.tsx` renders nine pockets per page with roving tabindex. Currently arrows
  call the same `select` callback as clicking; separating focus from activation is
  essential so keyboard navigation cannot accidentally place a card in move mode.
- `flight.ts` captures the origin at click time, hides the original without removing
  its layout, runs a fixed-position clone (150 ms lift + 550 ms flight + 150 ms descent),
  then hands off synchronously to 500 ms sleeve entry and 300 ms shine. Page turn,
  scroll settling, arrival tokens and abort cleanup already exist.
- `binders.css` uses a flexible auto-fit spread, a side panel and a document-flow tray;
  it does not guarantee viewport fit. Sleeve ratio is currently 245:337, not 63:88.
- `BindersPage.tsx` and Home `components/home/BinderShelf.tsx` share `Cover.tsx`, which
  currently accepts only `binderId` and draws the Noir cover. Home shows at most six
  covers and uses one grouped price request; it must not load binder details per item.
- `InventoryCopyPage.tsx` still prints `state.data.id` in a code element and identifies
  the printing by catalog ID. Remove the UUID and reuse card metadata/identity helpers.
- `services/pokemon.ts::searchPokemon` already returns up to eight name/number matches.
  Reuse it; no separate species index or external name-search implementation.
- `backend/app/binders/schemas.py` and `ck_binders_cover` currently allow only `noir`.
  Existing writes serialize by locking the owner row; composite foreign keys enforce
  ownership, and private routes use session/Origin/CSRF and no-store responses.
- 8C §5.5 deliberately deferred sticker storage. Its 24-sticker sketch is precedent,
  not a deployed schema or binding coordinate contract.

## 3. Scope and approaches

**Recommended approach:** retain the binder coordinator, mutation services, pocket
DOM and flight choreography; extract the tray and contextual controls into small
components. Add a bounded atomic appearance resource in Part 2.

Alternatives considered:
- CSS-only resize of the current view: less code, but cannot solve contextual focus,
  selection-versus-activation or the current distant actions panel.
- Rebuild with an album/drag-and-drop library: adds dependency and motion/focus risk;
  incompatible with preserving the approved flight. Not proposed.
- Per-sticker autosave endpoints: easy individual writes, but violates explicit Save
  and permits partial appearance saves. Use one atomic appearance replacement instead.

Included: approved album layout, contextual actions, touch paging, fixed tray,
cover editor, five materials, original pixel stickers, Pokémon artwork, migration
0011, anti-UUID cleanup, ES/EN, accessibility and regression evidence.

Excluded: inventory or scanner redesign, OCR changes, PC boxes, card drag-and-drop,
page stickers, user uploads, arbitrary URLs/SVG, sharing, batch scanning, favourites,
master sets, price changes and new large dependencies.

## 4. Part 1 — album workspace

### 4.1 Geometry and viewport budget (D1)

Desktop: two explicit 3×3 pages side by side; never let auto-fit unexpectedly wrap
one below the other. A central spine has three decorative rings, inset page shadows
and an outer cover. Part 1 uses Noir; Part 2 applies the saved material to this shell.
Rings and shadows are aria-hidden and cannot intercept pointer events.

Use a route-scoped workspace with header, status, flexible spread and bottom tray.
Derive available height from `100dvh`, existing shell header/mobile navigation,
safe-area insets, workspace heading and tray; measure changing containers with
ResizeObserver rather than assuming a fixed browser toolbar height. Account for
width as well as height. The smaller constraint determines the common pocket size.
A card/sleeve keeps **63:88** proportions and artwork uses contain, never crop/stretch.
No page scroll at normal desktop sizes (acceptance: 1280×720 and 1440×900, 100% zoom).

Proposal: minimum sleeve width 64 CSS px (height 64×88/63); minimum targets 44×44,
text 12 px. The contextual card name remains normally readable text. Compress header
spacing and show concise captions first; if even the minimum spread cannot fit
(e.g. very short windows, landscape phones or 200–400% zoom), allow document scrolling
instead of clipping content or shrinking below the minimum. This explicit accessibility
exception to “no scroll” needs D1 approval. No global body overflow lock that breaks
other routes or leaves focus off-screen. Full in-card rules text is not readable at
thumbnail size; View card provides the detailed image.

Large previous/next buttons flank the spread (at least 44×44), disabled at bounds.
Indicator: `PÁGS. 3–4 DE 8` / `PAGES 3–4 OF 8`; one-page equivalent on mobile.
Reuse page count rules (2–40), URL page/pocket links and desktop spreadStart logic.

Mobile: one 3×3 page, with the same three rings along the inner edge; arrows and
Page Up/Down remain available. Horizontal swipe on the page background turns one page
when displacement is at least 48 px and horizontal motion exceeds vertical by 1.5×.
Ignore multi-touch, controls, tray, open sheets and active copy mutations/flight.
Do not prevent pinch zoom or ordinary vertical scrolling in the accessible fallback.
Suppress the click following an accepted swipe. Keep actual card movement click-based.

### 4.2 Fixed bottom tray

Extract `BinderTray` from the current Tray; keep its owner-scoped fetch, 30-item
pagination, consumed-copy filtering, retry and arrival-triggered refresh. Render a
fixed/pinned bottom strip within the workspace, above the mobile tab bar and safe area,
with horizontally scrollable thumbnails. Reserve its height in layout; it must not
cover the last row, status or focus. Retain Previous/Next controls to reach all copies;
horizontal scrolling applies to the current bounded 30-item page, not unlimited fetching.

When idle, tapping a tray item stores in the next free pocket as today. Activating an
empty pocket first opens contextual controls; choosing `Choose from tray` then enters
fill mode: cyan tray outline plus text `Choose a card for page N,
pocket M`, not colour alone. Focus the first available thumbnail (heading if empty);
tapping a copy places it in the chosen pocket. Cancel/Escape restores pocket focus.
An empty/outage tray keeps its instruction and actionable retry/cancel controls.

### 4.3 Contextual actions and keyboard contract

Remove `.pv-selection` entirely. Activating an occupied pocket opens `PocketActions`
anchored to that pocket, on the right if it fits, otherwise left, then clamped within
the viewport. Use a portal so the spread's perspective/overflow cannot clip it.
Reposition or dismiss when the anchor changes, page turns or viewport changes.

The same content is a bottom sheet on mobile. Use a labelled dialog with native
buttons/links rather than pretending the card facts are ARIA menuitems. Desktop is
non-modal (no focus trap); mobile is modal with focus containment and inert background.
Facts: card name, expansion, page/pocket, physical variant/condition and price when
available; failed pricing says unavailable, never zero. No private UUID in visible text,
alt/title, live regions or accessible names; IDs remain internal keys and URLs.

Actions (ES/EN):
- `Ver carta` / `View card`: proposal D2 opens the physical-copy detail in the same tab;
  it preserves a validated binder/page/pocket return link. That detail links the official
  printing. Alternative: link directly to the official catalog detail, losing copy context.
- `Mover a otro bolsillo` / `Move to another pocket`.
- `Mover a otra carpeta` / `Move to another binder`.
- `Sacar de la carpeta` / `Remove from binder` (returns to tray, not inventory deletion).

Empty pockets show `Elegir de la bandeja` / `Choose from tray` in the same contextual
surface. Escape, close button or outside click closes it and restores the anchor focus;
if the anchor disappeared, use the current page's first pocket or the binder heading.
Outside dismissal never activates the pocket underneath in the same gesture.

Separate PageGrid callbacks: **focus/select** vs **activate**. Arrow/Home/End moves
focus and selection only; Enter/Space or a click activates. Within-page arrows keep
current row-major bounds; Tab can reach the other page's grid and pager. Page Up/Down
turns pages unless an input/dialog owns the key. Do not open a dialog or mutate from an
arrow key. Menus dismiss on page turn; a pending move/fill target remains explicit.

### 4.4 Placement modes and races

| State | Activation | Cancel / success |
| --- | --- | --- |
| idle | occupied or empty pocket opens its contextual controls | dismiss → pocket focus |
| fill(target) | tray copy → placeInPocket(target) | cancel → target; success → destination |
| move(source) | empty pocket click/Enter → placeInPocket | cancel → source; success → destination |
| other-binder(source) | select binder + explicit Move → storeNext | cancel → source; success → source/confirmation |
| mutation pending | disable duplicate writes and destination selection | failure keeps safe mode; refresh conflicts |

Moving within a binder highlights only empty destinations with cyan plus a text hint.
Paging remains possible before submission; never overwrite an occupied pocket.
At destination activation, capture the source card before the mutation only if it is
still mounted and visible. Do not retain stale geometry across a page turn. When its
page is no longer mounted or the source is outside the viewport, pass no flight origin
and use the existing destination sleeve-entry fallback after server success; never
invent a start position. Same-visible-spread moves retain the complete FLIP. Use current
`arrive` and the existing flight/sleeve nodes after success. Selecting a
new action cancels old arrival ownership. No flight or success before the server reply.

D3 proposal: cross-binder move uses an inline chooser in the same popover/sheet and
places into the destination's lowest free pocket, through existing `storeNext`. Announce
both binder names and the destination page/pocket; offer a destination link. No pretend
flight into an invisible binder and no new explicit-target cross-binder browser.
The off-page sleeve-only fallback is included in D3 for review; the flight choreography
itself remains unchanged.

Revalidation/logout/account switch unmount the private workspace as today, abort
requests/flight, remove portals and restore hidden origins. Never restore focus into
another owner's tree. Network failure/409 preserves copy identity, refreshes affected
state and provides explicit retry; cancellation cannot undo a committed placement.

### 4.5 Motion invariants and UUID debt

Do not redesign flight keyframes, timings, sleeve entry, shine or page turn. Keep
`.pv-pocket__card`, sleeve/front stacking, measured origins, synchronous hand-off,
consumed tray items, token checks and abort cleanup. The new album must not clip the
real card above its sleeve opening. Do not put the fixed clone under transformed parents.
Freeze destination geometry during an active flight; resize/orientation change cancels
the animation, reveals server-confirmed state and cleans hidden originals.
Reduced motion disables flight, entry, shine and page turn as it does today.

Copy detail removes the UUID node. Fetch printing metadata through the existing hook
and show card name + expansion; fallback to the official catalog ID when unavailable,
never the copy UUID. Preserve edit/delete, copy prices, location and owner guards.

## 5. Mandatory Safari checkpoint

After Part 1 tests/lint pass and its commits are complete, stop. Give the student local
URLs and the Part 1 checklist in §10. Do not create migration 0011 or implement Part 2
until Safari feedback is resolved and the student explicitly approves continuing.
There is no database migration in Part 1.

## 6. Part 2 — cover appearance

### 6.1 Materials and rendering (D4)

Wire values: `noir`, `brown_leather`, `metallic`, `holographic`, `white`.
Create material surface tokens only in `styles/tokens.css`; no Tailwind or external
texture assets. Noir keeps its current look; leather uses subtle CSS grain, metal a
brushed gradient, holographic a static iridescent gradient, white a contrasting neutral
surface. No perpetual animation. Cyan stays the interaction colour; gold remains
money/favourites. Brown/white/iridescent hues are decorative material tokens, not new
action/status colours. Outlines and sticker-editor controls remain contrast-safe on all.

Shared `CoverArt(appearance)` renders the material and stickers without links.
`Cover` wraps it in the existing pointer shortcut and accessible binder-name link;
Home and shelf render the same data without per-binder detail fetches. An open album
uses the material for the visible outer cover/spine. Stickers are on the exterior front
cover, not copied onto pages or rings; editor preview and closed cover show them fully.

### 6.2 Sticker catalogue and geometry (D5–D6)

Proposal: **24 stickers maximum per binder**, consistent with the 8C sketch. Repeated
species/designs are permitted, each a distinct layer. Allowed kinds:
- `pokemon`: species integer 1–1025, artwork URL derived only from the validated id:
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/{id}.png`.
- `pixel`: one of `star`, `bolt`, `heart`, `creature`, `circle`; original locally authored
  pixel SVG assets, no copied Pokémon silhouette. Fixed asset registry, no supplied SVG.

Do not store or accept an arbitrary URL. Search calls existing searchPokemon with
300 ms debounce, abort and stale-response guards; at most eight results, with names
and numbers. Failure leaves pixel choices and existing stickers usable. Images load
lazily with no referrer and a named placeholder on failure; no backend proxy or image
upload. Add brief source attribution; the provided URL is not a claim of an asset licence.

Pokémon die-cut treatment uses layered white drop-shadows plus a soft shadow on the
transparent image; pixel stickers reuse the same outer treatment. White/shadow values
are tokens. Decorative images are aria-hidden when a nearby label names the layer.

Cover canvas aspect ratio is **3:4** across shelf/Home/editor. Coordinates are centre
positions `x/y` in **0–100 percent** of this fixed canvas (explicitly replaces the 8C
0–1 sketch). Each sticker occupies a square box of width `20% × scale` of canvas width,
with artwork contained inside. Proposed scale **0.5–2.0**, rotation **−180..180°**;
order **0..23** is back-to-front. Round x/y to 0.1%, rotation to 1°, scale to 0.05 in UI;
API/DB accept finite values in range, with no string/boolean numeric coercion.

D6 proposal: allow overlap and partial edge clipping, but clamp the centre to 0–100;
renderer clips at the cover boundary. Editor selection handles remain in a separate
unclipped layer, and the layer list always permits selecting/removing a clipped sticker.
No full-sticker containment calculation is required. Never distort the canvas on resize.

### 6.3 Editor and explicit save

Entry points: `Edit cover` in shelf management and the open binder header. Use a
labelled dialog (full-screen mobile), owner-scoped local draft, preview and layer list.
New sticker starts at (50,50), rotation 0, scale 1, top order; play one 180 ms “plop”
only on insertion. Reduced motion makes insertion immediate.

Pointer drag uses pointer capture; pointercancel stops the gesture without saving.
Dragging only inside the editor canvas; no cover editor gestures affect album paging.
Rotate/scale by labelled controls (no multi-touch requirement). Keyboard alternative:
layer selector, x/y numeric inputs, arrow nudges 1% (Shift 5%), rotation buttons ±5°,
scale buttons ±0.1, forward/backward layer buttons and Remove. Do not intercept arrows
inside inputs. Touch controls are at least 44×44; announce changes after action/drag end,
not every pixel. Reorder renumbers all layers contiguously.

Save sends one atomic snapshot. Cancel/Escape/outside close with dirty draft asks
`Discard unsaved changes?`; navigation follows the same guard. No local/session storage
of drafts. Session loss discards private drafts without a discard prompt. Disable Save
and editing while pending; errors keep the draft for the same confirmed owner. No auto-save.

## 7. Data and API (migration 0011, D7)

### 7.1 Schema

Extend `ck_binders_cover` with the five values above. Add `appearance_revision` integer
not null default 0, check >=0 on binders. Its revision changes only for appearance edits;
renaming, ordering and pocket operations must not invalidate the editor's base revision.

`binder_stickers`:
- `id` UUID primary key; `user_id`, `binder_id` not null.
- Composite FK `(user_id,binder_id)` → `binders(user_id,id)`, on delete cascade; index
  owner/binder. User deletion reaches stickers through the owned binder cascade.
- `kind`, `species_id` nullable integer, `pixel_key` nullable bounded string. CHECK:
  pokemon requires species 1–1025 and null pixel_key; pixel requires allowed pixel_key
  and null species_id. No orphan reference or mixed kind accepted.
- `x`, `y`: Numeric(5,2); `rotation`: Numeric(5,1); `scale`: Numeric(3,2), with the
  bounds in §6.2. API accepts at most two fractional digits for x/y and scale, one for
  rotation; trailing zeroes are equivalent. Reject NaN/Infinity, excess precision and
  invalid types before SQL. Normalize to these decimal values for storage and replay
  comparisons; JSON responses remain numbers, not strings. UI steps are narrower than
  this wire contract and do not justify silently rounding an invalid request.
- `display_order` integer 0–23, unique `(binder_id,display_order)`. Together these
  constraints enforce at most 24 rows even through raw SQL. `created_at` timestamp.

### 7.2 Appearance resource

`GET /api/v1/binders/{binder_id}/appearance` →
`{cover, revision, stickers: [{id, kind, species_id, pixel_key, x, y, rotation, scale, display_order}]}`.

`PUT` same path, session + Origin + CSRF, body
`{expected_revision, cover, stickers: [...]}`; identical shape per layer, with client-generated
UUIDs for new layers (internal only). Exact allowed fields, max 24, duplicate IDs/order
rejected, order exactly 0..N−1. Return canonical Appearance after commit.

Reuse lock_owner and owned binder checks. Validate expected_revision under the lock;
replace layers and cover in one transaction, revision +1, update binder.updated_at.
Retained IDs preserve created_at; deleted layers are removed; new IDs must not belong
to another binder/user. Do not query or disclose another owner's appearance. Foreign
or absent binder →404; invalid body →422; revision mismatch →409 appearance_changed.
All responses are no-store. No provider or price requests during appearance writes.

Safe replay: when expected_revision is stale, compare requested cover/layers to current
canonical content (excluding revision/timestamps). If identical, return current state
without another increment. Otherwise 409. This supports a lost Save response without
new stickers or silent overwrites. Conflict retains local draft but requires Reload
(discard confirmed) before editing against a fresh base; no force-overwrite control.

Existing create may accept any allowed cover, but existing generic UpdateBinder must
route cover changes through the same lock/revision increment; it cannot leave appearance
revision unchanged. Frontend cover editing uses only the atomic appearance endpoint.

BinderSummary gains `appearance_revision` and `stickers` (empty arrays for old binders),
reused in list/detail/mutation responses. Fetch layers in one batched query for the
owner's returned binders, not N+1. Bound is 100×24; Home renders six and still requests
no binder detail/appearance per tile. Frontend service parsers validate every new field,
all numeric bounds, layer identifiers and order. Prices remain a separate grouped fetch.

### 7.3 Migration safety

0011 follows 0010 (9B's card species; 0009 is 9A's favourites and value history). Upgrade changes only the cover check, adds revision=0 and the empty
sticker table. Existing binder IDs, names, timestamps, positions, inventory and prices
are unchanged. PostgreSQL and SQLite-compatible migration operations must preserve FKs.

Downgrade **loses personalization**: drop stickers, map non-noir covers to noir, remove
appearance_revision and restore noir-only check. It never changes pockets/inventory.
Document this loss before providing downgrade commands. No automatic development DB
migration during agent tasks. Student takes a verified backup before applying/reverting
schema; disposable-schema migration tests are separate. Never read backend/.env.

### 7.4 Added by the student after the Part 1 Safari review: pages are stored

Today `page_count` is derived (the last used page plus one, rounded up to an even number),
so an empty page cannot be kept. Part 2 stores it:

- `binders.page_count` integer, even, 2–40, added by migration 0011. Existing binders get
  their *used pages plus one spare, rounded up to an even number* (minimum 2, maximum 40);
  the downgrade drops the column and the derived rule applies again.
- **"+ Agregar hojas"** at the end of the binder adds 2 pages (up to 40) and saves them even
  when they are empty. It is a server write (owner-scoped, CSRF, no-store) that returns the
  binder; the button is disabled at 40 pages and while a write is pending.
- **"Quitar páginas vacías"** removes only trailing empty pages (two at a time, keeping the
  count even and at least 2), after an explicit confirmation that says how many pages go.
  It never touches a page that holds a card: the server recomputes the last used page under
  the owner lock and refuses with 409 if the request would remove a used page.
- Placing a card in a pocket beyond the stored pages (next free pocket on a full binder)
  grows `page_count` by 2 in the same transaction, up to 40.
- Tests: two users never see or change each other's `page_count`; cards are never lost
  (adding, removing, concurrent placement and the 409 path leave every copy and pocket
  intact); migration up/down preserves pockets and inventory.

## 8. Security, failure handling and performance

- No auth/CSRF changes. Two-user isolation at API and SQL layers; all private views
  clear/abort on session changes, including portal content and editor draft/search.
- Numeric bounds enforced by API and DB; enum-only assets prevent URL/markup injection.
- One appearance save at a time, explicit conflict handling; no background writes.
- Image/price/search outages cannot block inventory placement or removal.
- No new runtime dependency planned. Reuse existing primitives; native Pointer Events,
  CSS, Web Animations API, ResizeObserver and portals suffice.
- No per-frame React updates for card flight; editor drag may update bounded local
  transforms. Clean all observers, capture, listeners and timers on unmount.
- Keep existing batch price/metadata calls, paged tray and ≤24 layers per cover.

## 9. Testing and acceptance criteria

Part 1 automated tests must prove: selection never mutates, anchored and modal actions,
Escape/outside/focus behavior, fill and multi-page move, cross-binder next-free,
collision refresh, tray paging, rapid action cancellation, successful/failed mutations,
auth transitions, anti-UUID text/accessible names and unchanged flight invariants.
Layout math tests use explicit viewport/header/tray dimensions; jsdom is not Safari
layout evidence. Preserve all existing flight tests and map changed action queries to
same assertions rather than deleting tests.

Part 2: DB/API bounds, two users in SQLite and PostgreSQL, cascade, atomic rollback,
24/25 limit, concurrent edits, stale replay, generic-cover revision invalidation,
migration up/down preservation, appearance batching; frontend parser rejection,
drag/keyboard equivalence, dirty cancel, errors, revalidation, cross-tab conflict,
all five materials on Home/shelf/album and artwork failures. Anti-UUID assertions cover
text, alt/title, dialog names, live regions and accessible labels, not internal URLs.
All strings in ES/EN; skeleton dimensions match loaded layouts and no perpetual shimmer
under reduced motion. Check tokens/style contracts.

## 10. Safari checklists

Part 1 (STOP for approval afterward):
- [ ] At http://localhost:5173/binders open an existing binder. At 1280×720 and 1440×900,
  the complete two-page spread and tray fit without document scroll; 63:88 sleeves,
  three rings, cover surround and spine shadows match the approved mockup.
- [ ] On phone-sized view: one page, arrows/swipe, safe area and mobile navigation clear.
- [ ] Click each corner pocket: controls stay visible beside it; phone uses a bottom sheet.
- [ ] Escape/outside restores focus. Arrows only select; Enter activates. Page Up/Down works.
- [ ] Fill from tray, cancel, move to another page, move to another binder, remove.
  Verify exact copy and announced location; tray pages still reach every unassigned copy.
- [ ] FLIP lift/curve/descent/entry/shine is unchanged, no clipped arrival, duplicate or
  floating clone. Cancel/resize mid-flight and enable reduced motion.
- [ ] At high zoom/short viewport, every control remains reachable under D1 fallback.
  Price or metadata outage does not prevent actions. Copy detail exposes no UUID.
- [ ] VoiceOver and keyboard pass; record feedback and explicit approval for Part 2.

Part 2/final:
- [ ] All five materials match across shelf, Home and album. Add both sticker kinds,
  search name/number, drag/rotate/scale/reorder/remove, hit limit 24, and save explicitly.
- [ ] Repeat without dragging, using keyboard/buttons; clipped/overlapping layers remain
  selectable. Cancel dirty changes; reopen after Save and verify persistence.
- [ ] Simulate failed artwork/search, lost Save response and two-tab edits. Log out/switch
  users with editor open: no old draft/content survives.
- [ ] Test reduced motion, 200%/400% zoom and mobile safe areas. Verify inventory/pocket
  counts unchanged after appearance editing and migration.
- [ ] Run `bash scripts/check.sh`; report exact counts/skips and actual Safari evidence.

## 11. Approved decisions (2026-11-24)

| Decision | Proposal | Alternative / consequence |
| --- | --- | --- |
| D1 | 64 px sleeve minimum; allow scroll only when short window/zoom cannot fit it | Always no-scroll would make content illegible or unreachable |
| D2 | View card opens physical-copy detail with binder return context | Direct official-printing detail skips copy attributes |
| D3 | Cross-binder move selects binder, then next free pocket; off-page same-binder origin uses sleeve entry only | Remote exact-pocket browsing or a persistent carried-card preview expands scope |
| D4 | Five CSS materials, decorative surface tokens, static holographic; stickers only outside cover | Animated holographic or stickers on inner pages adds motion/scope |
| D5 | 24 stickers per cover | Lower limit reduces decoration and response size |
| D6 | 3:4 canvas, 20%-width base, scale 0.5–2, centre 0–100%, overlap/edge clipping | Full containment or 8C's 0.25–3 range changes bounds/editor behavior |
| D7 | Atomic explicit save + appearance revision + identical-content safe replay | Last-writer-wins can silently discard another tab's work |

The Safari pause is required by the student, not an optional decision. Part 1 implementation is authorized; Part 2 and migration 0010 remain blocked until
explicit approval after Safari review.
