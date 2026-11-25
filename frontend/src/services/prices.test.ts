import { afterEach, expect, test, vi } from "vitest";
import { cardPrices, copyId, copyPrice, quote, rates, valuation } from "../test/priceFixtures";
import { jsonResponse as json } from "../test/tcgFixtures";
import { fetchCardPrices, fetchCollectionValue, fetchCopyPrices, fetchCurrencySetting, saveCurrencySetting } from "./prices";

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;

test("card prices are requested with the chosen currency and strictly validated", async () => {
  const request = vi.fn(async () => json(cardPrices("USD")));
  vi.stubGlobal("fetch", request);
  const result = await fetchCardPrices("sm9-33", "USD", signal());
  expect(result.variants[0].price?.amount).toBe("0.04");
  expect(request).toHaveBeenCalledWith("http://localhost:8000/api/v1/prices/cards/sm9-33?currency=USD", expect.objectContaining({ credentials: "include", cache: "no-store" }));
  for (const broken of [
    { ...cardPrices("USD"), currency: "CLP" },
    { ...cardPrices("USD"), rates: { ...rates, attribution_url: "https://evil.example" } },
    { ...cardPrices("USD"), variants: cardPrices("USD").variants.slice(0, 2) },
    { ...cardPrices("USD"), variants: [{ variant: "normal", price: quote("1", "USD"), reason: "pending" }, ...cardPrices("USD").variants.slice(1)] },
    { ...cardPrices("USD"), variants: [{ variant: "normal", price: quote("1e5", "USD"), reason: null }, ...cardPrices("USD").variants.slice(1)] },
  ]) {
    vi.stubGlobal("fetch", vi.fn(async () => json(broken)));
    await expect(fetchCardPrices("sm9-33", "USD", signal())).rejects.toMatchObject({ status: 0 });
  }
  await expect(fetchCardPrices("../x", "USD", signal())).rejects.toMatchObject({ status: 404 });
});

test("copy prices send each id once and reject rows that were not requested", async () => {
  const request = vi.fn(async () => json({ currency: "CLP", rates, results: [copyPrice(1, quote("38"))] }));
  vi.stubGlobal("fetch", request);
  await fetchCopyPrices([copyId(1), copyId(2), copyId(1)], "CLP", signal());
  const url = new URL((request.mock.calls[0] as unknown as [string])[0]);
  expect(url.searchParams.getAll("copy_id")).toEqual([copyId(1), copyId(2)]);
  expect(url.searchParams.get("currency")).toBe("CLP");
  vi.stubGlobal("fetch", vi.fn(async () => json({ currency: "CLP", rates, results: [copyPrice(9, quote("38"))] })));
  await expect(fetchCopyPrices([copyId(1)], "CLP", signal())).rejects.toMatchObject({ status: 0 });
  const tooMany = Array.from({ length: 101 }, (_, n) => copyId(n));
  await expect(fetchCopyPrices(tooMany, "CLP", signal())).rejects.toMatchObject({ status: 422 });
});

test("valuations must be internally consistent", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => json(valuation())));
  expect((await fetchCollectionValue("CLP", signal())).total).toBe("1112");
  for (const broken of [valuation({ priced_count: 4 }), valuation({ top: Array.from({ length: 6 }, (_, n) => copyPrice(n, quote("1"))) }),
    valuation({ top: [copyPrice(1, null, "pending")] }), valuation({ unpriced_by_reason: { invented: 1 } as never })]) {
    vi.stubGlobal("fetch", vi.fn(async () => json(broken)));
    await expect(fetchCollectionValue("CLP", signal())).rejects.toMatchObject({ status: 0 });
  }
});

test("the currency setting is read and saved with CSRF", async () => {
  const request = vi.fn(async (_input: string, options?: RequestInit) => json({ preferred_currency: options?.method === "PUT" ? "USD" : "CLP" }));
  vi.stubGlobal("fetch", request);
  expect(await fetchCurrencySetting(signal())).toBe("CLP");
  expect(await saveCurrencySetting("USD", "csrf-test", signal())).toBe("USD");
  const [url, options] = request.mock.calls[1];
  expect(url).toBe("http://localhost:8000/api/v1/me/settings");
  expect(options).toMatchObject({ method: "PUT", body: JSON.stringify({ preferred_currency: "USD" }), headers: { "X-CSRF-Token": "csrf-test", "Content-Type": "application/json" } });
  vi.stubGlobal("fetch", vi.fn(async () => json({ preferred_currency: "EUR" })));
  await expect(fetchCurrencySetting(signal())).rejects.toMatchObject({ status: 0 });
});

test("the collection value asks for more top copies only when told to, and checks the price age", async () => {
  const request = vi.fn(async () => json(valuation()));
  vi.stubGlobal("fetch", request);
  expect((await fetchCollectionValue("CLP", signal())).prices_updated_at).toBe("2026-11-25T09:00:00Z");
  expect((request.mock.calls[0] as unknown as [string])[0]).toBe("http://localhost:8000/api/v1/prices/collection?currency=CLP");
  await fetchCollectionValue("CLP", signal(), 12);
  expect((request.mock.calls[1] as unknown as [string])[0]).toBe("http://localhost:8000/api/v1/prices/collection?currency=CLP&top=12");
  for (const top of [0, 21, 1.5]) await expect(fetchCollectionValue("CLP", signal(), top)).rejects.toMatchObject({ status: 422 });
  expect(request).toHaveBeenCalledTimes(2);
  const many = Array.from({ length: 6 }, (_, n) => copyPrice(n, quote("1038", "CLP", "0.83")));
  vi.stubGlobal("fetch", vi.fn(async () => json(valuation({ top: many }))));
  await expect(fetchCollectionValue("CLP", signal())).rejects.toMatchObject({ status: 0 });   // more than asked for
  vi.stubGlobal("fetch", vi.fn(async () => json({ ...valuation(), prices_updated_at: "yesterday" })));
  await expect(fetchCollectionValue("CLP", signal())).rejects.toMatchObject({ status: 0 });
  vi.stubGlobal("fetch", vi.fn(async () => json(valuation({ prices_updated_at: null, top: [], priced_count: 0, unpriced_count: 5, unpriced_by_reason: { variant_unknown: 5 }, sources: {} }))));
  expect((await fetchCollectionValue("CLP", signal())).prices_updated_at).toBeNull();
});

test("fetchSetValues validates the per-expansion value rows", async () => {
  const { fetchSetValues } = await import("./prices");
  const row = { set_id: "me02.5", total: "1038", original_totals: { EUR: "0.83" }, copy_count: 2, priced_count: 1, pending_count: 0, stale_count: 0 };
  const reply = (results: unknown[]) => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ currency: "CLP", results, rates })));
  reply([row]);
  expect((await fetchSetValues("CLP", new AbortController().signal)).results).toHaveLength(1);
  reply([row, row]);
  await expect(fetchSetValues("CLP", new AbortController().signal)).rejects.toThrow();
  reply([{ ...row, set_id: "bad id!" }]);
  await expect(fetchSetValues("CLP", new AbortController().signal)).rejects.toThrow();
});
