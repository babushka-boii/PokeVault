# Scanner name discovery verification — 2026-11-10

Six bounded public GET requests returned HTTP 200. The compact capture in
[scanner_search_verification.json](scanner_search_verification.json) records
URLs, response hashes, counts and three identity/name samples per request. No
card details, artwork binaries or private application data were fetched. Run
`backend/.venv/bin/python research/tcgdex/scanner_verify.py` to repeat the six
public probes with the project's Python version.

The [official filtering and pagination contract](https://tcgdex.dev/rest/filtering-sorting-pagination)
documents case-insensitive `like:` substring search, operator prefixes, `|`
alternatives, wildcard behavior, sorting, and opt-in pagination. The scanner
constructs a literal `like:` name query per supported language, sorts by stable
ID and requests at most 64 briefs. If that page suggests no supported physical
expansion, it permits one three-character name-token fallback, for at most two
pages per language. Checklist comparison still uses the full original name,
allowing accentless names and some OCR typos to reach the verified alternatives.
It rejects operator/wildcard input; legitimate
name punctuation outside the literal filter alphabet searches a safe name token
and is checked against the full verified name afterward. For example,
`Type: Null` can search literal `Null` without passing a colon into filter grammar.

The sampled English Pikachu page contained exactly 64 entries, so it cannot
establish the end of that name pool. Furret returned 12 English and four Spanish
entries; the four Spanish IDs were a subset of the sampled English IDs. English
Professor Oak returned 17 briefs, beginning with **Impostor Professor Oak**;
substring discovery is therefore not itself exact-name evidence. Grass Energy
returned 36 English entries and Energía Planta returned 16 Spanish entries.
These are dated observations and do not establish exhaustive language coverage.

Discovery supplies expansion hints only. A brief's explicit local number must
agree exactly with an existing canonical physical-set ID before it can suggest
that expansion. This is a bounded routing hint, not proof of membership. Every
returned candidate comes from the English set checklist; Spanish names overlay
only the same ID/local number and snapshot. Opaque official IDs remain valid
through an explicitly selected set, without decomposing or guessing their ID.
The existing physical-series metadata allowlist excludes Pocket/unknown series.

Matching scans at most six expansions and returns at most eight alternatives
inside a 20-second budget, using shared provider HTTP limits/caches and no
per-card detail fanout. Name discovery always sets `limited=true`; expansion or
result truncation and partial/failed checklist coverage remain explicit. An
unqualified number does not cause arbitrary expansion sampling. A known printed
total narrows expansions by official count, separate from provider checklist total.

Exact selected set plus normalized number can be strong when the English
checklist is verified and other supplied clues do not conflict. Names alone are
possible; deterministic `SequenceMatcher` ratio at least 0.78 supports similar
names (minimum four normalized characters) and remains uncertain without stronger
identity evidence. Ratios are comparison rules, not probabilities, and are not
returned as confidence percentages. Conflicting names/numbers/counts are uncertain.
Accents and punctuation normalize for comparison; gender symbols stay distinct;
numeric leading zeros and separators normalize without replacing letters by digits.
Briefs do not prove category, so category clues produce no ranking evidence.
