import { vi } from "vitest";
import { pikachuCard, jsonResponse as json } from "./tcgFixtures";
import { copyId, quote, rates } from "./priceFixtures";

export const binderSession = { user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "csrf" };
export const stamp = "2026-11-24T12:00:00Z";
export const binderId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Cards in distinct expansions; copies reference them by index. */
export const binderCards = Array.from({ length: 6 }, (_, index) => ({
  ...pikachuCard, id: `sv${index + 1}-${index + 1}`, name: `Card ${index + 1}`, local_id: String(index + 1),
  set: { ...pikachuCard.set, id: `sv${index + 1}`, name: `Expansion ${index + 1}` },
}));
export const physical = (index: number, extra: Record<string, unknown> = {}) => ({
  id: copyId(200 + index), card_id: binderCards[index % binderCards.length].id, condition: "near_mint", language: "en", variant: "holo",
  acquired_on: null, notes: "", created_at: stamp, updated_at: stamp, ...extra,
});
export type Pocket = { page: number; pocket: number; copy: ReturnType<typeof physical>; placed_at: string };
export const pocketOf = (page: number, pocket: number, copy: ReturnType<typeof physical>): Pocket => ({ page, pocket, copy, placed_at: stamp });
const visible = (pockets: Pocket[]) => Math.min(40, Math.max(2, Math.ceil((Math.max(0, ...pockets.map((p) => p.page)) + 1) / 2) * 2));
export function binderSummary(n: number, name: string, pockets: Pocket[] = [], order = n - 1) {
  return { id: binderId(n), name, display_order: order, cover: "noir", stickers: [], copy_count: pockets.length, page_count: visible(pockets),
    last_placed_at: pockets.length ? stamp : null, created_at: stamp, updated_at: stamp };
}
const sorted = (pockets: Pocket[]) => [...pockets].sort((a, b) => (a.page - b.page) * 9 + (a.pocket - b.pocket));

/**
 * In-memory binders API: lists, details, tray, store/place/remove with moved_from,
 * values and copy prices. Unknown requests fail loudly.
 */
