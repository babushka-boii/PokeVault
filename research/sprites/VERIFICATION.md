# Verified Pokémon menu icons

Verified on 2026-10-22 against the primary [PokeAPI/sprites repository](https://github.com/PokeAPI/sprites). [verification.json](verification.json) records Git tree SHAs, complete base-species coverage, sample blob SHAs and decoded PNG/APNG headers. It contains metadata only; no image assets were copied into this repository.

## Coverage and selection

The [upstream README](https://github.com/PokeAPI/sprites#icons-2) identifies the Generation V `icons` directory as static and animated menu icons. Its neighboring `black-white` directory contains battle sprites and is not used by the storage grid.

| Directory under `sprites/pokemon/versions/` | Verified base species | Application use |
| --- | --- | --- |
| `generation-v/icons/` | Every #001–#649; #650–#1025 absent | Primary static menu icon |
| `generation-v/icons/animated/` | Every #001–#649; #650–#1025 absent | Optional animated menu icon |
| `generation-vii/icons/` | Every #001–#809 | Static fallback for #001–#649; primary for #650–#809 |
| `generation-viii/sword-shield/icons/` | 664 base species; every #810–#898 | Primary static icon for #810–#898 |
| `generation-ix/scarlet-violet/icons/` | 733 base species; every #884–#1025 | Primary static icon for #899–#1025 |

The generic `generation-viii/icons/` directory does not exist. Sword/Shield and Scarlet/Violet have gaps among older species; the resolver deliberately selects only their verified continuous ranges. Alternate forms are excluded from these base-species counts. The exact older-species gaps and the immutable directory tree links are in the JSON evidence.

For #001–#649, runtime failures advance through animated Gen V (if selected), static Gen V, static Gen VII, then a neutral localized placeholder. Later species use their verified static menu family, then the placeholder. No fallback uses a battle sprite, artwork, or a generated imitation.

## File verification

Pikachu's static Gen V file, [`icons/25.png`](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/versions/generation-v/icons/25.png), is a 242-byte, 32×32 PNG with one frame. Its animated counterpart, [`icons/animated/25.png`](https://github.com/PokeAPI/sprites/blob/master/sprites/pokemon/versions/generation-v/icons/animated/25.png), is a 604-byte, 32×32 **APNG with a `.png` extension**. Its `acTL` declares two frames and infinite looping; each `fcTL` declares 170/1000 seconds, giving a 340 ms cycle. This is image animation, not a CSS transform applied to a still sprite.

Later menu canvases differ in size and aspect ratio:

| File sample | Canvas | Frames |
| --- | --- | --- |
| Gen VII #025 / #650 | 40×30 | 1 |
| Gen VII #809 | 52×52 | 1 |
| Sword/Shield #025 / #810 / #898 | 68×68 | 1 |
| Scarlet/Violet #899 | 105×202 | 1 |
| Scarlet/Violet #1025 | 159×107 | 1 |

All six later boundary samples (#650, #809, #810, #898, #899, #1025) were parsed to their final `IEND`, with valid chunk CRCs and no `acTL`, `fcTL`, or `fdAT` chunks. This confirms those samples are still PNGs. The inventory checks every base filename; the byte-level animation check is limited to the listed samples. Native Gen V icons are 32×32; CSS displays menu icons at 64×64 on desktop and 48×48 on mobile, using `object-fit: contain` to preserve each source's natural aspect ratio.

The frontend defaults to static, persists the user's chosen mode, and reacts to live `prefers-reduced-motion: reduce` changes by selecting still files. Replacing the APNG URL with a still URL stops playback; CSS animation suppression alone would not stop an APNG.

## Rights and type symbols

The upstream [LICENCE.txt](https://github.com/PokeAPI/sprites/blob/master/LICENCE.txt) attributes the images to The Pokémon Company and separately declares the repository under CC0. Its section 4(c) does not clear third-party rights. These statements do not establish unrestricted reuse rights for the Pokémon images.

Sword/Shield type PNGs exist at `sprites/types/generation-viii/sword-shield/{typeId}.png` (verified Normal #10 and Electric #13: 200×44) and `small/{typeId}.png` (both #10 and #13: 60×60). Electric's [full badge](https://github.com/PokeAPI/sprites/blob/master/sprites/types/generation-viii/sword-shield/13.png) and [small symbol](https://github.com/PokeAPI/sprites/blob/master/sprites/types/generation-viii/sword-shield/small/13.png) were fully decoded as still PNGs with valid CRCs; their blob SHAs and dimensions are in the JSON metadata. The same image rights notice applies; the application uses original SVG type symbols rather than copying those badges.

## Verification limits

Automated frontend tests cover menu-only URL selection, coverage boundaries, runtime error fallbacks, mode replacement, persistence, storage failures and reduced-motion changes. Browser playback and responsive visual inspection remain unverified in this session because no connected browser was available. Binary inspection confirms the APNG frames and timing; it does not demonstrate browser playback.
