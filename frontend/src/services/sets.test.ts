import { afterEach, expect, test, vi } from "vitest";
import { jsonResponse as json } from "../test/tcgFixtures";
import { setCardPage, setCollectionPage, setDetail, setPage, setProgress } from "../test/setFixtures";
import { fetchSet, fetchSetCards, fetchSetCollection, fetchSetProgress, fetchSets } from "./sets";

afterEach(() => vi.unstubAllGlobals());
const filters = { page: 1, q: "", sort: "number" as const, ownership: "all" as const };

test.each([[1, 32, 3.13], [107, 160, 66.88], [57, 800, 7.13]])("accepts the backend's exact half-up percentage for %i/%i", async (owned, total, percentage) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(setCollectionPage({
    total,
    set: { ...setDetail, official_count: total, provider_total: total, checklist_size: total },
    progress: { ...setProgress, total, owned, missing: total - owned, physical_copies: owned, percentage }, quantities: {},
  }))));
  await expect(fetchSetCollection("sm9", "en", filters)).resolves.toMatchObject({ progress: { percentage } });
});

test.each([
  { progress: { ...setProgress, checklist_revision: "b".repeat(64) } },
  { progress: { ...setProgress, percentage: 12 } },
  { progress: { ...setProgress, owned: 101, missing: -1 } },
  { quantities: { "outside-1": 2 } },
  { quantities: { "sm9-33": -1 } },
  { results: [{ id: "sm9-1", name: "Broken" }] },
])("rejects mismatched or malformed private completion responses", async (changes) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(setCollectionPage(changes))));
  await expect(fetchSetCollection("sm9", "es", filters)).rejects.toThrow();
});

test("rejects row quantities inconsistent with the selected ownership filter", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(setCollectionPage())));
  await expect(fetchSetCollection("sm9", "es", { ...filters, ownership: "missing" })).rejects.toThrow();
  await expect(fetchSetCollection("sm9", "es", { ...filters, ownership: "owned" })).rejects.toThrow();
});

test.each([
  { set: { ...setDetail, id: "another" } },
  { page: 2 },
  { total: 2001 },
  { results: [{ ...setCardPage().results[0], image_sources: [{ base_url: "https://evil.example/image", language: "en" }] }] },
  { set: { ...setDetail, checklist_revision: null } },
])("rejects public pages with invalid identity, pagination, coverage or artwork", async (changes) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(setCardPage(changes))));
  await expect(fetchSetCards("sm9", "en", filters)).rejects.toThrow();
});

test("accepts punctuated set identities and null optional metadata without guessing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...setDetail, id: "sv03.5", official_count: null, serie: null, release_date: null })));
  await expect(fetchSet("sv03.5", "es")).resolves.toMatchObject({ id: "sv03.5", official_count: null });
});

test("rejects a public index that disagrees with its page or repeats set identities", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(setPage({ page: 2 })))
    .mockResolvedValueOnce(json(setPage({ results: [setPage().results[0], setPage().results[0]] }))));
  const query = { page: 1, q: "", seriesId: "", sort: "newest" as const };
  await expect(fetchSets("es", query)).rejects.toThrow();
  await expect(fetchSets("es", query)).rejects.toThrow();
});

test("requires one batch response for each requested set and never fabricates unavailable progress", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ results: [setProgress, setProgress] }))
    .mockResolvedValueOnce(json({ results: [{ ...setProgress, status: "unavailable", checklist_revision: null,
      total: null, owned: null, missing: null, physical_copies: null, percentage: null }] })));
  await expect(fetchSetProgress(["sm9"])).rejects.toThrow();
  await expect(fetchSetProgress(["sm9"])).resolves.toMatchObject([{ status: "unavailable", percentage: null }]);
});
