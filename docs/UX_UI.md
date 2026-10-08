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
