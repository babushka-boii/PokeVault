import { currencies, type Currency } from "./prices";

/** Recorded collection values (Iteration 9A). Only recorded days exist: nothing is ever filled in. */
export const historyRanges = ["7d", "30d", "1y"] as const;
export type HistoryRange = typeof historyRanges[number];
export type ValuePoint = { day: string; total: string };
export type History = { currency: Currency; range: HistoryRange; started_on: string | null; points: ValuePoint[]; baseline: ValuePoint | null };
export class HistoryError extends Error {
  constructor(public readonly status: number) { super("History request failed"); }
}

const MAX_POINTS = 366;   // a year, both ends included
const url = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/collection/history`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** A real calendar day, written YYYY-MM-DD. */
export function isDay(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
}
const money = (v: unknown): v is string => typeof v === "string" && /^\d{1,13}(?:\.\d{2})?$/.test(v);
const isPoint = (v: unknown): v is ValuePoint => record(v) && Object.keys(v).length === 2 && isDay(v.day) && money(v.total);

export async function fetchHistory(range: HistoryRange, currency: Currency, signal: AbortSignal): Promise<History> {
  const response = await fetch(`${url}?range=${range}&currency=${currency}`, { credentials: "include", cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new HistoryError(response.status);
  const v: unknown = await response.json();
  if (!record(v) || Object.keys(v).length !== 5 || v.range !== range || v.currency !== currency || !currencies.some((c) => c === v.currency)
    || !(v.started_on === null || isDay(v.started_on)) || !Array.isArray(v.points) || v.points.length > MAX_POINTS || !v.points.every(isPoint)
    || !(v.baseline === null || isPoint(v.baseline))) throw new HistoryError(0);
  const days = (v.points as ValuePoint[]).map((point) => point.day);
  // Strictly increasing (so no repeats), and never earlier than the first record.
  if (days.some((day, i) => i > 0 && day <= days[i - 1]) || (days.length > 0 && (v.started_on === null || days[0] < v.started_on))) throw new HistoryError(0);
  return v as History;
}
