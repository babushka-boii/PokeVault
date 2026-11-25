import { describe, expect, it } from "vitest";
import { fitAlbum } from "./albumLayout";

const base = { width: 1280, height: 1000, pages: 2 as const, gap: 8, pagePadding: 12, spineWidth: 28, framePadding: 12, captionHeight: 24, minSleeveWidth: 140 };
const total = (r: ReturnType<typeof fitAlbum>) => ({
  height: r.sleeveHeight * 3 + 24 * 3 + 16 + 24 + 24,
  width: r.sleeveWidth * 6 + 2 * (24 + 16) + 28 + 24,
});

describe("album fit", () => {
  it("takes all the available height when it fits, at card proportions", () => {
    const result = fitAlbum(base);
    expect(result.sleeveHeight / result.sleeveWidth).toBeCloseTo(88 / 63);
    expect(result.sleeveWidth).toBeGreaterThan(140);
    expect(total(result).height).toBeLessThanOrEqual(base.height);
    expect(total(result).width).toBeLessThanOrEqual(base.width);
    expect(result.overflow).toBe(false);
  });

  it("is limited by the width when that is the smaller space", () => {
    const result = fitAlbum({ ...base, width: 1000, height: 2000 });
    expect(total(result).width).toBeLessThanOrEqual(1000);
    expect(result.sleeveWidth).toBeGreaterThanOrEqual(140);
  });

  it("keeps pockets at least 140 px wide and lets the document scroll when the height is short", () => {
    const result = fitAlbum({ ...base, height: 400 });
    expect(result.sleeveWidth).toBe(140);
    expect(result.overflow).toBe(true);                       // taller than the window: vertical scroll
    expect(total(result).width).toBeLessThanOrEqual(base.width);
  });

  it("never exceeds the width: a phone page shrinks below 140 down to the hard floor", () => {
    const result = fitAlbum({ ...base, width: 360, height: 900, pages: 1 });
    expect(result.sleeveWidth).toBeLessThan(140);
    expect(result.sleeveWidth).toBeGreaterThanOrEqual(64);
    expect(result.sleeveWidth * 3 + 16 + 24 + 28 + 24).toBeLessThanOrEqual(360);
  });

  it("reports overflow instead of going under the 64 px floor", () => {
    const result = fitAlbum({ ...base, width: 200, height: 200 });
    expect(result.sleeveWidth).toBe(64);
    expect(result.overflow).toBe(true);
  });
});
