import { artworkUrl } from "../../services/pokemon";
import type { PixelKey, Sticker } from "../../services/binders";

/** The five original pixel stickers: 10x10 grids drawn as one SVG path each (no files, no copied Pokémon). */
export const PIXELS: Record<PixelKey, { path: string }> = {
  star: { path: "M4 0h2v3h4v2l-3 2 1 3-3-2-3 2 1-3-3-2V3h4z" },
  bolt: { path: "M5 0h3L6 4h3L3 10l1-5H1z" },
  heart: { path: "M1 1h3v1h2V1h3v4L5 9 1 5z" },
  creature: { path: "M3 1h4v1h1v1h1v3H8v1H7v2H6V7H4v2H3V7H2V6H1V3h1V2h1z" },
  circle: { path: "M3 0h4v1h2v2h1v4H9v2H7v1H3V9H1V7H0V3h1V1h2z" },
};

/** A Pokémon sticker's image comes only from its validated species number. */
export const stickerImage = (sticker: Sticker): string | null => sticker.kind === "pokemon" && sticker.species_id !== null ? artworkUrl(sticker.species_id) : null;

/** Where a sticker sits: its centre is x/y percent of the 3:4 cover and its box is 20% x scale of the cover's width. */
export const stickerStyle = (sticker: Sticker, index: number) => ({ left: `${sticker.x}%`, top: `${sticker.y}%`, width: `${20 * sticker.scale}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`, zIndex: index });
