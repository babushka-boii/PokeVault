# Iteration 6 card scanner implementation plan

> **For agentic workers:** Use test-driven development, focused parallel implementation and independent final review. User explicitly authorizes implementation after the audit/plan and prohibits commits/pushes; no additional design approval or Git operations are required.

**Goal:** Real local OCR → editable clues → verified alternatives → explicit inventory confirmation.

**Architecture:** Stateless authenticated scanner APIs reuse CardProvider and inventory. Pillow validates/preprocesses inside an isolated, cancellable worker; Tesseract performs CPU OCR. React reuses artwork, session boundaries and CopyForm. No scan tables, images, OCR logs or migration.

**Stack:** Existing Python 3.14/FastAPI/PostgreSQL and React/TypeScript; add pinned Pillow, native Tesseract with English/Spanish language data. No ML framework, GPU, cloud recognition or multipart dependency.

**Spec:** User attachment `/Users/naimsalas/.codex/attachments/95293f4e-6cc6-45ea-b244-1a6e287ae482/Pasted text.txt` (Iteration 6).

## Audit and constraints

- Clean `feat/iteration-6-card-scanner`, HEAD `9f2854c`; 5D `104932a` and 5C `dc233c4` are ancestors; main is one evidence commit behind.
- Code migration chain 0001 → 0002 → 0003 → 0004; read-only development current = 0004 (head).
- Preserve existing work and credentials. No commit, push, merge, rebase, reset or development database mutation.
- Reuse CardProvider, English physical membership, verified Spanish aliases, existing inventory/session/CSRF/forms. Never construct an identity from OCR text or infer Pokémon species for Trainer/Energy.
- Never register during recognition. No photos/raw OCR/private inventory in persistent storage or logs.
- Existing public catalog stays public. Scanner recognizes/matches only with session + CSRF; public sets/cards remain a signed-out manual browsing route.
- Work in the explicitly prepared feature checkout. Tests use only dedicated disposable schemas.

## Decisions and alternatives

Tesseract is preferred over Apple Vision (platform-specific bridge) and neural OCR stacks (large models/native compatibility burden). Invoke argv without a shell through an isolated Python worker; process-group termination stops OCR on timeout/cancellation. Pillow provides a Python 3.14 Apple Silicon wheel, image verification and EXIF handling without OpenCV. JPEG/PNG are required; WebP only if the decoder is available; HEIC/HEIF are explicitly unsupported.

Raw image request bodies avoid multipart spooling before size validation. Bound upload to 8 MiB, decoded image to 16 million pixels and 8192 px per edge, normalized edge to 2048. Reject animation/corruption/MIME mismatch. Parent-managed temporary directory guarantees cleanup even when terminating the worker. Two worker slots, no unbounded queue, one Tesseract CPU thread per worker, 20 s worker deadline; matching has a separate 20 s budget.

Matching first uses selected/verified expansion and complete checklist. Otherwise use bounded name discovery/printed-total narrowing and at most six expansion checklists. English membership is canonical; both verified localized names may contribute. At most eight ranked candidates, explicit search-limited/partial-coverage notices, exact set+number stronger than names; no probability claims. Catalog details load only for selected identity.

Inventory retry identity uses optional UUID `Idempotency-Key` on existing POST: derive copy UUID from session owner plus key; existing primary key provides cross-process uniqueness. Same key/payload returns same copy, conflicting payload returns 409. No extra schema; guarantee lasts while that record exists, with deletion documented. Client retains key and original values across uncertain retries and creates a fresh key for intentional next copy.

## Shared interfaces

`app/scanner/schemas.py` owns strict `ScanClues`: name (0–100 chars), local_number (0–20), printed_total (1–2000 or null), set_id (Identifier or null), set_hint (0–100), category (Pokemon/Trainer/Energy/null), language (en/es/null). Unknown fields forbidden. `MatchRequest`: clues plus language en/es (UI preference).

`ScanCandidate`: card (existing SetCard), set (existing SetSummary), quality strong/possible/uncertain, evidence list of codes name_exact/name_similar/number_exact/set_exact/printed_total. `MatchResult`: clues, candidates (max8), status matches/no_match/insufficient_clues, limited boolean, warnings codes. `RecognizeResult` adds engine_languages (eng/spa), warnings includes OCR notices. No raw OCR response.

`ScanCapabilities`: available bool, languages list eng/spa, formats image/jpeg,image/png,(image/webp), max_upload_bytes=8388608.

`OCRService.capabilities() -> ScanCapabilities`; `await OCRService.recognize(data: bytes, content_type: str) -> OCRResult` (clues + engine_languages + warnings), raises ScanError(code,status). Parent creates one service per app. `extract_clues(lines)` and numeric/text normalization remain independently testable.

