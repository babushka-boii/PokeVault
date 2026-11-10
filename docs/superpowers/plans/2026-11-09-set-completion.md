# TCG Set Explorer and Completion Implementation Plan

> Use test-driven implementation with parallel provider/frontend/database work and independent final review. User authorizes proceeding autonomously, prohibits commits/push/merge/rebase/reset and destructive database changes.

**Goal:** Explore real physical TCG sets and derive accurate personal completion from existing physical copies.

**Architecture:** Extend the existing CardProvider and its metadata/client/asset/cache infrastructure. A validated English embedded set.cards list supplies canonical membership; Spanish resources only overlay matching identities. SQL groups existing inventory by card_id for the session owner. No new tables, indexes, migrations or ownership store.

**Baseline:** clean dc233c4 on completed5C, main is ancestor one commit behind; created feat/iteration-5d-set-completion without changing history. Migration0004/auth/inventory/boxes present. Existing gate baseline43provider/247backend(42PG)/265frontend.

## Contracts

DTOs: backend/app/cards/set_schemas.py. Provider methods on the existing CardProvider:

- `list_sets(language="es", page=1, page_size=12, q="", series_id=None, sort="newest") -> SetPage`
- `get_set_checklist(set_id: str, language="es") -> SetChecklist` containing `.metadata: SetDetail` and `.cards: list[SetCard]` (full bounded membership).
- `SetNotFound` defined in app/cards/provider.py for unknown/nonphysical sets; provider failures use existing CardsUnavailable.
- `SetSummary` extends CardSet with official_count/provider_total nullable. SetDetail adds checklist_status verified/incomplete/empty, checklist_size and checklist_revision (SHA256 canonical sorted IDs, null unless verified nonempty).
- Lightweight SetCard: id/name/local_id/language/image_url/thumbnail_url/image_sources/image_language. No fabricated category/rarity or per-card detail fanout.
- SetPage has results,total,page,page_size,series,coverage english_physical_catalog, excluded_pocket/excluded_unknown_series.

Routes (language es/en, defaults page1/page_size12, bounds page<=10000, page_size<=24, q<=100):

- Public GET /api/v1/sets: provider list; q,series_id,sort newest/oldest; global filtering/sorting before slicing.
- Public GET /api/v1/sets/{set_id}: SetDetail.
- Public GET /api/v1/sets/{set_id}/cards: SetCardPage; q,sort number/name,page,page_size.
- Private GET /api/v1/sets/{set_id}/progress: SetCollectionPage; same card queries plus ownership all/owned/missing. Full-set progress fields set_id/checklist_revision/status/total/owned/missing/physical_copies/percentage; quantities map for returned rows only. SQL aggregation covers full canonical checklist before filtering/pagination. Public metadata and private page share same checklist snapshot.
- Private GET /api/v1/sets/progress?set_id=ID (repeat at most12 unique IDs): SetProgressBatch for current explorer page. At most12 bounded English checklist loads with existing provider concurrency/deadlines; one DB aggregate for union IDs. Each unavailable provider set gets explicit status unavailable/all counts null, never fake zero. Static route precedes set UUID/string routes.
- Incomplete progress counts/percentage are null. Empty checklist total/owned/missing/physical_copies=0 and percentage=null. Ownership filters other than all require verified nonempty coverage (409 checklist_not_verified); frontend disables them otherwise.
- Each nonempty verified checksum is stable across locales. Completion=owned distinct IDs / full canonical set size *100 (round2 decimals); duplicates only increase physical_copies/quantities. Outside IDs never count. No official-numbered subset or master-set mode.
- Session-derived ownership only; private no-store and existing security conventions. Public requests never read inventory. Unknown/invalid404/422, unavailable503, SQL failures sanitized503. Existing inventory writes retainCSRF.

## Provider decisions

- Full supported EN set index + existing metadata catalog, filter exact Pocket serie tcgp and absent/unrecognized physical series conservatively, explicit coverage/excluded counts.
- English membership unique IDs must match provider total; mismatch incomplete, duplicate/malformed responses unavailable and not cached as verified. Maximum2000 briefs/set, overflow explicit unavailable. Missing/zero totals cannot produce100%.
- Spanish missing/empty/partial checklists fall back per canonical ID; never replace canonical IDs or denominator. Invalid identities/assets cannot poison good cache.
- Shared existing client/semaphore(5), per-request timeouts, bounded TTL/LRU public caches and coalesced refreshes. Never cache private ownership in public provider state.
- Live evidence in research/tcgdex/set_completion_verification.json: base1 Spanish empty despite total102; swsh3 total201/official189; punctuated sv03.5 total207/official165; Pocket A1 belongs tcgp.

## Tasks / ownership

- [x] Provider agent: extend CardProvider and provider tests, preserve existing DTOs/routes. Test membership/counts, ES fallback, physical identity, punctuation, timeouts, singleflight, cache bounds and global search/sort.
- [x] Root: schemas, API/service aggregation/pagination, 22 HTTP tests, privacy registration, plan/docs and integration coordination. Include 12 copies/8 IDs/100 = 8%, final-copy deletion, incomplete/empty, authentication/no-store/public boundary.
- [x] Frontend agent: public /sets and /sets/:id, navigation/return context, shared artwork/SetLogo/AddToCollection callbacks, whole-set filters/progress, ES/EN, private cancellation, paging/loading/error regressions.
- [x] Database agent: 24 real PostgreSQL aggregation/privacy/persistence/mutation-independence cases, unchanged schema, disposable schemas only.
- [x] Root + independent reviewer: full check.sh against 5C, verify migration stays 0004, fix regressions and update required docs/SET_COMPLETION. No unsupported browser/OAuth claims.

## Review focus

Canonical checklist/version agreement across locales and refreshes; full-set counts independent of page/filter; no cross-account late progress; unknown/Pocket membership never inflates physical completion; partial/failed responses never cached verified; large request budgets/globalpagination; inventory mutations refresh distinct/quantity correctly without alternate editor.

## Completion record

Final stable gate exit 0: 43 provider fixtures; 355 backend (66 PostgreSQL, 62 new
provider cases); 315 frontend / 29 files; Ruff, ESLint, TypeScript, Vite and whitespace
passed. Compared with 5C: +108 backend, +24 PostgreSQL subset and +50 frontend.
Migration code head and read-only development current remain 0004 (head); no schema
changes or populated development writes. No commits/push/merge/rebase/reset.

Independent review found and verified fixes for overlapping drafts, browser-history
editor locks, repeated simultaneous provider failures/incomplete cross-locale loads;
other regressions pin canonical TTL, physical eligibility refresh, exact percentage
rounding and clearing all filters atomically. No unresolved blocking finding. Live
verification was limited to public TCGdex/API asset probes; real browser/OAuth/mobile
acceptance remains pending in SET_COMPLETION.md.
