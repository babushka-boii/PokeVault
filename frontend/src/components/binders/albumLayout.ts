export type AlbumDimensions = {
  width: number; height: number; pages: 1 | 2; gap: number; pagePadding: number;
  spineWidth: number; framePadding: number; captionHeight: number; minSleeveWidth: number;
};

export function fitAlbum(input: AlbumDimensions) {
  const { width, height, pages, gap, pagePadding, spineWidth, framePadding, captionHeight, minSleeveWidth } = input;
  const byWidth = (width - 2 * framePadding - spineWidth - pages * (2 * pagePadding + 2 * gap)) / (3 * pages);
  const byHeight = ((height - 2 * framePadding - 2 * pagePadding - 2 * gap) / 3 - captionHeight) * 63 / 88;
  const available = Math.min(byWidth, byHeight);
  const sleeveWidth = Math.max(minSleeveWidth, available);
  return { sleeveWidth, sleeveHeight: sleeveWidth * 88 / 63, overflow: available < minSleeveWidth };
}

const GAP = 8;
const MARGIN = 8;

/** Where the popover goes: right of the anchor if it fits, else left, clamped inside the viewport. */
export function placePopover(anchor: DOMRect, size: { width: number; height: number }, viewport: { width: number; height: number }) {
  const right = anchor.right + GAP + size.width + MARGIN <= viewport.width;
  const left = right ? anchor.right + GAP : Math.max(MARGIN, anchor.left - GAP - size.width);
  const top = Math.min(Math.max(MARGIN, anchor.top), Math.max(MARGIN, viewport.height - size.height - MARGIN));
  return { left, top, side: right ? "right" : "left" } as const;
}

/** Swipe thresholds: at least 48 px, and horizontal motion at least 1.5× the vertical. */
export const SWIPE_MIN_PX = 48;
export const SWIPE_RATIO = 1.5;

/** 1 = next page (swipe left), -1 = previous page (swipe right), 0 = not a page swipe. */
export function swipeDirection(dx: number, dy: number): 1 | -1 | 0 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}
