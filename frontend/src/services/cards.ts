import type { Locale } from "../i18n/LocaleProvider";
import { NATIONAL_DEX_TOTAL } from "./pokemon";
import { isOfficialAssetUrl } from "./cardImages";

export type CardSet = {
  id: string;
  name: string;
  name_language: Locale;
  logo_url: string | null;
  symbol_url: string | null;
  logo_sources: { url: string; language: Locale }[];
  serie: { id: string; name: string } | null;
  release_date: string | null;
};

export type TcgCard = {
  id: string;
  name: string;
  dex_ids: number[];
  image_url: string | null;
  thumbnail_url: string | null;
  image_sources: { base_url: string; language: Locale }[];
  image_language: Locale | null;
  set: CardSet;
  local_id: string;
  rarity: string | null;
  category: "Pokemon" | "Trainer" | "Energy";
  language: Locale;
  available_languages: Locale[];
  illustrator: string | null;
  hp: number | null;
  types: string[];
  stage: string | null;
  evolve_from: string | null;
  attacks: { name: string | null; cost: string[]; damage: string | number | null; effect: string | null }[];
  abilities: { name: string | null; type: string | null; effect: string | null }[];
  variants: { id: string | null; type: string; subtype: string | null; stamps: string[] }[];
  weaknesses: { type: string; value: string | null }[];
  resistances: { type: string; value: string | null }[];
  retreat: number | null;
  regulation_mark: string | null;
};

export type CardSort = "name" | "id" | "newest" | "oldest";
export type CardPage = {
  results: TcgCard[];
  page: number;
  page_size: number;
  has_more: boolean;
  coverage: "english_catalog";
  sets: CardSet[];
  sets_complete: true;
};
export type CardFilters = { page: number; sort: CardSort; setId?: string };

