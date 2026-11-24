# Iteration 8A "Unova Noir" visual system, shell and Home implementation plan

> **For agentic workers:** Work test-first, one task at a time, and finish with an
> independent final review. Implementation starts only after the student approves the
> spec and this plan. No commit or push without the student's explicit request; the
> Iteration 7 rule "commit each task if tests and lint pass" applies only if the
> student confirms it again for 8A.

**Goal:**
- Apply dark "Unova Noir" design tokens globally.
- Build a new responsive shell: a desktop header and a mobile bottom bar with a
  central Scan button.
- Build a new Home: value hero, scanner card, most valuable copies, "Mi PC" preview
  and expansion progress.

All of it uses only existing data and endpoints.

**Architecture:**
- `styles/tokens.css` is the only place where palette hex values are written.
- `styles/base.css` holds element defaults, focus, reduced motion and `.pv-*`
  utilities.
- Small UI primitives live in `components/ui/`, and shell pieces in
  `components/shell/`.
- Home sections live in `components/home/`.
- Existing feature CSS keeps its selectors and moves to tokens.

**Stack:**
- Existing React 19, React Router 7, Vite 8 and Vitest.
- New dependencies, exact-pinned:
  - `@fontsource-variable/inter@5.3.0`
  - `@fontsource-variable/space-grotesk@5.3.0`
  - `@fontsource/silkscreen@5.3.0`
- No Tailwind, unless spec decision D1 changes that.
- No backend changes.

**Spec:** `docs/superpowers/specs/2026-11-23-visual-redesign-8a-design.md`.

## Audit and constraints

