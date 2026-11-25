import { afterEach, expect, test, vi } from "vitest";
import { quote, rates } from "../test/priceFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";
import { fetchFavoriteCards, fetchFavoriteState, FavoritesError, setFavorite } from "./favorites";
import { closeGuide, fetchGuide } from "./home";
import { fetchHistory, HistoryError } from "./history";

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const calls = (request: ReturnType<typeof vi.fn>) => request.mock.calls as unknown as [string, RequestInit][];

// --- favourites ---

test("a favourite's state is read and written with the CSRF token, only for catalog ids", async () => {
  const request = vi.fn(async (_: string, options?: RequestInit) => json({ card_id: "base1-4", favorite: options?.method !== "DELETE" }));
  vi.stubGlobal("fetch", request);
  expect(await fetchFavoriteState("base1-4", signal())).toBe(true);
  expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/favorites/base1-4");
  expect(calls(request)[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  expect(await setFavorite("base1-4", true, "csrf", signal())).toBe(true);
  expect(calls(request)[1][1]).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "X-CSRF-Token": "csrf" }) });
  expect(await setFavorite("base1-4", false, "csrf", signal())).toBe(false);
  expect(calls(request)[2][1].method).toBe("DELETE");
  for (const bad of ["../x", "a b", "", "x".repeat(101)]) {
    await expect(fetchFavoriteState(bad, signal())).rejects.toMatchObject({ status: 404 });
  }
  expect(request).toHaveBeenCalledTimes(3);
});

test("a favourite's reply must name the card and the state that was asked for", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ card_id: "other-1", favorite: true })));
  await expect(fetchFavoriteState("base1-4", signal())).rejects.toMatchObject({ status: 0 });
  vi.stubGlobal("fetch", vi.fn(async () => json({ card_id: "base1-4", favorite: false })));
  await expect(setFavorite("base1-4", true, "csrf", signal())).rejects.toMatchObject({ status: 0 });
  vi.stubGlobal("fetch", vi.fn(async () => json({ detail: "favorites_full" }, 409)));
  await expect(setFavorite("base1-4", true, "csrf", signal())).rejects.toBeInstanceOf(FavoritesError);
});

const favoriteCards = (extra = {}) => ({
  currency: "CLP", total: 2, rates,
  results: [
    { card_id: "base1-4", favorited_at: "2026-11-25T12:00:00Z", price: quote("1500", "CLP", "1.20"), reason: null },
    { card_id: "base1-5", favorited_at: "2026-11-24T12:00:00Z", price: null, reason: "no_market_data" },
  ], ...extra,
});

test("favourite cards are requested in the display currency and validated", async () => {
  const request = vi.fn(async () => json(favoriteCards()));
  vi.stubGlobal("fetch", request);
  const page = await fetchFavoriteCards("CLP", signal());
  expect(page.results).toHaveLength(2);
  expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/favorites/cards?currency=CLP&limit=12");
  for (const broken of [
    favoriteCards({ currency: "USD" }),
    favoriteCards({ total: 1 }),                                    // fewer total than rows
    favoriteCards({ results: [{ card_id: "x y", favorited_at: "2026-11-25T12:00:00Z", price: null, reason: "pending" }] }),
    favoriteCards({ results: [{ card_id: "base1-4", favorited_at: "nope", price: null, reason: "pending" }] }),
    favoriteCards({ results: [{ card_id: "base1-4", favorited_at: "2026-11-25T12:00:00Z", price: null, reason: null }] }),
    favoriteCards({ results: [{ card_id: "base1-4", favorited_at: "2026-11-25T12:00:00Z", price: quote("1", "CLP"), reason: "pending" }] }),
    favoriteCards({ results: Array(13).fill(favoriteCards().results[0]) }),
    favoriteCards({ rates: { ...rates, attribution_url: "https://evil.example" } }),
  ]) {
    vi.stubGlobal("fetch", vi.fn(async () => json(broken)));
    await expect(fetchFavoriteCards("CLP", signal())).rejects.toMatchObject({ status: 0 });
  }
});

