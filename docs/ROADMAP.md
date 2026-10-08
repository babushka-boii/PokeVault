# PokéVault — Incremental roadmap (v0.1)

**Planning date:** 2026-10-08. Dates after week 1 are tentative and may change following technical validation and course guidance. The course expects a commit each Monday–Sunday week starting October 5, 2026; the rubric counts the best six weeks.

## Delivery 1: 2026-10-05 to 2026-10-11 — Foundation and requirements

**Scope:** documentation-only baseline.
- [x] Confirm theme, name, GitHub repository and visibility.
- [x] Record mandatory requirements and UX direction.
- [x] Document classic PC Box reference and product differentiators.
- [x] Propose preliminary stack and component boundaries.
- [x] Create roadmap, prompt log, authorship disclosure and README.
- [ ] Student reviews the published documentation and records corrections if needed.

**Acceptance:** one identifiable GitHub commit with versioned project documents, and no misleading claims of working functionality.

## Proposed iteration sequence

| Iteration | Focus | Demonstrable result | Main risks |
| --- | --- | --- | --- |
| 2 | Data-provider feasibility and relational model | Verified sample cards/sets/species/price availability; first ERD; schema decisions | External coverage, card variants, license terms |
| 3 | Project scaffold, database and authentication | Runnable frontend/API/database, Google sign-in, ES/EN switch | OAuth configuration, migrations, developer setup |
| 4 | Catalog, Pokédex and classic PC Boxes | Browse species and cards, navigate sprite boxes on desktop/mobile | Reliable sprites, responsive fidelity |
| 5 | Inventory and set completion | Add/edit copies, manual/smart boxes, check owned/missing by set | Copy-level bookkeeping, set checklist quality |
| 6 | Scanner end-to-end | Upload image, OCR match suggestion, correction and inventory registration | Recognition accuracy and demo test images |
| 7 | Prices, wishlist, trades and transaction history | Provenance-aware estimates, missing-card cost coverage and trade filters | Missing or stale provider prices |
| 8+ | Portfolio, deck builder and polish | Deck ownership gaps, selected animations/sounds, test and demo rehearsal | Time and feature creep |

**Rule:** requirements first, then cohesive vertical slices. Optional features only after working mandatory flows.

## Weekly workflow

1. Define issue/scope and acceptance criteria.
2. Implement or document a reviewable increment.
3. Validate with a reproducible example or test.
4. Update **Bitacora.md** with prompts, revisions, obstacles, lessons and evidence.
5. Update **Autoria.md** if AI-assisted or borrowed content changes materially.
6. Make meaningful commits with English descriptive messages.
7. Document the next increment and outstanding blockers.

## Course evaluation alignment

- The course project allocates **70%** to incremental process and **30%** to a brief demo and technical questions.
- The process rubric explicitly assesses commit history, weekly documentation, AI authorship disclosure, and a final survey.
- At least one weekly commit is mandatory, ideally more as functionality evolves.
- The selected project is option **2: Pokémon card Pokédex**; all required functions stay visible in the product spec.

## Definition of done for later functional increments

- User-visible behavior works; validation and empty/error states addressed.
- Appropriate automated or manual test evidence is captured.
- ES/EN labels and responsive behavior checked.
- No secrets or unlicensed assets are introduced.
- Documentation, changelog/bitácora and code remain consistent.
- Commit is correctly attributed and message reflects real change.

## Known pending decisions

- Trainer avatar shortlist (10–15 approved selections from the student).
- Pixel-perfect box wireframe measurements and legal/reusable audiovisual assets.
- Price feed validation; scanner OCR benchmark sample; deployment target.