- `main` @ `a2748bb` is clean. Iteration 7 is merged (PR #5). Work on a new branch,
  `feat/iteration-8a-unova-noir`, created from an updated `main`.
- **Tailwind is not installed**, although `CLAUDE.md` says it is. There are 12 plain
  CSS files with hard-coded light colors (spec §2). Without a token migration, a dark
  `:root` would make light panels inherit light text.
- **Tests coupled to the shell:**
  - `App.test.tsx` (h1 "Estado del sistema" on `/`; links "Inicio", "Cajas", "Home",
    "Boxes", "Profile"; button "English").
  - `Scanner.test.tsx` (the nav contains "Escáner de cartas").
  - `Sets.test.tsx` (clicks "Expansiones").
- **Tests coupled to classes:** `pc-wallpaper--*` (PersonalBoxes, CardEntrypoints).
  These class names must stay.
- **jsdom:**
  - It has no `matchMedia`, so the shell defaults to desktop when it is missing. The
    mobile tests stub it.
  - CSS media queries and `clip-path` are not evaluated, so the visual checks are
    manual.
- **Backend boundary:** no backend, migration or API change. `git diff main --
  backend` must stay empty.
- **Content rules:**
  - No trainer, character or third-party art or marks. The monogram is original.
  - Never read or output `backend/.env`.
  - No private photos.
- **Who runs what:** the student runs `bash scripts/check.sh` and the manual Safari
  checks. The session can run `npm` commands on this Mac when it is allowed to.

## Decisions and alternatives

These are the assumed answers to spec §12 (D1–D7). Changing any of them before Task 1
only affects the task noted.

| Decision | Assumed | Affects |
| --- | --- | --- |
| D1 | No Tailwind; CSS variables + `.pv-*` CSS; fix CLAUDE.md | Tasks 1, 2, 7 |
| D2 | "Escanear" button in desktop header | Task 3 |
| D3 | "Explorar" menu (Pokédex, Expansiones) in mobile header | Task 3 |
| D4 | Home expansions = sets of the 30 most recent copies, max 6; owned-sets endpoint recorded as debt in ROADMAP (needed by 8E) | Task 6 |
| D5 | Mi PC = first box, read-only selection, links to `/boxes?mode=personal` | Task 6 |
| D6 | System status as a collapsible footer on Home, signed-in only, closed by default (mounts `SystemStatus` only when opened) | Task 5 |
| D7 | Fontsource self-hosted, pinned 5.3.0 | Task 1 |

Alternatives that were considered and rejected:

- **Two navs in the DOM, hidden by CSS:**
  - Simple, but jsdom would see both landmarks, which breaks the "never both
    navigations" promise in tests.
  - It also duplicates links for assistive technology when CSS fails.
  - Rejected in favor of one layout chosen by `useMediaQuery`.
- **Reusing `CollectionValue` on Home:** it renders the Profile layout, with the
  currency select and a list. Instead, extract `useCollectionValuation` and build the
  Home view on it, and have Profile use the same hook.
- **A new Home grid component:** rejected. `PersonalGrid` is reused for keyboard and
  label parity with Mi PC, with a scoped restyle.

## Shared interfaces

- **`useMediaQuery(query: string): boolean`:** the same `useSyncExternalStore`
  semantics as today's private hook. It returns `false` without `matchMedia`.
- **`useCollectionValuation(): { state, retry }`:**
  - Keyed by `currency` when `ready`.
  - A 401 calls `retrySession`, as `CollectionValue` does today.
  - Used by Profile and Home.
- **UI primitives:**
  - `CutPanel({ as?, tone?: "default" | "scan" | "value", children, labelledBy? })`
  - `ButtonLink({ to, variant: "primary" | "secondary", cut?: boolean })` and
    `Button(...)`
  - `PixelLabel({ tone?: "gold" | "cyan" | "muted", children })`
  - `Chip({ to?, children })`
  - `Skeleton({ shape: "text" | "block" | "card" | "grid" | "bar", lines? })`
  - `InlineError({ message, onRetry, retryLabel })`
- **Shell:**
  - `AppShell` (unchanged export).
  - `DesktopHeader`, `MobileHeader`, `ExploreMenu`, `TabBar`.
  - `CurrencyToggle` (`role="group"`, two `aria-pressed` buttons, via `useCurrency`).
  - `LocaleToggle` (via `toggleLocale`).
  - `AvatarLink` (via `useAuth` + `Avatar`).
- **Home sections** (each owns its resource, skeleton and error):
  - `ValueHero({ resource })` and `TopCards({ resource })` share one valuation
    resource.
  - `ScannerCard`, `PcPreview`, `SetsProgress`, `GuestHome`, `EmptyHome`,
    `SystemStatusFooter`.
- **Test helper:** `src/test/media.ts` provides
  `stubMedia({ mobile?: boolean, reducedMotion?: boolean })`. It returns a controller
  that can fire `change` events.

## Review focus

1. **Every existing route stays legible and usable on the dark theme.** No light
   panel keeps inherited light text, and no control loses its visible boundary or
   focus.
2. **Exactly one primary navigation per layout,** with correct `aria-current`. Touch
   targets are at least 44px, and content is never hidden behind the tab bar.
3. **Home never sends a private request for guests,** or before auth resolves. One
   section's failure never hides the others. Account switches never show another
   user's data.
4. **Color roles:** gold only for money and value, cyan for interaction, and type
   colors never as large backgrounds.
5. **Motion:** nothing moves for more than 5 s, and everything respects reduced
   motion.
6. **No behavior change** in Pokédex, Boxes, Collection, Cards, Sets, Scanner, Login
   or Profile, and no backend diff.

## Tasks

### Task 0: Branch and baseline

- [x] Run `git switch main && git pull`, then
  `git switch -c feat/iteration-8a-unova-noir`. (Spec and plan committed as `ec4973b`.)
- [x] Record the baseline: the frontend test count (421 at the end of Iteration 7) and
  the list of hard-coded colors per CSS file (for the migration checklist).
  (34 files / 421 tests green. Color literals: `cards.css` 72, `boxes.css` 63,
  `scanner.css` 29, `styles.css` 24, `typeBadge.css` 22, `personal.css` 16,
  `auth.css` 15, `interactive-card.css` 13, `inventory.css` 11, `sets.css` 11,
  `artwork.css` 5, `prices.css` 0; 281 in total.)
- [ ] Student (optional): take "before" screenshots of the routes in spec §14 for
  comparison.

### Task 1: Fonts, tokens, base styles and contracts

**Files:**
- `frontend/package.json` and `package-lock.json` (the 3 font packages, exact
  versions).
- `frontend/src/styles/{tokens,base}.css`
- `frontend/src/main.tsx` (font and style imports, in this order: fonts → tokens →
  base → styles).
- `frontend/index.html` (theme-color, `viewport-fit=cover`, favicon link).
- `frontend/public/favicon.svg`
- `frontend/src/styles/styles.contract.test.ts`

**Steps:**
- [x] Write the failing contract tests (spec §13):
  - Token contrast pairs.
  - No raw colors outside `tokens.css` and allow-listed blocks, with a `LEGACY_FILES`
    list that starts with all 12 current files.
  - A global reduced-motion block.
  - Skeleton iterations ≤ 3.
  - Pixel font size ≥ 11px.
- [x] Install the fonts with
  `npm install --save-exact @fontsource-variable/inter@5.3.0 @fontsource-variable/space-grotesk@5.3.0 @fontsource/silkscreen@5.3.0`.
  Import only the needed weights: variable `wght` for Inter and Space Grotesk, and 400
  for Silkscreen.
- [x] Write `tokens.css` (spec §5) and `base.css`:
  - Body background, text and font.
  - Headings in Space Grotesk.
  - Links in cyan.
  - Form controls with `--pv-border-strong`.
  - The global `:focus-visible` ring.
  - The `.pv-sr-only`, `.pv-cut` (two pseudo-element layers), `.pv-pixel` and
    `.pv-skeleton` utilities.
  - The global reduced-motion block.
  - `color-scheme: dark`.
- [x] Verify that Silkscreen renders "COLECCIÓN", "ESCÁNER" and "BÓVEDA", using the
  latin and latin-ext subsets. If an accented glyph is missing, use Space Grotesk
  uppercase for that label and note it.
- [x] Get the contracts green. `LEGACY_FILES` still lists all 12 files. Then run
  `npm test -- --run`, lint and typecheck.
- Evidence:
  - 35 files / 467 tests green, including 46 contract tests. Lint, typecheck and build
    pass.
  - Vitest stubs stylesheets, so `vite.config.ts` now keeps only `?raw` imports
    (`css.include: [/\.css\?raw$/]`). Component CSS stays stubbed, so jsdom visibility
    checks are unchanged.
  - Silkscreen glyph coverage was checked by reading the woff `cmap`: Á É Í Ó Ú Ñ Ü ¿ ¡
    · are all present, so no fallback is needed.
  - The build emits every subset, but `unicode-range` limits downloads to latin and
    latin-ext: Inter 48 KB, Space Grotesk 22 KB and Silkscreen 8 KB for latin.
  - Until Task 4, legacy light panels inherit the dark body, so intermediate commits
    are not visually reviewable.

### Task 2: UI primitives and shared hooks

**Files:**
- `frontend/src/hooks/useMediaQuery.ts` (+ test).
- `frontend/src/components/cards/InteractiveCard.tsx` (import the hook; no behavior
  change).
- `frontend/src/components/ui/*` (+ `ui.css`, `ui.test.tsx`).
- `frontend/src/components/prices/useCollectionValuation.ts`;
  `frontend/src/components/prices/CollectionValue.tsx` (uses the hook).
- `frontend/src/components/shell/Avatar.tsx`; `frontend/src/pages/ProfilePage.tsx`
  (imports `Avatar`).
- `frontend/src/test/media.ts`

**Steps:**
- [x] Write failing tests:
  - `useMediaQuery`: initial value, `change` events, and no `matchMedia`.
  - Primitives:
    - Accessible names.
    - `ButtonLink` renders a real `<a href>`.
    - `InlineError` has `role="alert"`, and its retry calls the handler.
    - `Skeleton` is `aria-hidden` and the parent has `aria-busy`.
    - `PixelLabel` is text, not an image.
- [x] Implement them. The existing `InteractiveCard`, `Prices` and `Auth` suites must
  stay green **without edits**, which proves the extractions did not change behavior.
- Evidence:
  - 37 files / 476 tests green. The `InteractiveCard`, `Prices` and `Auth` suites
    passed with no edits. Lint, typecheck and build pass.
  - `main.tsx` now imports `tokens.css` and `base.css` **before** `App`, so component
    stylesheets come later in the cascade.
  - Element defaults in `base.css` use `:where()` (zero specificity), so every
    existing class rule still wins.

### Task 3: Shell (desktop + mobile)

**Files:**
- `frontend/src/components/AppShell.tsx`
- `frontend/src/components/shell/{Logo,DesktopHeader,MobileHeader,ExploreMenu,TabBar,CurrencyToggle,LocaleToggle,AvatarLink,icons}.tsx`
  and `shell.css`.
- `frontend/src/i18n/dictionaries.ts` (`shell` section in ES and EN).
- `frontend/src/components/AppShell.test.tsx`
- Updates to `frontend/src/app/App.test.tsx` and `frontend/src/pages/Scanner.test.tsx`.

**Steps:**
- [x] Write the failing shell tests listed in spec §13 for desktop, mobile, skip link
  and live layout swap.
- [x] Update the existing assertions without weakening them:
  - `App.test`: "Cajas" becomes "Cajas PC" (ES) and "PC Boxes" (EN). The locale test
    also asserts `document.documentElement.lang`.
  - `Scanner.test`: "nav contains Escáner de cartas" becomes "the banner contains a
    link 'Escanear' to `/scanner`", plus the nav assertion that the scanner page title
    is still the h1.
- [x] Implement the shell (spec §8):
  - The monogram SVG, an original "PV" in a cut hexagon.
  - Header: sticky on desktop, 56px on mobile.
  - Tab bar: safe area, a raised cut-corner ESCANEAR, `<main>` bottom padding.
  - `ExploreMenu`: Escape and outside click close it, and focus returns to the
    trigger.
  - Every target is at least 44px.
- [x] Remove the old `.topbar`, `.navigation`, `.brand` and `.locale-button` rules from
  `styles.css`, after checking with grep that nothing else uses them.
- [x] Run the full frontend suite. Only the files listed above may need edits. Any
  other failing suite means something regressed, so fix the code, not the test.
- Evidence:
  - 38 files / 485 tests green, including 9 new shell tests. Lint, typecheck and build
    pass.
  - Two more suites needed edits beyond the planned `App.test` and `Scanner.test`,
    each with a reason:
    - `Auth.test`: the "Cajas" link is now "Cajas PC", the approved nav label. Only the
      name changed.
    - `Sets.test`: two tests build the provider tree by hand and lacked
      `CurrencyProvider`, which `App` has had since Iteration 7. The shell now reads
      the currency, so the harness was aligned with `App`. The assertions are
      unchanged.
  - The currency-save failure notice in the shell uses its own short text
    (`shell.currencyLocalOnly`), so it never duplicates the Profile message that
    `Prices.test` looks for.
  - On `/boxes`, jsdom also exposes the page's own `<header>` as a banner (browsers do
    not, inside `<main>`). The mobile test takes the shell header, which comes first,
    and checks its class.

