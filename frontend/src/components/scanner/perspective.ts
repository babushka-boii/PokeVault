export type Point = readonly [number, number];

/** The 3x3 matrix (row-major, h33 = 1) that maps four source points onto four target points, or null if degenerate. */
export function homography(source: readonly Point[], target: readonly Point[]): number[] | null {
  const rows: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = source[i]; const [u, v] = target[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u], [0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  for (let column = 0; column < 8; column += 1) {   // Gaussian elimination with partial pivoting
    let pivot = column;
    for (let row = column + 1; row < 8; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-9) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column] / rows[column][column];
      for (let k = column; k < 9; k += 1) rows[row][k] -= factor * rows[column][k];
    }
  }
  const h = rows.map((row, i) => row[8] / row[i]);
  return h.every(Number.isFinite) ? [...h, 1] : null;
}

/** CSS `matrix3d(...)` for a homography, to be used with `transform-origin: 0 0`. */
export function matrix3d(h: readonly number[]): string {
  const [a, b, c, d, e, f, g, i, j] = h;
  return `matrix3d(${[a, d, 0, g, b, e, 0, i, 0, 0, 1, 0, c, f, 0, j].join(",")})`;
}
export const IDENTITY_MATRIX = "matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)";

export const CARD_RATIO = 63 / 88;

/** The largest card-shaped (63:88) rectangle centred in a width x height box, as TL, TR, BR, BL. */
export function cardTarget(width: number, height: number): Point[] {
  const cardHeight = Math.min(height, width / CARD_RATIO);
  const cardWidth = cardHeight * CARD_RATIO;
  const left = (width - cardWidth) / 2, top = (height - cardHeight) / 2;
  return [[left, top], [left + cardWidth, top], [left + cardWidth, top + cardHeight], [left, top + cardHeight]];
}

/** `matrix3d` that lays the detected card flat in the card-shaped frame, or null when the outline cannot be straightened. */
export function straighten(corners: readonly Point[], width: number, height: number): string | null {
  if (!(width > 0 && height > 0)) return null;
  const h = homography(corners.map(([x, y]) => [x * width, y * height] as Point), cardTarget(width, height));
  return h ? matrix3d(h) : null;
}