// --- history ---

const history = (extra = {}) => ({
  currency: "CLP", range: "30d", started_on: "2026-11-01",
  points: [{ day: "2026-11-01", total: "10000" }, { day: "2026-11-20", total: "12500" }],
  baseline: { day: "2026-11-18", total: "11000" }, ...extra,
});

test("the history is requested by range and currency, and only recorded days are accepted", async () => {
  const request = vi.fn(async () => json(history()));
  vi.stubGlobal("fetch", request);
  const result = await fetchHistory("30d", "CLP", signal());
  expect(result.points).toHaveLength(2);
  expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/collection/history?range=30d&currency=CLP");
  vi.stubGlobal("fetch", vi.fn(async () => json(history({ range: "1y", currency: "USD", points: [{ day: "2026-11-01", total: "10.50" }], baseline: null }))));
  expect((await fetchHistory("1y", "USD", signal())).points[0].total).toBe("10.50");
});

test.each([
  ["another currency", { currency: "USD" }],
  ["another range", { range: "7d" }],
  ["a malformed day", { points: [{ day: "2026-13-40", total: "1" }] }],
  ["an impossible date", { points: [{ day: "2026-02-30", total: "1" }] }],
  ["days out of order", { points: [{ day: "2026-11-20", total: "1" }, { day: "2026-11-01", total: "1" }] }],
  ["a repeated day", { points: [{ day: "2026-11-20", total: "1" }, { day: "2026-11-20", total: "2" }] }],
  ["a negative total", { points: [{ day: "2026-11-20", total: "-1" }] }],
  ["a non-numeric total", { points: [{ day: "2026-11-20", total: "1e5" }] }],
  ["a numeric total", { points: [{ day: "2026-11-20", total: 5 }] }],
  ["a point before the first record", { started_on: "2026-11-10" }],
  ["points without a first record", { started_on: null }],
  ["more points than days in a year", { points: Array.from({ length: 367 }, (_, n) => ({ day: new Date(Date.UTC(2025, 0, 1 + n)).toISOString().slice(0, 10), total: "1" })) }],
  ["an unknown key", { extra: 1 }],
])("a history with %s is rejected", async (_name, change) => {
  vi.stubGlobal("fetch", vi.fn(async () => json(history(change))));
  await expect(fetchHistory("30d", "CLP", signal())).rejects.toBeInstanceOf(HistoryError);
});

test("an empty history before any record is valid", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(history({ started_on: null, points: [], baseline: null }))));
  expect(await fetchHistory("30d", "CLP", signal())).toMatchObject({ started_on: null, points: [] });
});

// --- guide ---

const guide = { has_copy: true, has_stored: false, has_favorite: false, dismissed: false };

test("the guide is read, and closing sends only dismissed with the CSRF token", async () => {
  const request = vi.fn(async (_: string, options?: RequestInit) => json(options?.method === "PUT" ? { ...guide, dismissed: true } : guide));
  vi.stubGlobal("fetch", request);
  expect(await fetchGuide(signal())).toEqual(guide);
  expect((await closeGuide("csrf", signal())).dismissed).toBe(true);
  expect(calls(request)[1][0]).toBe("http://localhost:8000/api/v1/home/guide");
  expect(calls(request)[1][1]).toMatchObject({ method: "PUT", body: JSON.stringify({ dismissed: true }) });
});

test.each([
  ["a missing flag", { has_copy: true, has_stored: false, dismissed: false }],
  ["a string flag", { ...guide, has_copy: "yes" }],
  ["an extra key", { ...guide, user_id: "x" }],
])("a guide with %s is rejected", async (_name, body) => {
  vi.stubGlobal("fetch", vi.fn(async () => json(body)));
  await expect(fetchGuide(signal())).rejects.toMatchObject({ status: 0 });
});
