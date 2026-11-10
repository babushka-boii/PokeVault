import { pikachuCard } from "./tcgFixtures";

export const setSummary = { ...pikachuCard.set, official_count: 80, provider_total: 100 };
export const setDetail = { ...setSummary, checklist_status: "verified", checklist_size: 100, checklist_revision: "a".repeat(64) };
export const setCards = Array.from({ length: 13 }, (_, index) => ({
  id: `sm9-${33 + index}`, name: index === 0 ? pikachuCard.name : `Checklist card ${index + 1}`,
  local_id: String(33 + index), language: "en", image_url: null, thumbnail_url: null,
  image_sources: index === 0 ? pikachuCard.image_sources : [], image_language: index === 0 ? "en" : null,
}));
export const setProgress = { set_id: "sm9", checklist_revision: setDetail.checklist_revision,
  status: "verified", total: 100, owned: 8, missing: 92, physical_copies: 12, percentage: 8 };
export const setSession = { user: { id: "ash", display_name: "Ash", email: null, email_verified: true, picture_url: null }, csrf_token: "csrf-test" };

export function setPage(options: Record<string, unknown> = {}) {
  return { results: [setSummary], total: 1, page: 1, page_size: 12,
    series: [{ id: "sm", name: "Sun & Moon" }], coverage: "english_physical_catalog",
    excluded_unknown_series: 1, excluded_pocket: 7, ...options };
}
export function setCardPage(options: Record<string, unknown> = {}) {
  return { set: setDetail, results: setCards.slice(0, 12), total: 100, page: 1, page_size: 12, ...options };
}
export function setCollectionPage(options: Record<string, unknown> = {}) {
  return { ...setCardPage(), progress: setProgress, quantities: { "sm9-33": 3 }, ...options };
}
