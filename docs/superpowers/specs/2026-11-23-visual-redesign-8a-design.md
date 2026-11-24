# PokéVault — Visual redesign 8A design ("Unova Noir": tokens, shell and Home)

**Date:** 2026-11-23

**Status:** Approved by the student on 2026-11-23 with the recommended decisions in §12,
plus two adjustments: a D4 technical-debt note in ROADMAP, and D6 shown only to
signed-in users and closed by default.

**Iteration:** 8A — first phase of the visual redesign

| Phase | Content |
| --- | --- |
| **8A** | **Visual system, app shell and Home (this document)** |
| 8B | Quick save + animated scanner |
| 8C | Easy "Mi PC" |
| 8D | Favorites + carousel (replaces the "most valuable" strip on Home) |
| 8E | 3×3 binder + master set |
| 8F | Profile with trainer and team |

## 1. Purpose

Give PokéVault one coherent visual identity ("Unova Noir"): premium and modern, using
the dark look of the gen 5 games, with small doses of retro. 8A delivers three things:

1. **Design tokens** applied globally, so every existing page inherits the new look
   without breaking.
2. **A new app shell**: a desktop header and a mobile bottom bar.
3. **A new Home** built only from data and endpoints that already exist.

Success means:
- Every current route renders legibly on the new dark theme.
- The shell is usable with keyboard, touch and screen readers on desktop and on
  iPhone-sized screens.
- Home shows the collection value, scanner entry point, most valuable copies, a PC
  preview and expansion progress. There are no backend, endpoint or database changes.

The design direction was approved by the student on a mockup. It must not copy other
apps, trainer art or third-party marks.

## 2. Evidence: the frontend today (audited 2026-11-23 on `main` @ `a2748bb`)

- **Stack:** React 19, React Router 7, Vite 8, TypeScript 6, Vitest 5 + Testing
  Library, ESLint. The only runtime dependencies are `react`, `react-dom` and
  `react-router-dom`.
- **Tailwind is not installed.** `CLAUDE.md` lists it, but `docs/ARCHITECTURE.md`
  already states "Tailwind CSS … are not installed".
- **Styling is plain CSS.** There are 12 files and about 1 080 lines:
  - `styles.css` (global and shell) is imported by `main.tsx`.
  - Each feature imports its own CSS:
    - `auth/auth.css`, `components/typeBadge.css`
    - `cards/{cards,artwork,interactive-card}.css`
    - `inventory/inventory.css`, `boxes/{boxes,personal}.css`
    - `sets/sets.css`, `scanner/scanner.css`, `prices/prices.css`
- **The theme is light.** Cream background `#f5edd8`, navy text `#17233c`, a red and
  navy header, and a gold active link.
- **Colors are hard-coded hex literals in every file. There are no CSS variables**,
  apart from a few local ones (`--pc-ink`, `--wall`, `--type-color`, `--card-*`).
- **Shell (`components/AppShell.tsx`, 40 lines):**
  - A `header.topbar` with a "PokéVault" brand link and a locale button ("English" /
    "Español").
  - A separate `nav.navigation` labelled "Navegación principal" with 7 links: Inicio,
    Cajas, Pokédex, Expansiones, Escáner de cartas, Mi colección, Perfil.
  - `main.content` with max-width 72rem.
  - There is no mobile navigation pattern; the nav scrolls horizontally.
- **Home (`pages/HomePage.tsx`)** only shows the h1 "Estado del sistema" and
  `SystemStatus`, the API/PostgreSQL health check.
- **Reusable pieces Home can build on:**
  - `fetchCollectionValue` returns a `Valuation`: `total`, `copy_count`,
    `priced_count`, `unpriced_by_reason.variant_unknown`, `pending_count`, `top` (5)
    and `rates`.
  - `ValueTotal`, `PriceText`, `RatesAttribution`, `ReferenceNote`.
  - `usePersonalMetadata` (public card metadata, 4 parallel requests).
  - `fetchBoxes`, `fetchBox`, and `fetchBoxView("unassigned" | "recent")`, which gives
    `total` and 30 copies.
  - `PersonalGrid` and `PersonalIcon` (a 6×5 keyboard grid with menu icons).
  - `fetchSetProgress` (≤ 12 set ids) and `SetProgress`.
  - `InteractiveCard`, `CardArtwork`.
  - `useCurrency` and `CurrencySwitch`, `useLocale().toggleLocale`.
  - `useTcgResource` (load, error and retry per key).
- **There is no endpoint that lists "sets I own".** Progress is per set id.
- **Motion:** `InteractiveCard` already honours `prefers-reduced-motion`, through a
  private `useMediaQuery` hook and CSS. `boxes.css`, `cards.css` and `artwork.css`
  have their own reduced-motion blocks.
- **Tests coupled to the shell:**
  - `App.test.tsx`:
    - Expects the h1 "Estado del sistema" on `/`.
    - Expects the nav "Navegación principal".
    - Expects the links "Inicio", "Cajas", "Home", "Boxes" and "Profile".
    - Expects the locale button "English".
  - `Scanner.test.tsx` expects the nav to contain "Escáner de cartas".
  - `Sets.test.tsx` clicks the "Expansiones" link.
  - Tests that check `pc-wallpaper--*` classes stay valid, because class names are
    kept.
  - `jsdom` has no `matchMedia`, and the tests stub it where needed.
- **Validation:** `bash scripts/check.sh`. The last run had 421 frontend tests.

## 3. Confirmed direction (student, 2026-11-23)

