import { isCardId } from "./cards";
import { isQuote, isRates, type Currency, type NoPriceReason, type Quote, type RatesInfo } from "./prices";

/** Starred catalog cards (Iteration 9A): per user and card, not per physical copy. */
export const MAX_LISTED_FAVORITES = 12;
export type FavoriteCard = { card_id: string; favorited_at: string; price: Quote | null; reason: NoPriceReason | null };
export type FavoriteCards = { currency: Currency; total: number; results: FavoriteCard[]; rates: RatesInfo };
export class FavoritesError extends Error {
  constructor(public readonly status: number, public readonly detail: string | null = null) { super("Favorites request failed"); }
}

const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/favorites`;
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const reasons = ["variant_unknown", "variant_unpriced", "variant_not_in_catalog", "no_market_data", "source_unavailable", "pending"];

async function request(path: string, signal: AbortSignal, method = "GET", csrf?: string): Promise<unknown> {
  const response = await fetch(base + path, { method, credentials: "include", cache: "no-store", signal,
    headers: { Accept: "application/json", ...(csrf ? { "X-CSRF-Token": csrf } : {}) } });
  if (!response.ok) {
    let detail: string | null = null;
    try { const body = await response.json(); if (record(body) && typeof body.detail === "string") detail = body.detail; } catch { /* no body */ }
    throw new FavoritesError(response.status, detail);
  }
  return response.json();
}

function state(payload: unknown, cardId: string): boolean {
  if (!record(payload) || Object.keys(payload).length !== 2 || payload.card_id !== cardId || typeof payload.favorite !== "boolean") throw new FavoritesError(0);
  return payload.favorite;
}

export async function fetchFavoriteState(cardId: string, signal: AbortSignal): Promise<boolean> {
  if (!isCardId(cardId)) throw new FavoritesError(404);
  return state(await request(`/${encodeURIComponent(cardId)}`, signal), cardId);
}

/** The star changes only once the server confirms it: the answer must be the state that was asked for. */
export async function setFavorite(cardId: string, favorite: boolean, csrf: string, signal: AbortSignal): Promise<boolean> {
  if (!isCardId(cardId)) throw new FavoritesError(404);
  const confirmed = state(await request(`/${encodeURIComponent(cardId)}`, signal, favorite ? "PUT" : "DELETE", csrf), cardId);
  if (confirmed !== favorite) throw new FavoritesError(0);
  return confirmed;
}

function isFavoriteCard(v: unknown, currency: Currency): v is FavoriteCard {
  return record(v) && typeof v.card_id === "string" && isCardId(v.card_id) && typeof v.favorited_at === "string" && Number.isFinite(Date.parse(v.favorited_at))
    && ((v.price === null && typeof v.reason === "string" && reasons.includes(v.reason)) || (v.reason === null && isQuote(v.price, currency)));
}

export async function fetchFavoriteCards(currency: Currency, signal: AbortSignal): Promise<FavoriteCards> {
  const v = await request(`/cards?currency=${currency}&limit=${MAX_LISTED_FAVORITES}`, signal);
  if (!record(v) || v.currency !== currency || !isRates(v.rates) || !Array.isArray(v.results) || v.results.length > MAX_LISTED_FAVORITES
    || !v.results.every((row) => isFavoriteCard(row, currency)) || typeof v.total !== "number" || !Number.isSafeInteger(v.total)
    || v.total < v.results.length || new Set(v.results.map((row) => (row as FavoriteCard).card_id)).size !== v.results.length) {
    throw new FavoritesError(0);
  }
  return v as FavoriteCards;
}