export function binderWorld(initial: { binders: { name: string; pockets: Pocket[] }[]; tray?: ReturnType<typeof physical>[] }) {
  const state = initial.binders.map((binder, index) => ({ id: binderId(index + 1), name: binder.name, order: index, pockets: sorted(binder.pockets) }));
  let tray = [...(initial.tray ?? [])];
  const favorites = new Set<string>();
  const calls: { method: string; path: string; body: unknown }[] = [];
  const failures: Record<string, () => Response> = {};
  const detail = (b: typeof state[number]) => ({ ...binderSummary(Number(b.id.slice(-12)), b.name, b.pockets, b.order), pockets: b.pockets });
  const find = (id: string) => state.find((b) => b.id === id);
  function take(copyIdValue: string) {
    for (const binder of state) {
      const index = binder.pockets.findIndex((p) => p.copy.id === copyIdValue);
      if (index >= 0) { const [removed] = binder.pockets.splice(index, 1); return { binder, removed }; }
    }
    const trayIndex = tray.findIndex((c) => c.id === copyIdValue);
    const [copy] = tray.splice(trayIndex, 1);
    return { binder: null, removed: copy ? pocketOf(0, 0, copy) : null };
  }
  function put(binder: typeof state[number], page: number, pocket: number, copyIdValue: string) {
    const origin = take(copyIdValue);
    binder.pockets = sorted([...binder.pockets, pocketOf(page, pocket, origin.removed!.copy)]);
    const moved = origin.binder && !(origin.binder.id === binder.id && origin.removed!.page === page && origin.removed!.pocket === pocket)
      ? { binder_id: origin.binder.id, binder_name: origin.binder.name, page: origin.removed!.page, pocket: origin.removed!.pocket } : null;
    return json({ page, pocket, moved_from: moved, binder: detail(binder) });
  }
  const request = vi.fn(async (input: string, options?: RequestInit) => {
    const url = new URL(input); const path = url.pathname; const method = options?.method ?? "GET";
    const body = options?.body ? JSON.parse(String(options.body)) : null;
    calls.push({ method, path, body });
    const failure = failures[`${method} ${path}`]; if (failure) { delete failures[`${method} ${path}`]; return failure(); }
    if (path === "/api/v1/auth/me") return json(binderSession);
    if (path.startsWith("/api/v1/favorites/")) {
      const card = decodeURIComponent(path.split("/").pop()!);
      if (method === "PUT") favorites.add(card); if (method === "DELETE") favorites.delete(card);
      return json({ card_id: card, favorite: favorites.has(card) });
    }
    if (path === "/api/v1/me/settings") return json({ preferred_currency: "CLP" });
    if (path.startsWith("/api/v1/cards/")) { const card = binderCards.find((c) => c.id === decodeURIComponent(path.split("/").pop()!)); return card ? json(card) : json({}, 404); }
    if (path === "/api/v1/prices/copies") {
      return json({ currency: "CLP", rates, results: url.searchParams.getAll("copy_id").map((id) => ({ copy_id: id, card_id: "sv1-1", variant: "holo", price: quote("1500", "CLP", "1.20"), reason: null })) });
    }
    if (path === "/api/v1/prices/binders") return json({ currency: "CLP", rates, results: state.map((b) => ({ binder_id: b.id, total: String(b.pockets.length * 1500), original_totals: { EUR: "1.2" }, copy_count: b.pockets.length, priced_count: b.pockets.length, pending_count: 0, stale_count: 0 })) });
    if (/\/api\/v1\/binders\/[^/]+\/value$/.test(path)) return json({ currency: "CLP", total: "1500", original_totals: { EUR: "1.2" }, copy_count: 1, priced_count: 1, unpriced_count: 0, unpriced_by_reason: {}, pending_count: 0, stale_count: 0, prices_updated_at: "2026-11-25T09:00:00Z", sources: { cardmarket: 1 }, top: [], rates });
    if (path === "/api/v1/binders/views/unassigned") return json({ results: tray.slice(0, 30), total: tray.length, offset: 0, limit: 30 });
    if (path === "/api/v1/binders" && method === "GET") return json({ results: state.map((b) => binderSummary(Number(b.id.slice(-12)), b.name, b.pockets, b.order)), total: state.length });
    if (path === "/api/v1/binders" && method === "POST") { const created = { id: binderId(state.length + 1), name: body.name, order: state.length, pockets: [] }; state.push(created); return json(binderSummary(state.length, created.name, [], created.order), 201); }
    const match = /^\/api\/v1\/binders\/([^/]+)(?:\/pockets(?:\/(\d+)\/(\d+))?)?$/.exec(path);
    const binder = match && find(match[1]);
    if (!binder) return json({ detail: "Binder not found" }, 404);
    if (method === "GET") return json(detail(binder));
    if (method === "DELETE" && !match![2]) { state.splice(state.indexOf(binder), 1); return new Response(null, { status: 204 }); }
    if (method === "PUT" && !match![2]) { binder.name = body.name; return json(binderSummary(Number(binder.id.slice(-12)), binder.name, binder.pockets, binder.order)); }
    if (method === "POST") {
      const used = new Set(binder.pockets.map((p) => `${p.page}:${p.pocket}`));
      for (let page = 1; page <= 40; page++) for (let pocket = 1; pocket <= 9; pocket++) if (!used.has(`${page}:${pocket}`)) return put(binder, page, pocket, body.copy_id);
      return json({ detail: "binder_full" }, 409);
    }
    const page = Number(match![2]); const pocket = Number(match![3]);
    if (method === "PUT") {
      const occupant = binder.pockets.find((p) => p.page === page && p.pocket === pocket);
      if (occupant && occupant.copy.id !== body.copy_id) return json({ detail: "pocket_occupied" }, 409);
      return put(binder, page, pocket, body.copy_id);
    }
    if (method === "DELETE") {
      const index = binder.pockets.findIndex((p) => p.page === page && p.pocket === pocket);
      if (index >= 0) { if (binder.pockets[index].copy.id !== url.searchParams.get("copy_id")) return json({ detail: "pocket_changed" }, 409); tray = [binder.pockets[index].copy, ...tray]; binder.pockets.splice(index, 1); }
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected ${method} ${path}`);
  });
  vi.stubGlobal("fetch", request);
  return { request, calls, state, favorites, fail: (method: string, path: string, response: () => Response) => { failures[`${method} ${path}`] = response; },
    mutations: () => calls.filter((c) => c.method !== "GET") };
}
