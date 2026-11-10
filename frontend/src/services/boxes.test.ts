import { afterEach, expect, test, vi } from "vitest";
import { createBox, fetchBox, fetchBoxes, fetchBoxView, placeCopy, removePlacement, reorderBoxes } from "./boxes";

const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const summary = { id, name: "Favorites", wallpaper: "classic", display_order: 0, copy_count: 1, created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z" };
const copy = { id: other, card_id: "base1-44", condition: "mint", language: "en", variant: "normal", acquired_on: null, notes: "", created_at: summary.created_at, updated_at: summary.updated_at };
const json = (body: unknown) => new Response(JSON.stringify(body));
afterEach(() => vi.unstubAllGlobals());

test("uses private no-store session requests and CSRF for placement and stale-safe removal", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ ...summary, slots: [{ position: 29, copy }] })).mockResolvedValueOnce(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  expect((await placeCopy(id, 29, other, "csrf", signal)).slots[0].copy.id).toBe(other);
  await removePlacement(id, 29, other, "csrf", signal);
  expect(fetcher.mock.calls[0]).toEqual([expect.stringContaining(`/boxes/${id}/slots/29`), expect.objectContaining({ credentials: "include", cache: "no-store", signal, method: "PUT", headers: expect.objectContaining({ "X-CSRF-Token": "csrf" }), body: JSON.stringify({ copy_id: other }) })]);
  expect(fetcher.mock.calls[1][0]).toContain(`?copy_id=${other}`);
});

test("rejects duplicate, malformed and out-of-bounds private responses", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const signal = new AbortController().signal;
  for (const body of [{ results: [summary, summary], total: 2 }, { results: [{ ...summary, wallpaper: "bad" }], total: 1 }, { results: [summary], total: 1000 }]) {
    fetcher.mockResolvedValueOnce(json(body)); await expect(fetchBoxes(signal)).rejects.toMatchObject({ status: 0 });
  }
  for (const slots of [[{ position: 30, copy }], [{ position: 0, copy }, { position: 1, copy }], [{ position: 0, copy: { ...copy, id: "bad" } }]]) {
    fetcher.mockResolvedValueOnce(json({ ...summary, slots })); await expect(fetchBox(id, signal)).rejects.toMatchObject({ status: 0 });
  }
});

test("validates bounded views, exact requested identity and propagates conflicts", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({ results: [copy], total: 31, offset: 30, limit: 30 }))
    .mockResolvedValueOnce(json({ ...summary, id: other, slots: [] })).mockResolvedValueOnce(new Response(null, { status: 409 }));
  vi.stubGlobal("fetch", fetcher); const signal = new AbortController().signal;
  expect((await fetchBoxView("unassigned", 30, signal)).total).toBe(31);
  expect(fetcher.mock.calls[0][0]).toContain("/views/unassigned?offset=30&limit=30");
  await expect(fetchBox(id, signal)).rejects.toMatchObject({ status: 0 });
  await expect(createBox("Favorites", "classic", "csrf", signal)).rejects.toMatchObject({ status: 409 });
});

test("sends a full box ordering and rejects mismatched server ordering", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [summary], total: 1 })));
  await expect(reorderBoxes([other, id], "csrf", new AbortController().signal)).rejects.toMatchObject({ status: 0 });
});

test("accepts persistent display order gaps after repeated create and delete cycles", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ results: [{ ...summary, display_order: 100 }], total: 1 })));
  expect((await fetchBoxes(new AbortController().signal)).results[0].display_order).toBe(100);
});
