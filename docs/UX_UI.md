# PokéVault — UX/UI blueprint (v0.1)

**Status:** Agreed product direction; detailed pixel layouts pending. The submitted classic Pokémon PC Box screenshot is the primary *reference*, not an asset licensed for reuse.

## 1. Design principles

1. **Pokémon essence over generic dashboard aesthetics.** Sprites, selection states, menu rhythm and nostalgic discovery are essential.
2. **Classic exploration + modern management.** Game-faithful Pokédex and PC Boxes; clear modern layouts for finance, transactions and card administration.
3. **Every interaction has purpose.** Sounds and animations provide feedback, but can be muted or reduced.
4. **Accessibility and responsiveness are not optional.** Desktop reference fidelity should not make the mobile version unusable.

## 2. Design reference: classic PC Box (high priority)

The PC Box screen must preserve the *exact structural idea* of the provided game reference:

- **Left panel:** selected Pokémon preview with an enlarged sprite, National Dex number, name/types and collection-related summary.
- **Right panel:** **compact mini-sprites in a regular box grid**, not modern card tiles.
- **Top of box:** centered box title and left/right controls for switching boxes.
- **Wallpaper:** a full box background with optional presets and user-selected upload.
- **Selection:** visible cursor/highlight and responsive navigation feedback.
- **Interactions:** click or keyboard-select a sprite; open related cards for that Pokémon; optional classic-feel sound cues.

Do not replace the sprite grid with a card-image gallery. Individual **TCG card images appear after selecting a Pokémon**, in a Pokémon detail screen.

**Desktop:** side-by-side left details / right sprite grid, framed like a classic PC interface.  
**Mobile:** box grid first, selected Pokémon details in an accessible lower panel/drawer; retain box visuals and controls without shrinking them beyond usability.

### Box behavior

- Smart boxes: official set, generation, owned, favorites, wishlist, trade, sale (rules evaluated dynamically).
- Manual boxes: user names and arranges their own selections.
- No cloning inventory records when an item appears in more than one box.
- Trainer and Energy cards cannot be represented by species sprites; provide distinct category icons and an accessible card-list mode where needed.
- Sorting can be by National Dex, recent activity or custom order as supported by the box type.

## 3. Global shell

**Desktop:** left navigation, global search, language toggle (ES/EN), sound control and trainer profile access.  
**Mobile:** bottom/navigation drawer model sized for touch. Navigation must remain consistent across sections.

Top-level routes (provisional):
`/login`, `/welcome`, `/dashboard`, `/pokedex`, `/pokemon/:number`, `/boxes`, `/cards/:id`, `/scanner`, `/sets`, `/sets/:id`, `/collection`, `/decks`, `/decks/:id`, `/wishlist`, `/portfolio`, `/transactions`, `/profile`, `/settings`.

## 4. Screen inventory

| Screen | Main content | Main user action |
| --- | --- | --- |
| Login | Branded entry point, Google SSO, language | Continue with Google |
| First-run trainer setup | Trainer display name, favorite Pokémon, avatar, language, sounds | Save profile |
| Dashboard | Owned cards, collection value if priced, Pokédex coverage, recent additions, set progress | Continue exploring |
| National Pokédex | Species sprites ordered by National Dex number; generation/type/owned/favorites/set filters | Open a species |
| Pokémon detail | Large sprite, species facts, every related TCG card; All/Owned/Missing/Wishlist/Trade tabs | Open card / mark status |
| PC Boxes | Classic left-details + right-mini-sprite-grid UI with arrows and wallpaper | Select Pokémon, switch/configure box |
| Card detail | Official art, set/number/rarity/type, market estimate/source, owned copies and actions | Register copy / wishlist / trade / sale |
| Scanner | Camera/file upload, progress, candidate matches and manual correction | Confirm official card |
| Set explorer/detail | Expansion lists; collected versus missing checklist, conditional estimates | Inspect missing card |
| My collection | Box, card/table, deck, analytics entry points | Manage collection |
| Cards inventory | Grid and data-table modes with filters | Edit actual copies |
| Deck builder | Add cards, quantities, ownership gaps, deck grouping | Save deck |
| Wishlist | Priority, filter, available price and sum with coverage warnings | Track sought cards |
| Portfolio | Estimated collection value, priced/unpriced breakdown, value by set, available history | Analyze collection |
| Transactions | Purchase/sale records, filters and edit controls | Register transaction |
| Trainer card / settings | Curated trainer avatar, favorite Pokémon, language, sounds, currency and theme | Personalize account |

