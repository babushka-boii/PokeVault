import { isCardId } from "./cards";

export const currencies = ["CLP", "USD"] as const;
export type Currency = typeof currencies[number];
export type NoPriceReason = "variant_unknown" | "variant_unpriced" | "variant_not_in_catalog" | "no_market_data" | "source_unavailable" | "pending";
export type RatesInfo = { available: boolean; stale: boolean; updated_at: string | null; provider: "exchangerate-api"; attribution_url: string };
export type Quote = {
  amount: string | null; currency: Currency; original_amount: string; original_currency: "EUR" | "USD";
  source: "cardmarket" | "tcgplayer"; metric: "trend" | "marketPrice"; updated_at: string | null; stale: boolean;
};
export type CopyPrice = { copy_id: string; card_id: string; variant: string; price: Quote | null; reason: NoPriceReason | null };
export type CopyPrices = { currency: Currency; results: CopyPrice[]; rates: RatesInfo };
export type VariantPrice = { variant: "normal" | "reverse" | "holo"; price: Quote | null; reason: NoPriceReason | null };
export type CardPrices = { card_id: string; currency: Currency; language_independent: boolean; variants: VariantPrice[]; rates: RatesInfo };
export type Valuation = {
  currency: Currency; total: string | null; original_totals: Partial<Record<"EUR" | "USD", string>>; copy_count: number;
  priced_count: number; unpriced_count: number; unpriced_by_reason: Partial<Record<NoPriceReason, number>>; pending_count: number;
  stale_count: number; sources: Partial<Record<"cardmarket" | "tcgplayer", number>>; top: CopyPrice[]; rates: RatesInfo;
};
export class PricesError extends Error {
  constructor(public readonly status: number) { super("Price request failed"); }
}