export class CardRequestError extends Error {
  readonly status: number;
  constructor(status: number) {
    super("Card catalog unavailable");
    this.status = status;
  }
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
export const MAX_CARD_PAGE = 500;
export const isCardId = (value: string) => value.length <= 100 && /^[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*$/.test(value);
export const isSetId = isCardId;
export function parsePokemonNumber(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d{0,3}$/.test(value)) return undefined;
  const number = Number(value);
  return number <= NATIONAL_DEX_TOTAL ? number : undefined;
}

/** Only local catalog destinations may be used for a return link. */
export function safeReturnTo(value: string | null | undefined): string {
  const fallback = "/pokedex";
  if (!value || value.length > 2048 || /[\\#\s]/.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return fallback;
  const path = value.split("?")[0];
  if (path === "/boxes" || path === "/pokedex") return value;
  const match = /^\/pokemon\/([^/]+)\/cards$/.exec(path);
  return match && parsePokemonNumber(match[1]) !== undefined ? value : fallback;
}

export async function fetchPokemonCards(number: number, language: Locale, filters: CardFilters, signal?: AbortSignal): Promise<CardPage> {
  const params = new URLSearchParams({ language, page: String(filters.page), page_size: "12", sort: filters.sort });
  if (filters.setId) params.set("set_id", filters.setId);
  const payload = await request(`/pokemon/${number}/cards?${params}`, signal);
  if (!isCardPage(payload) || payload.page !== filters.page || payload.page_size !== 12 ||
    !payload.results.every((card) => card.category === "Pokemon" && card.dex_ids.includes(number) && (!filters.setId || card.set.id === filters.setId))) {
    throw new Error("Invalid card catalog");
  }
  return payload;
}

export async function fetchTcgCard(id: string, language: Locale, signal?: AbortSignal): Promise<TcgCard> {
  const payload = await request(`/cards/${encodeURIComponent(id)}?language=${language}`, signal);
  if (!isTcgCard(payload) || payload.id !== id) throw new Error("Invalid card details");
  return payload;
}

async function request(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}/api/v1${path}`, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new CardRequestError(response.status);
  return response.json();
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isNullableText = (value: unknown) => value === null || typeof value === "string";
const isTexts = (value: unknown): value is string[] => Array.isArray(value) && value.every(isText);
const isLanguage = (value: unknown): value is Locale => value === "es" || value === "en";
const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function isImageUrl(value: unknown): boolean {
  return value === null || isOfficialAssetUrl(value);
}

function isDate(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isCardSet(value: unknown): value is CardSet {
  return isRecord(value) && isText(value.id) && isSetId(value.id) && isText(value.name) &&
    isLanguage(value.name_language) && isImageUrl(value.logo_url) && isImageUrl(value.symbol_url) &&
    Array.isArray(value.logo_sources) && value.logo_sources.length <= 2 &&
    value.logo_sources.every((source) => isRecord(source) && isOfficialAssetUrl(source.url) && isLanguage(source.language)) &&
    (value.serie === null || (isRecord(value.serie) && isText(value.serie.id) && isSetId(value.serie.id) && isText(value.serie.name))) &&
    isDate(value.release_date);
}

function isTraits(value: unknown): boolean {
  return Array.isArray(value) && value.every((trait) => isRecord(trait) && isText(trait.type) && isNullableText(trait.value));
}

function isTcgCard(value: unknown): value is TcgCard {
  if (!isRecord(value)) return false;
  return isText(value.id) && isCardId(value.id) && isText(value.name) &&
    Array.isArray(value.dex_ids) && value.dex_ids.every((id) => isPositiveInteger(id) && id <= NATIONAL_DEX_TOTAL) &&
    isImageUrl(value.image_url) && isImageUrl(value.thumbnail_url) &&
    isCardSet(value.set) &&
    Array.isArray(value.image_sources) && value.image_sources.length <= 2 &&
    value.image_sources.every((source) => isRecord(source) && isOfficialAssetUrl(source.base_url) && isLanguage(source.language)) &&
    (value.image_language === null || isLanguage(value.image_language)) &&
    (value.image_sources.length === 0 ? value.image_language === null : value.image_language === value.image_sources[0].language) &&
    isText(value.local_id) && isNullableText(value.rarity) &&
    ["Pokemon", "Trainer", "Energy"].includes(value.category as string) &&
    isLanguage(value.language) && Array.isArray(value.available_languages) &&
    value.available_languages.every(isLanguage) && value.available_languages.includes(value.language) &&
    new Set(value.available_languages).size === value.available_languages.length &&
    isNullableText(value.illustrator) && (value.hp === null || (typeof value.hp === "number" && Number.isSafeInteger(value.hp) && value.hp >= 0)) &&
    isTexts(value.types) && isNullableText(value.stage) && isNullableText(value.evolve_from) &&
    Array.isArray(value.attacks) && value.attacks.every((attack) => isRecord(attack) &&
      isNullableText(attack.name) && isTexts(attack.cost) &&
      (isNullableText(attack.damage) || (typeof attack.damage === "number" && Number.isFinite(attack.damage) && attack.damage >= 0)) && isNullableText(attack.effect)) &&
    Array.isArray(value.abilities) && value.abilities.every((ability) => isRecord(ability) &&
      isNullableText(ability.name) && isNullableText(ability.type) && isNullableText(ability.effect)) &&
    Array.isArray(value.variants) && value.variants.every((variant) => isRecord(variant) &&
      isNullableText(variant.id) && isText(variant.type) && isNullableText(variant.subtype) && isTexts(variant.stamps)) &&
    isTraits(value.weaknesses) && isTraits(value.resistances) &&
    (value.retreat === null || (typeof value.retreat === "number" && Number.isSafeInteger(value.retreat) && value.retreat >= 0)) &&
    isNullableText(value.regulation_mark);
}

function isCardPage(value: unknown): value is CardPage {
  return isRecord(value) && isPositiveInteger(value.page) && value.page <= MAX_CARD_PAGE &&
    isPositiveInteger(value.page_size) && value.page_size <= 24 &&
    typeof value.has_more === "boolean" && value.coverage === "english_catalog" &&
    value.sets_complete === true && Array.isArray(value.sets) && value.sets.length <= 512 && value.sets.every(isCardSet) &&
    new Set(value.sets.map((set) => set.id)).size === value.sets.length &&
    Array.isArray(value.results) && value.results.length <= value.page_size && value.results.every(isTcgCard) &&
    new Set(value.results.map((card) => card.id)).size === value.results.length;
}