### Palette

Tokens become CSS variables plus a theme.

| Role | Token | Value |
| --- | --- | --- |
| Background "Noche" | `--pv-bg` | `#0B0D10` |
| Panel | `--pv-panel` | `#14181D` |
| Raised panel | `--pv-panel-raised` | `#1B2128` |
| Header / bars | `--pv-bar` | `#0E1115` |
| Border | `--pv-border` | `#2A323C` |
| Soft border | `--pv-border-soft` | `#222A33` |
| Text | `--pv-text` | `#F2F5F7` |
| Secondary text | `--pv-text-2` | `#9AA6B2` |
| Tertiary text | `--pv-text-3` | `#8592A0` |
| Interactive (cyan) | `--pv-cyan` | `#3FD0E0`; text on cyan `#0B0D10` |
| Money / favorites (gold) | `--pv-gold` | `#F2C94C` |
| Notice | `--pv-warn-border` | `#5A4A1E` with gold text |

### Color roles

- **Cyan** is for actions and anything interactive: the primary button, focus,
  selection and the box cursor.
- **Gold** is for money/value and favorites only.
- **Pokémon type colors** appear only in small details (dots, sprites, the existing
  type badges), never as large backgrounds.

### Typography

- **Space Grotesk:** titles and numbers/prices.
- **Inter:** body text.
- **Silkscreen:** only for short uppercase labels, never below 11px. Fonts must not
  depend on Google at runtime.

### Shape

- Featured panels and the primary button get a diagonal cut corner (gen 5 menus).
- Everything else uses straight edges or minimal radii.

### Accessibility

- Focus is always visible, as a cyan ring.
- Touch targets are at least 44px.
- Contrast meets AA on every background.

### Motion

- Transitions last 150–250 ms, and animations only exist with a purpose.
- Everything honours `prefers-reduced-motion`.
- Anything that moves on its own for more than 5 s needs a pause control. This is
  mandatory from 8D, and 8A simply avoids such motion.

### Shell

- **Desktop:**
  - Original monogram logo.
  - Nav with Inicio, Pokédex, Cajas PC, Expansiones and Mi colección.
  - The existing CLP/USD and ES/EN controls.
  - An avatar that links to Perfil.
- **Mobile (< 768px):**
  - A fixed bottom bar with Inicio, Cajas, **ESCANEAR** in the middle (a featured cyan
    button), Colección and Perfil.
  - The header shrinks.
  - Both full navigations are never shown at once.

### Home

The sections, in order:
1. Value hero.
2. Scanner card.
3. Most valuable copies.
4. "Mi PC" preview.
5. Expansion progress.

Required states: guest, skeleton loading, empty with personality, and error with retry.
ES/EN must be complete.

### Scope limits

- No business logic, endpoint or database changes.
- No new trainer or character art.
- Only the shell and Home are redesigned in depth.

## 4. Scope

### Included

- `tokens.css` holding all design tokens, and `base.css` for element defaults, focus,
  reduced motion and utilities. Fonts are self-hosted.
- A small set of UI primitives:
  - Cut-corner panel, primary and secondary buttons and button-links.
  - Pixel label, chip, skeleton, and inline error with retry.
- A shared `useMediaQuery` hook, extracted from `InteractiveCard` without changing its
  behavior.
- New shell:
  - Desktop header.
  - Mobile reduced header, bottom tab bar and an "Explorar" menu.
  - Skip link.
  - Compact currency and locale toggles.
  - Avatar link.
  - Original SVG monogram, also used as the favicon.
- New Home with the five sections and all states, plus the system status moved to a
  small footer section (see D6).
- **Global token migration:** the 12 CSS files keep their selectors and layout, but
  every color is replaced by a token. Existing pages become dark-themed and legible,
  with no structural redesign.
- ES/EN strings for everything new.
- Tests:
  - Shell on desktop and mobile.
  - Home states.
  - Reduced motion.
  - Basic accessibility.
  - Token contrast.
  - A "no raw colors outside tokens" contract.
- Docs: UX_UI, ARCHITECTURE, DEVELOPMENT, ROADMAP, Bitacora, Autoria, and the Tailwind
  line in CLAUDE.md.

### Excluded (later phases or never)

- Redesigning Pokédex, Boxes, Collection, Card detail, Sets, Scanner, Login or Profile
  layouts; they only inherit tokens.
- Favorites and the carousel (8D), quick save and the animated scanner (8B), and easy
  Mi PC moves (8C).
- Deep links into the personal-box views (for example the unassigned view) are 8C.
- Binder and master set (8E), trainer profile (8F).
- Any backend change, new endpoint, migration or new stored preference.
- Light theme or a theme switch. 8A is dark only (`color-scheme: dark`).
- Trainer or character sprites and illustrations, Poké Ball shapes, official logos.
- Auto-playing carousels or any motion lasting more than 5 s.

## 5. Design tokens

### 5.1 Color

All tokens live in `frontend/src/styles/tokens.css` under `:root`. The values are the
approved ones (§3), plus four derived tokens needed for accessibility and states.

| Token | Value | Use |
| --- | --- | --- |
| `--pv-border-strong` | `#64717F` | Form control borders. Needs ≥ 3:1 against every surface (WCAG 1.4.11). |
| `--pv-danger` | `#FF7A7A` | Error text and icons |
| `--pv-success` | `#5BD69A` | Success text (for example "Copia añadida") |
| `--pv-focus` | `var(--pv-cyan)` | Focus ring |

