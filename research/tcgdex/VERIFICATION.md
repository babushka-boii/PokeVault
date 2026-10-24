# TCGdex card and expansion verification

Verified against public TCGdex responses on 2026-10-22. The final refinement's
compact source responses, asset HEAD results and normalized API checks are in
[refinement.json](refinement.json). Reproduce the provider/asset probes with
`python research/tcgdex/verify_refinement.py`; this saves JSON and HTTP headers,
never artwork binaries. [metadata.json](metadata.json) retains the earlier
integration's evidence; its old pagination strategy has been superseded below.
Sample checks establish present provider behavior, not worldwide completeness.

## Artwork: diagnosis and correction

The existing `/low.webp` and `/high.webp` construction already followed the
[official asset documentation](https://tcgdex.dev/assets). The backend defect
was selecting only the requested language's `image`, even when another verified
resource for the **same printing** contained artwork. In the exact Pikachu pool,
12 Spanish records omitted image metadata while English supplied it, including
`smp-SM157` and `smp-SM162`. These are genuine translations with Spanish text;
changing the whole card to English would misstate the available localized data.

Both supported language resources are now fetched and identity-checked before
artwork alternatives are exposed. Card ID, set ID, local number, category and
nonempty species associations must agree. `image_sources` lists only those
validated resources' image bases in preferred-language order; identical bases
are deduplicated. Explicit `/en/` or `/es/` asset paths identify actual artwork
language, even when a resource points to artwork in a different language.
`language` describes card text, `image_language` the primary artwork, and
`available_languages` only positively fetched resources. Primary `image_url`
and `thumbnail_url` remain `/high.webp` and `/low.webp`; an already-qualified
provider image URL is normalized back to its single official base first.

The browser can try documented WebP/PNG/JPG and high/low variants for each
verified base, then move to the verified alternative language. A failed request
cannot be reinterpreted as proof that a new printing or language exists. No
species sprite or different-printing image is substituted. Missing metadata in
both languages remains explicit null/empty artwork metadata.

The 18 sampled language resources cover Base Set `base1-58`, special illustration
`sv03.5-199`, Sword & Shield `swsh3-136`, multi-species `sm9-33`, Pocket `A1-001`,
Spanish-null/English-present `smp-SM157`/`SM162`, and both-null `swsh12.5gg-GG30`
and `2024sv-2`. Spanish `base1-58` returned 404. All sampled non-null card
low-WebP/high-WebP/high-PNG URLs returned 200. Of 43 asset HEAD probes, 39 returned
200 and four **set symbol PNG** URLs returned 404. Thus even official metadata
cannot guarantee current asset availability; no sampled card-art format outage
was observed and none is claimed.

Every normalized image, logo and symbol base must use HTTPS on
`assets.tcgdex.net`, port 443, with no credentials, query or fragment. The API
never constructs alternative-language paths by replacing strings in a URL.

## Complete species discovery and chronological sorting

English REST discovery uses strict numeric array membership:

```text
GET /v2/en/cards?dexId=eq:25&sort:field=id&sort:order=ASC&pagination:page=1&pagination:itemsPerPage=1000
```

Plain `dexId=25` incorrectly matched other numeric identifiers in the earlier
live tests. Exact membership is required, including for multi-species cards:
`sm9-33` legitimately links both Pikachu 25 and Zekrom 644. Current-page full
English details still verify category, numeric species membership and requested
set; malformed or conflicting resources produce a sanitized 503.

The cached species index contains **briefs only**, never all card details. It
loads at most two chunks of 1000 briefs. A separate absolute-offset one-item
probe proves the end, including after a short chunk, so an undocumented provider
page cap cannot silently become a complete index. Duplicate/repeated pages,
conflicting brief identifiers, overflow beyond 2000, failed requests and missing
matching expansion metadata return 503. Successful `sets_complete: true` applies
to this exact English species pool; `coverage: "english_catalog"` remains the
explicit limit. It is not an exhaustive all-language or physical-only catalog.

REST `sort:field=set.releaseDate` did **not** yield chronological card order.
The sampled descending query produced official dates 2020 → 1999 → 2010 → 2024;
ascending started with XY promos rather than the oldest printings. Exact source
URLs, card IDs and official dates are archived. The implementation therefore
orders the complete validated brief index locally using official set dates,
then filters/slices to the requested page and loads only that page's details.

`newest`/`oldest` use release date descending/ascending, followed by set ID,
numeric-aware local number and card ID ascending. Unknown or malformed dates
remain null and sort last in both directions. No date is derived from an ID.
Existing `name` and `id` options remain ascending; names are English discovery
names with card ID as a stable tie-breaker. `has_more` is computed from the
matching brief index; no `total` or worldwide-completeness claim is exposed.

## Expansion metadata without catalog-wide card enrichment

The official [Set reference](https://tcgdex.dev/reference/set) documents
`releaseDate`, `serie`, localized name, logo and symbol. REST `/sets` briefs do
not include the release date or series. Instead one bounded metadata-only
GraphQL query obtains the official English set information:

```graphql
{ sets { id name releaseDate logo symbol serie { id name } } }
```

The verified response contained 220 sets. It selects **no card details, pricing,
checklists or artwork binaries**. The adapter rejects errors, duplicate IDs and
responses outside 1–512 sets. Spanish REST `/sets` (156 sampled entries) and
`/series` (16) supply localized names/assets and series names. GraphQL's sampled
schema supplied English metadata, so the implementation never assumes its text
was Spanish. Missing Spanish metadata retains verified English metadata with
`name_language: "en"`; Spanish names and English logos may coexist honestly.

Each gallery response includes all matching species expansions in `sets`,
independently of current page or selected expansion. No page-derived subset is
claimed as a complete selector. Sets remain individually identifiable even when
logos are absent. New species expansion IDs missing from cached metadata evict
the metadata cache so an immediate retry can discover the new expansion.

Logo/symbol URLs append `.png` to their verified asset base, following the
separate set-asset convention. They never receive a card quality segment.
`logo_sources` preserves resolved preferred/localized and verified English logo
URLs with source language, allowing browser format/language fallback. An asset
error can still require the UI's Other/Otras grouping; metadata presence alone
is not proof that the image successfully loads.

## Optional metadata, localization and runtime bounds

Weakness/resistance values retain actual provider text (numeric values normalize
to strings), retreat retains zero, and regulation marks remain nullable. Attacks,
TCG abilities, illustrator, HP, evolution and variant data retain provider
semantics. Missing values remain null/empty, never invented. Game abilities,
prices and ownership are outside these endpoints. A provider's available foil
variants do not establish that a particular image shows that physical finish.

A missing translation is recognized only by 404. Timeout, malformed JSON/schema,
HTTP failure or conflicting identities returns sanitized 503; direct details
return 404 only if both supported resources are absent. English discovery
includes Pocket and can omit printings absent from that catalog.

Five-minute per-process LRU caches cap validated language resources at 256,
normalized card views at 256, pages at 64, species indexes at 32 (each ≤2000
briefs), and localized set catalogs at two (each ≤512 sets). Refreshes coalesce;
at most five HTTP requests run concurrently. Requests have a five-second timeout
and refreshes a 15-second deadline. Failed pages/indexes are not cached; implicated
card resources are evicted for immediate retry. The browser fetches remote
assets directly. No dependencies, database tables or migrations were added.

Offline regression tests exercise artwork variants/languages, no incorrect
printing substitution, null metadata, strict origins/ports, global date ordering
before pagination, deterministic ties, unknown dates, complete set choices,
filtered empty results, bounded/truncated discovery, retry recovery, cache
expiry and concurrency. Live normalized application checks are archived in
`refinement.json` rather than inferred from the mock suite.

## Official references

- [Card and set asset formats](https://tcgdex.dev/assets)
- [Full set fields](https://tcgdex.dev/reference/set)
- [Full card fields](https://tcgdex.dev/reference/card)
- [Brief fields](https://tcgdex.dev/reference/card-brief)
- [Filtering, sorting and pagination](https://tcgdex.dev/rest/filtering-sorting-pagination)
- [GraphQL API](https://tcgdex.dev/graphql)
- [404 semantics](https://tcgdex.dev/errors/not-found)
