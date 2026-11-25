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