There are also translucent helpers built with `color-mix`:
- `--pv-cyan-soft`: selected backgrounds, `color-mix(in srgb, var(--pv-cyan) 14%, transparent)`.
- `--pv-gold-soft`: the value hero glow.
- `--pv-overlay`.

Pokémon type colors stay as the existing `.type-badge--*` variables. They are
allow-listed in the contract test (§13). The same applies to:
- The PC wallpaper palettes in `boxes.css` (the wallpaper is user-chosen content).
- The iridescence gradient in `interactive-card.css`.

**Contrast, computed with the WCAG 2.x formula on 2026-11-23:**

| Foreground | `--pv-bg` | `--pv-panel` | `--pv-panel-raised` | `--pv-bar` |
| --- | --- | --- | --- | --- |
| `--pv-text` | 17.77 | 16.28 | 14.81 | 17.28 |
| `--pv-text-2` | 7.85 | 7.19 | 6.54 | 7.63 |
| `--pv-text-3` | 6.13 | 5.62 | **5.11** | 5.96 |
| `--pv-cyan` | 10.48 | 9.60 | 8.74 | 10.19 |
| `--pv-gold` | 12.26 | 11.23 | 10.22 | 11.93 |
| `--pv-danger` | 7.71 | 7.06 | 6.42 | — |
| `--pv-border-strong` (non-text) | 3.90 | 3.57 | 3.25 | 3.79 |

- `#0B0D10` text on a cyan button has a ratio of 10.48.
- Every text pair passes AA, and the lowest is 5.11.
- `--pv-border` and `--pv-border-soft` (1.1–1.5) and `--pv-warn-border` (≈ 2.1) are
  decorative only. They must never be the only boundary of a form control or the only
  indicator of state.
- These ratios are enforced by a unit test (§13).

### 5.2 Type, spacing, shape, elevation, motion

| Group | Tokens |
| --- | --- |
| Font families | `--pv-font-display` ("Space Grotesk Variable", system-ui …), `--pv-font-body` ("Inter Variable", system-ui …), `--pv-font-pixel` ("Silkscreen", ui-monospace …) |
| Type scale | `--pv-text-xs` 0.75rem, `-sm` 0.875rem, `-md` 1rem, `-lg` 1.25rem, `-xl` 1.75rem, `--pv-text-hero` clamp(2.5rem, 8vw, 4rem); pixel labels `--pv-text-pixel` 0.75rem (12px, never below 11px) |
| Spacing | `--pv-space-1` … `--pv-space-8` (0.25rem steps up to 3rem) |
| Radii | `--pv-radius-0` 0, `--pv-radius-1` 2px, `--pv-radius-2` 4px. Avatars stay circular. |
| Cut corner | `--pv-cut` 14px (panels), `--pv-cut-sm` 10px (buttons) |
| Elevation | `--pv-shadow-1` (a subtle 0 1px 0 inner highlight + 0 8px 24px black at 35%). No bright offset "sticker" shadows. |
| Layout | `--pv-content-max` 72rem, `--pv-header-h` 64px, `--pv-tabbar-h` 64px + safe area, `--pv-touch` 44px |
| Motion | `--pv-dur-fast` 150ms, `--pv-dur` 200ms, `--pv-dur-slow` 250ms, `--pv-ease` cubic-bezier(.2, .7, .2, 1) |

Tailwind exposure is decision D1 (§12). The recommendation is to keep CSS variables
only.

## 6. Fonts: self-hosted with Fontsource

**Decision:** install three exact-pinned Fontsource packages:
- `@fontsource-variable/inter@5.3.0`
- `@fontsource-variable/space-grotesk@5.3.0`
- `@fontsource/silkscreen@5.3.0` (weights 400 and 700)

All three were published on 2026-07-19 and carry the OFL-1.1 license.

They are imported once in `main.tsx`. Vite copies the `woff2` files into `dist/` with
hashed names.

**Why not the Google Fonts CDN at runtime:**
- **Privacy.** Every page load would send the user's IP address and referrer to Google.
  The project already avoids third-party requests that are not needed (for example
  `referrerPolicy="no-referrer"` on avatars).
- **It works offline and on the LAN.** Testing on a phone over the local network
  (pending since Iteration 6) and offline demos must not lose typography.
- **Deterministic.** The font versions are locked in `package-lock.json`, so the
  build and tests do not depend on the network.
- **Cheap.** Fontsource CSS uses `unicode-range`, so the browser only downloads the
  subsets it uses:
  - Latin and latin-ext cover Spanish (á é í ó ú ñ ¿ ¡).
  - Silkscreen ships both latin and latin-ext.
  - The expected cost is about 40–60 KB of woff2 per variable family for latin.

Every family uses `font-display: swap`. The fallback stacks are system fonts
(`system-ui`, `ui-monospace`).

`index.html` stops depending on any external font host and gains:
- `<meta name="theme-color" content="#0E1115">`
- `viewport-fit=cover`, for the iPhone safe areas.
- `color-scheme: dark`, so Safari renders native selects, date pickers and scrollbars
  in dark.

## 7. Shape, focus and motion rules

### Cut corner

The `.pv-cut` utility draws the diagonal cut with `clip-path` on two pseudo-element
layers:
- `::before` is the border color.
- `::after` is the fill, inset by 1px.

`clip-path` is **not** applied to the element itself. If it were, it would clip the
focus outline and the diagonal border. The content sits above both layers.

Cut corners are used only on:
- Featured panels: the Home hero, the scanner card and the Mi PC frame.
- The primary button.
- The mobile scan button.