export const ATTRIBUTION_URL = "https://www.exchangerate-api.com";
const api = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1`;
const reasons: NoPriceReason[] = ["variant_unknown", "variant_unpriced", "variant_not_in_catalog", "no_market_data", "source_unavailable", "pending"];
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const decimal = (v: unknown): v is string => typeof v === "string" && /^\d{1,13}(?:\.\d{1,4})?$/.test(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const timestamp = (v: unknown) => v === null || (typeof v === "string" && Number.isFinite(Date.parse(v)));
const isCurrency = (v: unknown): v is Currency => currencies.some((c) => c === v);
const isReason = (v: unknown): v is NoPriceReason => reasons.some((r) => r === v);

function isRates(v: unknown): v is RatesInfo {
  return record(v) && typeof v.available === "boolean" && typeof v.stale === "boolean" && timestamp(v.updated_at)
    && v.provider === "exchangerate-api" && v.attribution_url === ATTRIBUTION_URL;
}
function isQuote(v: unknown, currency: Currency): v is Quote {
  return record(v) && (v.amount === null || decimal(v.amount)) && v.currency === currency && decimal(v.original_amount)
    && (v.original_currency === "EUR" || v.original_currency === "USD") && (v.source === "cardmarket" || v.source === "tcgplayer")
    && (v.metric === "trend" || v.metric === "marketPrice") && timestamp(v.updated_at) && typeof v.stale === "boolean";
}
/** Exactly one of price or reason: a copy is either priced or explains why not. */
function priced(v: Record<string, unknown>, currency: Currency) {
  return (v.price === null && isReason(v.reason)) || (v.reason === null && isQuote(v.price, currency));
}
function isCopyPrice(v: unknown, currency: Currency): v is CopyPrice {
  return record(v) && uuid(v.copy_id) && typeof v.card_id === "string" && isCardId(v.card_id) && typeof v.variant === "string" && priced(v, currency);
}
function counts<K extends string>(v: unknown, keys: readonly K[]): v is Partial<Record<K, number>> {
  return record(v) && Object.entries(v).every(([key, n]) => keys.some((k) => k === key) && count(n));
}
function amounts(v: unknown): v is Partial<Record<"EUR" | "USD", string>> {
  return record(v) && Object.entries(v).every(([key, n]) => (key === "EUR" || key === "USD") && decimal(n));
}

async function request(path: string, signal: AbortSignal, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(api + path, { credentials: "include", cache: "no-store", signal, ...options,
    headers: { Accept: "application/json", ...(options.headers ?? {}) } });
  if (!response.ok) throw new PricesError(response.status);
  return response.json();
}
const query = (currency: Currency) => `currency=${currency}`;

export async function fetchCardPrices(cardId: string, currency: Currency, signal: AbortSignal): Promise<CardPrices> {
  if (!isCardId(cardId)) throw new PricesError(404);
  const v = await request(`/prices/cards/${encodeURIComponent(cardId)}?${query(currency)}`, signal);
  if (!record(v) || v.card_id !== cardId || v.currency !== currency || typeof v.language_independent !== "boolean" || !isRates(v.rates)
    || !Array.isArray(v.variants) || v.variants.length !== 3
    || !v.variants.every((row, i) => record(row) && row.variant === ["normal", "reverse", "holo"][i] && priced(row, currency))) {
    throw new PricesError(0);
  }
  return v as CardPrices;
}

export async function fetchCopyPrices(copyIds: string[], currency: Currency, signal: AbortSignal): Promise<CopyPrices> {
  const ids = [...new Set(copyIds)];
  if (!ids.length || ids.length > 100 || !ids.every(uuid)) throw new PricesError(422);
  const params = new URLSearchParams({ currency });
  for (const id of ids) params.append("copy_id", id);
  const v = await request(`/prices/copies?${params}`, signal);
  if (!record(v) || v.currency !== currency || !isRates(v.rates) || !Array.isArray(v.results)
    || !v.results.every((row) => isCopyPrice(row, currency) && ids.includes(row.copy_id))
    || new Set(v.results.map((row) => (row as CopyPrice).copy_id)).size !== v.results.length) {
    throw new PricesError(0);
  }
  return v as CopyPrices;
}

function isValuation(v: unknown, currency: Currency): v is Valuation {
  return record(v) && v.currency === currency && (v.total === null || decimal(v.total)) && amounts(v.original_totals)
    && count(v.copy_count) && count(v.priced_count) && count(v.unpriced_count) && v.priced_count + v.unpriced_count === v.copy_count
    && counts(v.unpriced_by_reason, reasons) && count(v.pending_count) && count(v.stale_count) && counts(v.sources, ["cardmarket", "tcgplayer"] as const)
    && Array.isArray(v.top) && v.top.length <= 5 && v.top.every((row) => isCopyPrice(row, currency) && (row as CopyPrice).price !== null)
    && isRates(v.rates);
}
export async function fetchCollectionValue(currency: Currency, signal: AbortSignal): Promise<Valuation> {
  const v = await request(`/prices/collection?${query(currency)}`, signal);
  if (!isValuation(v, currency)) throw new PricesError(0);
  return v;
}
export async function fetchBoxValue(boxId: string, currency: Currency, signal: AbortSignal): Promise<Valuation> {
  if (!uuid(boxId)) throw new PricesError(404);
  const v = await request(`/boxes/${encodeURIComponent(boxId)}/value?${query(currency)}`, signal);
  if (!isValuation(v, currency)) throw new PricesError(0);
  return v;
}

export async function fetchCurrencySetting(signal: AbortSignal): Promise<Currency> {
  const v = await request("/me/settings", signal);
  if (!record(v) || !isCurrency(v.preferred_currency) || Object.keys(v).length !== 1) throw new PricesError(0);
  return v.preferred_currency;
}
export async function saveCurrencySetting(currency: Currency, csrf: string, signal: AbortSignal): Promise<Currency> {
  const v = await request("/me/settings", signal, { method: "PUT", body: JSON.stringify({ preferred_currency: currency }),
    headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf } });
  if (!record(v) || v.preferred_currency !== currency) throw new PricesError(0);
  return currency;
}
