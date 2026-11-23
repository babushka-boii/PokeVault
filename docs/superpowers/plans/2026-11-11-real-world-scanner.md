# Real-world scanner improvement plan

**Goal:** Ordinary single-card photographs should lead to verified suggestions with automatic framing and minimal correction; saving remains explicit.

**Spec:** User attachment `4217d078-1198-43d8-9ab8-5d2ece35067a/Pasted text.txt`.

**Authorization:** Continue implementation autonomously under the existing user instructions. Preserve all current work, credentials, database contents and Git history. Do not commit or push. Use focused independent work and final review; no separate checkout is needed for the user's prepared feature branch.

## Audit and hypotheses

The existing implementation and 43/508/379 passing baseline remain intact. A source snapshot plus SHA-256 manifest is preserved outside Git at `/private/tmp/pokevault-scanner-before-real-world`. Root-cause reproduction with the same original synthetic card, placed lower in a dark photograph-sized canvas, loses its name while retaining 025/165. The current top-30%-of-photo extraction, whole-frame resize, sparse-text-only segmentation and early exit on any name/number explain this behavior. They do not prove the precise cause in the two reported photographs: those photographs have been requested and are not yet accessible.

## Approaches to compare

1. Existing whole-frame OCR (baseline), then simple luminance bounding-box cropping plus region OCR: smallest dependency surface, poor separation under shadows or perspective.
2. Bounded contour/quadrilateral detection, conservative homography and region OCR, plus local visual verification against a small verified candidate list: better geometric correction, requires headless OpenCV/NumPy. Evaluate ORB geometric evidence against perceptual hashes; generic frame similarity must never establish printing identity.
3. Large neural vision models/cloud OCR: defer unless the measured lightweight approaches fail; no model, external-photo upload or licensing assumption is authorized by popularity alone.

The selected pipeline must retain the whole-image fallback when framing is ambiguous. Do not force a quadrilateral, infer identities from colors or hardcode the reported names/numbers. Candidate-only visual verification cannot discover an unknown card when all text retrieval fails; report this limit explicitly. Real-photo results remain pending authorized inputs and cannot be replaced by transformed artwork or synthetic fixtures.

## Implementation boundaries

- Keep 8 MiB/16M-pixel/8192-edge input limits, isolated killable workers, two admission slots, one native thread, 20 s worker bound and five-second native calls.
- Analyze geometry at a bounded resolution, rectify from the bounded decoded source, cap working pixels and OCR attempts. Name/footer crops must map coordinates back to card-relative positions. Preserve a safe whole-frame fallback and reject ambiguous multiple cards.
- Reuse CardProvider canonical physical membership and existing catalog/cache clients. Any artwork fetch must be catalog-derived, exact HTTPS host/path allowlisted, redirect-free, size/time bounded and cancellable. No supplied URL, persistent photo or raw OCR logging.
- Hybrid evidence may change ordering only with verified visual correspondences and explicit ambiguity handling; no percentage confidence or automatic save. Manual matching must remain independent of image processing.
- React keeps existing account suspension/idempotency boundaries. Put corrected fields behind an explicit disclosure; show the leading candidate prominently with alternatives available. Keep condition/language/finish choices in the account-scoped in-memory scanner session for subsequent cards; do not carry notes or persist private data.

## Tasks

- [ ] Reproduce baseline failures; obtain authorized real photographs and record rights, hashes and labels privately. Compare on identical inputs, retaining synthetic/transformed images as a separate stratum.
- [ ] Evaluate Pillow bounding box vs OpenCV quadrilateral correction, perceptual hashing vs ORB. Record dependency size/version/license and comparative outcomes before retaining the selected implementation.
- [ ] Add failing geometry/region/extraction tests, implement conservative framing and OCR, then run the OCR/security suite. Include shifted small cards, perspective/rotation, blank/noise, multiple rectangles, native failure/cancellation and output limits.
- [ ] Add tested bounded artwork retrieval and optional hybrid verification through the existing provider/API. Test untrusted URLs/redirects, oversized images, outages, cancellation, shared-template false positives, duplicate artwork and number conflicts.
- [ ] Add failing frontend tests for progressive correction, prominent suggestions, next-card defaults, no automatic inventory writes, repeated submissions and account reset. Preserve the existing scanner lifecycle regressions.
- [ ] Run comparative evaluation with latency, CPU and sampled memory; report missing datasets instead of claiming real-world accuracy.
- [ ] Review the combined diff, run `bash scripts/check.sh`, update SCANNER/ROADMAP/ARCHITECTURE/DEVELOPMENT/UX/Bitacora/Autoria and report exact results plus remaining acceptance.

## Review focus

Background text mistaken for a title; wrong quadrilateral cropping a card's artwork rather than its border; shared template/artwork mistaken for an exact printing; lost save responses across next-card transitions; unknown identity or no usable number/name must abstain honestly. Real-photo acceptance is a required evidence gap until authorized images are supplied.
