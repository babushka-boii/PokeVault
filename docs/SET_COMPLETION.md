# TCG expansion explorer and derived completion — Iteration 5D

The public explorer uses official TCGdex identities and the existing `CardProvider`.
Personal progress is derived from `inventory_copies`. No completion flags, tables,
new indexes, migrations or additional inventory editor are introduced; migration
head remains `0004`.

## Verified membership and counts

An expansion's canonical checklist is the English set resource's explicit `cards`
array. Each entry supplies `id`, `localId`, name and optional artwork. Membership
never comes from splitting IDs, localized names, artwork paths or display position.
Identifiers such as `sv03.5` and local numbers such as `001` remain unchanged.

For canonical unique IDs S and the current user's grouped inventory quantities Q:

- Total = |S|.
- Owned = the number of IDs in S with Q[id] > 0.
- Missing = Total − Owned.
- Physical copies = sum of Q[id] for IDs in S.
- Completion = Owned / Total × 100, rounded to two decimals with decimal half-up
  rounding. For example, 1/32 is 3.13%.

Twelve copies of eight distinct IDs in a 100-entry verified checklist mean **8 owned,
92 missing, 12 physical copies and 8%**, never 12%. Condition, language, finish,
notes, acquisition date and box placement do not change distinct ownership. Copies
outside S do not count. Deleting the final copy of an ID makes it missing again.
Totals always cover the full checklist, independently of current page, search or
Owned/Missing filters. `total` on a card page instead counts entries matching those
page filters; it is separate from `progress.total`.

`cardCount.official` is the printed count, shown separately from `cardCount.total`.
The default tracker covers all verified unique provider printings, including extra
cards beyond the printed count. It does not guess an official-numbered subset from
the first N entries or card suffixes. Variant-specific master sets are deferred.

Verified status requires a nonempty unique canonical checklist that agrees with
the resource's provider total and has no contradictory official count. A bounded
SHA-256 revision over sorted canonical IDs identifies this baseline independently
of locale. Partial/missing counts or inconsistent cardinality yield `incomplete`:
all progress counts and percentage are null. An explicitly empty checklist has zero
counts and a null percentage. Malformed, duplicate or oversized resources fail
sanitized with 503 and are not cached as verified. Partial known cards can still be
browsed with an explicit coverage warning; Owned/Missing filters require verification.
Verified means complete against this provider's declared checklist, not proof of
worldwide/all-language catalog completeness.

## Provider verification and physical scope

