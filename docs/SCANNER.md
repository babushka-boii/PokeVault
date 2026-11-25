# OCR-assisted card scanner — Iteration 6

The scanner helps a signed-in collector identify a physical printing. A photograph
is evidence to review; it never creates inventory. The workflow is upload/capture →
local OCR → editable clues → catalog alternatives → explicit selection → physical
copy form → Save. Manual matching also works when OCR is unavailable. Signed-out
users can continue browsing the public expansion/card catalog.

## Engine and installation

Tesseract performs actual CPU OCR. Pillow 13.0.0 verifies and preprocesses images;
both are compatible with this environment's Python 3.14.10 and Apple Silicon.
Direct subprocess invocation avoids another Python wrapper and gives the API
control over deadlines, output size and cancellation. Apple Vision would require
a macOS-specific bridge; neural OCR stacks would add large models/frameworks and
compatibility work. Neither is needed for this iteration. There is no cloud OCR,
GPU requirement, browser OCR bundle, OpenCV dependency or training step.

Tesseract and its official language data use Apache-2.0; Pillow uses the HPND
license. Consult the [official Tesseract installation guide](https://tesseract-ocr.github.io/tessdoc/Installation.html),
[Homebrew formula](https://formulae.brew.sh/formula/tesseract) and
[Pillow platform support](https://pillow.readthedocs.io/en/stable/installation/platform-support.html).

Install the Python dependency with the existing project requirements:

```sh
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
```

On macOS, `brew install tesseract` installs the native engine with English and
orientation data. For Spanish, either install `tesseract-lang` (all languages), or
install just the official `spa.traineddata` into Tesseract's reported tessdata
directory. This session used the smaller, versioned file:

- Source: `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/4.1.0/spa.traineddata`
- SHA-256: `6f2e04d02774a18f01bed44b1111f2cd7f3ba7ac9dc4373cd3f898a40ea6b464`
- Local destination: `/opt/homebrew/share/tessdata/spa.traineddata`.
- Verified native version: **Tesseract 5.5.4**, Leptonica 1.87.0, NEON; languages
  `eng`, `osd`, `spa`. `osd` is not required by this bounded rotation workflow.

For Debian/Ubuntu, install `tesseract-ocr tesseract-ocr-eng tesseract-ocr-spa` through
the OS package manager. Arch uses `tesseract tesseract-data-eng tesseract-data-spa`.
Verify `tesseract --version` and `tesseract --list-langs` in the API's environment.
The executable must be on PATH; standard `TESSDATA_PREFIX` may select language data.
Do not change database/OAuth secrets to configure OCR. Restart the API after native
installation. No migration is needed: code and populated development DB remain 0004.

The API starts even if Tesseract/language data is absent. Capabilities report
`available: false`, recognition returns an explicit 503, and corrected-field matching
remains available. If only one supported OCR language is installed, the response
declares it and warns about partial language support.

## Images and privacy

| Boundary | Limit/behavior |
| --- | --- |
| Encoded upload | 8 MiB (8,388,608 bytes), enforced while streaming; 10 s receive deadline |
| Accepted content | JPEG, PNG; WebP when available; HEIC/HEIF with pillow-heif |
| Rejected formats | GIF, TIFF, SVG, PDF and other unadvertised formats; animation/multiple primary images are rejected |
| Decoded size | At most 16,000,000 pixels, no edge above 8,192 px |
| OCR working image | EXIF-oriented, at most 2,048 px on either edge, metadata-free grayscale |
| OCR capacity | Two active recognition/upload slots per API process, immediate 429 when busy |
| Native processing | One Tesseract thread per worker, at most four 0/90/180/270° attempts |
| Deadlines | Native language probe up to 3 s; worker up to 20 s; each native attempt up to 5 s; matching separately up to 20 s |
| Manual match/capabilities | Four concurrent API slots; corrected JSON body at most 4 KiB |

The client uploads raw image bytes with their Content-Type. The server independently
checks the decoded format against that type, validates headers/dimensions before full
decode, verifies integrity, and rejects Pillow decompression-bomb warnings/errors.
Filenames and embedded metadata never establish card identity. No client URL is fetched.
HEIC/HEIF decoding is automatic with pinned pillow-heif 1.8.1. Capabilities omit these formats if its native binary cannot load; JPEG/PNG remain available. A photo above the pixel
limit must be resized first; the API does not decode an unlimited image to resize it.

EXIF orientation is applied before resizing. Transparency is composited on white;
grayscale receives restrained autocontrast blending. No complex perspective detector,
segmentation or destructive binary threshold is used. Mild rotation is evaluated on
synthetic samples; perspective, foil glare and real camera backgrounds remain limits.

Pillow decoding and Tesseract execute in a disposable Python worker, outside the
async request loop. Native calls use explicit argv, no shell, bounded output, and a
minimal environment without application credentials. The parent owns a private
temporary directory and terminates/reaps the process group on cancellation, timeout
or failure before removing it. Uploaded photos, EXIF/GPS and raw OCR are neither
persisted in PostgreSQL nor logged. Only normalized clues leave the worker.

The browser keeps the original preview via an object URL while the workflow is
mounted, revokes replaced/unmounted previews, and stores no photo, OCR or inventory
data in persistent browser storage. Session revalidation immediately hides/inerts
the private scanner and aborts requests, retaining in-memory work only while the
same owner is being checked. Successful same-owner validation restores the photo,
clues and draft; logout, a different owner or failed validation discards them.
Late responses cannot restore discarded work. Scanner
responses, including errors, use no-store/no-cache. Disconnect cancellation reaches
the OCR child, while public catalog caches contain only provider data.

## Extraction and matching

Clues are card name, local number, optional printed total, expansion hint/selected
canonical set ID, category and language hints. OCR lines and positions are transient.
Names are read conservatively from the top region; known labels/HP/evolution lines
are excluded. Fraction context supports `025/198` and prefixed identifiers, retaining
leading zeros. O/I/L → digit correction is restricted to numeric fraction context;
ordinary names are never rewritten that way. Conflicting number fractions abstain.
Standalone promo numbers without a fraction, such as `SWSH183`, currently require
manual number entry; they are not guessed from arbitrary text. Enter the local
number and printed total in their separate manual fields. Very short OCR text is
conservatively ignored; official short names such as `N`/`AZ` work by exact manual
name matching after selecting their expansion.
HP, attack damage and copyright text do not establish card numbers. Trainer/Energy
headers never imply a Pokémon species.

The existing CardProvider supplies the bounded English physical-set catalog,
canonical set membership and verified Spanish overlays. It owns all TCGdex requests,
the shared five-request semaphore, asset validation and existing TTL/LRU caches.
Pocket and unclassified series remain excluded. No second catalog implementation or
global card download is introduced; selected details use the existing card API.

1. Prefer a selected supported set or an exact catalog name/ID match for the set hint.
2. Otherwise narrow by the printed **official** count, or discover expansion IDs
   through bounded English/Spanish name queries (at most two 64-brief pages per
   language; a safe three-letter token is a fallback when the full name finds no
   physical expansion). Printed count and provider checklist
   size remain separate concepts, as in 5D.
3. Inspect at most six expansions' canonical checklists and verified aliases. Provider
   briefs never bypass English membership validation. No card ID is built from OCR.
4. Compare Unicode/accent/punctuation-normalized names and normalized local numbers.
   Fuzzy names use deterministic string similarity, not a probability. Category is
   not scored because lightweight checklist briefs do not prove it.
5. Return at most eight candidates ordered by evidence, similarity and stable IDs.
   Exact expansion + number is strongest; name alone is never unique. Conflicting
   clues lower quality, partial coverage is disclosed, and insufficient clues abstain.

Labels are **strong**, **possible** or **uncertain**. They describe evidence, not
calibrated confidence. Each candidate includes the stable official ID, number,
expansion, artwork where available and evidence codes. The user must select a result;
ties or even a single strong candidate never register automatically. Search limits
mean absence from results is not proof that a card does not exist. Selecting an
expansion and correcting the printed number is the most reliable way to narrow it.

Internal ordering weights (not exposed as confidence): +1000 for exact set+number,
+400 exact name, +250 exact number, +150 similar-but-not-exact name, +60 matching
printed total, −500 for conflicting supplied name/number/total. Name similarity is
Python SequenceMatcher's `2*M/(len(a)+len(b))` over normalized text, threshold 0.78
with at least four name characters. Ties use similarity, set ID and card ID. Quality
labels additionally require complete membership/no conflicting clues for strong
set+number evidence. None of these numbers is calibrated to recognition accuracy.

## API

All scanner endpoints require the existing opaque session. Both POSTs additionally
require the allowed Origin and current X-CSRF-Token. No user ID is accepted.

| Method/path | Request → response |
| --- | --- |
| GET `/api/v1/scans/capabilities` | available, installed supported languages, accepted MIME types, max upload bytes |
| POST `/api/v1/scans/recognize?language=es\|en` | Raw image body → clues, candidates, status, limited, warnings, engine_languages |
| POST `/api/v1/scans/match` | `{clues, language}` → clues, candidates, status, limited, warnings |

`clues`: name ≤100 chars, local_number ≤20, printed_total integer 1–2000 or null,
set_id validated Identifier or null, set_hint ≤100, category Pokemon/Trainer/Energy
or null, language en/es or null. Unknown fields/control characters are rejected.
Response status is matches/no_match/insufficient_clues. No raw OCR text is returned.
Errors are sanitized: 401 session, 403 CSRF, 408 slow upload, 413 bytes, 415 type,
422 invalid/corrupt/oversized decoded image or fields, 429 busy, 503 unavailable
engine/provider, 504 OCR deadline. A disconnected request cancels processing (499
internally). The preview and manual form remain usable after recognition failure.

## Explicit inventory confirmation and retries

Selection opens the shared physical-copy form: condition, physical language,
finish/variant, acquisition date and notes. The confirmation shows the exact
printing, owned quantity when available, and official details. Saving uses only
`POST /api/v1/inventory`; there is no scanner inventory endpoint or extra copy table.
Success exposes the physical UUID and links to its exact collection record, card,
expansion/progress and another scan. Boxes are never assigned automatically.

The existing inventory POST now accepts an optional UUIDv4 `Idempotency-Key` header.
The server derives a UUID from that key within the session owner's namespace. The
existing primary key atomically resolves concurrent repeats across API processes:
same key + same attributes returns the same record (201); conflicting attributes
return 409 without overwriting. A replay can succeed even if the provider is now
unavailable. Ownership/CSRF are still checked and a session that expires or logs out
during initial catalog validation is rejected before insertion.

The client synchronously blocks repeated submits and retains one key/original payload
for explicit retries after an uncertain response. A fresh intentional addition gets
a new key. This is record-backed idempotency, not a permanent event ledger: deleting
the record ends the replay guarantee; editing it can cause a conflicting replay.
Keys/drafts survive successful same-owner revalidation in memory; an interrupted
save becomes uncertain and retains its original key/payload for explicit retry.
They do not survive page reload, logout, changed ownership or failed validation.
If a response is lost
and the workflow is discarded, inspect My Collection before starting a new addition.
Unkeyed API calls retain the existing intentional-one-row-per-request behavior.

Set completion automatically derives distinct printing ownership from the existing
inventory. A duplicate increases quantity but not the distinct denominator/numerator.
Existing box memberships and their same-owner foreign keys are untouched.

## Verification and manual acceptance

Standard tests use offline provider/Google boundaries and disposable PostgreSQL
schemas. Real native OCR is evaluated on original generated text-and-shape images,
not copyrighted card artwork or private photos; see `research/scanner/`. Synthetic
results do not establish photographed-card accuracy. Exact final test counts and
measured evaluation data are recorded in DEVELOPMENT.md and the research report.

1. Start API/frontend, verify installed languages, sign in and open Scanner in ES/EN.
2. Upload a JPEG/PNG and select a phone photo or camera capture. Replace/remove it;
   check portrait/landscape preview, visible limits and unsupported HEIC guidance.
3. Recognize a clear card, cancel/retry, then try glare/rotation/unreadable text. Check
   that weak results admit uncertainty and never create a copy.
4. Correct name/number, search/select an expansion, run successive searches and inspect
   alternatives/full details. Verify the official ID, local number and selected set.
5. Confirm a copy with each physical attribute; double-click Save and simulate a lost
   response/retry. Expect one UUID. Start a fresh addition for an intentional duplicate.
6. Open that exact collection record/card/expansion. Check quantity, distinct progress
   and unchanged personal boxes. Assign a box only through the existing workflow.
7. Expire/log out/switch accounts while recognition/search/save is pending. No prior
   private state or late result may reappear. Check keyboard focus, announcements,
   desktop and phone widths in Safari and Chromium.
8. Run without Tesseract and with a provider outage: explicit error, retained preview,
   manual correction/search where the catalog is available, and no fabricated result.

Full real-photo, live Google, camera hardware and cross-browser acceptance remain
separate from the automated evidence. Future improvements should be driven by a
consented real-photo dataset: better framing/deskew, number-region selection, verified
expansion-code metadata and measured ranking changes, without weakening confirmation.


## Milestone A verified — 2026-11-23

The interrupted HEIC/baseline milestone is complete. `pillow-heif==1.8.1` is already
installed on this Apple Silicon/Python 3.14 environment. Its Pillow plugin decodes
HEIC/HEIF inside the existing isolated worker, with one decode thread, auxiliary,
depth and thumbnail decoding disabled, and libheif security limits enabled. Existing
8 MiB, 16-million-pixel, 8192-edge and deadline/cancellation bounds remain intact.
Content must match the MIME family; orientation is applied once and metadata is
stripped. Compatible binary wheels are required on other deployments; an unavailable
decoder is reported through capabilities. Browser HEIC preview may be unavailable;
raw-file recognition does not require a preview or manual conversion.

Both authorized originals were processed directly as HEIC, with real local Tesseract
and public TCGdex metadata. Cranidos 044/084 ranked `me05-044` first; Armarouge 086/084
ranked `me05-086` first, with `me05-012` retained as an uncertain alternative. Both
leading candidates are **possible**, never automatically confirmed. The existing
geometry/regional OCR changes predate this milestone's verification; no additional
recognition algorithm or UI redesign was implemented in this session.

The preserved baseline read “hat” + 044/084 (correct candidate through number alone)
and “xe” without a number (no candidates). Source snapshots, input hashes and actual
measurements are in `research/scanner/real_photo_baseline_verified.json` and
`real_photo_heic_milestone_a.json`; originals remain outside the repository. These
two development examples are not a held-out accuracy benchmark. This supersedes
earlier HEIC-unavailable and no-real-photo statements in this historical guide.

Manual acceptance still needs a real iPhone/browser file selection, authenticated
confirmation, next-card flow and account switching. Later milestone work must finish
reviewing the pending recognition/UI/visual changes and the full integration gate.


## Milestone B — bounded localization fallback (2026-11-23)

Previously, geometry kept the original image when no reliable rectangle existed,
but an accepted rectangle discarded the original OCR path. An existing unfinished
regression reproduced an unproductive crop. The worker now retains validated source
pixels and checks original-frame OCR after a successful rectangle detection.

A complete crop receives one original-frame check at its selected orientation. An
incomplete crop can try at most four distinct orthogonal original orientations,
starting with the crop's selected orientation. These passes share at most four
seconds and the existing 18-second internal/20-second supervisor deadline. Together
with the existing crop/title/footer work (including the outlined-number footer
pass) there are at most twelve native calls.
Uncertain geometry already uses the whole frame and does not duplicate this work.

Original-frame tokens require native confidence >=55. Deterministic selection orders
complete name+number readings above number-only, then name-only, then empty readings;
ties retain the localized reading. These are extraction heuristics, not calibrated
identity confidence. A selected reading stays intact: separate paths' names and
numbers are never spliced. Different normalized names or number/total pairs produce
`localization_conflict`; a stronger original reading emits `original_image_selected`.
Fallback errors/deadlines retain prior clues with `localization_fallback_unavailable`.
The UI explains these notices in ES/EN. Catalog ranking/quality rules are unchanged.

The geometry rules remain conservative quadrilateral checks: convexity, area, side
ratios, corner angles, unclipped edges and competing-object overlap. They can still
mistake a plausible background rectangle for a card. Complete wrong crops tied with
complete original readings are flagged, not automatically resolved. The original
path still uses photo-relative title positions; extreme framing, glare or unreadable
pixels can leave both paths weak. Explicit printing confirmation remains mandatory.

Real-photo evidence is in `research/scanner/real_photo_milestone_b.json`. Both names,
numbers, top candidates and possible labels are unchanged from A. OCR rose from
1.9509 to 2.3296 s (Cranidos) and 1.6596 to 2.2734 s (Armarouge); both now disclose
conflicting full-photo OCR. No private image files enter the repository. These are
single runs on two development photos, not general accuracy/performance estimates.


### Milestone C — consecutive scanning and session lifecycle (2026-11-23)

Existing behavior was retained: file/camera selection queues one recognition; selecting an
official candidate opens the physical-copy form; only explicit save registers inventory.
Successful saves retain condition/language/variant in account-scoped memory, not dates or
notes. Scan next clears the image, clues, candidates and errors and permits the same file
again. Each new confirmed scan has a fresh idempotency key; uncertain retries keep the
original key and payload. No database or OCR changes were needed.

This milestone finishes the queued recognition effect with a cancellable timer (and
file-identity guard), resolving the interrupted React lint failure. Scan next now focuses
the image chooser after it mounts, instead of leaving keyboard focus on the document body.
Existing request abort guards reject stale responses. Same-owner validation hides/inerts
private UI, cancels pending work, and retains drafts; failed validation, logout or account
switching discards the subtree and its private data. Aborting a save cannot undo a server
commit: retry the same retained intent after ordinary revalidation. Leaving the page or
logging out loses that in-memory retry identity; check inventory before registering again
if the previous outcome was uncertain.

Validation: 98 passed, 0 failed, 0 skipped across Scanner.test.tsx (67),
scanner.test.ts (20), inventory.test.ts and Inventory.test.ts (11 combined).
Tests include new same-printing/different-printing consecutive saves and logout during
recognition/save, plus existing replacement, cancellation, unmount, timeout, provider error,
duplicate-submit, lost-response retry, session validation, expiry and account-switch cases.
Scoped ESLint and TypeScript passed; no backend changes, OCR reruns or full gate.

Manual browser acceptance (not executed this milestone):
1. On a phone, capture, select the official candidate, save and scan next in Spanish/English.
2. Scan the same file twice deliberately and a different card; verify distinct copies,
   retained condition/language/variant and cleared notes/date.
3. Double-click save and simulate a lost response; retry the same intent and verify one copy.
4. Replace/cancel a slow scan, navigate away, revalidate, expire the session and switch accounts.
   Confirm no stale result, private quantity or success appears in the new session.
5. Check narrow-screen controls, keyboard focus and screen-reader success/error announcements.

Limitations: tests use mocked HTTP in jsdom; native camera dialogs and mobile accessibility
still require real-browser acceptance. Backend OCR behavior is unchanged from Milestone B.

### Milestone D — real browser acceptance (2026-11-23)

Native Zen browser control was used because the browser connector was unavailable.
Existing Google OAuth completed normally; authentication and CSRF remained enabled.
Local services: frontend http://localhost:5173, API http://localhost:8000.
API health reported PostgreSQL healthy. Tesseract 5.5.4 and pillow-heif 1.8.1
processed the original private HEIC inputs locally; no photograph was committed or
sent to a third-party recognition service.

Observed browser flow:
- Spanish: original Cranidos HEIC → leading me05-044, 044/84, possible match,
  name/number/printed-total evidence → explicit selection and save → success.
- Scan next cleared the photograph and candidates and focused the file chooser.
- English: original Armarouge HEIC → leading me05-086, 086/84, possible match,
  name/number/printed-total evidence → explicit selection and save → success.
  Alternative me05-012 remained uncertain. Conflict warnings were retained.
- Save controls disabled during registration; success headings received focus.
- Both saved-copy pages were opened successfully; Cranidos also survived a full
  navigation/reload. PostgreSQL readback verified both rows and migration 0004.

Exactly two acceptance copies were added and intentionally retained:
Cranidos a8791254-d417-5364-a99c-da226dc6eb52;
Armarouge 66f184e7-16b4-5502-b9c4-a4c887fb4c1d.
Armarouge already had one owned copy before this explicit registration.
Existing records were not deleted or changed. No browser OCR duration was measured.

Focused evidence: 43 backend API/PostgreSQL tests and 98 frontend tests passed.
Race, duplicate-submit, lost-response retry, cancellation, expiry, logout and account
switch cases use automated tests, not fault-injected browser sessions. Dedicated
PostgreSQL test schemas verify durable idempotency and intentional duplicate copies.

The first full gate found one pre-existing visual-module false positive: a lone
inlier in a third cell allowed concentrated matches to pass spatial coverage.
Require three supported regions with at least three inliers each. The existing
negative regression and all 15 visual tests pass; hybrid recognition remains
unintegrated and no live OCR behavior was changed.

Remaining manual acceptance:
1. Open http://localhost:5173/scanner on the development Mac and repeat with other
   photographs; two successful originals do not establish general OCR accuracy.
2. Test a real phone camera and narrow viewport, touch controls and VoiceOver.
   localhost on a phone refers to that phone; LAN/OAuth configuration was not changed.
3. Exercise disrupted networks/session changes in a real browser if desired; automated
   coverage is not device evidence. After leaving an uncertain save, inspect collection
   before registering again because the in-memory retry identity is no longer available.

The next gate passed all 586 backend tests, then exposed 25 existing scanner lint
violations. Formatting was corrected in geometry.py, hybrid.py and the artwork,
hybrid and region test modules; one redundant UTF-8 encode became a bytes literal.
No assertions were removed or weakened.

### Milestone D — final validation (2026-11-23)

Real Zen browser acceptance completed with existing Google OAuth, local FastAPI,
PostgreSQL, Tesseract 5.5.4 and pillow-heif 1.8.1. Original HEIC Cranidos → me05-044
and Armarouge → me05-086 ranked first as possible matches. Explicit selection and
save created exactly two acceptance copies, retained in the development database.
Both collection detail pages and read-only PostgreSQL queries confirmed persistence;
migration remains 0004. Spanish/English flow, next-scan reset and focus were observed.
Race/failure scenarios have automated coverage, not browser fault-injection evidence.

Final bash scripts/check.sh exited 0: 43 unittest cases, 586 backend cases (including
75 PostgreSQL integration cases), 406 frontend cases across 32 files; zero failures
or skips. Provider validation, Ruff, ESLint, TypeScript, build and whitespace passed.
Earlier gate attempts found one copied-patch false positive in existing unintegrated
visual code and 25 scanner lint violations. Fixed without enabling hybrid recognition
or weakening tests. Focused runs: 43 backend, 98 frontend and 15 visual tests passed.

Ready for final user acceptance. Mobile camera/touch, narrow-screen and VoiceOver
remain manual: http://localhost:5173/scanner on the development Mac. No private images
stored in the repository, secrets changed, database resets, commits or pushes.
See docs/SCANNER.md for copy identifiers and detailed browser evidence.

### Five-photo acceptance regressions — 2026-11-23

Seven unchanged local files were evaluated through OCRService and CardProvider:
five user-supplied WhatsApp JPEGs (900×1600) and the two previous HEIC originals.
Images stayed local. Hashes, extracted clues, candidates, warnings and timings are
in research/scanner/acceptance_regression_before.json and acceptance_regression_after.json.
Reproduce with PYTHONPATH=backend backend/.venv/bin/python
research/scanner/evaluate_acceptance.py INPUT_DIR OUTPUT_JSON. Catalog lookups are
live, so metadata and network latency may change. No inventory registrations were made.

Diagnosis:
- Jamming Tower: JPEG decoding succeeded. Default edge detection found no valid
  quadrilateral, so card-relative footer recovery sampled the photograph background.
  Full-image OCR read both "EN: TRENADOR" and "Torre de Interferencia", but extraction
  selected the former. No number/total survived. With a recovered frame, sparse OCR
  split the title and returned "Est." first; the old narrow Pokémon title region
  did not fit the Stadium layout. This was primarily framing/title extraction.
- Galarian Zigzagoon: decoding and localization succeeded; sparse OCR missed the
  large name, but existing regional recovery read "Zigzagoon de Galar" correctly.
  Footer OCR produced "1130/2178)" then "130/2178)"; total 2178 was correctly rejected
  by the 2000 limit. The actual Spanish title therefore entered name-only discovery.
- A separate discovery-budget defect affected both titles: English prefix hits and
  Spanish hits were unioned and alphabetically truncated to six expansions. Correct
  me02.5 could be excluded before checklist loading. It was not a missing card,
  unsupported regional form or rejection of a number above the official total.
- Live TCGdex verified me02.5-261 (Jamming Tower, Trainer/Stadium, official count 217,
  total checklist 295) and me02.5-130 (Spanish Zigzagoon de Galar). Number-only matching
  already supports incomplete titles and secret numbers without inventing IDs.

Changes:
1. Only when initial localization finds no candidate, try one smoothed edge/hull
   pass at the existing 1024 analysis bound and 256-contour limit. Existing quad,
   clipping, ambiguity and original-image OCR fallback checks remain.
2. Trainer recovery uses a wider title band with block OCR, replacing its narrow
   title pass rather than adding retries. Fragmented standalone Trainer labels
   and abbreviated Stadium headers are excluded from names.
3. Prioritize corroborated multilingual discoveries and OCR-language discoveries
   before allocating the unchanged six-checklist budget. Canonical checklist
   verification and confidence rules remain unchanged.

| Photo | Extracted title before → after | Number/total after | Top result before → after | OCR seconds before → after | Total seconds before → after |
| --- | --- | --- | --- | --- | --- |
| Scorbunny | corbu → corbu | 036/217 | me02.5-036 → same | 1.85 → 1.78 | 3.35 → 3.23 |
| Jamming Tower | EN: TRENADOR → Torre de Interferencia | unreadable | none → me02.5-261 | 3.32 → 4.12 | 3.32 → 7.41 |
| Misdreavus | Misdreavus → same | 085/217 | me02.5-085 → same | 1.11 → 0.88 | 1.12 → 0.89 |
| Galarian Zigzagoon | Zigzagoon de Galar → same | unreadable | none → me02.5-130 | 3.11 → 2.93 | 6.62 → 6.42 |
| Palafin | Palafin → same | 022/84 | me05-022 → same | 2.56 → 2.02 | 2.56 → 2.03 |
| Cranidos | Cranidos → same | 044/84 | me05-044 → same | 2.35 → 2.32 | 4.98 → 5.05 |
| Armarouge | Armarouge → same | 086/84 | me05-086 → same | 2.36 → 2.29 | 2.36 → 2.30 |

All expected cards now have rank 1; previously the two failures were absent.
This is 5/5 top-ranked on this acceptance sample, not general accuracy or uniquely
verified printing recognition. Jamming Tower still has sv06-153 and sv10-243 as
same-name alternatives; Zigzagoon has four other printings. Their relative order
does not establish the physical printing without the unreadable number.
Both remain possible matches, requiring explicit confirmation. Scorbunny remains
uncertain because its partial title conflicts with the exact number. Existing crop
conflict and category-unverified warnings remain visible. No numbers were guessed,
truncated or corrected from catalog expectations.

Latency values are single sequential runs with cache/network effects, not a benchmark.
Jamming Tower costs about 0.8 seconds more OCR plus successful catalog discovery.
Unsuccessful experimental inversion/threshold/blur sweeps were not added to production.
Security limits, worker isolation, HEIC, auth/CSRF, retry identity and inventory semantics
are unchanged. Real-browser acceptance was not repeated for this regression session.

Final verification: 100 focused tests passed. One complete scripts/check.sh run passed: 43 unittest, 593 backend, 406 frontend; zero skips/failures. Lint, types, build and whitespace passed.

### Outlined collector numbers — 2026-11-23

Galarian Zigzagoon and Jamming Tower print the collector number as a dark fill
inside a light outline. Tesseract read only the outline strokes (for example
"1130/2178)"), so no number survived. A third footer pass, used only when the plain
and thresholded passes fail, thresholds the light outline, flood-fills everything
reachable from the crop border as background and keeps the enclosed dark regions
(the glyph shapes) as black text on white (`_enclosed_glyphs` in worker.py).

Local evaluation (Tesseract 5, eng+spa, single run, not a benchmark): Zigzagoon
130/217 and Jamming Tower 261/217 are now read; the 14 synthetic samples and the
other five photos produce identical clues. Jamming Tower OCR also finished sooner
because the original-frame fallback stops at a complete reading.

The italic flagged "1" remains fragile: some preprocessing variants (other block
sizes, English-only, shear correction) consistently read 430 or 730. Agreement
between variants is therefore not proof. The reading is only OCR evidence; matching
keeps reporting name/number conflicts as uncertain and still requires confirmation.

## Visual feedback and crop (Iteration "scanner visual")

`POST /scans/recognize` also returns `corners`: the outline `geometry.py` already finds, as four points normalized 0-1 on the EXIF-oriented photo (top-left, top-right, bottom-right, bottom-left), or `null` when no reliable outline was found. OCR, matching and the photo handling are unchanged: the photo is still never stored.
While it recognises, the preview shows a cyan beam sweeping top to bottom inside viewfinder corners, the dimmed photo in a chamfered frame and the text "Analizando carta…" (`role="status"`), for at least 1.2 s so it never flashes. With reduced motion there is no sweep and no transition, only the static frame and the same text.
When corners arrive, the photo is clipped to the outline and straightened into a 63:88 frame with `matrix3d` (`components/scanner/perspective.ts`, a homography). With `null` corners, an error, or HEIC without a preview, nothing is cropped (HEIC shows only the status text).
The crop is only a preview aid: it never changes the clues, the candidates or what gets saved, and a malformed `corners` value is dropped instead of failing the scan.
Tests: the geometry and API tests cover corners with and without detection; `ScanPhoto.test.tsx` covers the minimum duration, the crop and the no-corners cases.
