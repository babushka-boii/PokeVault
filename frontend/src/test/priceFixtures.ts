import type { CopyPrice, Quote, RatesInfo, Valuation } from "../services/prices";

export const rates: RatesInfo = { available: true, stale: false, updated_at: "2026-11-23T00:00:00Z", provider: "exchangerate-api", attribution_url: "https://www.exchangerate-api.com" };
export const noRates: RatesInfo = { ...rates, available: false, updated_at: null };
export function quote(amount: string | null, currency: "CLP" | "USD" = "CLP", original = "0.03", extra: Partial<Quote> = {}): Quote {
  return { amount, currency, original_amount: original, original_currency: "EUR", source: "cardmarket", metric: "trend", updated_at: "2026-11-22T22:16:19Z", stale: false, ...extra };
}
export function cardPrices(currency: "CLP" | "USD" = "CLP") {
  return { card_id: "sm9-33", currency, language_independent: true, rates, variants: [
    { variant: "normal", price: quote(currency === "CLP" ? "38" : "0.04", currency), reason: null },
    { variant: "reverse", price: null, reason: "no_market_data" },
    { variant: "holo", price: null, reason: "variant_not_in_catalog" },
  ] };
}
export const copyId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function copyPrice(n: number, price: Quote | null, reason: CopyPrice["reason"] = null, variant = "normal"): CopyPrice {
  return { copy_id: copyId(n), card_id: "sm9-33", variant, price, reason };
}
export function valuation(extra: Partial<Valuation> = {}): Valuation {
  return { currency: "CLP", total: "1112", original_totals: { EUR: "0.89" }, copy_count: 5, priced_count: 3, unpriced_count: 2,
    unpriced_by_reason: { variant_unknown: 2 }, pending_count: 0, stale_count: 0, prices_updated_at: "2026-11-25T09:00:00Z", sources: { cardmarket: 3 },
    top: [copyPrice(1, quote("1038", "CLP", "0.83"), null, "holo")], rates, ...extra };
}
