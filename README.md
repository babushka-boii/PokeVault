# PokéVault

**Every card has a story. Build your collection.**

PokéVault is an academic Pokémon Trading Card Game (TCG) collection manager inspired by the classic Pokédex and Pokémon PC storage system. The product aims to make collecting, organizing, discovering, and tracking cards feel like an adventure rather than a spreadsheet.

> **Project status:** Iteration 3 complete: runnable React frontend, FastAPI health API, native PostgreSQL migration baseline, ES/EN shell, and reproducible quality gate. Authentication and domain features remain pending.

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

## Technology status

| Layer | Current status |
| --- | --- |
| Web frontend | React, TypeScript, Vite and React Router implemented |
| Backend | FastAPI, Pydantic Settings, SQLAlchemy and Alembic implemented |
| Database | Native PostgreSQL integration and revision `0001` implemented |
| Sign-in | Google OpenID Connect (SSO) pending |
| Pokémon reference data | PokéAPI sample feasibility validated; runtime catalog pending |
| Pokémon TCG cards | TCGdex sample feasibility validated; runtime catalog pending |
| Recognition | OCR, image processing and card matching pending |

Fixed samples from both providers were validated on 2026-10-19. Complete catalog coverage, production price suitability, and asset licenses remain unresolved.

## Documentation

- [Product requirements](docs/PROJECT_SPEC.md)
- [UX/UI design](docs/UX_UI.md)
- [Preliminary architecture](docs/ARCHITECTURE.md)
- [Development roadmap](docs/ROADMAP.md)
- [Logical data model](docs/DATA_MODEL.md)
- [Provider validation and reproducibility](research/providers/README.md)
- [Generated provider evidence report](research/providers/REPORT.md)
- [Local development and verification](docs/DEVELOPMENT.md)
- [Weekly prompt and learning log](Bitacora.md)
- [Authorship and AI assistance](Autoria.md)

## Run the verified scaffold

After configuring `backend/.env` from its example and installing the documented dependencies:

- Apply migration `0001` with `cd backend`, then `.venv/bin/alembic upgrade head`.
- Start FastAPI with `.venv/bin/uvicorn app.main:create_app --factory --reload` from `backend`.
- Start Vite with `npm run dev --prefix frontend` from the repository root.
- Open `http://localhost:5173`; the API health contract is at `http://localhost:8000/api/v1/health`.
- Run all offline checks with `bash scripts/check.sh`.

The frontend currently provides responsive `/`, `/boxes`, `/pokedex`, and `/profile` routes plus persisted Spanish/English switching. Only the Home health flow is connected to the API; the remaining routes are honest placeholders.

**Iteration 3 evidence (validated October 19, 2026):** 43 provider tests, 9 backend tests including PostgreSQL, and 13 frontend tests passed alongside Ruff, ESLint, TypeScript checking, a Vite production build, migration upgrade/rollback verification, and healthy/degraded browser checks.

No authentication, user inventory, functional boxes, live Pokédex/catalog, prices, scanner, or Pokémon artwork/audio is included yet. Course requirements and rubric remain the source of truth.
