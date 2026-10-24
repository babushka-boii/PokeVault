import { isPokemon, type Pokemon } from "./pokemon";
import type { Locale } from "../i18n/LocaleProvider";

type ContentLanguage = Locale | null;
export type PokemonDetails = Pokemon & {
  name_language: ContentLanguage;
  height_m: number;
  weight_kg: number;
  abilities: { name: string; is_hidden: boolean; language: ContentLanguage }[];
  description: string | null;
  description_language: ContentLanguage;
};

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const isLanguage = (value: unknown): value is ContentLanguage => value === "es" || value === "en" || value === null;

export async function fetchPokemonDetails(number: number, language: Locale, signal?: AbortSignal): Promise<PokemonDetails> {
  const response = await fetch(`${apiBaseUrl}/api/v1/pokemon/${number}?language=${language}`, {
    headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) throw new Error("Pokemon details unavailable");
  const data: unknown = await response.json();
  if (!isPokemon(data) || data.national_dex_number !== number) throw new Error("Invalid Pokemon details");
  const details = data as Record<string, unknown>;
  if (!isLanguage(details.name_language) ||
    typeof details.height_m !== "number" || !Number.isFinite(details.height_m) || details.height_m < 0 ||
    typeof details.weight_kg !== "number" || !Number.isFinite(details.weight_kg) || details.weight_kg < 0 ||
    !(details.description === null || typeof details.description === "string") ||
    !isLanguage(details.description_language) || !Array.isArray(details.abilities) ||
    !details.abilities.every((ability: unknown) => {
      if (typeof ability !== "object" || ability === null) return false;
      const row = ability as Record<string, unknown>;
      return typeof row.name === "string" && !!row.name.trim() && typeof row.is_hidden === "boolean" && isLanguage(row.language);
    })) throw new Error("Invalid Pokemon details");
  return data as PokemonDetails;
}
