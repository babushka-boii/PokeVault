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
The default request remains fixed at 20 entries; optional bounded pagination is described below. Filters remain deferred.

`backend/tests/test_pokemon.py` mocks upstream HTTP transport and exercises the
real route/adapter. `frontend/src/pages/PokedexPage.test.tsx` mocks backend fetch
responses and exercises the application route, localization, retry and cleanup.
All quality-gate tests run offline with respect to external providers.

## PC Storage catalog preview

`/boxes` reuses the Pokémon endpoint with `?offset=0&limit=30`. Defaults remain
`offset=0&limit=20`, with the same `{ "results": [...] }` response shape. Offset
must be 0–1024 and limit 1–30; invalid inputs return HTTP 422. This version pins
the National Dex range to 1–1025 (35 groups); expanding it requires updating the
shared range in backend/frontend and checking default-form ID alignment. The last
page has five Pokémon and 25 empty slots. No forms or invented inventory are added.

Backend caching is bounded to 16 page entries for 300 seconds, evicting least
recently used pages. Concurrency/timeouts/sanitized failures are unchanged. Boxes
also keeps up to eight pages in component memory for five minutes, and aborts
obsolete requests. The current page and retry attempt identify display state;
responses from an obsolete request cannot replace the active page. No collections
or wallpapers are persisted. Audio and sprite-mode preferences are stored locally; no inventory or wallpaper persistence is implied.

Manual verification (requires running both servers and a browser):

1. Open `/boxes` at desktop width, then at 390 px. Check the details-left/grid-right
   arrangement on desktop and grid-first/details-below arrangement on mobile,
   30 unclipped slots, focus visibility, touch targets and absence of horizontal scroll.
2. Select sprites by click, Tab then arrows, Home/End, Enter and Space. Verify the
   detail panel changes immediately. Switch boxes rapidly, return to a prior box,
   reach Box 35 and confirm five populated slots and a disabled next button.
3. Change Forest/Ocean/Night sky; switch ES/EN and check all labels and types.
4. Confirm silence on initial load. Enable sound, select sprites, switch boxes and
   apply a wallpaper. Listen for distinct soft cursor/transition/confirmation effects.
   Move rapidly to check throttling; adjust volume, mute and reload to check persistence.
5. Block API requests to check error/retry; block sprite hosting to check fallback.
   Disable Web Audio or deny resume: interactions should still work with a localized
   unavailable message and no unhandled promises. Enable reduced motion and verify
   selection still has a static highlight.

These steps are a manual checklist, not a claim that visual/audio inspection ran.
Automated tests mock HTTP and audio boundaries; listening on real hardware is needed
for final sound-level and timbre approval.

## Search within PC boxes

`GET /api/v1/pokemon/search?q=%23559` returns
`{"results":[{"national_dex_number":559,"name":"scraggy"}]}`. `q` is required,
nonblank and at most 40 characters; optional `limit` defaults to 8 and must be 1–8.
Invalid parameters return 422, no matches return 200 with an empty results list,
and upstream failure returns 503 with `{"detail":"Pokemon search is unavailable"}`.
The existing paginated/default Pokémon endpoint remains unchanged.

The backend caches one name-only index of 1025 species for an hour; autocomplete
is debounced by 300 ms and cancels obsolete requests. There is no browser-wide
catalog download, persistent search storage or database migration. Canonical
PokéAPI names are the fallback in both UI languages; accents, punctuation and
separators are ignored for matching. A separate localized alias catalog is not
provided by the list resource and has not been guessed.

Manual checklist extension: open the magnifying glass in `/boxes`; type `Scrag`,
`SCRAGGY`, `559` or `#559`; use arrows and Enter. Check Box 19, Scraggy in space 19,
30 visible peers/slots and focus on the selected sprite. Repeat while in Box 19
and check there is no extra page fetch. Try empty/nonsense input, clear, Escape,
API failure/retry and fast query changes. Repeat after switching boxes, in ES/EN,
at 390 px, with sound muted and enabled. These visual/audio steps still require a
connected browser; automated route/component tests cover the data and interaction
behavior, and a real index query verified Scraggy's identity.

## Detailed Pokémon and menu icon refinement

`GET /api/v1/pokemon/1?language=es` returns the existing Pokémon identity/types/sprite
fields plus:

```json
{
  "name_language": "es",
  "height_m": 0.7,
  "weight_kg": 6.9,
  "abilities": [
    {"name": "Espesura", "is_hidden": false, "language": "es"},
    {"name": "Clorofila", "is_hidden": true, "language": "es"}
  ],
  "description": "Una rara semilla le fue plantada en el lomo al nacer. La planta brota y crece con este Pokémon.",
  "description_language": "es"
}
```

This example shows only the additional fields and the verified first Spanish
provider description for Bulbasaur. `language` defaults to `es` and accepts only `es`
or `en`; number must be 1–1025. Invalid inputs return 422. Provider failures return
503 with `{"detail":"Pokemon details are unavailable"}`. Names/description languages
can be null when no localized text exists. Description can be null. Abilities are
separate normal/hidden entries, not a single combined ability string. Descriptions
use first nonempty provider-order requested language, then English, then null;
name fallbacks are requested language, English, then canonical species/ability.

