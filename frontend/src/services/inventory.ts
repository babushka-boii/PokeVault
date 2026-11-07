import { isCardId } from "./cards";

export const conditions = ["unknown", "mint", "near_mint", "excellent", "good", "played", "poor"] as const;
export const physicalLanguages = ["es", "en", "ja", "fr", "de", "it", "pt", "ko", "zh", "id", "th", "other"] as const;
export const variants = ["unknown", "normal", "holo", "reverse", "first_edition", "other"] as const;
export type CopyAttributes = {
  condition: typeof conditions[number];
  language: typeof physicalLanguages[number];
  variant: typeof variants[number];
  acquired_on: string | null;
  notes: string;
};
export type InventoryCopy = CopyAttributes & { id: string; card_id: string; created_at: string; updated_at: string };
export type InventoryPage = { results: InventoryCopy[]; total: number; quantities: Record<string, number>; offset: number; limit: number };
export type InventoryFilters = { offset: number; card_id: string; condition: string; language: string };
export class InventoryError extends Error {
  constructor(public readonly status: number) { super("Inventory request failed"); }
}
const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/inventory`;

async function request(path: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(base + path, { ...options, credentials: "include", cache: "no-store" });
  if (!response.ok) throw new InventoryError(response.status);
  return response.status === 204 ? null : response.json();
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
function isCopy(v: unknown): v is InventoryCopy {
  return record(v) && uuid(v.id) && typeof v.card_id === "string" && isCardId(v.card_id)
    && conditions.some((x) => x === v.condition) && physicalLanguages.some((x) => x === v.language)
    && variants.some((x) => x === v.variant) && typeof v.notes === "string" && v.notes.length <= 2000
    && (v.acquired_on === null || (typeof v.acquired_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.acquired_on)))
    && typeof v.created_at === "string" && Number.isFinite(Date.parse(v.created_at))
    && typeof v.updated_at === "string" && Number.isFinite(Date.parse(v.updated_at));
}
export async function fetchInventory(filters: InventoryFilters, signal: AbortSignal): Promise<InventoryPage> {
  const params = new URLSearchParams({ offset: String(filters.offset), limit: "24" });
  for (const key of ["card_id", "language", "condition"] as const) if (filters[key]) params.set(key, filters[key]);
  const payload = await request(`?${params}`, { signal, headers: { Accept: "application/json" } });
  if (!record(payload) || !Array.isArray(payload.results) || !payload.results.every(isCopy)
    || payload.results.length > 24 || new Set(payload.results.map((r) => r.id)).size !== payload.results.length
    || payload.offset !== filters.offset || payload.limit !== 24 || !Number.isSafeInteger(payload.total) || (payload.total as number) < 0
    || !record(payload.quantities) || !Object.entries(payload.quantities).every(([key, n]) => isCardId(key) && Number.isSafeInteger(n) && (n as number) > 0)) {
    throw new InventoryError(0);
  }
  return payload as InventoryPage;
}
export async function saveCopy(cardId: string, attributes: CopyAttributes, csrf: string, signal: AbortSignal, id?: string): Promise<InventoryCopy> {
  const payload = await request(id ? `/${encodeURIComponent(id)}` : "", {
    method: id ? "PUT" : "POST", signal,
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrf },
    body: JSON.stringify(id ? attributes : { card_id: cardId, ...attributes }),
  });
  if (!isCopy(payload) || payload.card_id !== cardId || (id && payload.id !== id)) throw new InventoryError(0);
  return payload;
}
export async function deleteCopy(id: string, csrf: string, signal: AbortSignal): Promise<void> {
  await request(`/${encodeURIComponent(id)}`, { method: "DELETE", signal, headers: { "X-CSRF-Token": csrf } });
}
