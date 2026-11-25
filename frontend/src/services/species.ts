import { isCardId, isCardPage, type CardPage, type CardSort } from "./cards";
import type { Locale } from "../i18n/LocaleProvider";
import { isSpeciesRow, NATIONAL_DEX_TOTAL, type SpeciesRow } from "./pokemon";
import { isValuation, type Currency, type Valuation } from "./prices";

/** Your collection by species, and the species' catalog cards (Iteration 9B). */
export type SpeciesCounts = { counts: Record<number, number>; species_owned: number; pending: number };
export type SpeciesCollection = {
  national_dex_number: number; copies: number; distinct_cards: number; owned_card_ids: string[]; value: Valuation;
  catalog_total: number | null; pending: number;
};
export type Show = "all" | "owned" | "missing";
export type SpeciesCardFilters = { page: number; sort: CardSort; show: Show; setId?: string; guest?: boolean };
export type SpeciesCardPage = CardPage & { owned_ids: string[] };
export class SpeciesError extends Error {
  constructor(public readonly status: number) { super("Species request failed"); }
}

const api = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const PAGE_SIZE = 12;

async function get(path: string, signal: AbortSignal, privateData: boolean): Promise<unknown> {
  const response = await fetch(api + path, { ...(privateData ? { credentials: "include" as const, cache: "no-store" as const } : {}), signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new SpeciesError(response.status);
  return response.json();
}
const checkNumber = (number: number) => { if (!Number.isInteger(number) || number < 1 || number > NATIONAL_DEX_TOTAL) throw new SpeciesError(404); };

/** All 1025 species (public, static): validated, complete and in order, or an error. */
export async function fetchSpeciesIndex(signal: AbortSignal): Promise<SpeciesRow[]> {
  const v = await get("/pokemon/index", signal, false);
  if (!record(v) || Object.keys(v).length !== 1 || !Array.isArray(v.results) || v.results.length !== NATIONAL_DEX_TOTAL
    || !v.results.every((row, position) => isSpeciesRow(row) && row.national_dex_number === position + 1)) throw new SpeciesError(0);
  return v.results as SpeciesRow[];
}

/** The user's copies per national number, from one request. `pending` cards are not resolved yet. */
export async function fetchSpeciesCounts(signal: AbortSignal): Promise<SpeciesCounts> {
  const v = await get("/collection/species", signal, true);
  if (!record(v) || Object.keys(v).length !== 3 || !record(v.counts) || !count(v.species_owned) || !count(v.pending)) throw new SpeciesError(0);
  const counts: Record<number, number> = {};
  for (const [key, total] of Object.entries(v.counts)) {
    const number = Number(key);
    if (!/^\d+$/.test(key) || number < 1 || number > NATIONAL_DEX_TOTAL || !count(total, 1)) throw new SpeciesError(0);
    counts[number] = total;
  }
  if (Object.keys(counts).length !== v.species_owned) throw new SpeciesError(0);
  return { counts, species_owned: v.species_owned, pending: v.pending };
}

export async function fetchSpeciesCollection(number: number, currency: Currency, signal: AbortSignal): Promise<SpeciesCollection> {
  checkNumber(number);
  const v = await get(`/collection/species/${number}?currency=${currency}`, signal, true);
  if (!record(v) || v.national_dex_number !== number || !count(v.copies) || !count(v.distinct_cards) || !count(v.pending)
    || !Array.isArray(v.owned_card_ids) || v.owned_card_ids.length !== v.distinct_cards || v.distinct_cards > v.copies
    || !v.owned_card_ids.every((id) => typeof id === "string" && isCardId(id)) || new Set(v.owned_card_ids).size !== v.owned_card_ids.length
    || !(v.catalog_total === null || count(v.catalog_total)) || !isValuation(v.value, currency) || v.value.copy_count !== v.copies) throw new SpeciesError(0);
  return v as unknown as SpeciesCollection;
}

/**
 * A species' catalog cards. Signed in, the server marks the ones you own and can filter owned or
 * missing before paging; a guest gets the public list (all cards, none marked).
 */
export async function fetchSpeciesCards(number: number, language: Locale, filters: SpeciesCardFilters, signal: AbortSignal): Promise<SpeciesCardPage> {
  checkNumber(number);
  if (filters.guest && filters.show !== "all") throw new SpeciesError(422);
  const params = new URLSearchParams({ language, page: String(filters.page), page_size: String(PAGE_SIZE), sort: filters.sort });
  if (filters.setId) params.set("set_id", filters.setId);
  if (!filters.guest) params.set("show", filters.show);
  const v = await get(filters.guest ? `/pokemon/${number}/cards?${params}` : `/collection/species/${number}/cards?${params}`, signal, !filters.guest);
  if (!isCardPage(v) || v.page_size !== PAGE_SIZE) throw new SpeciesError(0);
  const owned = filters.guest ? [] : (v as unknown as Record<string, unknown>).owned_ids;
  const onPage = new Set(v.results.map((card) => card.id));
  if (!Array.isArray(owned) || new Set(owned).size !== owned.length || !owned.every((id) => typeof id === "string" && isCardId(id) && onPage.has(id))) throw new SpeciesError(0);
  return { ...v, owned_ids: owned as string[] };
}