A live API check verified Bulbasaur in ES/EN (0.7 m, 6.9 kg, Espesura/Overgrow and
Clorofila/Chlorophyll) and Scraggy in ES (0.6 m, 11.8 kg, two normal abilities and one
hidden). These checks do not replace the mocked offline suite.

Menu sprites are remotely loaded from the repository paths inventoried in
`research/sprites/verification.json`. The file contains metadata/SHAs only. Gen V
static/APNG covers 1–649; later menu assets cover the remaining supported range.
Only the grid uses these menu icons; the portrait remains a large front sprite.
No Nintendo image or audio binaries are bundled, and repository availability is
not treated as a grant of all image rights. Type badges use original SVG/CSS.

Manual refinement checklist (not executed in this session):

1. Open `/boxes` on desktop and at 390 px. Check all 30 slots, clear continuous
   Classic wallpaper, readable icons, uncut badges, large portrait and no horizontal
   overflow. Confirm the details region scrolls on desktop and expands on mobile.
2. Search `#25`: inspect the grid image URL under `generation-v/icons/25.png`.
   Enable Animated: URL must change to `generation-v/icons/animated/25.png`; observe
   actual two-frame motion. Selecting a neighboring Pokémon must not restart that
   unchanged APNG. Switch back to Static, reload, and confirm preference/selection
   behavior. No preference change should play audio.
3. Enable reduced motion with Animated saved: network/rendered sources must use
   still PNGs. Disable it and confirm the saved Animated preference resumes. Check
   #650, #810, #899 and #1025 use later menu assets, never battle sprites. Block an
   APNG request to verify static fallback; block all icon sources for the neutral
   placeholder. An APNG-unsupported decoder may naturally show its default still
   frame; a resource load error explicitly advances the fallback chain.
4. Select Bulbasaur: verify localized numbers, both types, height/weight, normal and
   hidden abilities and real description. Switch ES/EN, navigate rapidly and retry
   blocked detail requests: old content must never replace the new selection.