`await match_candidates(provider: CardProvider, request: MatchRequest) -> MatchResult`. Extend CardProvider for bounded catalog discovery; no second HTTP catalog client.

API: authenticated GET `/api/v1/scans/capabilities`; POST `/recognize?language=en|es` with raw image body; POST `/match` with MatchRequest JSON. POSTs require CSRF. Errors: 401/403 session/CSRF, 413 size, 415 type, 422 invalid image/fields, 429 worker capacity, 503 engine/provider unavailable, 504 processing deadline. All scanner responses no-store. Recognition/provider failure preserves the local preview/manual form.

## Review focus

1. Disconnect/account change while work or a save is pending: kill OCR and ignore late private responses.
2. Lost successful save response followed by retry: exactly one physical row, independent owners and intentional next copies still work.
3. Partial catalog/ambiguous numbers/Trainer/Energy: abstain or label uncertainty, never invent identity or completion.
4. Crafted image headers, huge dimensions and native output: bound before allocation, sanitize errors and clean temp files on all exits.
5. Edited input while earlier search resolves: new query wins; selected confirmation cannot refer to stale candidates.

## Tasks

- [x] **1. OCR worker/extraction:** `backend/app/scanner/{ocr,worker,images,extraction,errors}.py`; security/extraction/real synthetic tests; generator/evaluator in `research/scanner/`. Watch security/extraction tests fail, implement and run focused tests. Measure actual OCR latency/memory; explicitly synthetic-only evidence.
- [x] **2. Provider matching:** `backend/app/cards/provider.py`, `backend/app/scanner/matching.py`; deterministic provider transport and ranking tests. Verify bounded search filters against a few public TCGdex probes, preserve compact evidence. Cover accents, special numbers, conflicting/partial data, Pocket exclusion, timeout, caps and ambiguous name collisions.
- [x] **3. Frontend:** scanner service/page/styles, nav/router/dictionaries and shared CopyForm extension. Tests first for auth/file/preview/abort/manual correction/selection/explicit save/retry identity/success/navigation/stale accounts. Reuse owned quantity API and CardArtwork, lazy candidate art. All copy attributes and links to exact copy/card/expansion. Inputs remain accessible at desktop/mobile widths.
- [x] **4. API and inventory safety:** schemas/routes/middleware/app wiring, optional idempotency on existing inventory POST. API tests first (404 red), then strict image streaming/auth/body errors. PostgreSQL tests for concurrent replay, isolation, no recognition writes, derived progress and boxes unchanged. No migration.
- [x] **5. Integration/review/docs:** inspect independent diffs and whole change; fix actionable findings with regressions. Run full `bash scripts/check.sh`, real offline OCR evaluation, installed/unavailable startup checks. Update scanner guide, roadmap, architecture/data model/development/UX/README/Bitacora/Autoria with exact evidence and limits.

## Execution evidence

- Initial sandbox checks could not access localhost PostgreSQL. Approved read-only revision check and baseline gate succeeded: 43 provider fixtures, 355 backend, 315 frontend; lint/typecheck/build/whitespace pass. Native OCR initially absent.
- The resumed audit retained all existing modified/untracked implementation files. No worktree recreation, history changes or database migration was needed.
- Native Tesseract 5.5.4/Leptonica 1.87.0, English/Spanish language data and Pillow 13.0.0 are installed and exercised. Four native OCR tests and the application capability test ran without skips; a real missing-executable service test preserves manual matching.
- Independent review found three issues, all corrected and rechecked: clearing expansion also clears its hint; selected-set searches accept exact short official names; focus/pageshow/visibility revalidation preserves the same owner's photo/draft/retry identity. The last correction was preceded by eleven failing lifecycle tests. During revalidation the workflow is hidden/inert and pending requests abort; changed owner, logout or failed validation discards state. A suspended save requires explicit retry with its original key/payload.
- Final `bash scripts/check.sh` exited 0: 43 provider fixtures, 508 backend tests (75 PostgreSQL included), 379 frontend tests in 32 files, no failures/skips. Ruff, ESLint, TypeScript, production build (101 modules) and whitespace checks passed.
- Real OCR recheck on 14 original synthetic specimens: 11/11 top-1 and top-3 labeled matches, 2/2 abstentions, 1/1 ambiguity preserved; median OCR 0.2334 s, sampled process-tree RSS approximately 180.05 MiB. `research/scanner/results-final.json` preserves the final measurement alongside the original run. These samples do not measure real-photo accuracy.
- A separate production-service smoke used actual OCR and live public TCGdex: `sv03.5-025` ranked first among six alternatives in 3.130 s including provider work. No photo upload, inventory write or browser/OAuth interaction occurred.
- Technical, setup, academic attribution, limitations and manual-acceptance documentation are updated. Real photographs, Safari/Chromium camera and live Google browser acceptance remain manual checks, not claimed passes. No commit or push was performed.
