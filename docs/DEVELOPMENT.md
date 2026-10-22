# Local development

PokéVault currently runs as two development processes backed by native PostgreSQL. The commands below target Arch Linux and assume the repository root as the working directory.

## Prerequisites

- Python 3.14 with `venv` support
- Node.js and npm
- PostgreSQL running locally

Install project dependencies only when setting up a new clone:

- `python -m venv backend/.venv`
- `backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt`
- `npm install --prefix frontend`

## Environment

Copy `backend/.env.example` to `backend/.env`, then replace both placeholder passwords locally. Keep the development and test database names different. The real `.env` file is ignored by Git and must never be committed.

Copy `frontend/.env.example` to `frontend/.env` only when the API does not use its documented local URL. Vite reads this file when its process starts.

## PostgreSQL and migrations

For a first-time Arch Linux setup, install and initialize the native service:

- `sudo pacman -S postgresql`
- `sudo -iu postgres initdb --locale=C.UTF-8 --encoding=UTF8 -D /var/lib/postgres/data`
- `sudo systemctl enable --now postgresql`

Create a dedicated login and separate development/test databases. The first command prompts for the password that must match the two local URLs in `backend/.env`:

- `sudo -iu postgres createuser --pwprompt pokevault`
- `sudo -iu postgres createdb --owner=pokevault pokevault`
- `sudo -iu postgres createdb --owner=pokevault pokevault_test`

Do not repeat initialization or role/database creation on an already configured PostgreSQL cluster.

Start the native service:

- `sudo systemctl start postgresql`
- `pg_isready`

Apply the current schema from the backend directory:

- `cd backend`
- `.venv/bin/alembic upgrade head`
- `cd ..`

From the `backend` directory, use `.venv/bin/alembic current` to inspect the applied revision.

## Development servers

Start the API in one terminal:

- `cd backend`
- `.venv/bin/uvicorn app.main:create_app --factory --reload`

Start the web client in another terminal from the repository root:

- `npm run dev --prefix frontend`

Open `http://localhost:5173`. The Home view requests `http://localhost:8000/api/v1/health`, which reports the API and PostgreSQL states separately. A healthy response uses HTTP 200. If PostgreSQL becomes unavailable after startup, FastAPI remains available and returns a sanitized HTTP 503 response; the web client shows a retry action.

## Verification

Run the complete offline quality gate after dependencies and the two local databases are configured:

- `bash scripts/check.sh`

The script stops on the first failure. It checks provider fixtures, backend unit and PostgreSQL integration tests, Ruff, frontend tests, lint, type checking, the production build, and whitespace errors. It never installs packages or refreshes provider data from the network.

Useful focused commands:

- `backend/.venv/bin/python -m pytest backend/tests -v`
- `backend/.venv/bin/python -m ruff check backend`
- `npm test --prefix frontend -- --run`
- `npm run lint --prefix frontend`
- `npm run typecheck --prefix frontend`
- `npm run build --prefix frontend`

If the PostgreSQL integration test is skipped, confirm that `POKEVAULT_TEST_DATABASE_URL` exists in `backend/.env` and points to a dedicated test database. If the Home view cannot contact the API, confirm both development processes are running and that `VITE_API_BASE_URL` matches the API origin.

## National Pokédex (Iteration 4)

Open `/pokedex` with both development servers running. The frontend requests
`GET /api/v1/pokemon` on the configured API base URL; it never requests PokéAPI
JSON directly. Runtime reference fetching needs outbound HTTPS to `pokeapi.co`.
Remote sprite URLs are loaded by the browser, so image hosting must also be
reachable. No database migrations or authentication are required for this route.

HTTP 200 response (one entry shown; a successful provider load returns 20):

```json
{
  "results": [
    {
      "national_dex_number": 1,
      "name": "bulbasaur",
      "types": ["grass", "poison"],
      "sprite_url": "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png"
    }
  ]
}
```

Numbers are ordered 1–20. `sprite_url` may be null. Types are canonical English
identifiers and translated in the UI. Names in this range are shared in ES/EN.
Upstream failures, invalid JSON/schema and timeouts return HTTP 503 with
`{"detail":"Pokemon catalog is unavailable"}`; upstream exception text is never
returned. The frontend renders its own translated error and retry action.

The adapter uses five concurrent requests, a five-second per-request timeout,
a 15-second total refresh deadline and a 300-second successful in-memory cache.
Each process has its own cache, reset at restart; concurrent callers share a
refresh. Failed refreshes do not replace the cache, and expired data is not served.
The initial catalog is deliberately fixed: there are no pagination/filter inputs.

`backend/tests/test_pokemon.py` mocks upstream HTTP transport and exercises the
real route/adapter. `frontend/src/pages/PokedexPage.test.tsx` mocks backend fetch
responses and exercises the application route, localization, retry and cleanup.
All quality-gate tests run offline with respect to external providers.