### Focus

A global `:focus-visible` rule draws a 3px `--pv-focus` outline with a 3px offset.
Inside clipped or dense grids (PC slots), the offset is −3px.

The legacy per-file focus colors are removed:
- `#173f70`, `#317ec5` and `#bf700f`.
- The `!important` rule in `boxes.css`.

Focus is never removed without a replacement.

### Targets

Every interactive element in the shell and Home has a minimum size of
`--pv-touch` × `--pv-touch`. The existing pages already use 44px in most places, and
the token migration keeps that.

### Motion budget

- **Hover and selection:** color, border and transform transitions within
  150–250 ms.
- **Section entrance:** a fade/translate of 200 ms, once.
- **Skeleton pulse:** 1.2 s for at most 3 iterations (≤ 3.6 s), then static. It
  never moves for more than 5 s.
- **Scanner card:** the scanline pattern is static. A single 600 ms sweep plays on
  hover or focus only.
- **Value number:** no count-up animation. The value must be readable immediately and
  stable for screen readers.
- **Global `@media (prefers-reduced-motion: reduce)`** in `base.css`: animations and
  transitions are set to ~0 (`.01ms`, one iteration) and smooth scrolling is turned
  off.
- **JS motion:** `InteractiveCard` keeps its live reduced-motion check.

## 8. Shell

The shell is one `AppShell` that chooses the layout with
`useMediaQuery("(max-width: 767px)")`. Only one primary navigation landmark exists in
the DOM at a time. If `matchMedia` is unavailable (jsdom without a stub), the desktop
layout is used.

### 8.1 Desktop (≥ 768px)

The header is a sticky `<header>` on `--pv-bar`, 64px high, with a bottom
`--pv-border-soft`. From left to right:

1. **Logo link** to `/`. It contains the original SVG monogram (a "PV" ligature inside
   a cut-corner hexagon, stroked in cyan) and the wordmark "PokéVault" in Space
   Grotesk. Its accessible name is "PokéVault — Inicio" / "PokéVault — Home".
2. **`<nav aria-label="Navegación principal">`** with links, in this order:
   - Inicio `/`
   - Pokédex `/pokedex`
   - Cajas PC `/boxes`
   - Expansiones `/sets`
   - Mi colección `/collection`

   The active link uses `aria-current="page"` (NavLink) and shows cyan text with a 2px
   cyan underline bar. Gold is not used here.
3. **Scan action:** a small primary cut-corner button-link "Escanear" to `/scanner`,
   outside the nav (decision D2).
4. **Currency toggle:** a two-button segmented control "CLP | USD" with
   `aria-pressed`, inside a `role="group"` named "Moneda de visualización". It reuses
   `useCurrency().setCurrency`, so the signed-in save, the localStorage fallback and
   `saveFailed` all keep working. If `saveFailed` is set, a small notice appears below
   the header.
5. **Locale toggle:** the existing `toggleLocale`. The visible text is "EN" / "ES",
   with an accessible name of "English" / "Español" and `lang` set on the button.
6. **Avatar link** to `/profile`, named "Perfil" / "Profile":
   - Signed in: the Google picture (`referrerPolicy="no-referrer"`, initials as the
     fallback). `ProfilePicture` is extracted from `ProfilePage` for this.
   - Guest: a neutral outline glyph.

Mi colección, Perfil and Login stay reachable. `/login` is reached from Perfil and from
the Home guest call to action.

### 8.2 Mobile (< 768px)

**Reduced header (56px):**
- Monogram only. The link keeps the same accessible name.
- An "Explorar" button (`aria-expanded`, `aria-controls`) that opens a small menu
  panel with Pokédex and Expansiones (decision D3). Escape closes it and focus
  returns to the button. Choosing a link also closes it.
- Currency toggle.
- Locale toggle.

**Bottom tab bar:**
- `<nav aria-label="Navegación principal">`, fixed to the bottom, on `--pv-bar` with a
  top `--pv-border`.
- Its height is 64px + `env(safe-area-inset-bottom)`.
- Five equal items, each an icon plus a short label (Silkscreen 11–12px uppercase):
  - INICIO
  - CAJAS
  - **ESCANEAR**
  - COLECCIÓN
  - PERFIL
- ESCANEAR is a cut-corner cyan button raised 12px above the bar. It has `#0B0D10`
  text and a 56px target.
- The active item uses cyan with `aria-current`.
- The icons are original inline SVG with `aria-hidden`, and the label carries the
  name.

**`<main>`:** gets a bottom padding equal to the tab bar height, so content is never
hidden.

### 8.3 Shared

- **Skip link:** "Saltar al contenido" / "Skip to content" is the first focusable
  element and moves focus to `<main id="contenido" tabIndex={-1}>`.
- **Landmarks:** one banner, one primary navigation and one main per layout.
- **Body:** background `--pv-bg`, text `--pv-text`, Inter.

## 9. Home

Home lives in `pages/HomePage.tsx` plus `components/home/*`. Every section loads
independently: its own request, skeleton, error and retry. One failing section never
hides the others.

Private requests start only when `auth.status === "authenticated"` and not
`validating`. The Home subtree is keyed by `user.id`, so switching accounts never shows
the previous user's data. Responses with 401 call `retrySession()`, the same as
existing pages.

The h1 is visually hidden: "Inicio" / "Home". The visible headings are the section
titles.

### 9.1 Layout