### Task 4: Global token migration of existing CSS

**Files:** the 12 CSS files listed in spec §2, one commit-sized step per group:
1. `styles.css`, `auth.css`, `typeBadge.css`
2. `cards.css`, `artwork.css`, `interactive-card.css`
3. `inventory.css`, `prices.css`
4. `sets.css`, `scanner.css`
5. `boxes.css`, `personal.css`

**Steps:**
- [x] For each group, replace the literals following the mapping in spec §10, then
  remove the files from `LEGACY_FILES`. Do not change any selector, class name,
  breakpoint or DOM.
- [x] Remove the per-file focus colors and `!important` focus overrides, because the
  global ring from `base.css` applies. Keep the existing reduced-motion blocks.
- [x] Price amounts become gold Space Grotesk with tabular numbers. Gold that was used
  as "active" becomes cyan.
- [x] The catalog PC: the console frame goes dark, and the wallpaper screens stay
  allow-listed content. The selected-slot cursor becomes cyan.
- [x] After each group, the full frontend suite passes **with no test edits**.
  `LEGACY_FILES` is empty at the end.
- [ ] **Stop for the student:** run `npm run dev` and do a quick Safari pass over every
  route in spec §14 before building Home. A regression found now is cheaper than one
  found after Task 6.
- Evidence:
  - Five commits, one per group: `07009dc`, `f79af41`, `6976b63`, `98a6c56` and the
    boxes commit.
  - 38 files / 486 tests green. No existing test was edited in this task. Lint,
    typecheck and build pass.
  - `LEGACY_FILES` is empty, and a new contract test keeps it empty.
  - The raw-color contract was verified by planting a hex literal in `styles.css`: the
    test failed, then passed again once the literal was removed.
  - Allow-listed content blocks: type badge colors, holo glare/iridescence, and the PC
    wallpaper screens (including the empty-slot dots and hover drawn on them).
  - Removed per-file focus colors (`#173f70`, `#317ec5`, `#bf700f`) and the PC slot
    `outline … !important`. The PC selection cursor now uses a cyan border plus a dark
    inset ring (`box-shadow`, not `outline`), so the focus ring is never overridden.
    The two remaining focus rules are intentional: inward offsets (−3px) for PC slots
    and `main`.
  - Spec deviations, all minor:
    - The ability label (`.tcg-ability-kind`, previously red) uses secondary text.
    - Language and coverage notes use secondary text rather than the notice
      treatment, which is reserved for real notices: scanner notices and uncertain
      quality.
    - The catalog box title uses Space Grotesk uppercase rather than Silkscreen,
      because personal box names can be long user text.