5. Search Scraggy (#559) and confirm Box 19, slot 19, all peers visible, keyboard
   focus, menu icon and localized detail data. Exercise arrows, Home/End, Enter,
   Space, clear and Escape. Check all four wallpapers, muted/enabled audio and
   persisted volume. Listen on real hardware before approving sound comfort.
6. Open `/pokedex` and verify the same rectangular type badges, ES/EN labels and
   prior loading/error/retry behavior. Trivia/etymology, TCG browsing and ownership
   remain outside this increment.

No connected browser was available for screenshots/playback/listening. PNG/APNG
format inspection and automated image/error tests establish source selection and
frame metadata; they do not establish actual browser playback or visual fidelity.

## Public TCG catalog

Two new endpoints reuse FastAPI's existing settings/CORS/application structure:

- `GET /api/v1/pokemon/{number}/cards?language=es&page=1&page_size=12&sort=name&set_id=sm9`
- `GET /api/v1/cards/{card_id}?language=es`

`number` is 1–1025; `language` is `es` (default) or `en`; page is 1–500; page_size
is 1–24 (default 12); sort is `name` (English catalog), `id`, `newest` or `oldest`.
Expansion is optional.
Identifiers are at most 100 characters, alphanumeric segments separated by single
hyphens/dots, including `sv03.5-001`; slashes, consecutive separators and whitespace
are rejected. Invalid parameters use HTTP 422; provider failures use sanitized 503
`{"detail":"Card catalog is unavailable"}`. Direct details use HTTP 404
`{"detail":"Card not found"}` only when both supported language resources are absent.

Page shape: `{results: Card[], page, page_size, has_more, coverage:"english_catalog", sets: CardSet[], sets_complete:true}`.
There is no total-result count. Card records include stable id/name, `dex_ids`,
`image_url`, `thumbnail_url`, `set:{id,name}`, `local_id`, nullable rarity/illustrator/
HP/stage/evolve_from, category, actual content language, verified available_languages,
TCG types, attacks, abilities and variants. Missing metadata is null/[]; a provider
attack/ability name can be null. Full schemas are in `backend/app/cards/schemas.py`.
No pricing or inventory fields are exposed. Cards also include verified
`image_sources:[{base_url,language}]`, nullable `image_language`, weaknesses and
resistances `[{type,value:string|null}]`, nullable retreat and regulation_mark.
CardSet adds name_language, logo_url, symbol_url, logo_sources `[{url,language}]`,
nullable serie `{id,name}` and release_date. Logo URLs already include a format
suffix; card sources are bases. `sets` contains all expansions in that species'
bounded index, including those outside the current filter/page.

TCGdex requires exact `dexId=eq:N`, not substring `dexId=N`. The adapter verifies
complete card associations after bounded CardBrief discovery. Multi-species cards
appear in either associated species; missing `dexId` is never guessed from names.
The complete species-only brief index is cached, filtered by stable set ID and
sorted before pagination; it never loads all global card details. Discovery is
bounded at 2000 briefs, with an end probe to reject truncation. Shared metadata-only
GraphQL set data (at most 512) and Spanish set/series lists establish dates, names
and logos. `newest`/`oldest` sort by official English expansion release dates;
unknown/invalid dates stay last in either direction. Ties use set ID, numeric local
number when possible, then card ID. REST nested release-date sorting was not reliable.
Name/ID ordering is deterministic; no sorting is performed on just the React page.
The English discovery pool may include Pocket and omits links
not established by the provider; it is not an exhaustive all-language catalog.
Spanish missing with 404 falls back by the same stable ID, never by translated name.
For direct details, Spanish-only data also remains usable when English is absent.
Other failures are not disguised as missing translations.

Outbound JSON goes to `api.tcgdex.net`; artwork loads remotely from
`assets.tcgdex.net` using documented `low.webp` (245×337) and `high.webp` (600×825)
conventions. No image download, new dependency, database table or migration is needed.
HTTP timeout is five seconds and the full operation deadline is 15 seconds. Cached
resources/pages live for 300 seconds with explicit LRU bounds; tests mock HTTP.
See `research/tcgdex/VERIFICATION.md` and `refinement.json` for live request/coverage
evidence. `verify_refinement.py` reproduces read-only provider/asset probes; this
network-dependent research script is separate from the mocked automated suite.

`cardImages.ts` tries WebP/PNG/JPG at the preferred quality, then the other quality,
then artwork from another verified language resource of the same stable printing.
The displayed artwork language is tracked independently of the card text. Missing
provider metadata and failed image requests have different messages. Artwork uses
contain/aspect-ratio, gallery lazy loading, cached-completion detection and a
20-second visible loading deadline with detail retry. Offscreen lazy images do
not start that deadline. Set logos use `.png`/`.webp`/`.jpg`, without `/high` or `/low`.

Mouse tilt is CSS/pointer driven, with 4° gallery and 8° detail limits. Mobile users
activate Tilt card before dragging; the toggle allows ordinary scrolling by default
and avoids changing touch-action mid-gesture. A drag never activates the card link.
Release, pointer cancellation, Escape, preference changes and unmount clean up state.
Reduced motion disables transformations/reflections and loading animation. All foil
effects are simulations; unknown/mixed finishes receive only restrained reflection.
No GPL code/textures were copied; see `research/tcgdex/EXPERIENCE_REFERENCES.md`.

Manual browser checklist (not performed in this session):

1. Start both servers, open `/boxes`, select Bulbasaur, and activate View TCG cards.
   Check that selecting another slot still only updates Pokémon details.
2. In the gallery, search expansions by name/series/year, inspect names/logos and
   Other/Otras grouping, select two distinct logo-less expansions, and use Escape,
   Tab and clear. Select newest/oldest and compare cards across two pages; filtering
   or sorting resets page 1. No price/owned/total controls should appear.
3. Open a card; check high-resolution art, all available official metadata, TCG-only
   attacks/abilities and missing-field states. Back returns to the same filtered page.
4. Return to Boxes and verify original box, selected slot, wallpaper, focus, sprite
   mode and audio settings. Repeat with Scraggy (#559), reached through search.
5. Repeat from `/pokedex`; test ES/EN, known missing translations, direct detail URLs,
   invalid IDs, API failure/retry and blocked artwork. Verify old network responses
   cannot overwrite a new language/species/filter selection.
6. At desktop and 390 px, inspect image proportions, readable captions, touch/focus
   controls and no overflow. Move a mouse across artwork: restrained tilt/light must
   follow it, captions stay fixed, and leave returns to rest. Activate Tilt card on
   mobile, drag over the actual image, release/cancel and verify no accidental link;
   ordinary taps must still open details and scrolling works with interaction off.
7. Toggle reduced motion while interacting: movement/reflections must stop and
   native keyboard navigation remain usable. Confirm existing search/icons/audio.
8. Inspect older Base Set, Sword & Shield, Scarlet & Violet illustration rares,
   Spanish art, English fallback, multi-species and missing-artwork cases. Block
   WebP to verify PNG fallback, then all formats of one language to verify the exact
   same printing's alternative. Block every candidate: no broken icon/stuck skeleton;
   inspect the distinct provider-missing state and retry details after unblocking.
9. Block localized logos to verify English alternatives and all logo formats to
   verify Other grouping without merging identities. No card quality suffix should
   occur in a logo request. Check browser back/forward through filters and details.

Automated tests establish response and interaction behavior. A connected browser
is still required to approve actual visual responsiveness and artwork loading.

## Iteration 5A — Google sign-in setup

The complete reproducible guide is [AUTHENTICATION.md](AUTHENTICATION.md). Install
updated backend requirements, populate only the ignored backend `.env`, then run
`alembic upgrade head` from `backend`. New environment variables are
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `FRONTEND_ORIGIN`,
`AUTH_COOKIE_SECURE`, `AUTH_SESSION_TTL_SECONDS`, and `AUTH_TRANSACTION_TTL_SECONDS`.

Register exactly `http://localhost:8000/api/v1/auth/google/callback` on a Google
**Web application** client. Keep the frontend at `http://localhost:5173` and backend
at `http://localhost:8000`. Use `AUTH_COOKIE_SECURE=false` only for local HTTP.
Start Uvicorn with `--no-access-log` to keep OAuth callback queries out of logs;
production proxies must redact them as well. Production needs HTTPS and Secure
cookies, exact trusted origins and a same-site frontend/API arrangement.

No Google credentials are supplied by this iteration. `/login` reports missing
configuration safely and never produces a fake user. Tests use mocked Google
transport and locally signed ID tokens; they do not require live credentials.
PostgreSQL integration tests require the existing distinct dedicated test database;
auth migration tests create/drop disposable schemas within it, not development data.

Manual acceptance pending credentials: sign in/cancel/retry; refresh `/profile`;
confirm actual name/email/picture; log out and check old cookie invalidation;
repeat login and retain internal UUID; inspect desktop/390 px keyboard behavior;
confirm public Pokédex, Boxes, search, TCG galleries/details remain accessible.
Do not claim live login or production cookie verification from mocked tests.

### Iteration 5A automated evidence — 2026-10-24

`bash scripts/check.sh` completed with exit 0:

- Provider fixtures/report: **43 tests passed** and offline report regenerated.
- Backend: **155 passed**, including **6 PostgreSQL integration tests**, no skips.
  Five new auth integration cases use disposable schemas and exercise migration
  reversal, identity persistence, uniqueness/FKs, digest sessions/cascades, concurrent
  callback consumption, returning-user email changes, session rotation and logout.
- Frontend: **232 passed in 22 files**; 38 focused auth cases plus a login-route case
  supplement the existing 193 tests.
- Ruff, ESLint, TypeScript, Vite production build and `git diff --check`: passed.
- `pip check`: no broken requirements; real `.env` files remain ignored.

The managed sandbox blocks local PostgreSQL connections and stalls FastAPI's
TestClient. Backend/project checks ran with approved broader execution access;
tests were not disabled or weakened to bypass that environment restriction.

## macOS continuation and inventory 5B — 2026-11-07

Verified on Darwin arm64: Homebrew Node 24, Python 3.14 in backend/.venv and native
PostgreSQL 18. Do not use macOS /usr/bin/python3 (3.9) for this project's environment.
Dependencies were already installed; no dependency versions changed. `pip check`
passed. No Arch paths or service commands are assumed on macOS.

The quality gate now consistently invokes backend/.venv/bin/python, including the
standard-library provider checks, so `bash scripts/check.sh` does not need a global
`python` alias or an activated shell. PostgreSQL tests need local DB access and the
existing distinct POKEVAULT_TEST_DATABASE_URL. A restricted sandbox can report
Operation not permitted even while PostgreSQL is running; run authorized checks
with localhost access, without weakening/skipping tests.

From backend, use `.venv/bin/alembic upgrade head` to apply additive 0003; never run
a development downgrade merely to test reversal. Inventory integration tests create
and drop disposable schemas in the dedicated test database. Runtime endpoints and
manual acceptance are in [INVENTORY.md](INVENTORY.md).

The local configuration check found incomplete Google OAuth settings on this Mac.
Private environment files were neither printed nor modified. Follow AUTHENTICATION.md
locally before attempting a real sign-in; simulated test identities are never added
to the development database.


### Validación automatizada — 07/11/2026

`bash scripts/check.sh` finalizó con código 0: **43 pruebas de proveedores**,
**179 de backend** (incluidas **9 de PostgreSQL**, sin omisiones) y **240 de
frontend en 23 archivos**. Ruff, ESLint, TypeScript, build y whitespace pasan.
Prueba adicional de cambio de cuenta: 8/8 casos de inventario frontend correctos.
La base local de desarrollo quedó en **0003 (head)** mediante upgrade aditivo.
Las pruebas demuestran persistencia tras logout/relogin/reinicio de aplicación con
Google simulado; login Google real y aprobación visual siguen pendientes.

## Iteration 5C — Personal PC boxes (2026-11-07)

Implementation uses the existing macOS Python/Node/PostgreSQL environment and adds
no dependencies. The corrected `feat/iteration-5c-personal-boxes` baseline matched
`main` at `ad8279c` with a clean tree before implementation. No commits, pushes,
merges, resets or rebases were performed by Codex.

From the repository root, apply the additive migration locally with:

```sh
cd backend
.venv/bin/alembic upgrade head
.venv/bin/alembic current
```

`0004` follows `0003`; it adds box/membership tables and the composite inventory
owner/identity unique key. It does not remove physical copies or authentication
records. The local development database was first inspected read-only at `0003`,
then upgraded additively and verified as **`0004 (head)`**. Never downgrade the
populated development database to validate reversal. The test suite runs all
migration upgrade/downgrade checks in fresh disposable schemas of the dedicated
test database; the older metadata/health test now uses its own disposable schema too.

Fresh final `bash scripts/check.sh` completed with **exit 0**:

| Check | Result |
| --- | --- |
| Offline provider fixtures/report | 43 tests passed; deterministic report regenerated |
| Backend | 247 passed, no failures or skips |
| PostgreSQL integration subset | 42 passed, included in backend total; 33 new box cases |
| Frontend | 265 passed in 27 files; 25 new cases including direct-copy navigation |
| Ruff / ESLint | Passed |
| TypeScript | Passed |
| Vite production build | Passed |
| `git diff --check` | Passed |

New evidence covers composite owner FKs, valid positions, unique copy and slot,
cascades, full capacity, whole-permutation ordering, competing slot/copy movement,
box-limit concurrency, consistent count/page snapshots, acquisition-date recency,
0004 reversal preserving exact 0003 inventory, and application restart/relogin.
HTTP tests use real application/session/CSRF boundaries with deterministic providers.
Frontend regressions cover stale read and mutation responses across account changes,
copy identity, missing metadata/categories, paginated placement, keyboard focus and ES/EN.

The restricted sandbox initially denied localhost database connections. Successful
PostgreSQL/full-gate runs used approved localhost access; no tests were skipped or
assertions weakened. Independent code review found no critical/important defect;
an empty derived-view range was corrected and documentation clarified the explicit
Place copy here action. The pending-mutation privacy regression also passes.

Limited live native-browser inspection confirmed the original public catalog at
box 27 with its 30 positions and the new My Boxes entry. Before migration, My Boxes
showed its translated load-error state as expected. Further live checks were deferred
while the browser was in use; no post-migration personal-box CRUD, full real OAuth
cycle, mobile visual, audio or touch acceptance is claimed. Complete [BOXES.md](BOXES.md)
using the real local session after reviewing the implementation.

Known limits: 100 manual boxes per user; no automatic swaps or drag-only operation;
concurrent successful moves of the same copy serialize with one final placement;
box `updated_at` describes metadata/order and is not an optimistic contents version.
Generation grouping applies to the bounded visible page, uses official species
associations and explicit mixed/unknown/category fallbacks. Provider failure keeps
inventory management usable with IDs. Collection-wide generation indexing, custom
smart rules and set completion remain deferred (set completion belongs to 5D).

## Iteration 5D — Expansion explorer and completion (2026-11-09)

The starting checkout was clean on `feat/iteration-5c-personal-boxes` at `dc233c4`,
including committed 5A/5B/5C and migration 0004. Local main was its ancestor by one
commit. A new `feat/iteration-5d-set-completion` branch was created at that complete
baseline; no merge/rebase/reset/commit/push was performed. No dependencies changed.

Completion uses the existing `(user_id,card_id)` inventory index and a single grouped
query over full canonical set IDs. No new table/index/migration was necessary. Both
Alembic code head and read-only development `current` remain **0004 (head)**; 5D
did not apply a migration or alter populated development records. Tests create/drop
only disposable PostgreSQL schemas using the existing dedicated test configuration.

Live provider verification, interpretation and reproduction script are in
`research/tcgdex/set_completion_*`. The corrected ten-request capture found Spanish
Base Set's empty list despite total 102; swsh3 had 201 unique IDs vs 189 printed, and
sv03.5 had 207 vs 165. English membership is therefore canonical. Four additional
asset HEAD probes (two cards/logo 200, symbol 404) verify both available artwork and
the continuing need for fallbacks. No image binaries or private configuration were
printed or modified. Those live probes are separate from the deterministic gate.

Full-set progress is independent of pagination/filters, quantities, physical metadata
and box placement. Existing AddToCollection/CopyForm and exact copy routes remain
the only inventory editor. New public/private API and cache/coverage details are in
[SET_COMPLETION.md](SET_COMPLETION.md).

The initial sandbox run could not connect to localhost PostgreSQL; approved runs used
the real disposable schemas without skipping tests. The first approved baseline run
already included new return-route red tests: two expected missing-feature failures,
with existing regressions passing. Compare final results against the committed 5C
evidence (43 provider, 247 backend/42 PostgreSQL, 265 frontend), not that intermediate
red development run. Backend/API and frontend feature tests were observed failing
before implementation; the first PostgreSQL completion case failed404 before APIs.

Independent review and regression fixes cover locale views outliving canonical
membership/physical classification, duplicate concurrent partial/failed provider
fetches, canceled refresh cleanup, decimal half-up percentage consistency, competing
inline drafts, browser-history editor locks and incorrect public rows appearing under
a pending private ownership filter. In-flight account reads/saves are aborted and late
responses cannot restore another user's private state. No assertions were weakened.

Fresh final `bash scripts/check.sh` completed with **exit 0**, after the last
clear-all-filter regression:

| Check | 5C baseline | 5D final |
| --- | ---: | ---: |
| Offline provider fixtures/report | 43 passed | 43 passed |
| Backend total | 247 passed | 355 passed (+108), no skips |
| PostgreSQL subset (included in backend) | 42 passed | 66 passed (+24) |
| New set-provider adapter cases (included in backend) | — | 62 passed |
| Frontend | 265 passed / 27 files | 315 passed / 29 files (+50) |
| Ruff / ESLint | Passed | Passed |
| TypeScript | Passed | Passed |
| Vite production build | Passed | Passed, 95 modules |
| `git diff --check` | Passed | Passed |

The other new backend cases are 22 HTTP/completion tests and 24 PostgreSQL cases.
Frontend additions cover 26 initial route-level cases, one clear-all regression,
18 service cases and five return-route cases. The required 12-copies/8-distinct/100
example yields 8% in HTTP, PostgreSQL and UI tests. The SQL regression with 1,000
physical copies verifies one grouped query without loading every physical row.
Public browsing never queries inventory; batch progress uses one union aggregation.
Current schema/indexes and migration head stay unchanged at 0004.

No known failing automated check or unresolved blocking review finding remains.
Manual browser/OAuth checks for 5D were not performed; use SET_COMPLETION.md. Actual
desktop/mobile appearance, touch and artwork loading remain human acceptance,
distinct from deterministic component tests and public HTTP probes. Retained limits
are English physical catalog coverage, conservative new-series exclusions, 2,000
briefs per expansion, nullable incomplete progress, and no official-numbered subset
or variant master-set tracking. Provider availability remains an external dependency.


## Iteration 6 — OCR-assisted scanner (2026-11-10–11)

The initial tree was clean on `feat/iteration-6-card-scanner` at `9f2854c`, after
merged 5A–5D and a provider-evidence commit. The audited baseline gate passed 43
provider-fixture checks, 355 backend tests (66 PostgreSQL) and 315 frontend tests.
Development Alembic current was checked read-only at `0004 (head)` and reconfirmed
after final verification on 2026-11-11. No migration,
model/index change, development data mutation or Git history change was needed.

The resumed audit preserved every modified/untracked scanner file. OCR supervision,
image/extraction/matching services, API, React workflow, inventory retry identity and
synthetic fixtures were already implemented. Final work closed review gaps: clearing
an expansion also clears its hint; exact short official names work inside a selected
set; same-owner focus/camera/details revalidation suspends and hides the workflow
instead of losing its photo/draft/key. It still aborts pending work and clears state
on logout, changed ownership or failed validation. Eleven lifecycle regressions were
observed failing before the correction. Pending saves resume as explicit uncertain
retries with the original key/payload. The independent reviewer rechecked all three
findings and reported no remaining Critical/Important/Minor findings in that scope.

### Runtime dependencies and reproducibility

Python 3.14.10, Pillow 13.0.0 and native Tesseract 5.5.4/Leptonica 1.87.0 were verified on
macOS arm64. The only added Python dependency is pinned Pillow. English/Spanish OCR
data are installed; the exact Spanish source/hash, native output and fixture-font
provenance are under `research/scanner/environment.json`. See [SCANNER.md](SCANNER.md)
for macOS/Linux setup. Actual application tests cover installed capabilities and
missing-executable startup/recognition failure with working manual matching.

Recognition consumes a raw JPEG/PNG/supported-WebP body, 8 MiB maximum, 16 million decoded
pixels, 8192 px edge limit and 2048 px working edge. HEIC is explicitly unsupported.
Pillow/native OCR run in parent-managed temporary workers with output, concurrency
and time bounds. No photo/EXIF/GPS/raw OCR is persisted or logged. A 20 s worker deadline
plus separate 3 s language probe precedes a separately bounded 20 s matching stage.
Session/CSRF, no-store, account isolation and provider canonical identity remain in
existing infrastructure. API contracts and record-backed retry limits are in SCANNER.md.

### Final complete gate — 2026-11-11

`bash scripts/check.sh` completed with **exit 0** after all product review fixes:

| Check | 5D baseline | Iteration 6 final |
| --- | ---: | ---: |
| Offline provider fixtures/report | 43 passed | **43 passed** |
| Backend | 355 passed | **508 passed (+153)** |
| PostgreSQL subset, included above | 66 passed | **75 passed (+9)** |
| Frontend | 315 passed/29 files | **379 passed/32 files (+64)** |
| Ruff / ESLint | Pass | **Pass** |
| TypeScript | Pass | **Pass** |
| Production build | Pass | **Pass, 101 modules** |
| Whitespace | Pass | **Pass** |

**No skipped or failing tests.** New backend cases comprise 47 image/OCR/extraction,
56 matching/provider, 32 scanner HTTP/application, 9 inventory replay and 9 PostgreSQL
integration tests. Four OCR tests execute the actual engine on original fixtures;
an additional application test queries installed native capabilities. On a machine
without native data these optional native cases can skip, which must be reported;
none skipped here. All external catalog/Google boundaries in standard tests are
offline. Database tests use the existing dedicated test DB's disposable schemas only.
Concurrency tests prove identical confirmations yield one durable UUID, conflicting
payloads fail without overwrite, different owners are isolated and intentional new
keys create separate copies. Completion remains distinct-printing-derived and boxes
are unchanged. Recognition/matching produce no inventory writes.

A preliminary gate also passed 497 backend/368 frontend before final extraction and
review regressions; it is not the final count. Sandbox attempts unable to reach
localhost PostgreSQL or public TCGdex were rerun with approved access, never bypassed
by skipping tests or weakening assertions. No credentials were printed or changed.

### Actual OCR evidence and limits

`research/scanner/results.json` retains the original run; `results-final.json` records
the final recheck on 2026-11-11. Both use 14 original generated text/geometric samples
and a real local OCR process with production matching against 510 captured physical
catalog identities in three expansions. No copyrighted card artwork or private photo
is committed. The first generation's default font lacked accented glyphs; it was
replaced with a locally installed font, visually checked and evaluated again before
claiming Spanish evidence. Font files are not redistributed.

Final results: **11/11 top-1 and 11/11 top-3** labeled cases, **2/2 abstentions**, and
**1/1 ambiguity preserved**. Observed OCR latency was **0.2020–0.4981 s, median 0.2334 s**;
peak sampled evaluator/worker/native RSS approximately **180.05 MiB**. RSS sampling
can miss peaks and is not a hard ceiling/two-worker benchmark. These small synthetic
results do not establish real-card-photo or global retrieval accuracy. Latency excludes
candidate matching and network work; no confidence percentages are shown in the app.

Separately, `research/scanner/live_smoke.json` records one original upright sample
through real OCR and live TCGdex matching: `sv03.5-025` ranked first among six
alternatives in 3.130 s including provider work. That was a service-level public-data
probe; it performed no inventory write, browser interaction or Google flow. Additional
name-query probes and six captured EN/ES checklist sources retain URLs/hashes under
research. No real-photo, mobile camera, Safari/Chromium or live OAuth acceptance was
performed. Use SCANNER.md's checklist before publication. Standalone promo numbers
without a fraction need manual entry; physical English coverage, provider uptime,
foil/glare/perspective and limited global name discovery remain explicit limitations.


## Scanner Milestone A — 2026-11-23

Scoped continuation completed HEIC/baseline verification only. Existing native
registration, image validation, API capability/schema changes, geometry/regional OCR,
frontend HEIC upload and the verified baseline were recovered intact. No new OCR
algorithm, dependency or UI redesign was added in this session.

Added HEIF orientation/metadata and corrupt-content regressions, plus two real native
HTTP cases covering both HEIC MIME aliases, exact fixture extraction, no-store and
zero inventory writes. Replaced the obsolete unsupported-HEIC envelope case with
unsupported TIFF; corrupt HEIC now exercises the real decoder instead of a fake OCR
service. Fixed formatting/import lint in the touched modules.

Focused validation: **66 backend tests passed, no skips** (HEIF, OCR/security and
scanner HTTP); **20 frontend scanner-service tests passed**; scoped Ruff/ESLint and
frontend TypeScript passed. Three initial process-cleanup assertions could not run
`ps` inside the sandbox; the approved rerun passed without changing assertions.
The complete gate was deliberately deferred per the one-milestone instruction.

| Original private photograph | Preserved baseline | Current original HEIC |
| --- | --- | --- |
| Cranidos 044/084 | “hat”, 044/84; me05-044 first, uncertain | Cranidos, 044/84; me05-044 first, possible |
| Armarouge 086/084 | “xe”, no number; no candidates | Armarouge, 086/84; me05-086 first, possible; me05-012 uncertain alternative |

Direct HEIC OCR took 1.9509 / 1.6596 s; total OCR+catalog took 4.5785 / 1.6653 s.
CPU was 3.0909 / 1.9993 s; approximate sampled process-tree RSS was 213.23 / 232.30 MiB.
These are single runs, with provider cache warming between inputs; no throughput or
general speed/accuracy claim follows. Preserved baseline OCR was 0.5021 / 3.0048 s.
A current lossless-PNG rerun used exactly the baseline's processed-input hashes and
returned the same clues and candidate ordering as direct HEIC. Art/visual reranking
is not wired into the scanner route and contributed no evidence to these results.

Reproduce using `research/scanner/evaluate_private.py` with the authorized input
directory, `--date`, and `--output`; add `--baseline` for frozen source or `--png` for
matched decoded inputs. Photos are selected by manifest hashes, never filename or
production hardcoding. Results: `real_photo_heic_milestone_a.json` and
`real_photo_png_milestone_a.json`. Original hashes remain unchanged; no private
images were copied into the repository or uploaded. Tesseract 5.5.4 and pillow-heif
1.8.1 were used. Real browser/camera acceptance remains pending.

Next single milestone: B, focused completion/review of recognition fallback behavior
when card localization is uncertain. Pending hybrid/UI integration work is preserved;
this checkpoint does not claim the full branch is ready to commit.


## Scanner Milestone B — 2026-11-23

Finished only the accepted-crop fallback gap. The previously added unproductive-crop
regression and six new deterministic cases failed before the fix. Nine new tests
now cover empty/partial/strong/conflicting crops, no cross-path splicing, timeout
preservation, shared four-second allowance, and actual native recovery after an
overaggressive crop of upright/90-degree original synthetic images. Existing geometry
cases retain uncertain/noisy/partial boundaries and mild rotations. No hybrid or UI
redesign was started; only ES/EN notices were added to the existing display.

Final focused command covers fallback, regions, geometry, extraction, OCR, HEIF,
matching, provider and scanner HTTP: **172 passed, zero failures/skips**. Scoped Ruff, dictionary ESLint and frontend
TypeScript pass. Full-project gate remains deferred by the milestone instruction.

| Original HEIC | Name / number | Top candidate / quality | Evidence | A OCR → B OCR |
| --- | --- | --- | --- | --- |
| Cranidos | Cranidos / 044/084 | me05-044 / possible | exact name, number, printed total | 1.9509 → 2.3296 s |
| Armarouge | Armarouge / 086/084 | me05-086 / possible | exact name, number, printed total | 1.6596 → 2.2734 s |

Armarouge retains me05-012 as an uncertain alternative. Both disclose localization
conflict; stronger cropped clues remain intact. Total service times were 5.1107 /
2.2792 s (including live catalog work), CPU 3.4683 / 2.7454 s, sampled tree RSS
223.14 / 244.27 MiB. Network/cache and single-run timing preclude a general speed claim.
No match-quality labels were promoted.

The separate 14-image original synthetic run preserves 11/11 top-1 and top-3 hits,
2/2 abstentions, 1/1 ambiguity, and 14/14 normalized name/number/total/category checks.
Median OCR 0.3221 s, range 0.2860–0.7697 s, approximate peak RSS 237.48 MiB. Evidence:
`research/scanner/results-milestone-b.json`. Real photographs remain outside Git;
original hashes are checked by the evaluator. No browser acceptance or full-gate pass
is claimed. Next milestone should review the already pending consecutive-scan UI and
its session/cancellation behavior, separately from this completed fallback change.

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

### Acceptance regression follow-up — 2026-11-23

Recovered the two absent candidates in the five-photo sample with bounded fallback
framing, layout-aware Trainer title OCR and language-aware discovery budget ordering.
All five expected cards now rank first, as do the prior Cranidos/Armarouge HEICs.
Jamming Tower and Zigzagoon numbers remain unreadable: same-name printings remain
ambiguous, requiring explicit confirmation. This is not a general accuracy claim.
Scorbunny retains a partial OCR title and uncertain confidence. See docs/SCANNER.md
and research/scanner/acceptance_regression_{before,after}.json for measured evidence.

Validation: 100 focused tests; one complete scripts/check.sh run passed with 43
unittest, 593 backend and 406 frontend tests, zero skips/failures. Ruff, ESLint,
TypeScript, production build and whitespace passed. Seven general regression cases
cover bounded localized discovery, incomplete regional names, secret numbering,
Trainer headers/title regions and interrupted geometric boundaries. No private
images committed, inventory writes, credentials changes, commits or pushes.
Remaining: improve outlined footer OCR using independent evidence; do not infer a
printing solely from first rank. No hybrid recognition or Iteration 7 work.

## Iteration 7 — Reference prices (2026-11-23)

Apply migration `0005` before starting the API (sign-in writes `user_settings`, which now
has `preferred_currency`):

- `cd backend && .venv/bin/alembic upgrade head` → `.venv/bin/alembic current` shows `0005 (head)`.

No new dependencies or environment variables. Prices come from TCGdex and exchange
rates from `https://open.er-api.com/v6/latest/USD`; tests never use the network.
`research/prices/capture_exchangerate.py` refreshes the rate sample (run it rarely: a 429
blocks the client for 20 minutes).

Final gate: `bash scripts/check.sh` exit 0 — 43 provider fixtures, 790 backend tests
(PostgreSQL integration included, no skips), 421 frontend tests in 34 files; Ruff,
ESLint, TypeScript, production build and whitespace passed. See [PRICES.md](PRICES.md).

## Visual tokens and style contracts (Iteration 8A)

- Add or change a color only in `frontend/src/styles/tokens.css`. Feature stylesheets use
  `var(--pv-*)`; a hex, `rgb()` or `hsl()` literal anywhere else fails
  `npm test --prefix frontend` (`styles/styles.contract.test.ts`). Colors that are content
  (Pokémon types, PC wallpapers, holo effects) go between `/* pv-allow-colors: reason */`
  and `/* pv-allow-colors-end */`.
- A new text token needs contrast pairs added to the contract (≥ 4.5:1 on every surface;
  ≥ 3:1 for borders and focus). Pixel-font rules must use at least `--pv-text-pixel`.
- Animations must not be `infinite`; keep durations within 150–250 ms except skeletons
  (≤ 3 iterations). `base.css` already neutralizes motion for reduced-motion users.
- Component tests that need a viewport or media preference use `src/test/media.ts`
  (`stubMedia({ mobile, reducedMotion })`); Home tests route requests with
  `src/test/homeFixtures.ts`.
- Automated tests cannot judge the cut corners, spacing or colors on a real screen. Use the
  manual checklist in `docs/ROADMAP.md` (Safari, desktop and iPhone-size responsive mode).

## Iteration 8C.1 — PC boxes retired

The manual checklists above that open `/boxes` (catalog boxes: wallpapers, sound, sprite
modes, box search, the box journey) are **historical**; the feature was removed.

- **Applying migration 0008** (drops the personal-box tables). Make a backup first, with your
  own connection data (the session never reads `backend/.env`):
  ```bash
  pg_dump "postgresql://USER@HOST:PORT/DBNAME" -Fc -f ~/pokevault-before-0008.dump
  cd backend && .venv/bin/alembic upgrade head
  .venv/bin/alembic current   # 0008 (head)
  ```
  Restore with `pg_restore -d "postgresql://USER@HOST:PORT/NEWDBNAME" ~/pokevault-before-0008.dump`
  into an empty database. To go back one step: `.venv/bin/alembic downgrade 0007`.
- **Manual check:** `/boxes` opens the Pokédex; `/boxes?pokemon=559` opens Scraggy's gallery;
  `/boxes?mode=personal` opens the binders; the Pokédex pages 1–35 and finds species by name
  and number; no nav or Explorar entry says "Cajas PC".
