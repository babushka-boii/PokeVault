import { expect, test } from "vitest";
import { cardTarget, CARD_RATIO, homography, straighten, type Point } from "./perspective";

const apply = (h: number[], [x, y]: Point): Point => { const w = h[6] * x + h[7] * y + 1; return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]; };

test("the homography sends each detected corner onto the card rectangle", () => {
  const source: Point[] = [[120, 80], [380, 110], [350, 460], [90, 400]];
  const target = cardTarget(500, 600);
  const h = homography(source, target)!;
  source.forEach((point, i) => { const [x, y] = apply(h, point); expect(x).toBeCloseTo(target[i][0], 4); expect(y).toBeCloseTo(target[i][1], 4); });
});

test("the card-shaped target is centred, 63:88 and fits the box", () => {
  const [tl, tr, br] = cardTarget(500, 600);
  expect((tr[0] - tl[0]) / (br[1] - tr[1])).toBeCloseTo(CARD_RATIO, 6);
  expect(tl[1]).toBe(0);                                          // a tall box is filled top to bottom
  expect(tl[0]).toBeCloseTo(500 - tr[0], 6);                      // and centred sideways
  const [wide] = cardTarget(200, 600);
  expect(wide[0]).toBe(0);                                        // a narrow box is filled side to side
});

test("a degenerate outline cannot be straightened", () => {
  expect(homography([[0, 0], [0, 0], [0, 0], [0, 0]], cardTarget(100, 100))).toBeNull();
  expect(straighten([[0, 0], [1, 0], [1, 1], [0, 1]], 0, 100)).toBeNull();
});

test("straighten gives a matrix3d string", () => {
  expect(straighten([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], 400, 500)).toMatch(/^matrix3d\((-?[\d.e-]+,){15}-?[\d.e-]+\)$/);
});
