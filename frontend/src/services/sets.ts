import type { Locale } from "../i18n/LocaleProvider";
import { isOfficialAssetUrl } from "./cardImages";
import { CardRequestError, isCardId, isCardSet, isSetId, type CardSet, type TcgCard } from "./cards";

export type SetSummary = CardSet & { official_count: number | null; provider_total: number | null };
export type ChecklistStatus = "verified" | "incomplete" | "empty";
export type SetDetail = SetSummary & { checklist_status: ChecklistStatus; checklist_size: number; checklist_revision: string | null };
export type SetCard = Pick<TcgCard, "id" | "name" | "local_id" | "language" | "image_url" | "thumbnail_url" | "image_sources" | "image_language">;
export type SetSort = "newest" | "oldest";
export type ChecklistSort = "number" | "name";
export type Ownership = "all" | "owned" | "missing";
export type SetFilters = { page: number; q: string; seriesId: string; sort: SetSort };
export type ChecklistFilters = { page: number; q: string; sort: ChecklistSort; ownership: Ownership };
export type SetPage = { results: SetSummary[]; total: number; page: number; page_size: number;
  series: { id: string; name: string }[]; coverage: "english_physical_catalog"; excluded_unknown_series: number; excluded_pocket: number };
export type SetCardPage = { set: SetDetail; results: SetCard[]; total: number; page: number; page_size: number };
export type SetProgress = { set_id: string; checklist_revision: string | null; status: ChecklistStatus | "unavailable";
  total: number | null; owned: number | null; missing: number | null; physical_copies: number | null; percentage: number | null };
