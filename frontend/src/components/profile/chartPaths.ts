import type { ValuePoint } from "../../services/history";

export const W = 600, H = 120;

/** The recorded values as a gold area. Needs two recorded days; nothing is ever filled in. */
export function chartPaths(points: ValuePoint[]): { line: string; area: string } | null {
  if (points.length < 2) return null;
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const values = points.map((point) => Number(point.total));
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const t0 = day(points[0].day), span = day(points[points.length - 1].day) - t0;
  const coords = points.map((point, index) => {
    const x = (day(point.day) - t0) / span * W;
    const y = hi === lo ? H / 2 : H - 16 - (values[index] - lo) / (hi - lo) * (H - 32);
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const line = `M${coords.join(" L")}`;
  return { line, area: `${line} L${W} ${H} L0 ${H} Z` };
}
