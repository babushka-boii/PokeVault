import type { Locale } from "../i18n/LocaleProvider";
import { isSetId } from "./cards";
import { isSetCard, isSetSummary, type SetCard, type SetSummary } from "./sets";

export type ScanClues = { name: string; local_number: string; printed_total: number | null; set_id: string | null;
  set_hint: string; category: "Pokemon" | "Trainer" | "Energy" | null; language: Locale | null };
export type ScanEvidence = "name_exact" | "name_similar" | "number_exact" | "set_exact" | "printed_total" | "visual_features";
export type ScanCandidate = { card: SetCard; set: SetSummary; quality: "strong" | "possible" | "uncertain"; evidence: ScanEvidence[] };
export type MatchResult = { clues: ScanClues; candidates: ScanCandidate[]; status: "matches" | "no_match" | "insufficient_clues"; limited: boolean; warnings: string[] };
export type RecognizeResult = MatchResult & { engine_languages: ("eng" | "spa")[] };
export type ScanCapabilities = { available: boolean; languages: ("eng" | "spa")[]; formats: string[]; max_upload_bytes: number };
export class ScanError extends Error {
  constructor(public readonly status: number, public readonly code = "unavailable") { super("Scanner request failed"); }
}
const base = `${(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "")}/api/v1/scans`;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === "string" && value.length <= max &&
  !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
const language = (value: unknown) => value === "en" || value === "es";
const engineLanguages = (value: unknown): boolean => Array.isArray(value) && value.length <= 2 && value.every((v) => v === "eng" || v === "spa") && new Set(value).size === value.length;
const evidence = ["name_exact", "name_similar", "number_exact", "set_exact", "printed_total", "visual_features"];
export const scanImageFormats = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** The filename is only a media-type hint; the server validates the original bytes. */
export function scanImageType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };
  return extension ? types[extension] ?? "" : "";
}

function isClues(value: unknown): value is ScanClues {
  return record(value) && text(value.name, 100) && text(value.local_number, 20) && text(value.set_hint, 100) &&
    (value.printed_total === null || (typeof value.printed_total === "number" && Number.isSafeInteger(value.printed_total) && value.printed_total >= 1 && value.printed_total <= 2000)) &&
    (value.set_id === null || (typeof value.set_id === "string" && isSetId(value.set_id))) &&
    (value.category === null || ["Pokemon", "Trainer", "Energy"].includes(value.category as string)) && (value.language === null || language(value.language));
}
function isCandidate(value: unknown): value is ScanCandidate {
  return record(value) && isSetCard(value.card) && isSetSummary(value.set) && ["strong", "possible", "uncertain"].includes(value.quality as string) &&
    Array.isArray(value.evidence) && value.evidence.length <= evidence.length && value.evidence.every((code) => evidence.includes(code));
}
function isResult(value: unknown): value is MatchResult {
  return record(value) && isClues(value.clues) && Array.isArray(value.candidates) && value.candidates.length <= 8 && value.candidates.every(isCandidate) &&
    new Set(value.candidates.map((candidate) => candidate.card.id)).size === value.candidates.length &&
    (value.status === "matches" ? value.candidates.length > 0 : ["no_match", "insufficient_clues"].includes(value.status as string) && value.candidates.length === 0) &&
    typeof value.limited === "boolean" && Array.isArray(value.warnings) && value.warnings.length <= 16 && value.warnings.every((warning) => text(warning, 100));
}
async function request(path: string, options: RequestInit): Promise<unknown> {
  const response = await fetch(base + path, { ...options, credentials: "include", cache: "no-store" });
  if (!response.ok) {
    let code = "unavailable";
    try { const payload: unknown = await response.json(); if (record(payload) && typeof payload.detail === "string" && /^[a-z_]{1,64}$/.test(payload.detail)) code = payload.detail; } catch { /* An empty error body still has a useful HTTP status. */ }
    throw new ScanError(response.status, code);
  }
  try { return await response.json(); } catch { throw new ScanError(0); }
}
export async function fetchScanCapabilities(signal: AbortSignal): Promise<ScanCapabilities> {
  const payload = await request("/capabilities", { signal, headers: { Accept: "application/json" } });
  if (!record(payload) || typeof payload.available !== "boolean" || !engineLanguages(payload.languages) ||
    (payload.available && (payload.languages as unknown[]).length === 0) || !Array.isArray(payload.formats) || payload.formats.length < 2 || payload.formats.length > scanImageFormats.length ||
    !payload.formats.includes("image/jpeg") || !payload.formats.includes("image/png") || payload.formats.some((type) => !scanImageFormats.includes(type)) ||
    !Number.isSafeInteger(payload.max_upload_bytes) || (payload.max_upload_bytes as number) < 1 || (payload.max_upload_bytes as number) > 8388608) throw new ScanError(0);
  return payload as ScanCapabilities;
}
export async function recognizeScan(file: File, locale: Locale, csrf: string, signal: AbortSignal): Promise<RecognizeResult> {
  if (!csrf) throw new ScanError(401);
  const type = scanImageType(file);
  if (!scanImageFormats.includes(type)) throw new ScanError(415);
  const payload = await request(`/recognize?language=${locale}`, { method: "POST", body: file, signal,
    headers: { Accept: "application/json", "Content-Type": type, "X-CSRF-Token": csrf } });
  const languages = record(payload) ? payload.engine_languages : undefined;
  if (!isResult(payload) || !engineLanguages(languages) || (languages as unknown[]).length === 0) throw new ScanError(0);
  return payload as RecognizeResult;
}
export async function matchScan(clues: ScanClues, locale: Locale, csrf: string, signal: AbortSignal): Promise<MatchResult> {
  if (!csrf) throw new ScanError(401);
  if (!isClues(clues)) throw new ScanError(422);
  const payload = await request("/match", { method: "POST", signal,
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-CSRF-Token": csrf }, body: JSON.stringify({ clues, language: locale }) });
  if (!isResult(payload)) throw new ScanError(0);
  return payload;
}
