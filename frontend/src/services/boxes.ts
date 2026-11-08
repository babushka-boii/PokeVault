import { isInventoryCopy, type InventoryCopy } from "./inventory";
import { wallpapers, type Wallpaper } from "../components/boxes/wallpapers";

export type BoxSummary = { id: string; name: string; display_order: number; wallpaper: Wallpaper; created_at: string; updated_at: string; copy_count: number };
export type PersonalBox = BoxSummary & { slots: { position: number; copy: InventoryCopy }[] };
export type BoxList = { results: BoxSummary[]; total: number };
export type BoxView = "owned" | "unassigned" | "recent";
export type BoxViewPage = { results: InventoryCopy[]; total: number; offset: number; limit: number };
export class BoxesError extends Error {
  constructor(public readonly status: number) { super("Personal boxes request failed"); }
}
const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/boxes`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
function summary(v: unknown): v is BoxSummary {
  return record(v) && uuid(v.id) && typeof v.name === "string" && v.name.trim() === v.name && v.name.length > 0 && v.name.length <= 80
    && integer(v.display_order, 2147483647) && wallpapers.some((w) => w === v.wallpaper) && integer(v.copy_count, 30) && timestamp(v.created_at) && timestamp(v.updated_at);
}
function list(v: unknown): v is BoxList {
  return record(v) && Array.isArray(v.results) && v.results.length <= 100 && v.results.every(summary) && v.total === v.results.length
    && new Set(v.results.map((b) => b.id)).size === v.results.length && new Set(v.results.map((b) => b.display_order)).size === v.results.length
    && v.results.every((b, i, all) => i === 0 || all[i - 1].display_order < b.display_order);
}
function detail(v: unknown, id: string): v is PersonalBox {
  if (!record(v)) return false;
  const slots = v.slots;
  return summary(v) && v.id === id && Array.isArray(slots) && slots.length <= 30 && slots.length === v.copy_count
    && slots.every((s) => record(s) && integer(s.position, 29) && isInventoryCopy(s.copy))
    && new Set(slots.map((s) => s.position)).size === slots.length && new Set(slots.map((s) => s.copy.id)).size === slots.length
    && slots.every((s, i, all) => i === 0 || all[i - 1].position < s.position);
}

async function request(path: string, signal: AbortSignal, method?: string, csrf?: string, body?: unknown): Promise<unknown> {
  const response = await fetch(base + path, { credentials: "include", cache: "no-store", signal, ...(method ? { method } : {}),
    headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) throw new BoxesError(response.status);
  return response.status === 204 ? null : response.json();
}
export async function fetchBoxes(signal: AbortSignal): Promise<BoxList> {
  const payload = await request("", signal); if (!list(payload)) throw new BoxesError(0); return payload;
}
export async function fetchBox(id: string, signal: AbortSignal): Promise<PersonalBox> {
  const payload = await request(`/${encodeURIComponent(id)}`, signal); if (!detail(payload, id)) throw new BoxesError(0); return payload;
}
export async function createBox(name: string, wallpaper: Wallpaper, csrf: string, signal: AbortSignal): Promise<BoxSummary> {
  const payload = await request("", signal, "POST", csrf, { name: name.trim(), wallpaper }); if (!summary(payload)) throw new BoxesError(0); return payload;
}
export async function updateBox(id: string, name: string, wallpaper: Wallpaper, csrf: string, signal: AbortSignal): Promise<BoxSummary> {
  const payload = await request(`/${encodeURIComponent(id)}`, signal, "PUT", csrf, { name: name.trim(), wallpaper });
  if (!summary(payload) || payload.id !== id) throw new BoxesError(0); return payload;
}
export async function reorderBoxes(ids: string[], csrf: string, signal: AbortSignal): Promise<BoxList> {
  const payload = await request("/order", signal, "PUT", csrf, { box_ids: ids });
  if (!list(payload) || payload.results.length !== ids.length || !payload.results.every((b, i) => b.id === ids[i])) throw new BoxesError(0); return payload;
}
export async function deleteBox(id: string, csrf: string, signal: AbortSignal): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, signal, "DELETE", csrf);
}
export async function placeCopy(id: string, position: number, copyId: string, csrf: string, signal: AbortSignal): Promise<PersonalBox> {
  const payload = await request(`/${encodeURIComponent(id)}/slots/${position}`, signal, "PUT", csrf, { copy_id: copyId });
  if (!detail(payload, id) || !payload.slots.some((s) => s.position === position && s.copy.id === copyId)) throw new BoxesError(0); return payload;
}
export async function removePlacement(id: string, position: number, copyId: string, csrf: string, signal: AbortSignal): Promise<void> {
  await request(`/${encodeURIComponent(id)}/slots/${position}?copy_id=${encodeURIComponent(copyId)}`, signal, "DELETE", csrf);
}
export async function fetchBoxView(view: BoxView, offset: number, signal: AbortSignal): Promise<BoxViewPage> {
  const payload = await request(`/views/${view}?offset=${offset}&limit=30`, signal);
  if (!record(payload) || !Array.isArray(payload.results) || payload.results.length > 30 || !payload.results.every(isInventoryCopy)
    || new Set(payload.results.map((c) => c.id)).size !== payload.results.length || payload.offset !== offset || payload.limit !== 30
    || !integer(payload.total, Number.MAX_SAFE_INTEGER) || payload.results.length > payload.total) throw new BoxesError(0);
  return payload as BoxViewPage;
}