| Breakpoint | Layout |
| --- | --- |
| ≥ 1024px | 12-column grid. Row 1: Hero (8 columns) + Scanner (4). Row 2: Most valuable (12). Row 3: Mi PC (7) + Expansiones (5). |
| 768–1023px | Hero (12); Scanner (12); Most valuable (12); Mi PC (12); Expansiones (12) |
| < 768px | Single column, same order |

### 9.2 Sections and data sources (existing endpoints only)

| # | Section | Data | Content |
| --- | --- | --- | --- |
| 1 | **Value hero** | One `fetchCollectionValue(currency)`, shared with section 3 | See below |
| 2 | **Scanner card** | None | See below |
| 3 | **Tus cartas más valiosas** | `valuation.top` (≤ 5) + `usePersonalMetadata(top ids)` | See below |
| 4 | **Mi PC** | `fetchBoxes` → first box by `display_order` → `fetchBox(id)` + `usePersonalMetadata(slot ids)`. `fetchBoxView("unassigned", 0).total` for the counter. | See below |
| 5 | **Expansiones** | `fetchBoxView("recent", 0)` (30 copies) → distinct card ids in order → `usePersonalMetadata` → distinct `card.set.id`, first 6 → `fetchSetProgress(ids)` (decision D4) | See below |

**1. Value hero**
- A gold pixel label "VALOR DE TU COLECCIÓN".
- The total in Space Grotesk, gold, sized `--pv-text-hero`, with the currency code.
- Chips:
  - "{n} copias"
  - "{n} con precio"
  - "{n} sin variante · indicar" (only when n > 0), linking to
    `/collection?variant=unknown`.
  - "{n} precios pendientes · reintentar" (only when n > 0).
- `ReferenceNote`.
- `RatesAttribution` "Rates By Exchange Rate API" whenever converted amounts are shown,
  following the same rule as Profile.
- If there are no rates, the totals are shown per source currency with the existing
  notice, and there is no attribution.

**2. Scanner card**
- A cut-corner panel with a cyan border and a static scanline background.
- A pixel label "ESCÁNER".
- The copy "Fotografía una carta y la reconocemos. Tú confirmas antes de guardar."
- A primary button-link "Escanear carta" to `/scanner`.

**3. Tus cartas más valiosas**
- A horizontal list, which becomes a scroll-snap row on mobile.
- Each item is `InteractiveCard` + `CardArtwork`: tilt, glare and the existing simulated
  foil. A static cyan/gold sheen appears on hover or focus.
- Each item shows the name, the variant and the price (gold `PriceText`), and links to
  `/collection/{copy_id}`.
- There is no auto-scroll. The section has a "Ver mi colección" link.
- In 8D this section becomes the favorites carousel.

**4. Mi PC**
- The box name and copy count.
- A 6×5 `PersonalGrid`, reused as is. It keeps its roving tab index, arrow keys and
  labels.
- Restyle scoped by `.pv-home-pc`:
  - Dark dotted background.
  - The selected slot has a cyan cursor.
  - Static sprites (`useSpriteMode`).
- A side panel, or a lower panel on mobile, shows the selected copy: name, number,
  variant, language, condition, and a "Ver copia" link.
- The first occupied slot is selected initially.
- The section is read-only: no moves or placements.
- Links:
  - "{n} cartas sin caja · ordenar" to `/boxes?mode=personal`.
  - "+ Nueva caja" to `/boxes?mode=personal`, where the existing create form lives.
  - "Abrir Mi PC" to `/boxes?mode=personal`.

**5. Expansiones**
- Up to 6 rows. Each row shows the expansion name (localized `card.set.name`) and the
  existing `SetProgress compact` (an accessible `<progress>` with
  "owned / total · %"), restyled as a cyan bar.
- Unverified checklists show the existing "unavailable" text.
- A "Ver todas las expansiones" link to `/sets`.
- The caption reads "De tus copias más recientes" / "From your most recent copies", so
  the selection is honest.

Duplicate copies never raise completion, because `fetchSetProgress` already counts
distinct cards. Duplicates do add value in the hero, as in Iteration 7.

### 9.3 States

| State | Behavior |
| --- | --- |
| **Auth resolving** | Skeletons for the hero and sections. No private requests. |
| **Guest** | See below. **No** private requests (`/prices/collection`, `/boxes`, `/inventory`, `/sets/progress` are never called). |
| **Loading (per section)** | See below |
| **Empty: no copies** (`copy_count === 0`) | See below |
| **Empty: no boxes** | Mi PC shows "Tu primera caja te espera" with "+ Nueva caja" and "Escanear carta". |
| **Empty: no expansions** | Expansiones shows "Aún no hay expansiones con cartas tuyas" with a link to `/sets`. |
| **Error (per section)** | See below |
| **Session expired** | A 401 calls `retrySession()`. The existing `SessionNotice` behavior is unchanged. |

**Guest**
- A hero with the pixel label "TU BÓVEDA TCG", the title "Tu colección, ordenada y
  valorizada", a short line about prices and boxes, and a primary "Iniciar sesión" link
  to `/login`.
- The scanner card. Its link goes to `/scanner`, which already explains that sign-in
  is needed.
- A public row of two cut panels: "Explorar Pokédex" and "Explorar expansiones".

**Loading (per section)**
- Skeleton blocks with the same shape as the final content: hero number bar, 5 card
  rectangles, a 6×5 dotted grid and 3 progress bars.
- The section has `aria-busy="true"` and a visually hidden `role="status"` text
  ("Cargando valor…").
- There are no spinners.