## 5. Critical flows

**A — Discovery:** Pokédex → select Scraggy/Charizard → card printings → card detail → add copy.  
**B — Scan:** upload image → progress → suggested match(es) + confidence caveat → confirm/correct → add copy → box/set count updates.  
**C — Smart collections:** create box → choose manual or filters → choose wallpaper → navigate mini-sprites → open species details.  
**D — Set completion:** open set → compare catalog checklist to unique owned cards → missing list → estimated cost for priced missing items; show incomplete price coverage explicitly.  
**E — Deck building:** build list from catalog → count target → compare required quantities against inventory → identify gaps.

## 6. Pokémon-specific details

- Small species sprites as the primary visual language of boxes and the Pokédex.
- Silhouettes / locked states for unregistered species (with accessibility labels; display remains usable).
- Optional "registered" feedback when first species card is added.
- Short click/select/back/box-change success cues, controllable by a global mute and volume.
- Trainer Card profile with favorite Pokémon and curated avatar selection.
- **Avatar roster:** owner to select roughly 10–15 key playable trainers/protagonists from reference images; no arbitrary photo upload.
- Do not use trademarked music, sound recordings, or character assets in the repository until licensing/use is reviewed.

## 7. Visual and responsive requirements

- Pixel-style typography only for accents/headings where readable; body text must remain accessible.
- Color and Pokémon-type iconography support meaning but must not be the only indicator.
- Full hover, focus, active, loading, empty and error states.
- Pointer and keyboard input must reach box controls.
- Mobile scanner must support camera capture if browser permissions permit, and ordinary file upload fallback.
- Avoid forced autoplay sound; respect muted/reduced-motion settings.

## 8. Pending design tasks

- Final trainer avatar shortlist from student.
- Background wallpaper specifications and copyright-safe source.
- Detailed wireframes and spacing tokens; exact mini-sprite box capacity and mobile behavior.
- Sound pack selection and rights review.

## Iteration 4 implementation status

The National Pokédex now shows entries 1–20 in a responsive semantic list/grid:
National Dex number, species name, localized type labels and a 96 px remote
sprite. Null or failed images have a localized text fallback. The existing
cream/red/blue shell, ES/EN switch and navigation are preserved, with visible
keyboard focus. Loading and empty states use status announcements; failures use
an alert plus a native retry button. Entries are informational and have no
inactive buttons or links to unfinished species detail pages. Filters, species
selection, TCG detail flows remain future work; the PC catalog preview is described below.

## Iteration 4 PC Storage catalog preview

Implemented: a framed two-panel PC terminal with selected Pokémon details on the
left and a compact 6×5 sprite grid on the right. Mobile below 700 px puts the grid
first. Four original CSS wallpapers (Classic by default, Forest, Ocean, Night sky), directional box
buttons and a high-contrast selection cursor preserve the game-inspired identity
without copying proprietary screens. Empty slots remain visible. Entries use remote
PokéAPI sprites with an image-failure fallback; there are no bundled Pokémon assets.

Boxes are prominently labeled as a catalog preview, without owned cards. Each of
35 boxes covers up to 30 consecutive species within 1–1025. Selection starts at the
first entry on each box change. Arrow keys move focus and selection, Home/End reach
the first/last populated slots, and Enter/Space select. The grid uses one Tab stop,
with native buttons and ARIA grid/row/cell semantics. Prev/next controls stop at the
boundaries. Loading/error/empty states and retry are localized. Subtle grid/detail
animations and selection transitions are disabled under reduced motion.

