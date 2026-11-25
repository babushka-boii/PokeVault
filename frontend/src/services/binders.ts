import { isInventoryCopy, type InventoryCopy } from "./inventory";
import { NATIONAL_DEX_TOTAL } from "./pokemon";

/** Binders (Iteration 8C): albums of 9-pocket pages holding the user's physical copies. */
export const MAX_PAGES = 40;
export const POCKETS_PER_PAGE = 9;
/** Closed catalogues: a cover or a sticker is one of these ids, never a URL. */
export const covers = ["noir", "brown_leather", "metallic", "holographic", "white"] as const;
export type Cover = typeof covers[number];
export const pixelKeys = ["star", "bolt", "heart", "creature", "circle"] as const;
export type PixelKey = typeof pixelKeys[number];
export const MAX_STICKERS = 24;
/** One layer on the cover, in the list's order (back to front). x and y are percentages of the 3:4 cover. */
export type Sticker = { kind: "pokemon" | "pixel"; species_id: number | null; pixel_key: PixelKey | null; x: number; y: number; rotation: number; scale: number };
export type Appearance = { cover: Cover; stickers: Sticker[] };
export type BinderSummary = {
  id: string; name: string; display_order: number; cover: Cover; stickers: Sticker[]; copy_count: number; page_count: number;
  last_placed_at: string | null; created_at: string; updated_at: string;
};
export type BinderPocket = { page: number; pocket: number; copy: InventoryCopy; placed_at: string };
export type Binder = BinderSummary & { pockets: BinderPocket[] };
export type BinderList = { results: BinderSummary[]; total: number };
export type MovedFrom = { binder_id: string; binder_name: string; page: number; pocket: number };
export type StoreResult = { page: number; pocket: number; moved_from: MovedFrom | null; binder: Binder };
export type CopyLocation = { copy_id: string; binder_id: string; binder_name: string; page: number; pocket: number };
export type CopyView = "owned" | "unassigned" | "recent" | "added";
export type CopyViewPage = { results: InventoryCopy[]; total: number; offset: number; limit: number };
export class BindersError extends Error {
  constructor(public readonly status: number, public readonly detail: string | null = null) { super("Binders request failed"); }
}