### Task 5: Home structure, guest, empty and status footer

**Files:**
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/components/home/{GuestHome,EmptyHome,ScannerCard,SystemStatusFooter}.tsx`
  and `home.css`.
- `frontend/src/i18n/dictionaries.ts` (`home` section; move `home.title` and
  `home.description` to `status`).
- `frontend/src/pages/Home.test.tsx`
- `frontend/src/app/App.test.tsx` (`/` heading).

**Steps:**
- [ ] Write failing tests:
  - Guest render with zero private requests.
  - Auth resolving shows skeletons and makes no private requests.
  - The visually hidden h1 "Inicio" / "Home".
  - The scanner card copy and its `/scanner` link.
  - The status footer:
    - Absent for guests.
    - For signed-in users it is closed by default, with the summary "Estado del
      sistema" and no `/health` request.
    - Opening it mounts `SystemStatus`, which makes one `/health` request.
    - The existing `SystemStatus` behavior stays covered by `SystemStatus.test`.
  - Full ES/EN coverage of the new strings. Dictionary parity is enforced by the
    existing type.
- [ ] Implement the page skeleton:
  - The responsive grid (spec §9.1).
  - Auth gating, with the subtree keyed by `user.id`.
  - Guest and empty states (spec §9.3).
  - The scanner card: static scanline, and a single 600 ms sweep on hover or focus,
    disabled under reduced motion.
- [ ] Write the ES/EN strings (spec §9.5, plus all state, error, retry and status
  strings). Counters use the `one`/`other` keys.

### Task 6: Home data sections

**Files:**
- `frontend/src/components/home/{ValueHero,TopCards,PcPreview,SetsProgress}.tsx`
- `frontend/src/components/home/home.css`
- `frontend/src/pages/Home.test.tsx`
- Fixtures: reuse `test/priceFixtures.ts` and `test/setFixtures.ts`, plus a small
  `test/homeFixtures.ts` for boxes and recent copies.

**Steps:**
- [ ] Write failing tests for every authenticated case in spec §13:
  - Hero total, chips, the variant link and the attribution link.
  - Rates unavailable.
  - Top 5 order and links.
  - The PC grid: 30 cells, initial selection, arrow keys move the selection and update
    the panel, the unassigned counter and the links.
  - Expansions: deduplicated, at most 6, in order, one `/sets/progress` call; the
    unavailable checklist case.
  - Per-section errors with an isolated retry.
  - A 401 calls `retrySession`.
  - Switching user.
  - Loading shows `aria-busy` and no spinner.
  - Reduced motion: no tilt and no sweep.
- [ ] Implement:
  - **`ValueHero` + `TopCards`:** one shared `useCollectionValuation`. Reuse
    `PriceText`, `RatesAttribution` and `ReferenceNote`, and the existing
    `ValueTotal` formatting rules.
  - **`PcPreview`:** `fetchBoxes` → `fetchBox(first)` + `fetchBoxView("unassigned")`.
    Reuse `PersonalGrid`, `PersonalIcon` and `useSpriteMode` in static mode, with the
    `.pv-home-pc` scoped restyle (dots and cyan cursor).
  - **`SetsProgress`:** `fetchBoxView("recent")` → `usePersonalMetadata` → set ids
    (first 6 distinct) → `fetchSetProgress`. Reuse `SetProgress compact`.
- [ ] Keep request counts bounded:
  - Guests make no private requests.
  - Signed-in users make 1 valuation request + 2 box requests + 1 unassigned + 1
    recent + 1 progress request.
  - Card metadata comes through `usePersonalMetadata`, 4 at a time.

### Task 7: Review, validation and docs

- [ ] Run an independent review against the review focus above, and fix what it
  confirms.
- [ ] Run `bash scripts/check.sh` (the student, in Terminal) and record the counts.
- [ ] Student manual acceptance in Safari, following spec §14:
  - Desktop and iPhone-size responsive mode.
  - All routes.
  - Home in the guest, loaded, empty and outage states.
  - VoiceOver pass over the shell and Home.
  - Reduce motion.
  - Network tab: no Google font hosts.
- [ ] Docs:
  - `docs/UX_UI.md`: an "Iteration 8A — Unova Noir" section with tokens, roles, shell,
    Home and the motion rules.
  - `docs/ARCHITECTURE.md`: the styles layer, `components/{ui,shell,home}`, and fonts.
  - `docs/DEVELOPMENT.md`: how to add a token and the contract tests.
  - `docs/ROADMAP.md`: 8A items, the manual checklist, and 8B–8F listed as next.
  - `Bitacora.md` and `Autoria.md`, in Spanish.
  - `CLAUDE.md`: fix the stack line (Tailwind) and update the state.

## Manual route checklist (Task 4 stop and Task 7)

Check each route on desktop and at iPhone size:
- `/` (guest, loaded, empty, prices down)
- `/pokedex`
- `/boxes` (catalog, all 5 wallpapers)
- `/boxes?mode=personal` (box, picker, derived views)
- `/sets`, `/sets/:id` (owned/missing filters)
- `/pokemon/:n/cards`, `/cards/:id` (price panel, interactive card)
- `/collection` (filters, `?variant=unknown`), `/collection/:id` (edit form)
- `/scanner` (upload, candidates, confirmation)
- `/login`, `/profile` (guest and signed in, currency switch)

For each one, confirm:
- Text is legible.
- Controls are visible.
- Focus is visible.
- Nothing is hidden behind the tab bar.
- Gold appears only on money.

## Execution evidence

(Filled in during implementation.)
