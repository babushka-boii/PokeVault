# Iteration 5D: verified expansion membership

The bounded read-only probe on 2026-11-09 is recorded in
[set_completion_verification.json](set_completion_verification.json). Reproduce
with `backend/.venv/bin/python research/tcgdex/set_completion_verify.py`. It makes
ten public requests, selects no individual card details and stores response
hashes and compact field summaries rather than full checklists. The first
capture attempt failed in its summarizer; the corrected ten-request capture
below succeeded. No additional live calls were needed for implementation.

The [set-list reference](https://tcgdex.dev/rest/sets) documents brief metadata
and both counts. The [set reference](https://tcgdex.dev/rest/set) documents the
explicit embedded `cards` membership list, series and release date.

| Resource | HTTP | Unique checklist IDs | Provider total | Official printed |
| --- | --- | ---: | ---: | ---: |
| English Base Set (`base1`) | 200 | 102 | 102 | 102 |
| Spanish Base Set (`base1`) | 200 | **0** | 102 | 102 |
| English Darkness Ablaze (`swsh3`) | 200 | 201 | 201 | 189 |
| Spanish Darkness Ablaze (`swsh3`) | 200 | 201 | 201 | 189 |
| English 151 (`sv03.5`) | 200 | 207 | 207 | 165 |
| Spanish 151 (`sv03.5`) | 200 | 207 | 207 | 165 |
| English Genetic Apex (`A1`, Pocket) | 200 | 286 | 286 | 226 |

English/Spanish Darkness Ablaze and 151 membership hashes match exactly.
Spanish Base Set demonstrates why HTTP 200 and matching advertised counts do
not establish a complete localized checklist: its embedded list is empty.
English canonical membership must survive missing or partial translations.
The 151 identifiers preserve punctuation and card local numbers preserve their
leading zeros (`sv03.5-001`). Membership comes from the set response, never an
ID-prefix split or asset filename.

The English set list has 221 unique IDs and the Spanish list 160, all of which
also occur in English. This is English catalog coverage, not a worldwide claim.
Metadata-only GraphQL also returned 221 unique IDs with series associations.
Fifteen identify their series as exactly `tcgp` (Pokémon TCG Pocket). The
remaining 206 belong to the observed physical series:

`base`, `bw`, `col`, `dp`, `ecard`, `ex`, `gym`, `hgss`, `lc`, `mc`, `me`,
`misc`, `neo`, `pl`, `pop`, `sm`, `sv`, `swsh`, `tk`, `xy`.

An absent or unrecognized series is not evidence of physical-card eligibility.
The physical explorer must exclude Pocket and expose its catalog scope; newly
unknown series require explicit handling rather than an inferred classification.

Completion is available only when canonical embedded membership is nonempty,
unique and agrees with the advertised total. The provider total is distinct
from the official printed count. A missing/partial English list must never
become a denominator for a fabricated completion percentage. Spanish records
can translate canonical IDs, but cannot introduce, remove or reorder membership
in a way that changes ownership or its denominator. Missing artwork remains
explicit, and the prior asset verification still applies: an official URL does
not guarantee that its artwork request will succeed.

Implementation reuses `CardProvider`'s metadata catalog, client, origin checks
and shared five-request semaphore. A separate single-entry, five-minute English
REST count index adds the fields absent from the existing GraphQL selection.
Raw set resources are limited to 64 locale keys and normalized checklists to 32;
each embedded list is limited to 2,000 cards. Normalized locale views expire no
later than both canonical English membership and English metadata. Refreshing
English membership invalidates translated views and overlays. A verified English
checklist with empty/partial Spanish lists can cache its explicit English
fallback for 60 seconds; incomplete English membership is never retained
as a normal cached checklist. Active refresh groups share validated raw resources,
incomplete results and raw-resource failures among concurrent waiters, including
across locales, and disappear when the last active caller leaves. Sequential
retries therefore recheck incomplete English membership or failed resources
immediately. Canceling an owner or waiter releases its active group membership;
cancellation is never retained as a shared provider failure.
