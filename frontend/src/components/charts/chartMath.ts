import type { ValuePoint } from "../../services/history";

export const CHART = { width: 640, height: 240, left: 72, right: 16, top: 16, bottom: 36 } as const;
const DAY = 86_400_000;

export type Plotted = { day: string; total: string; x: number; y: number };

const time = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** The value range shown on the y axis: the data's own range with a margin (a flat series gets a visible band). */
export function yRange(points: ValuePoint[]): { min: number; max: number } {
  const values = points.map((point) => Number(point.total));
  const low = Math.min(...values); const high = Math.max(...values);
  if (low === high) { const pad = Math.max(Math.abs(low) * 0.05, 1); return { min: Math.max(0, low - pad), max: high + pad }; }
  const pad = (high - low) * 0.1;
  return { min: Math.max(0, low - pad), max: high + pad };
}

/**
 * Places each *recorded* day: x is proportional to the real date (so a gap is a long
 * segment, not a hidden one) and y to its value. Nothing is placed for a day with no record.
 */
export function plot(points: ValuePoint[]): Plotted[] {
  if (points.length === 0) return [];
  const { min, max } = yRange(points);
  const start = time(points[0].day); const span = time(points[points.length - 1].day) - start;
  const inner = { width: CHART.width - CHART.left - CHART.right, height: CHART.height - CHART.top - CHART.bottom };
  return points.map((point) => ({
    ...point,
    x: CHART.left + (span === 0 ? inner.width / 2 : ((time(point.day) - start) / span) * inner.width),
    y: CHART.top + (1 - (Number(point.total) - min) / (max - min)) * inner.height,
  }));
}

/** One straight segment between each pair of consecutive recorded days. */
export function line(plotted: Plotted[]): string {
  return plotted.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
}

/** Evenly spaced tick values between the axis ends. */
export function ticks(points: ValuePoint[], count = 4): { value: number; y: number }[] {
  const { min, max } = yRange(points);
  const height = CHART.height - CHART.top - CHART.bottom;
  return Array.from({ length: count }, (_, index) => {
    const value = min + ((max - min) * index) / (count - 1);
    return { value, y: CHART.top + (1 - index / (count - 1)) * height };
  });
}

export const daysBetween = (from: string, to: string) => Math.round((time(to) - time(from)) / DAY);