**Empty: no copies** (`copy_count === 0`)
- One friendly empty hero, replacing sections 1, 3, 4 and 5: "Tu primera caja te
  espera".
- The line "Escanea o busca una carta para empezar tu colección."
- The primary "Escanear carta" and a secondary "Buscar en expansiones".
- The scanner card is still shown.

**Error (per section)**
- An inline `role="alert"` message with a "Reintentar" button that retries only that
  section.
- A price-service outage never blocks Mi PC or Expansiones, and the reverse holds too.

### 9.4 System status (decision D6)

`SystemStatus` keeps its behavior, but moves from being the whole Home to a small
collapsible `<details>` footer section "Estado del sistema" at the bottom of Home.

- **Signed-in users only.** Guests and the auth-resolving state do not render it.
- **Closed by default.** `SystemStatus` mounts only when the student opens the
  `<details>`, so Home does not call `/health` on every visit. Closing it unmounts the
  component and aborts any request in flight.
- The summary keeps the current text "Estado del sistema" / "System status".

### 9.5 Copy (ES / EN)

There are new `shell` and `home` dictionary sections. The existing `home.title` and
`home.description` move under `status`. The complete strings are in the plan (Task 5).
Representative keys:

| Key | ES | EN |
| --- | --- | --- |
| `shell.nav.boxes` | Cajas PC | PC Boxes |
| `shell.scan` | Escanear | Scan |
| `shell.explore` | Explorar | Explore |
| `shell.skip` | Saltar al contenido | Skip to content |
| `shell.currencyGroup` | Moneda de visualización | Display currency |
| `home.valueLabel` | VALOR DE TU COLECCIÓN | YOUR COLLECTION VALUE |
| `home.scannerLabel` | ESCÁNER | SCANNER |
| `home.scannerText` | Fotografía una carta y la reconocemos. Tú confirmas antes de guardar. | Photograph a card and we recognize it. You confirm before saving. |
| `home.scanAction` | Escanear carta | Scan card |
| `home.topTitle` | Tus cartas más valiosas | Your most valuable cards |
| `home.pcTitle` | Mi PC | My PC |
| `home.unassigned` | {count} cartas sin caja · ordenar | {count} cards without a box · organize |
| `home.newBox` | + Nueva caja | + New box |
| `home.firstBox` | Tu primera caja te espera | Your first box is waiting |
| `home.setsTitle` | Expansiones | Expansions |
| `home.setsSource` | De tus copias más recientes | From your most recent copies |

Pluralization follows the existing `{count}` replacement pattern. "1 copias" is
avoided by using `one`/`other` keys for counters.

## 10. Applying tokens to existing pages

All 12 CSS files move from literals to tokens. Selectors, class names, layout,
breakpoints and DOM stay the same. The mapping:

| Today | Becomes |
| --- | --- |
| Page/background creams (`#f5edd8`, `#fffaf0`, `#fffdf7`, `#fff8df`, `#fafcf1`) | `--pv-bg` (page) / `--pv-panel` (cards, panels, inputs) |
| Light info panels (`#edf4fb`, `#f4f7f9`, `#f0f6fb`, `#e4edf6`, `#f1f5e8`, `#e6f0d8`, `#edf1f4`) | `--pv-panel-raised` |
| Navy / green ink text (`#17233c`, `#173f70`, `#183e32`, `#284d43`, `#365a4d`) | `--pv-text` |
| Muted text (`#526073`, `#586b80`, `#637181`, `#4d5e71`, `#44516a` …) | `--pv-text-2` / `--pv-text-3` |
| Dividers (`#c9d3dc`, `#b4c5d5`, `#9aae95` …) | `--pv-border` / `--pv-border-soft` |
| Form control borders (`#8a9db0`, `#718877`, `#7b9983`) | `--pv-border-strong` |
| Primary buttons (`.tcg-action`, `.auth-button`, `.tcg-page button`, `.inventory-* button`, `.pc-page button`) | Cyan fill + `#0B0D10` text (primary) or transparent + cyan border (secondary). No cut corner on legacy buttons. |
| Notice/warning (`#fff3d6`/`#cdb87b`/`#69552c`) | `--pv-panel` + `--pv-warn-border` + `--pv-gold` text |
| Errors (`#fff0e8`/`#a63a2d`) | `--pv-panel` + `--pv-danger` left border/text |
| Success / owned green (`#24603f`, `#1e6345`, `#235a3e`) | `--pv-success` |
| Gold used as "active/selected" (`#f3c744` nav, PC search option outline) | `--pv-cyan` (gold is reserved for money/favorites) |
| Offset "sticker" shadows (`6px 6px 0 #d4b76f`) | `--pv-shadow-1` |
| Card artwork stage and placeholders (light gradients) | Dark radial on `--pv-panel-raised` so card art pops |
| Price amounts (`.price-amount`, `.price-total`) | `--pv-gold`, Space Grotesk, tabular numbers |

**Kept as content (allow-listed):**
- Type badge colors.
- The PC wallpaper palettes inside `.pc-screen`, which stay light retro screens framed
  in dark.
- The holo iridescence gradient.

The catalog PC console frame (`#7b9983`) becomes `--pv-panel-raised` with a
`--pv-border` frame. The retro screen remains inside it.

Each file is migrated and checked separately. A route checklist for manual Safari
review is in the plan.

## 11. Architecture and files

