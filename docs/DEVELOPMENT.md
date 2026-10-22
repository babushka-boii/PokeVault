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
