import { vi } from "vitest";
import { copyId, copyPrice, noRates, quote, rates, valuation } from "./priceFixtures";
import { setProgress } from "./setFixtures";
import { jsonResponse as json, pikachuCard } from "./tcgFixtures";
import type { Valuation } from "../services/prices";

export const userA = { id: "4f6a3fab-002c-44e1-b3e8-0247badc013c", display_name: "Ash Ketchum", email: "ash@example.test", email_verified: true, picture_url: null as string | null };
export const userB = { ...userA, id: "9b1d5c7e-1111-4222-8333-444455556666", display_name: "Misty Waterflower" };

/** Eight cards, each in its own expansion, so set deduplication and the six-row cap are observable. */
export const homeCards = Array.from({ length: 8 }, (_, index) => ({
  ...pikachuCard, id: `sv${index + 1}-${index + 1}`, name: `Card ${index + 1}`, dex_ids: [index + 1], local_id: String(index + 1),
  set: { ...pikachuCard.set, id: `sv${index + 1}`, name: `Expansion ${index + 1}` },
}));
export const cardById = Object.fromEntries(homeCards.map((card) => [card.id, card]));

export const physicalCopy = (index: number, extra: Record<string, unknown> = {}) => ({
  id: copyId(100 + index), card_id: homeCards[index].id, condition: "near_mint", language: "en", variant: "holo", acquired_on: "2026-10-01",
  notes: "", created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z", ...extra,
});
const stamp = "2026-11-07T12:00:00Z";
export const binder = (n: number, name: string, extra: Record<string, unknown> = {}) => ({ id: copyId(n), name, display_order: n - 1, cover: "noir", copy_count: 2, page_count: 4, last_placed_at: stamp, created_at: stamp, updated_at: stamp, ...extra });
export type HomePocket = { page: number; pocket: number; copy: ReturnType<typeof physicalCopy>; placed_at: string };
export const pocketAt = (page: number, pocket: number, copy: ReturnType<typeof physicalCopy>, placed_at = stamp): HomePocket => ({ page, pocket, copy, placed_at });

/** Valuation whose top five point at the first five cards, in price order. */
export function homeValuation(extra: Partial<Valuation> = {}): Valuation {
  return valuation({ copy_count: 5, priced_count: 3, top: [0, 1, 2, 3, 4].map((index) => ({
    ...copyPrice(100 + index, quote(String(5000 - index * 1000), "CLP", "5.00"), null, "holo"), card_id: homeCards[index].id,
  })), ...extra });
}
export const ratesDown = { rates: noRates, total: null, priced_count: 0, top: [] as Valuation["top"] };

type Handler = (url: URL, options?: RequestInit) => Response | Promise<Response> | undefined;
export const emptyHistory = { started_on: null as string | null, points: [] as { day: string; total: string }[], baseline: null as { day: string; total: string } | null };
export const openGuide = { has_copy: true, has_stored: true, has_favorite: false, dismissed: true };   // closed by default: most tests are not about it
export const noFavorites = { total: 0, results: [] as unknown[] };
export type HomeData = {
  user?: typeof userA; guest?: boolean; valuation?: Valuation | (() => Response | Promise<Response>); binders?: unknown[];
  pockets?: HomePocket[]; unassigned?: number; recent?: ReturnType<typeof physicalCopy>[]; added?: ReturnType<typeof physicalCopy>[];
  progress?: (setIds: string[]) => unknown[]; override?: Handler;
  /** The recorded history; the range and currency in the URL are echoed back. A function answers by itself. */
  history?: Partial<typeof emptyHistory> | ((url: URL) => Response | Promise<Response>);
  guide?: Partial<typeof openGuide> | (() => Response | Promise<Response>);
  favorites?: { total?: number; results: unknown[] } | (() => Response | Promise<Response>);
  /** Card ids that start out starred. */
  starred?: string[];
};

