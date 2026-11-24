import { afterEach, expect, test, vi } from "vitest";
import { BindersError, fetchBinder, fetchBinders, fetchCopyView, fetchLocations, placeInPocket, removeFromPocket, reorderBinders, spreadStart, storeNext } from "./binders";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const copyId = "00000000-0000-4000-8000-000000000003";
const stamp = "2026-11-24T12:00:00Z";
const summary = { id, name: "Kanto", display_order: 0, cover: "noir", copy_count: 1, page_count: 2, last_placed_at: stamp, created_at: stamp, updated_at: stamp };
const copy = { id: copyId, card_id: "base1-44", condition: "mint", language: "en", variant: "normal", acquired_on: null, notes: "", created_at: stamp, updated_at: stamp };
const binder = (pockets = [{ page: 1, pocket: 5, copy, placed_at: stamp }], extra = {}) => ({ ...summary, copy_count: pockets.length, pockets, ...extra });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signal = new AbortController().signal;
afterEach(() => vi.unstubAllGlobals());

test("stores, places and removes with private no-store requests, CSRF and the expected copy", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(json({ page: 1, pocket: 5, moved_from: null, binder: binder() }))
    .mockResolvedValueOnce(json({ page: 1, pocket: 5, moved_from: { binder_id: other, binder_name: "Repetidas", page: 3, pocket: 7 }, binder: binder() }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  expect((await storeNext(id, copyId, "csrf", signal)).moved_from).toBeNull();
  expect((await placeInPocket(id, { page: 1, pocket: 5 }, copyId, "csrf", signal)).moved_from?.binder_name).toBe("Repetidas");
  await removeFromPocket(id, { page: 1, pocket: 5 }, copyId, "csrf", signal);
  expect(fetcher.mock.calls[0]).toEqual([expect.stringContaining(`/binders/${id}/pockets`), expect.objectContaining({ credentials: "include", cache: "no-store", signal, method: "POST", headers: expect.objectContaining({ "X-CSRF-Token": "csrf" }), body: JSON.stringify({ copy_id: copyId }) })]);
  expect(fetcher.mock.calls[1][0]).toContain(`/binders/${id}/pockets/1/5`);
  expect(fetcher.mock.calls[2][0]).toContain(`/binders/${id}/pockets/1/5?copy_id=${copyId}`);
  expect(fetcher.mock.calls[2][1]).toMatchObject({ method: "DELETE" });
});

test("rejects malformed, duplicated or out-of-range binder responses", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const body of [{ results: [summary, summary], total: 2 }, { results: [{ ...summary, cover: "sepia" }], total: 1 }, { results: [{ ...summary, page_count: 3 }], total: 1 }, { results: [summary], total: 9 }]) {
    fetcher.mockResolvedValueOnce(json(body)); await expect(fetchBinders(signal)).rejects.toMatchObject({ status: 0 });
  }
  const bad = [
    [{ page: 0, pocket: 1, copy, placed_at: stamp }],
    [{ page: 1, pocket: 10, copy, placed_at: stamp }],
    [{ page: 3, pocket: 1, copy, placed_at: stamp }], // beyond page_count
    [{ page: 1, pocket: 2, copy, placed_at: stamp }, { page: 1, pocket: 1, copy: { ...copy, id: other }, placed_at: stamp }], // unsorted
    [{ page: 1, pocket: 1, copy, placed_at: stamp }, { page: 1, pocket: 2, copy, placed_at: stamp }], // same copy twice
  ];
  for (const pockets of bad) {
    fetcher.mockResolvedValueOnce(json(binder(pockets))); await expect(fetchBinder(id, signal)).rejects.toMatchObject({ status: 0 });
  }
  fetcher.mockResolvedValueOnce(json({ page: 1, pocket: 4, moved_from: null, binder: binder() }));
  await expect(storeNext(id, copyId, "csrf", signal)).rejects.toMatchObject({ status: 0 }); // reported pocket is not where the copy is
  await expect(fetchBinder("not-a-uuid", signal)).rejects.toMatchObject({ status: 404 });
});

test("propagates conflict codes so the view can explain them", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ detail: "pocket_occupied" }, 409)).mockResolvedValueOnce(json({ detail: "binder_full" }, 409)));
  await expect(placeInPocket(id, { page: 1, pocket: 1 }, copyId, "csrf", signal)).rejects.toEqual(new BindersError(409, "pocket_occupied"));
  await expect(storeNext(id, copyId, "csrf", signal)).rejects.toMatchObject({ status: 409, detail: "binder_full" });
});

test("sends a full ordering, validates bounded views and owned locations", async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(json({ results: [summary], total: 1 }))
    .mockResolvedValueOnce(json({ results: [copy], total: 31, offset: 30, limit: 30 }))
    .mockResolvedValueOnce(json({ results: [{ copy_id: copyId, binder_id: id, binder_name: "Kanto", page: 2, pocket: 5 }] }))
    .mockResolvedValueOnce(json({ results: [{ copy_id: other, binder_id: id, binder_name: "Kanto", page: 2, pocket: 5 }] }));
  vi.stubGlobal("fetch", fetcher);
  expect((await reorderBinders([id], "csrf", signal)).total).toBe(1);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ binder_ids: [id] });
  expect((await fetchCopyView("unassigned", 30, signal)).total).toBe(31);
  expect(fetcher.mock.calls[1][0]).toContain("/binders/views/unassigned?offset=30&limit=30");
  expect(await fetchLocations([copyId, copyId], signal)).toHaveLength(1);
  expect(fetcher.mock.calls[2][0]).toContain(`/binders/locations?copy_id=${copyId}`);
  await expect(fetchLocations([copyId], signal)).rejects.toMatchObject({ status: 0 }); // a copy that was not asked for
  await expect(fetchLocations([], signal)).rejects.toMatchObject({ status: 422 });
});

test("spreads start on the odd page", () => {
  expect([1, 2, 3, 4, 40].map(spreadStart)).toEqual([1, 1, 3, 3, 39]);
});