```
frontend/src/
  styles/tokens.css           # :root tokens (only place with palette hex values)
  styles/base.css            # element defaults, focus, reduced motion, .pv-* utilities, skeleton
  styles.css                 # trimmed: legacy shared classes (.panel, .eyebrow, .pokedex-*) on tokens
  hooks/useMediaQuery.ts     # extracted from InteractiveCard (same semantics)
  components/ui/             # CutPanel, ButtonLink/Button, PixelLabel, Chip, Skeleton, InlineError + ui.css
  components/shell/          # Logo, DesktopHeader, MobileHeader, ExploreMenu, TabBar, CurrencyToggle,
                             # LocaleToggle, AvatarLink, Avatar (ProfilePicture), icons.tsx, shell.css
  components/AppShell.tsx    # chooses desktop/mobile; skip link; <main id="contenido">
  components/prices/useCollectionValuation.ts  # extracted from CollectionValue (same 401 handling)
  components/home/           # ValueHero, ScannerCard, TopCards, PcPreview, SetsProgress, GuestHome,
                             # EmptyHome, SystemStatusFooter, home.css
  pages/HomePage.tsx         # orchestrates auth state and sections
  public/favicon.svg         # monogram
```

Refactors limited to extraction (no behavior change):
- `useMediaQuery` from `InteractiveCard`.
- `useCollectionValuation` from `CollectionValue`.
- `ProfilePicture` from `ProfilePage`, to `components/shell/Avatar.tsx`.

`AppShell` stays at the same path, so `router.tsx` is unchanged.

**No new runtime dependency besides the three font packages.** There is no Tailwind
unless D1 decides otherwise, and no icon library: icons are about 6 small inline SVGs.

## 12. Decisions for review

Each decision has a recommendation, which the plan assumes unless the student changes
it.

**D1: Tailwind.**
- **Recommended:** do not add it in 8A. The tokens become CSS custom properties, and
  the new components use plain CSS with `.pv-*` classes, following the codebase's
  per-feature CSS. Correct the `CLAUDE.md` stack line to "CSS (custom properties)".
- **Why:**
  - All 1 080 lines of existing CSS are plain.
  - Adding Tailwind for two screens creates two styling systems for Codex and Claude
    to keep in sync.
  - Its Preflight reset would change the margins, lists and buttons of every page that
    8A promises not to redesign.
  - The tokens can be mapped to a Tailwind v4 `@theme` later at zero cost.
- **Alternative:** Tailwind v4 through `@tailwindcss/vite`, **without Preflight**
  (import only theme and utilities). `@theme` would point at the same `--pv-*`
  variables, and it would be used only in shell and Home components. It must be
  pinned to an exact 4.x release at least two weeks old (4.3.5 was published today).

**D2: Scanner on desktop.**
- **Recommended:** a small primary "Escanear" button in the desktop header, outside
  the nav. The approved desktop nav does not include the scanner, and Home alone
  would make it hard to find from other pages.
- **Alternative:** desktop scanner entry only from Home.

**D3: Pokédex and Expansiones on mobile.** The bottom bar has no room for them.
- **Recommended:** an "Explorar" menu button in the reduced header with those two
  links.
- **Alternative:** reach them only through Home links.

**D4: Which expansions Home shows.** There is no "sets I own" endpoint.
- **Recommended:** the expansions of the 30 most recent copies (`/boxes/views/recent`),
  up to 6, with the honest caption above.
- **Alternatives:**
  - Paginate the whole inventory to find every owned set. This costs many requests and
    is better solved by a backend endpoint later.
  - Infer set ids by splitting card ids. This is rejected because it guesses data.

**D5: Mi PC preview.**
- **Recommended:** the first box by `display_order`, with read-only selection, and
  links to `/boxes?mode=personal` without deep links. Moving copies and opening the
  unassigned view directly are 8C.

- **Approved adjustment:** `docs/ROADMAP.md` records an owned-sets endpoint as
  technical debt, because 8E (3×3 binder and master set) needs it.

**D6: System status.**
- **Recommended:** a collapsible footer section on Home.
- **Alternative:** move it to Profile.
- **Approved adjustment:** signed-in users only, and closed by default (§9.4).

**D7: Fonts.**
- **Recommended:** Fontsource self-hosted, pinned to 5.3.0 (§6).
- **Alternative:** Google Fonts CDN. Rejected for privacy and offline use.

**Not adding:** `axe-core` or `vitest-axe`. 8A uses role/name/landmark assertions in
Testing Library and a manual VoiceOver check. Adding axe is possible as a dev-only
dependency if the student prefers.

## 13. Testing

All tests run without network.

**Contract tests** (`src/styles/styles.contract.test.ts`, reading CSS with Vite
`?raw`):
- **Tokens:** parse `tokens.css`, then assert:
  - Every text/background pair in §5.1 reaches ≥ 4.5:1.
  - Button text on cyan reaches ≥ 4.5:1.
  - `--pv-border-strong` and `--pv-focus` reach ≥ 3:1 against every surface.
- **No raw colors:** no hex, `rgb()` or `hsl()` literal in any `src/**/*.css` file
  except `tokens.css` and the allow-listed blocks: type badges, PC wallpapers and
  iridescence. During migration, a shrinking `LEGACY_FILES` list documents the files
  not yet migrated, and it must be empty at the end of 8A.
- **Motion:**
  - `base.css` contains the global reduced-motion block.
  - Every `@keyframes` used outside `base.css` has a matching reduced-motion rule, or
    relies on the global one.
  - The skeleton animation iteration count is ≤ 3.
- **Pixel font:** every rule using `--pv-font-pixel` sets a font size of at least
  `--pv-text-pixel` (≥ 11px).