const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/binders`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const integer = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const timestamp = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const name = (v: unknown): v is string => typeof v === "string" && v.trim() === v && v.length > 0 && v.length <= 80;
const page = (v: unknown): v is number => integer(v, 1, MAX_PAGES);
const pocket = (v: unknown): v is number => integer(v, 1, POCKETS_PER_PAGE);

const decimals = (n: number, places: number) => Math.abs(Math.round(n * 10 ** places) - n * 10 ** places) < 1e-6;
const ranged = (v: unknown, min: number, max: number, places: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max && decimals(v, places);
/** A sticker names a species (1-1025) or a fixed pixel design, never both, and stays inside the cover. */
export function isSticker(v: unknown): v is Sticker {
  if (!record(v) || Object.keys(v).length !== 7) return false;
  const pokemon = v.kind === "pokemon" && integer(v.species_id, 1, NATIONAL_DEX_TOTAL) && v.pixel_key === null;
  const pixel = v.kind === "pixel" && v.species_id === null && pixelKeys.some((key) => key === v.pixel_key);
  return (pokemon || pixel) && ranged(v.x, 0, 100, 2) && ranged(v.y, 0, 100, 2) && ranged(v.rotation, -180, 180, 1) && ranged(v.scale, 0.5, 2, 2);
}
function summary(v: unknown): v is BinderSummary {
  return record(v) && uuid(v.id) && name(v.name) && integer(v.display_order, 0, 2147483647) && covers.some((c) => c === v.cover)
    && Array.isArray(v.stickers) && v.stickers.length <= MAX_STICKERS && v.stickers.every(isSticker)
    && integer(v.copy_count, 0, MAX_PAGES * POCKETS_PER_PAGE) && integer(v.page_count, 2, MAX_PAGES) && v.page_count % 2 === 0
    && (v.last_placed_at === null || timestamp(v.last_placed_at)) && timestamp(v.created_at) && timestamp(v.updated_at);
}
function list(v: unknown): v is BinderList {
  return record(v) && Array.isArray(v.results) && v.results.length <= 100 && v.results.every(summary) && v.total === v.results.length
    && new Set(v.results.map((b) => b.id)).size === v.results.length && new Set(v.results.map((b) => b.display_order)).size === v.results.length
    && v.results.every((b, i, all) => i === 0 || all[i - 1].display_order < b.display_order);
}
const order = (p: BinderPocket) => (p.page - 1) * POCKETS_PER_PAGE + p.pocket;
function detail(v: unknown, id: string): v is Binder {
  if (!record(v)) return false;
  const pockets = v.pockets;
  if (!summary(v) || v.id !== id || !Array.isArray(pockets)) return false;
  return pockets.length === v.copy_count
    && pockets.every((p) => record(p) && page(p.page) && pocket(p.pocket) && isInventoryCopy(p.copy) && timestamp(p.placed_at) && p.page <= v.page_count)
    && new Set((pockets as BinderPocket[]).map((p) => p.copy.id)).size === pockets.length
    && (pockets as BinderPocket[]).every((p, i, all) => i === 0 || order(all[i - 1]) < order(p));
}
function movedFrom(v: unknown): v is MovedFrom | null {
  return v === null || (record(v) && uuid(v.binder_id) && name(v.binder_name) && page(v.page) && pocket(v.pocket));
}
function storeResult(v: unknown, id: string, copyId: string): v is StoreResult {
  return record(v) && page(v.page) && pocket(v.pocket) && movedFrom(v.moved_from) && detail(v.binder, id)
    && v.binder.pockets.some((p) => p.page === v.page && p.pocket === v.pocket && p.copy.id === copyId);
}

async function request(path: string, signal: AbortSignal, method?: string, csrf?: string, body?: unknown): Promise<unknown> {
  const response = await fetch(base + path, { credentials: "include", cache: "no-store", signal, ...(method ? { method } : {}),
    headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    let code: string | null = null;
    try { const payload: unknown = await response.json(); if (record(payload) && typeof payload.detail === "string") code = payload.detail; } catch { /* no body */ }
    throw new BindersError(response.status, code);
  }
  return response.status === 204 ? null : response.json();
}
const path = (id: string) => `/${encodeURIComponent(id)}`;

export async function fetchBinders(signal: AbortSignal): Promise<BinderList> {
  const payload = await request("", signal); if (!list(payload)) throw new BindersError(0); return payload;
}
export async function fetchBinder(id: string, signal: AbortSignal): Promise<Binder> {
  if (!uuid(id)) throw new BindersError(404);
  const payload = await request(path(id), signal); if (!detail(payload, id)) throw new BindersError(0); return payload;
}
export async function createBinder(binderName: string, csrf: string, signal: AbortSignal): Promise<BinderSummary> {
  const payload = await request("", signal, "POST", csrf, { name: binderName.trim() }); if (!summary(payload)) throw new BindersError(0); return payload;
}
export async function renameBinder(id: string, binderName: string, csrf: string, signal: AbortSignal): Promise<BinderSummary> {
  const payload = await request(path(id), signal, "PUT", csrf, { name: binderName.trim() });
  if (!summary(payload) || payload.id !== id) throw new BindersError(0); return payload;
}
/** Saves the cover and every sticker as one snapshot; the answer must be exactly what was asked. */
export async function saveAppearance(id: string, appearance: Appearance, csrf: string, signal: AbortSignal): Promise<BinderSummary> {
  if (!uuid(id) || !covers.some((c) => c === appearance.cover) || appearance.stickers.length > MAX_STICKERS || !appearance.stickers.every(isSticker)) throw new BindersError(422);
  const payload = await request(`${path(id)}/appearance`, signal, "PUT", csrf, appearance);
  if (!summary(payload) || payload.id !== id || payload.cover !== appearance.cover || JSON.stringify(payload.stickers) !== JSON.stringify(appearance.stickers)) throw new BindersError(0);
  return payload;
}
/** "+ Agregar hojas": two more pages, saved even when empty; the server never removes any. */
export async function addPages(id: string, csrf: string, signal: AbortSignal): Promise<BinderSummary> {
  if (!uuid(id)) throw new BindersError(404);
  const payload = await request(`${path(id)}/pages`, signal, "POST", csrf);
  if (!summary(payload) || payload.id !== id) throw new BindersError(0); return payload;
}
export async function reorderBinders(ids: string[], csrf: string, signal: AbortSignal): Promise<BinderList> {
  const payload = await request("/order", signal, "PUT", csrf, { binder_ids: ids });
  if (!list(payload) || payload.results.length !== ids.length || !payload.results.every((b, i) => b.id === ids[i])) throw new BindersError(0);
  return payload;
}
export async function deleteBinder(id: string, csrf: string, signal: AbortSignal): Promise<void> {
  await request(path(id), signal, "DELETE", csrf);
}
/** Stores the copy in the binder's lowest free pocket (chosen by the server). */
export async function storeNext(id: string, copyId: string, csrf: string, signal: AbortSignal): Promise<StoreResult> {
  const payload = await request(`${path(id)}/pockets`, signal, "POST", csrf, { copy_id: copyId });
  if (!storeResult(payload, id, copyId)) throw new BindersError(0); return payload;
}
export async function placeInPocket(id: string, target: { page: number; pocket: number }, copyId: string, csrf: string, signal: AbortSignal): Promise<StoreResult> {
  const payload = await request(`${path(id)}/pockets/${target.page}/${target.pocket}`, signal, "PUT", csrf, { copy_id: copyId });
  if (!storeResult(payload, id, copyId) || payload.page !== target.page || payload.pocket !== target.pocket) throw new BindersError(0);
  return payload;
}
export async function removeFromPocket(id: string, target: { page: number; pocket: number }, copyId: string, csrf: string, signal: AbortSignal): Promise<void> {
  await request(`${path(id)}/pockets/${target.page}/${target.pocket}?copy_id=${encodeURIComponent(copyId)}`, signal, "DELETE", csrf);
}
export async function fetchCopyView(view: CopyView, offset: number, signal: AbortSignal): Promise<CopyViewPage> {
  const payload = await request(`/views/${view}?offset=${offset}&limit=30`, signal);
  if (!record(payload) || !Array.isArray(payload.results) || payload.results.length > 30 || !payload.results.every(isInventoryCopy)
    || new Set(payload.results.map((c) => c.id)).size !== payload.results.length || payload.offset !== offset || payload.limit !== 30
    || !integer(payload.total, 0, Number.MAX_SAFE_INTEGER) || payload.results.length > payload.total) throw new BindersError(0);
  return payload as CopyViewPage;
}
export async function fetchLocations(copyIds: string[], signal: AbortSignal): Promise<CopyLocation[]> {
  const ids = [...new Set(copyIds)];
  if (!ids.length || ids.length > 100 || !ids.every(uuid)) throw new BindersError(422);
  const params = new URLSearchParams(ids.map((id) => ["copy_id", id]));
  const payload = await request(`/locations?${params}`, signal);
  if (!record(payload) || !Array.isArray(payload.results) || !payload.results.every((row) => record(row) && uuid(row.copy_id)
    && ids.includes(row.copy_id) && uuid(row.binder_id) && name(row.binder_name) && page(row.page) && pocket(row.pocket))
    || new Set(payload.results.map((row) => (row as CopyLocation).copy_id)).size !== payload.results.length) throw new BindersError(0);
  return payload.results as CopyLocation[];
}

/** Pages shown for a binder view, as pairs (spreads). */
export function spreadStart(pageNumber: number) { return pageNumber % 2 === 0 ? pageNumber - 1 : pageNumber; }


/**
 * A binder return target (`/binders/<id>` with optional `?page=N&pocket=M`) is accepted only
 * in exactly that shape; anything else (another path or host, extra parameters, a fragment,
 * out-of-range numbers) gives null, so a link in the address bar can never send the user away.
 */
export function safeBinderReturn(value: string | null | undefined): string | null {
  if (!value || value.length > 120) return null;
  const match = /^\/binders\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})(?:\?page=([1-9]\d?)&pocket=([1-9]))?$/i.exec(value);
  if (!match) return null;
  return match[2] === undefined || Number(match[2]) <= MAX_PAGES ? value : null;
}

/** The copy-detail link of a pocket, remembering where to come back to. */
export function copyDetailPath(copyId: string, binderId: string, target: { page: number; pocket: number }): string {
  const returnTo = `/binders/${binderId}?page=${target.page}&pocket=${target.pocket}`;
  return `/collection/${encodeURIComponent(copyId)}?${new URLSearchParams({ returnTo })}`;
}
