# Offline scanner evidence

These are 14 original text and geometric specimens, **not real card photographs**. No card artwork, user uploads, EXIF/GPS data or font files are included. The generated layout deliberately places a title near the top and a fraction near the bottom; this is a limited pipeline exercise, not a representative card-photo benchmark.

Run from the repository root with the backend virtual environment:

```sh
backend/.venv/bin/python research/scanner/generate.py
backend/.venv/bin/python research/scanner/evaluate.py
backend/.venv/bin/python -m pytest backend/tests/test_scanner_ocr.py backend/tests/test_scanner_extraction.py -q
```

Generation uses a locally installed font with Spanish glyphs: Arial on macOS or DejaVu Sans on Linux. `POKEVAULT_SCANNER_FONT` can select another local TrueType font. The manifest records the font path and each generated image's dimensions and SHA-256. Changing the font can change OCR results. The committed accented Spanish specimens were visually inspected after generation. Pillow's default font lacks the required accented glyphs and is intentionally not used.

Evaluation requires Tesseract and its `eng`/`spa` data. It makes no network requests: the real `OCRService` reads each PNG, then the production `CardProvider` and `match_candidates` execute against a local HTTP transport containing captured official facts. Process-memory sampling uses `ps`, which may need an unrestricted local terminal in a sandboxed environment.

## Captured catalog

`catalog.json` contains canonical IDs, local numbers, names, set/series metadata and counts from the English and Spanish TCGdex set endpoints for `base1`, `swsh3` and `sv03.5`. Each of the six source URLs, original-response SHA-256 values, capture timestamp and actual card counts is recorded there. Image URLs/bytes, attacks, descriptions and pricing were removed. There are 510 English physical checklist entries; available Spanish aliases come from the actual matching Spanish membership. The Spanish `base1` source has zero entries, which is preserved rather than inventing a translation.

Local name discovery filters these captured facts, then production matching verifies membership through the captured checklists. This measures ranking in a small known catalog, rather than live provider search, global retrieval or provider availability. No identity or translated alias is created from OCR text.

## Measured result

`results.json` records per-case extracted clues, candidate IDs/evidence quality, warnings, measured OCR latency and sampled process-tree RSS. `environment.json` records native versions and Spanish language-data provenance. These files contain only the public synthetic specimens' clues, never private OCR output or raw OCR lines.

| Check | Observed result |
| --- | --- |
| Real OCR → top-1 candidate | 11/11 labeled identity cases |
| Real OCR → top-3 candidate recall | 11/11 labeled identity cases |
| Blank/geometric-noise abstention | 2/2 |
| Name-only ambiguity preserved | 1/1; three Pikachu alternatives |
| Normalized name / printed number / total / category | 14/14 each, including empty/unknown fields |
| OCR latency, sequential scans | min 0.2084 s; median 0.2323 s; max 0.5063 s |
| Peak sampled process-tree RSS | approximately 178.27 MiB |

The native run used Python 3.14.10, Pillow 13.0.0 and Tesseract 5.5.4 with English and Spanish language data on macOS arm64. RSS is the sum for evaluator and descendants sampled approximately every 50 ms, including the short `ps` process; it can miss shorter peaks and is not a memory ceiling or a simultaneous two-worker measurement. Latency includes the per-scan engine-language probe, image worker startup, preprocessing and OCR; it excludes candidate matching and network activity.

Cases cover English and Spanish, Trainer/Energy headings, accents and punctuation, leading zero fractions, one small and one large image, low contrast, 2.5° tilt, 90°/180° orientation, a deliberately printed `Pikacbu` typo, name-only ambiguity, blank and geometric noise. The typo fixture intentionally tests fuzzy ranking; it is not evidence that a real Pokémon card has that printed spelling. All ranking still uses captured official catalog identities.

**Limits:** the perfect result on this tiny synthetic set is not a calibrated confidence, real-photo accuracy estimate, or evidence about glare, foil, cluttered artwork, severe blur, perspective, arbitrary card layouts, other fonts or the full global catalog. No real-photo or manual-browser/OAuth verification was performed by this evaluation. Weak/missing clues still need user correction, catalog verification and explicit selection.

## Security and process evidence

Focused tests exercise empty/oversized uploads, MIME/content mismatch, corruption, excessive dimensions and decompression-bomb headers, animated PNG, EXIF orientation, metadata stripping, resizing, engine unavailability/failure, bounded native output, native/per-worker deadlines, process-group termination, live cancellation, parent temporary-directory cleanup, two-worker immediate busy rejection, conservative numeric extraction and four actual native English/Spanish/orientation scans. Glued `HP60/100`/`PS60/100` and historical copyright-year fractions are explicitly rejected as identifiers. The focused run passed 47 tests with no skips in this environment.

The supervisor allows two active recognition jobs, one OpenMP thread per native call, at most four orthogonal OCR attempts, a 5 s native-call deadline and a 20 s image-worker deadline. The separate engine-language probe has a 3 s deadline, so recognition supervision can take up to approximately 23 s before cleanup overhead. HTTP upload and provider-matching deadlines are separate. The parent removes scratch files even if it must kill the complete worker/native process group; it never persists scans in the database.


## Final recheck — 2026-11-11

`results-final.json` preserves the new run after the extraction/ranking review fixes;
`results.json` retains the initial evaluation. The same 14 specimens again produced
11/11 top-1 and top-3 hits, 2/2 abstentions and 1/1 preserved ambiguity; normalized name,
number, total and category expectations matched 14/14 (including empty fields).
Final observed OCR latency was 0.2020–0.4981 s, median 0.2334 s; approximate sampled
process-tree RSS was 180.05 MiB. The same measurement limitations above apply; no claim of
real-photo accuracy or hard memory bounds follows.

`live_smoke.json` separately records actual local OCR followed by the production
matcher using live public TCGdex on 2026-11-11. The original upright English specimen
produced Pikachu/025/165; `sv03.5-025` ranked first among six alternatives, labeled
possible with conflicting alternatives explicitly uncertain. Elapsed service time
was 3.130 s including provider work. This was one networked service probe, not a
browser/OAuth/inventory test or global accuracy study. Only catalog queries left
the computer; no image upload, inventory write or artwork download occurred. The
initial sandbox attempt returned provider_unavailable; approved network access
then completed successfully. Standard tests/evaluation remain offline.