**Shell** (`components/AppShell.test.tsx`, with a `matchMedia` stub helper):
- **Desktop:**
  - The nav links appear in the specified order with their exact names, plus
    `aria-current` on the active route (including nested routes such as
    `/collection/:id` → Mi colección).
  - "Escanear" links to `/scanner`.
  - The currency group toggles CLP/USD with `aria-pressed` and persists through
    `useCurrency`.
  - The locale button "English" switches all labels.
  - The avatar link is named "Perfil" and shows the picture or initials when signed
    in.
  - Exactly one `navigation` named "Navegación principal".
- **Mobile:**
  - The bottom nav has 5 items in order, with ESCANEAR in the middle linking to
    `/scanner`.
  - No desktop nav links are present.
  - "Explorar" toggles `aria-expanded`, shows Pokédex and Expansiones, closes with
    Escape with focus back on the button, and closes on navigation.
  - A media `change` event swaps the layouts live.
- **Skip link:** it is the first tab stop and focuses `main`.

**Home** (`pages/Home.test.tsx`):
- **Guest:** the guest hero, sign-in link and public links render, **zero** private
  requests are made, and there is no system status footer.
- **Status footer (signed in):** closed by default and no `/health` request. Opening it
  shows `SystemStatus`, which calls `/health` once.
- **Authenticated, full data:**
  - The hero total in CLP and USD is formatted as in Iteration 7.
  - The chips are present, including the variant link `/collection?variant=unknown`.
  - The attribution link has the exact text, `href`, `target="_blank"` and
    `rel="noopener noreferrer"`.
  - The top 5 keep their order and links.
  - The PC grid has 30 cells, the first occupied slot is selected, arrow keys move the
    selection and update the panel, and the unassigned counter is correct.
  - The expansions come from recent copies: deduplicated, at most 6, in order, sent in
    a single `/sets/progress` call.
- **Rates unavailable:** source-currency totals, the notice, and no attribution.
- **Empty collection:** "Tu primera caja te espera" with both calls to action.
- **No boxes:** the Mi PC empty state.
- **Errors per section:** the prices endpoint failing still renders Mi PC and
  Expansiones. Retry refetches only that section.
- **Loading:** sections expose `aria-busy` and a status text, and no `progressbar` or
  spinner role.
- **A 401 on a section** calls `retrySession`.
- **Switching user:** the new user's data replaces the old, with no stale render.

**Reduced motion:** with `(prefers-reduced-motion: reduce)` stubbed, the Home top cards
render `InteractiveCard` without tilt, as the existing behavior already does, and the
scanner sweep class is not applied.

**Existing tests are updated, not weakened:**
- `App.test`:
  - The heading for `/` becomes the visually hidden h1 "Inicio". `App.test` runs as a
    guest, so "Estado del sistema" moves to `Home.test` with a signed-in session (see
    "Status footer" above).
  - "Cajas" becomes "Cajas PC".
  - The locale test still uses "English" and adds a check of `lang`.
- `Scanner.test`: replace "nav contains Escáner de cartas" with "the header scan
  action links to `/scanner`".

The other suites should pass unchanged, and any change to them is listed in the plan
with a reason.

**Full validation:** `bash scripts/check.sh` exits 0. The backend suites are untouched.

## 14. Acceptance criteria

**Automated:**
- `check.sh` passes.
- The frontend test count is at least 421 plus the new tests.
- No backend, migration or endpoint diff (`git diff main -- backend` is empty).

**Manual, by the student in Safari on the development Mac:**
- Desktop and iPhone-size responsive mode.
- Every route is legible and usable on the dark theme:
  - `/`, `/pokedex`, `/boxes` (catalog and personal), `/sets`, `/sets/:id`
  - `/pokemon/:n/cards`, `/cards/:id`
  - `/collection`, `/collection/:id`
  - `/scanner`, `/login`, `/profile`
- The shell switches at 768px, with no double navigation.
- Content is never hidden behind the tab bar.
- Focus is visible everywhere when tabbing.
- Home works in all of these states: guest, loaded, empty and price outage
  (backend stopped, then started).
- With macOS "Reduce motion" on, nothing animates beyond simple fades.
- Fonts load with the network disabled once the page is cached, and no request goes to
  `fonts.googleapis.com` or `fonts.gstatic.com` (Safari Web Inspector → Network).

**Rules:**
- No trainer/character art and no third-party marks; the monogram is original.
- Gold appears only for money and value.

## 15. Risks

- **Global recolor regressions** in pages that are not redesigned: hard-coded light
  backgrounds or inherited text colors could become unreadable. This is mitigated by:
  - One-file-at-a-time migration.
  - The no-raw-colors contract.
  - The manual route checklist.
- **The catalog PC wallpapers** stay light retro screens inside a dark frame. If the
  student dislikes the contrast, the darker "night" wallpaper already exists. A full
  rethink belongs to 8C.
- **`clip-path` corner cuts** are not hit-tested in jsdom. The focus visibility on
  clipped buttons is verified manually.
- **Safari specifics:**
  - `env(safe-area-inset-*)` needs `viewport-fit=cover`.
  - `color-mix()` needs Safari ≥ 16.2. The development Mac and current iOS support it,
    and the plain token is the fallback.
- **Home request volume:** up to 5 + 30 + 30 public card metadata requests, 4 at a
  time, cached by the backend. This is acceptable for 8A. A backend "owned sets"
  endpoint can replace D4 later.
