import { expect, test } from "vitest";
import { getAlphaBounds } from "./menuIconBounds";

function pixels(width: number, height: number, left: number, top: number, contentWidth: number, contentHeight: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = top; y < top + contentHeight; y++) {
    for (let x = left; x < left + contentWidth; x++) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}

test('finds the visible Charmander footprint without counting transparent padding', () => {
  expect(getAlphaBounds(pixels(32, 32, 6, 11, 21, 18), 32, 32)).toEqual({
    canvasWidth: 32, canvasHeight: 32, left: 6, top: 11, width: 21, height: 18,
  });
});

test('finds padded Thwackey and non-square later icons without changing proportions', () => {
  expect(getAlphaBounds(pixels(68, 68, 23, 21, 22, 26), 68, 68)).toEqual({
    canvasWidth: 68, canvasHeight: 68, left: 23, top: 21, width: 22, height: 26,
  });
  expect(getAlphaBounds(pixels(105, 202, 0, 0, 105, 202), 105, 202)).toEqual({
    canvasWidth: 105, canvasHeight: 202, left: 0, top: 0, width: 105, height: 202,
  });
});

test('empty or invalid images retain the unnormalized fallback', () => {
  expect(getAlphaBounds(new Uint8ClampedArray(64), 4, 4)).toBeUndefined();
  expect(getAlphaBounds(new Uint8ClampedArray(), 0, 0)).toBeUndefined();
});