/** Routes every request by path and fails loudly on anything unplanned. */
export function stubHome(data: HomeData = {}) {
  const starred = new Set<string>(data.starred ?? []);
  const request = vi.fn((input: string, options?: RequestInit) => {
    const url = new URL(input); const path = url.pathname;
    const custom = data.override?.(url, options); if (custom) return Promise.resolve(custom);
    if (path === "/api/v1/auth/me") return Promise.resolve(data.guest ? json({}, 401) : json({ user: data.user ?? userA, csrf_token: "csrf" }));
    if (path === "/api/v1/me/settings") return Promise.resolve(json({ preferred_currency: "CLP" }));
    if (path === "/api/v1/health") return Promise.resolve(json({ status: "healthy", api: "healthy", database: "healthy", version: "test" }));
    if (path === "/api/v1/prices/collection") {
      const value = data.valuation ?? homeValuation();
      return Promise.resolve(typeof value === "function" ? value() : json({ ...value, currency: url.searchParams.get("currency") ?? "CLP" }));
    }
    if (path === "/api/v1/collection/history") {
      const history = data.history ?? {};
      if (typeof history === "function") return Promise.resolve(history(url));
      return Promise.resolve(json({ currency: url.searchParams.get("currency") ?? "CLP", range: url.searchParams.get("range") ?? "30d", ...emptyHistory, ...history }));
    }
    if (path === "/api/v1/home/guide") {
      const guide = data.guide ?? {};
      return Promise.resolve(typeof guide === "function" ? guide() : json({ ...openGuide, ...guide }));
    }
    if (path === "/api/v1/favorites/status") {
      const asked = url.searchParams.getAll("card_id");
      return Promise.resolve(json({ card_ids: asked.filter((id) => starred.has(id)) }));
    }
    if (path.startsWith("/api/v1/favorites/") && path !== "/api/v1/favorites/cards") {
      const card = decodeURIComponent(path.split("/").pop()!); const method = options?.method ?? "GET";
      if (method === "PUT") starred.add(card); if (method === "DELETE") starred.delete(card);
      return Promise.resolve(json({ card_id: card, favorite: starred.has(card) }));
    }
    if (path === "/api/v1/favorites/cards") {
      const favorites = data.favorites ?? noFavorites;
      return Promise.resolve(typeof favorites === "function" ? favorites() : json({ currency: url.searchParams.get("currency") ?? "CLP", rates, total: favorites.results.length, ...favorites }));
    }
    if (path === "/api/v1/binders") { const binders = data.binders ?? [binder(1, "Favoritas")]; return Promise.resolve(json({ results: binders, total: binders.length })); }
    if (path === "/api/v1/prices/binders") {
      const binders = (data.binders ?? [binder(1, "Favoritas")]) as { id: string; copy_count: number }[];
      return Promise.resolve(json({ currency: url.searchParams.get("currency") ?? "CLP", rates, results: binders.map((b) => ({
        binder_id: b.id, total: String(b.copy_count * 1500), original_totals: { EUR: "1.2" }, copy_count: b.copy_count, priced_count: b.copy_count, pending_count: 0, stale_count: 0 })) }));
    }
    if (path === "/api/v1/binders/views/unassigned") return Promise.resolve(json({ results: [], total: data.unassigned ?? 0, offset: 0, limit: 30 }));
    if (path === "/api/v1/binders/views/added") { const added = data.added ?? data.recent ?? [physicalCopy(0), physicalCopy(1)]; return Promise.resolve(json({ results: added, total: added.length, offset: 0, limit: 30 })); }
    if (path === "/api/v1/prices/copies") {
      return Promise.resolve(json({ currency: url.searchParams.get("currency") ?? "CLP", rates, results: url.searchParams.getAll("copy_id").map((id) => {
        const copy = [...(data.added ?? data.recent ?? [physicalCopy(0), physicalCopy(1)])].find((c) => c.id === id);
        return { copy_id: id, card_id: copy?.card_id ?? homeCards[0].id, variant: copy?.variant ?? "holo", price: quote("2500", "CLP", "2.00"), reason: null };
      }) }));
    }
    if (path === "/api/v1/binders/views/recent") { const recent = data.recent ?? [physicalCopy(0), physicalCopy(1)]; return Promise.resolve(json({ results: recent, total: recent.length, offset: 0, limit: 30 })); }
    if (path.startsWith("/api/v1/binders/")) {
      const id = path.split("/").pop();
      const known = ((data.binders ?? [binder(1, "Favoritas")]) as { id: string }[]).find((b) => b.id === id) ?? binder(1, "Favoritas");
      const pockets = data.pockets ?? [pocketAt(1, 3, physicalCopy(0)), pocketAt(1, 4, physicalCopy(1))];
      return Promise.resolve(json({ ...known, copy_count: pockets.length, pockets }));
    }
    if (path.startsWith("/api/v1/prices/cards/")) return Promise.resolve(json({ card_id: path.split("/").pop(), currency: "CLP", language_independent: true, rates, variants: [{ variant: "normal", price: quote("38"), reason: null }, { variant: "reverse", price: null, reason: "no_market_data" }, { variant: "holo", price: null, reason: "no_market_data" }] }));
    if (path.startsWith("/api/v1/cards/")) { const card = cardById[decodeURIComponent(path.split("/").pop()!)]; return Promise.resolve(card ? json(card) : json({}, 404)); }
    if (path === "/api/v1/sets/progress") {
      const ids = url.searchParams.getAll("set_id");
      return Promise.resolve(json({ results: data.progress ? data.progress(ids) : ids.map((id) => ({ ...setProgress, set_id: id })) }));
    }
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  vi.stubGlobal("fetch", request);
  return request;
}
export const callsTo = (request: ReturnType<typeof stubHome>, path: string) => request.mock.calls.filter(([input]) => new URL(input as string).pathname === path);
