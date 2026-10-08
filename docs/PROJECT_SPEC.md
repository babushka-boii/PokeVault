# PokéVault — Product specification (v0.1)

**Status:** Planning baseline | **Date:** 2026-10-08 | **Course:** TICS316 — Diseño de Software

## 1. Product vision

Build a responsive web application for Pokémon TCG collectors that combines practical card management with the nostalgic feel of the classic in-game Pokédex and PC storage boxes. Users should feel they are exploring Pokémon, not maintaining a generic CRUD table.

**Primary user:** a collector who wants to identify cards, track owned copies, manage boxes, discover missing set cards, and estimate collection value.

**Core user journey:** sign in → discover a Pokémon or scan a card → select the correct official card → register owned copy → place into a box → check set completion / estimated value.

## 2. Official requirements (mandatory)

These requirements derive from the course's project option 2 and general technical rules; this section does not reinterpret extra ideas as course requirements.

| ID | Requirement | Acceptance target |
| --- | --- | --- |
| RF-01 | Upload a card image for automatic identification | Accept an image, process recognition, propose official card match(es), allow user confirmation/correction. |
| RF-02 | Associate identified cards with an official card database | Every registered card references a stable catalog entry; manual search is available if recognition fails. |
| RF-03 | Personal inventory with rarity, type, and set | Authenticated user can add, view, edit and remove registered copies, and view catalog properties. |
| RF-04 | Organize cards into collections/decks and labels | User can create collections/decks and assign or remove cards without corrupting inventory. |
| RF-05 | Estimated market prices | Show sourced estimate and currency when provider data exists; clearly state missing/stale data. |
| RF-06 | Mark cards available for trade | Mark and filter a user's owned copies as tradeable. |
| RF-07 | Purchase and sale history | Record transactions with date, quantity, amounts and card reference. |
| RF-08 | Identify missing cards per official set | Compute owned unique cards versus catalog checklist; show missing entries. |
| RNF-01 | Responsive web interface | Demonstrate usable desktop, tablet and mobile layouts. |
| RNF-02 | SSO login | Demonstrate working identity-provider sign-in, user session, and account-specific data isolation. |
| RNF-03 | Custom multilingual interface | Demonstrate Spanish/English UI with project-maintained dictionaries, without external translation services. |
| RNF-04 | Code quality and traceability | English code identifiers; weekly GitHub commits starting Monday 2026-10-05; authored/AI-assisted work documented. |

## 3. Product differentiators (additional scope)

Priority meanings: **P1** = essential product identity/near-term, **P2** = after required end-to-end flow, **P3** = optional polish.

| ID | Priority | Feature |
| --- | --- | --- |
| EX-01 | P1 | National Pokédex with small sprites, National Dex ordering, species filters, and species-to-TCG-card browsing. |
| EX-02 | P1 | Game-faithful classic PC Box interface: left selection info, right sprite grid, box name and arrows. |
| EX-03 | P1 | User-defined boxes, plus rule-based boxes for set, generation, favorites, wishlist, trade and sale. |
| EX-04 | P2 | Box wallpaper presets and safe custom image upload; optional interface sound effects with mute/volume. |
| EX-05 | P2 | Wishlist with priority and approximate completion budget based on available estimates. |
| EX-06 | P2 | Portfolio overview: valued cards, historical snapshots when available, estimated value by set. |
| EX-07 | P2 | Deck builder with a 60-card target, ownership-aware missing list and optional format validation. |
| EX-08 | P3 | Curated 10–15 trainer avatar options selected by project owner; no user photo uploads planned. |
| EX-09 | P3 | Suggested deck templates / meta decks, pending reliable update source and format/version validity. |
| EX-10 | P3 | Practice opening hand simulations, achievements, and discovery animations. |

The fact that a feature is listed does not mean it has been implemented.

## 4. Domain decisions

- **Species versus cards:** Pokédex views are grouped by Pokémon species; a species opens multiple TCG printings. Official cards can feature multiple Pokémon, and Trainer/Energy cards may have no species.
- **Card versus physical copy:** the shared card catalog is distinct from owned inventory. Multiple owned copies can have different conditions, acquisition costs, and trade/sale status.
- **Boxes:** box membership does not duplicate inventory. Automatic boxes are computed from criteria; manual boxes explicitly include selections. Exact representation of species versus individual cards is a design decision to validate in the data model.
- **Pricing:** no invented live price. Estimates must include source, timestamp, currency and missing-data behavior. A cost-to-complete figure is only approximate.
- **Recognition:** OCR and candidate matching may fail; confidence must be meaningful or labeled heuristic, and manual correction is always possible.
- **Trainer avatars:** users choose among curated trainer images, not arbitrary photos. The 10–15 characters have not been selected yet.
- **Language:** product copy can be Spanish/English; code, identifiers and API schemas will be in English.

## 5. Boundaries / exclusions

No real-money checkout, payment processing, auctions, user-to-user chat, full trading marketplace, model training from scratch, native mobile app, or obligatory background music in the initial project. Sound effects must be optional.

## 6. Non-functional quality attributes

- **Usability/accessibility:** keyboard navigation, visible focus, screen-reader labels, color contrast, touch targets, and reduced-motion handling.
- **Security:** private inventory endpoints, authorization checks, strict image upload limits and server-side validation; no passwords handled by PokéVault.
- **Reliability:** graceful fallback for unavailable external APIs; stable locally saved collection records; clear error/empty/loading states.
- **Maintainability:** modular frontend/backend, data migrations, API contracts, tests by increment, English code naming, documented decisions.
- **Performance:** cached reference data, server pagination/filtering, image optimization and reasonable mobile payloads.

## 7. Demo-oriented acceptance scenario

An authenticated collector opens the classic PC Box, explores Charizard via its sprite, sees matching TCG printings, uploads a card image, corrects or confirms the match, adds one copy, then observes inventory and set progress updates. A separate short sequence demonstrates Spanish/English and mobile layout.

**This is a target scenario, not a completed demo.**

## 8. Unresolved questions

1. Evaluate data coverage and usage terms for TCGdex and PokéAPI, including card artwork and sprites.
2. Validate actual price-provider coverage, currencies and history; implement explicit unpriced-card handling.
3. Set inventory granularity and multi-species card mapping in the relational schema.
4. Decide box capacity/rows and mobile presentation while preserving desktop reference fidelity.
5. Determine exact recognition engine and measurable test set for OCR/matching.
6. Confirm academic deliverables and acceptance questions with Product Owner Nicolás Cenzano when needed.