export type SetCollectionPage = SetCardPage & { progress: SetProgress; quantities: Record<string, number> };
export const MAX_SET_PAGE = 10000;
const PAGE_SIZE = 12;
const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/sets`;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const natural = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nullableCount = (value: unknown) => value === null || natural(value);
const locale = (value: unknown): value is Locale => value === "es" || value === "en";
const revision = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const invalid = () => new CardRequestError(0);

async function request(path: string, signal?: AbortSignal, privateRequest = false): Promise<unknown> {
  const response = await fetch(base + path, { headers: { Accept: "application/json" }, signal,
    ...(privateRequest ? { credentials: "include" as const, cache: "no-store" as const } : {}) });
  if (!response.ok) throw new CardRequestError(response.status);
  return response.json();
}

function isSummary(value: unknown): value is SetSummary {
  return isCardSet(value) && nullableCount((value as SetSummary).official_count) && nullableCount((value as SetSummary).provider_total);
}
function isDetail(value: unknown): value is SetDetail {
  if (!isSummary(value)) return false;
  const detail = value as SetDetail;
  if (!natural(detail.checklist_size) || detail.checklist_size > 2000) return false;
  return detail.checklist_status === "verified"
    ? detail.checklist_size > 0 && detail.provider_total === detail.checklist_size && revision(detail.checklist_revision)
    : ["incomplete", "empty"].includes(detail.checklist_status) && detail.checklist_revision === null &&
      (detail.checklist_status !== "empty" || detail.checklist_size === 0);
}
function isSetCard(value: unknown): value is SetCard {
  return record(value) && text(value.id) && isCardId(value.id) && text(value.name) && text(value.local_id) && locale(value.language) &&
    (value.image_url === null || isOfficialAssetUrl(value.image_url)) && (value.thumbnail_url === null || isOfficialAssetUrl(value.thumbnail_url)) &&
    Array.isArray(value.image_sources) && value.image_sources.length <= 2 && value.image_sources.every((source) => record(source) &&
      isOfficialAssetUrl(source.base_url) && locale(source.language)) &&
    (value.image_sources.length === 0 ? value.image_language === null : value.image_language === value.image_sources[0].language);
}
function isProgress(value: unknown): value is SetProgress {
  if (!record(value) || !text(value.set_id) || !isSetId(value.set_id)) return false;
  if (value.status === "verified") {
    return revision(value.checklist_revision) && natural(value.total) && value.total > 0 && value.total <= 2000 && natural(value.owned) && value.owned <= value.total &&
      natural(value.missing) && value.missing === value.total - value.owned && natural(value.physical_copies) && value.physical_copies >= value.owned &&
      typeof value.percentage === "number" && Number.isFinite(value.percentage) &&
      Math.abs(value.percentage - Math.round(value.owned * 10000 / value.total) / 100) < .000001;
  }
  if (value.checklist_revision !== null || value.percentage !== null) return false;
  const counts = [value.total, value.owned, value.missing, value.physical_copies];
  return value.status === "empty" ? counts.every((count) => count === 0)
    : (value.status === "incomplete" || value.status === "unavailable") && counts.every((count) => count === null);
}
function isCardPage(value: unknown, id: string, page: number): value is SetCardPage {
  return record(value) && isDetail(value.set) && value.set.id === id && natural(value.total) && value.total <= value.set.checklist_size &&
    value.page === page && value.page_size === PAGE_SIZE && Array.isArray(value.results) && value.results.length <= PAGE_SIZE &&
    value.results.length <= value.total && value.results.every(isSetCard) && new Set(value.results.map((card) => card.id)).size === value.results.length;
}
function checklistParams(language: Locale, filters: ChecklistFilters) {
  if (!natural(filters.page) || filters.page < 1 || filters.page > MAX_SET_PAGE) throw invalid();
  const params = new URLSearchParams({ language, page: String(filters.page), page_size: String(PAGE_SIZE), sort: filters.sort });
  if (filters.q) params.set("q", filters.q.slice(0, 100));
  return params;
}

export async function fetchSets(language: Locale, filters: SetFilters, signal?: AbortSignal): Promise<SetPage> {
  const params = new URLSearchParams({ language, page: String(filters.page), page_size: String(PAGE_SIZE), sort: filters.sort });
  if (filters.q) params.set("q", filters.q.slice(0, 100));
  if (filters.seriesId) params.set("series_id", filters.seriesId);
  const payload = await request(`?${params}`, signal);
  if (!record(payload) || payload.coverage !== "english_physical_catalog" || payload.page !== filters.page || payload.page_size !== PAGE_SIZE ||
    !natural(payload.total) || payload.total > 512 || !natural(payload.excluded_pocket) || !natural(payload.excluded_unknown_series) ||
    !Array.isArray(payload.results) || payload.results.length > PAGE_SIZE || payload.results.length > payload.total || !payload.results.every(isSummary) ||
    new Set(payload.results.map((set) => set.id)).size !== payload.results.length || !Array.isArray(payload.series) || payload.series.length > 512 ||
    !payload.series.every((series) => record(series) && text(series.id) && isSetId(series.id) && text(series.name)) ||
    new Set(payload.series.map((series) => series.id)).size !== payload.series.length) throw invalid();
  return payload as SetPage;
}
export async function fetchSet(id: string, language: Locale, signal?: AbortSignal): Promise<SetDetail> {
  if (!isSetId(id)) throw invalid();
  const payload = await request(`/${encodeURIComponent(id)}?language=${language}`, signal);
  if (!isDetail(payload) || payload.id !== id) throw invalid();
  return payload;
}
export async function fetchSetCards(id: string, language: Locale, filters: ChecklistFilters, signal?: AbortSignal): Promise<SetCardPage> {
  if (!isSetId(id)) throw invalid();
  const payload = await request(`/${encodeURIComponent(id)}/cards?${checklistParams(language, filters)}`, signal);
  if (!isCardPage(payload, id, filters.page)) throw invalid();
  return payload;
}
export async function fetchSetCollection(id: string, language: Locale, filters: ChecklistFilters, signal?: AbortSignal): Promise<SetCollectionPage> {
  if (!isSetId(id)) throw invalid();
  const params = checklistParams(language, filters);
  params.set("ownership", filters.ownership);
  const payload = await request(`/${encodeURIComponent(id)}/progress?${params}`, signal, true);
  if (!record(payload)) throw invalid();
  const progress = payload.progress;
  const quantities = payload.quantities;
  if (!isCardPage(payload, id, filters.page) || !isProgress(progress) ||
    progress.set_id !== id || progress.checklist_revision !== payload.set.checklist_revision ||
    progress.status !== payload.set.checklist_status ||
    (progress.status === "verified" && progress.total !== payload.set.checklist_size) || !record(quantities)) throw invalid();
  const ids = new Set(payload.results.map((card) => card.id));
  if (!Object.entries(quantities).every(([key, count]) => ids.has(key) && natural(count) && count > 0) ||
    (filters.ownership === "owned" && payload.results.some((card) => !quantities[card.id])) ||
    (filters.ownership === "missing" && Object.keys(quantities).length > 0)) throw invalid();
  return payload as SetCollectionPage;
}
export async function fetchSetProgress(ids: string[], signal?: AbortSignal): Promise<SetProgress[]> {
  if (ids.length < 1 || ids.length > 12 || ids.some((id) => !isSetId(id)) || new Set(ids).size !== ids.length) throw invalid();
  const params = new URLSearchParams(ids.map((id) => ["set_id", id]));
  const payload = await request(`/progress?${params}`, signal, true);
  if (!record(payload) || !Array.isArray(payload.results) || payload.results.length !== ids.length || !payload.results.every(isProgress) ||
    new Set(payload.results.map((progress) => progress.set_id)).size !== ids.length || payload.results.some((progress) => !ids.includes(progress.set_id))) throw invalid();
  return payload.results;
}