Audio is opt-in, initially muted, with 15% volume. Sound/volume controls persist
locally without authentication. Original Web Audio sweeps provide cursor, box-change
and wallpaper-confirmation feedback; no autoplay, recordings or musical sequences.
Audio failure leaves the rest of the interface usable. The former TCG placeholder has been removed; the selected panel now shows real
Pokémon facts as described in the refinement below, without owned-card quantities.

Manual desktop/390 px inspection and real listening remain required; this session
had no connected browser. See DEVELOPMENT.md for the exact checklist. Automated
coverage does not certify visual fidelity or subjective audio comfort.

## PC search refinement

A compact magnifying-glass button sits at the right end of the storage header,
separate from previous/next. It opens an original framed search panel with ES/EN
labels, a clear button and up to eight name/number suggestions. Arrow keys choose
suggestions, Enter locates the match and Escape closes the panel and restores the
trigger's focus. Results use combobox/listbox active-descendant semantics and a
visible cursor, with automatic scrolling for keyboard selection.

Selecting Scraggy (#559) closes the panel, navigates to Box 19 and selects space
19 (zero-based 18), updates details and moves focus to its sprite button. It never
renders a filtered storage grid or creates another box. Opening uses the cursor
sound; locating uses one confirmation or box-transition effect depending on whether
the box changes, avoiding simultaneous effects. Escape reuses the back effect.
All sounds respect existing preferences. Name matching uses canonical PokéAPI
names as the reliable fallback, without invented translations. Manual responsive
and audio inspection remain pending as noted above.

## Definitive PC visual/data refinement — 2026-10-22

The storage grid now uses **menu icons only**: Generation V static or real APNG
for #001–#649, followed by verified later menu-icon families for newer species.
Battle/front sprites remain restricted to the large selected portrait and existing
Pokédex cards, never as grid fallbacks. Native Gen V icons are 32×32; grid images
occupy up to 64×64 CSS pixels on desktop and 48×48 on mobile, preserving proportions
with contain/pixelated rendering. A failed APNG tries a still Gen V icon, then a
later menu icon, then a neutral placeholder. Later-generation menu icons remain
static even when Animated is selected. See `research/sprites/VERIFICATION.md`.

The localized Sprites: Static/Animated radio controls default to Static and persist
at `pokevault.spriteMode`. Reduced motion always selects still resources while
retaining the saved preference; replacing APNG with PNG actually stops animation.
Changing mode does not change selection, request another box, play audio or replace
unchanged image nodes during subsequent selections. No artificial bounce is used.

Classic is the default original wallpaper: soft pale green/cream with broad low-noise
geometric bands. Slots are transparent over one continuous background, with a warm
brown/cream selection cursor. Forest, Ocean and Night sky remain available. The
large portrait is preserved above compact facts, with controlled keyboard-accessible
scrolling on desktop; mobile places the grid first and expands facts below it.

The selected panel shows real height/weight, separate normal/hidden abilities and
one localized provider description. Content loads only for the selected species,
with its own loading/error/retry state; header identity/types remain visible while
loading. ES decimal commas and EN decimal points use Intl.NumberFormat. A missing
hidden ability or description is explicit; English fallback descriptions carry a
visible note and correct language metadata. No etymology or speculative trivia is
shown. The old TCG placeholder is gone.

Cajas and Pokédex share original rectangular TypeBadge SVG/CSS banners for all 18
types: colored angled symbol segment, dark high-contrast label segment and uppercase
localized text. These are not the copyrighted fixed-English badge PNGs. No old
rounded type-pill markup remains in either view.

Automated checks and provider queries verify behavior/data, not appearance. No
connected browser was available for desktop/390 px screenshots, APNG playback or
sound listening. The manual checklist in DEVELOPMENT.md remains required before
claiming those aspects are visually/auditively approved.
