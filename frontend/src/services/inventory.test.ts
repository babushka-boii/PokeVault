import { afterEach, expect, test, vi } from "vitest";
import { fetchInventory, saveCopy } from "./inventory";
import { scannedCopy } from "../test/scannerFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());
const attributes = { condition: "unknown", language: "en", variant: "unknown", acquired_on: null, notes: "" } as const;
test("uses an explicit replay key only for new physical copies", async () => {
  const request = vi.fn<(input: string, options: RequestInit) => Promise<Response>>(async () => json(scannedCopy, 201)); vi.stubGlobal("fetch", request);
  await saveCopy("sm9-33", attributes, "csrf", new AbortController().signal, undefined, "56b2cb39-551f-4902-b86b-1684a38b9cb2");
  expect(request.mock.calls[0][1].headers).toMatchObject({ "Idempotency-Key": "56b2cb39-551f-4902-b86b-1684a38b9cb2", "X-CSRF-Token": "csrf" });
  await saveCopy("sm9-33", attributes, "csrf", new AbortController().signal, scannedCopy.id, "56b2cb39-551f-4902-b86b-1684a38b9cb2");
  expect(request.mock.calls[1][1].headers).not.toHaveProperty("Idempotency-Key");
});

test.each([
  { results: [{ ...scannedCopy, card_id: "base1-44" }], quantities: { "sm9-33": 1 } },
  { results: [scannedCopy], quantities: { "base1-44": 1 } },
])("rejects ownership data for a different printing than the exact-card filter", async (changes) => {
  vi.stubGlobal("fetch", vi.fn(async () => json({ total: 1, offset: 0, limit: 24, ...changes })));
  await expect(fetchInventory({ offset: 0, card_id: "sm9-33", condition: "", language: "" }, new AbortController().signal)).rejects.toMatchObject({ status: 0 });
});
