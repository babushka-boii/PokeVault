import { setCards, setSummary } from "./setFixtures";

export const scanClues = { name: "Pikachu & Zekrom-GX", local_number: "033", printed_total: 80,
  set_id: "sm9", set_hint: "Team Up", category: "Pokemon" as const, language: "en" as const };
export const scanCandidate = { card: setCards[0], set: setSummary, quality: "strong", evidence: ["name_exact", "number_exact", "set_exact"] };
export const scanCapabilities = { available: true, languages: ["eng", "spa"], formats: ["image/jpeg", "image/png", "image/webp"], max_upload_bytes: 8388608 };
export const scanResult = { clues: scanClues, candidates: [scanCandidate], status: "matches", limited: false, warnings: [] };
export const recognizeResult = { ...scanResult, engine_languages: ["eng", "spa"] };
export const scannedCopy = { id: "00000000-0000-4000-8000-000000000001", card_id: "sm9-33", condition: "unknown", language: "en", variant: "unknown", acquired_on: null, notes: "",
  created_at: "2026-11-10T12:00:00Z", updated_at: "2026-11-10T12:00:00Z" };
