# PokéVault

**Every card has a story. Build your collection.**

PokéVault is an academic Pokémon Trading Card Game (TCG) collection manager inspired by the classic Pokédex and Pokémon PC storage system. The product aims to make collecting, organizing, discovering, and tracking cards feel like an adventure rather than a spreadsheet.

> **Project status:** Iteration 2 complete: provider feasibility evidence, offline validation tooling, and a logical data model. Frontend, backend, database, and authentication are not implemented yet.

## Project context

- **Course:** Diseño de Software — TICS316, second semester 2026.
- **Project option:** 2 — Pokédex de cartas Pokémon.
- **Development model:** Individual, incremental, with weekly GitHub commits.
- **Audience:** Pokémon TCG collectors and Pokémon fans.
- **Languages planned:** Spanish and English, with an in-app translation dictionary (no automatic translation API).

## Required capabilities

1. Identify cards from uploaded images and match them to an official card catalog.
2. Maintain a personal inventory with set, rarity, type, and card details; organize it into collections and decks.
3. View estimated market prices, mark cards for trade, and record purchases and sales.
4. Find missing cards in each TCG set.
5. Support responsive layouts, single sign-on (SSO), and custom multilingual UI.

## Pokémon-inspired experience

- **Classic PC Boxes:** faithful two-panel layout with selected Pokémon information on the left and a sprite grid on the right; box names, navigation arrows, wallpapers, and selection feedback.
- **National Pokédex:** species ordered by National Dex number; selecting a Pokémon reveals its official TCG cards.
- **Custom boxes:** collections, favorites, wishlist, trade, sale, and user-created boxes.
- **Trainer profiles:** user-chosen avatar from a curated set of approximately 10–15 Pokémon protagonists/trainers (selection pending).
- **Optional enhancements:** price-aware set completion, collection portfolio, decks, sample hands, achievements, and configurable interface sounds.

Artwork and sound use must be reviewed before assets are included or distributed. PokéVault is a fan-made academic concept, not affiliated with or endorsed by The Pokémon Company, Nintendo, or Game Freak.

## Proposed technology (not implemented)

| Layer | Proposed stack |
| --- | --- |
| Web frontend | React, TypeScript, Vite, Tailwind CSS |
| UI and data fetching | shadcn/ui, React Router, TanStack Query |
| Backend | Python, FastAPI, SQLAlchemy, Alembic |
| Database | PostgreSQL |
| Sign-in | Google OpenID Connect (SSO) |
| Pokémon reference data | PokéAPI (sample integration validated) |
| Pokémon TCG cards | TCGdex (sample integration validated) |
| Recognition | OCR + OpenCV + card matching (to be validated) |

Fixed samples from both providers were validated on 2026-10-19. Complete catalog coverage, production price suitability, and asset licenses remain unresolved.

## Documentation

- [Product requirements](docs/PROJECT_SPEC.md)
- [UX/UI design](docs/UX_UI.md)
- [Preliminary architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Logical data model](docs/DATA_MODEL.md)
- [Provider validation and reproducibility](research/providers/README.md)
- [Generated provider evidence report](research/providers/REPORT.md)
- [Weekly prompt and learning log](Bitacora.md)
- [Authorship and AI assistance](Autoria.md)

## Current delivery

**Iteration 2 (validated October 19, 2026):** a bounded Python validator checks 12 TCGdex/PokéAPI cases, stores hash-verified minimal fixtures, cross-checks National Dex links, and regenerates a deterministic offline report. The current automated suite covers this research tooling only; no application UI or API is claimed.

Future commits will implement and validate capabilities incrementally. Course requirements and rubric remain the source of truth.