Primary contracts: [set listing](https://tcgdex.dev/rest/sets) and
[set details](https://tcgdex.dev/rest/set). The limited read-only 2026-11-09 probe is
recorded with URLs, HTTP status, payload hashes and compact summaries in
[`research/tcgdex/set_completion_verification.json`](../research/tcgdex/set_completion_verification.json),
with interpretation in [set_completion_findings.md](../research/tcgdex/set_completion_findings.md).
The corrected capture used ten public requests and fetched no per-card details.

| Sample | Unique English IDs | Provider total | Official printed |
| --- | ---: | ---: | ---: |
| Base Set / base1 | 102 | 102 | 102 |
| Darkness Ablaze / swsh3 | 201 | 201 | 189 |
| 151 / sv03.5 | 207 | 207 | 165 |

Spanish Base Set returned HTTP 200 with an empty `cards` array despite advertising
102 entries. Spanish Darkness Ablaze and 151 matched the English membership hashes.
An empty/missing/partial Spanish resource therefore cannot become the denominator.
Spanish names/artwork overlay only matching canonical IDs with matching local numbers;
missing entries fall back individually to verified English data, with language labels.
Conflicting identities or malformed assets fail safely rather than inventing data.

Four additional read-only asset HEAD probes are recorded in
[set_completion_assets.json](../research/tcgdex/set_completion_assets.json): two
card WebP resources and the Darkness Ablaze logo returned 200; its symbol PNG
returned 404. Thus metadata presence does not guarantee a successful image load.
No image binaries were downloaded. Existing image/category fallbacks remain necessary.

The sampled English index had 221 sets; 15 belonged to exact series `tcgp` (Pocket),
leaving 206 in recognized physical series. The Spanish index had 160 sets. These are
dated observations, not permanent constants. The explorer explicitly covers the
supported English physical catalog, excluding Pocket and absent/unrecognized series.
A conservative verified physical-series allowlist must be extended after verifying
a new series; unknown exclusions are returned explicitly. Existing public species
card discovery remains backward compatible, including its prior English catalog scope.

## Data flow, reliability and cache boundaries

The existing metadata-only GraphQL catalog supplies global dates/series; the shared
localized metadata adapter supplies Spanish names and assets. One bounded English
REST set-list cache adds counts. All supported expansions are filtered and sorted
before pagination; newest/oldest use release dates with ID ties and unknown dates last.
Set pages use embedded card briefs, never one full-card request per entry. Categories
and rarity are not fabricated when briefs omit them.

The shared HTTP client uses five-second request timeouts, five concurrent provider
requests and fifteen-second refresh deadlines. Public catalogs are capped at 512
sets; canonical checklists at 2,000 entries, with explicit failure on overflow.
Raw set resources use a 64-entry LRU, normalized checklist views a 32-entry LRU, and
the count index one entry. Existing metadata catalogs remain bounded and shared.
Normal TTL is five minutes. Refreshes coalesce by stable set ID, with at most twelve
active keys; different sets can use the shared HTTP budget concurrently.

Locale views never outlive the canonical English baseline. Refreshing English
invalidates derived locale views and the old Spanish overlay. A verified English
baseline with partial Spanish text can cache its safe normalized fallback for up
to sixty seconds, without caching partial Spanish raw membership as verified.
Genuinely incomplete English checklists remain uncached for immediate retry.

Detail progress uses one SQL `GROUP BY card_id`, constrained by session owner and
the complete canonical IDs, using the existing owner/card index. It never loads all
physical copy rows. The explorer batches at most twelve set IDs: bounded English
checklists, a twenty-second outer budget and one union ownership aggregation. An
unavailable batch item has explicit null metrics rather than fabricated zero progress.
One aggregation statement supplies a consistent ownership snapshot to all totals,
quantities and filters. Public provider caches never contain private quantities.

## API contract

All paths begin `/api/v1/sets`. IDs use the existing validated identifier syntax.
Default language is `es`, with `en` supported. Pagination defaults to page 1 with
12 entries; page is bounded 1–10,000 and page size 1–24. Search `q` is at most 100
characters. Unknown/nonphysical IDs return 404, invalid inputs 422, provider errors
sanitized 503, unverified ownership filters 409 and database errors sanitized 503.

| Method/path | Contract |
| --- | --- |
| GET base | Public SetPage; q, series_id, sort newest/oldest; complete supported series options independent of page |
| GET /{set_id} | Public SetDetail; canonical checklist status/size/revision and metadata/counts |
| GET /{set_id}/cards | Public SetCardPage; q, sort number/name and pagination |
| GET /{set_id}/progress | Authenticated SetCollectionPage; same card queries plus ownership all/owned/missing |
| GET /progress?set_id=ID&set_id=ID | Authenticated batch for 1–12 distinct IDs; static route precedes dynamic set paths |

SetSummary extends existing CardSet metadata with nullable `official_count` and
`provider_total`. SetDetail adds `checklist_status`, `checklist_size` and
`checklist_revision`. Lightweight SetCard contains stable ID/local number/name,
actual text language and verified artwork candidates. SetCardPage contains `set`,
`results`, matching `total`, `page` and `page_size`.

SetCollectionPage adds `progress` and `quantities` for visible rows only. Progress
contains set_id, checklist_revision, status, total, owned, missing, physical_copies
and percentage. Its baseline revision must match the accompanying metadata. The
batch returns `{results: SetProgress[]}`. Incomplete/unavailable metrics are null;
empty metrics are zero except percentage null. Owning multiple copies does not
change checklist identity or the completed-entry count.

All personal data derives ownership exclusively from the existing server session;
client-supplied user IDs confer no access. Progress requires a live session and
returns no-store/no-cache, including errors. Public routes never query inventory.
Read-only GET progress adds no mutation or CSRF exception; existing inventory adds,
edits and deletes retain Origin/CSRF protections. Shared inventory workflow remains
the only source of physical-copy writes.

## Frontend and manual acceptance

`/sets` is linked from global navigation. `/sets/:setId` shows metadata, separate
counts, verified checklist, whole-set personal progress and native accessible filters.
Existing SetLogo/CardArtwork fallback behavior and aspect ratios are reused. Known
sets link from card details and relevant species catalog context; validated return
URLs preserve filters and browser history. Direct add actions reuse AddToCollection
and CopyForm, then refresh derived quantities/progress. Returning from card details,
reload and session restoration fetch current persistent inventory again.

Private progress/checklists are account-keyed mounted components, hidden immediately
during session revalidation/logout and aborted on cleanup. Explorer metadata stays
public while its private badge subtree is replaced. No private progress enters
localStorage or shared provider caches. ES/EN labels distinguish fallback language,
coverage, empty and error states; no prices or unsupported rarity data are shown.

1. Browse `/sets` as a guest; search by name and punctuated ID, change series/date
   order and pages. Confirm global results and public detail access.
2. Open swsh3: verify 189 printed vs 201 provider/verified entries. Open base1 in ES:
   fallback must retain 102 canonical entries, not an empty completion denominator.
3. Sign in. Add a missing printing through the shared form; check owned/missing/
   percentage and quantity. Add a duplicate: quantity increases, distinct owned stays.
4. Filter Owned/Missing, search, paginate and return from card details. Delete copies
   in inventory: only the final deletion makes that printing missing again.
5. Change physical attributes or box placement: completion must remain unchanged.
   Reload, sign out/in, and switch accounts: current inventory determines progress.
6. Test keyboard controls, narrow/mobile width, image failures, rapid navigation,
   provider/database errors and ES/EN. Confirm Pokédex, catalog, inventory and boxes.

Final automated evidence is recorded in DEVELOPMENT.md. Tests use deterministic
provider/Google boundaries and disposable PostgreSQL schemas; they do not establish
real OAuth consent, actual mobile layout or manual browser acceptance.
