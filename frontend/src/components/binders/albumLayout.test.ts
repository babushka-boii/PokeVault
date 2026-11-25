import { describe, expect, it } from "vitest";
import { fitAlbum } from "./albumLayout";

const base = { width: 1000, height: 460, pages: 2 as const, gap: 8, pagePadding: 12, spineWidth: 28, framePadding: 12, captionHeight: 32, minSleeveWidth: 64 };
describe("album fit", () => {
  it("fits two pages within both measured bounds at card proportions", () => {
    const result = fitAlbum(base);
    expect(result.sleeveHeight / result.sleeveWidth).toBeCloseTo(88 / 63);
    expect(result.sleeveHeight * 3 + 32 * 3 + 16 + 48).toBeLessThanOrEqual(base.height);
    expect(result.sleeveWidth * 6 + 32 + 48 + 28 + 24).toBeLessThanOrEqual(base.width);
    expect(result.overflow).toBe(false);
  });
  it("uses width when a single mobile page is narrower", () => {
    const result = fitAlbum({ ...base, width: 360, height: 900, pages: 1 });
    expect(result.sleeveWidth).toBeGreaterThanOrEqual(64);
    expect(result.sleeveWidth * 3 + 16 + 24 + 28 + 24).toBeLessThanOrEqual(360);
    expect(result.overflow).toBe(false);
  });
  it("preserves the readable minimum and explicitly reports overflow", () => {
    const result = fitAlbum({ ...base, width: 200, height: 200 });
    expect(result.sleeveWidth).toBe(64);
    expect(result.overflow).toBe(true);
  });
});
