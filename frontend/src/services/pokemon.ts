export const pokemonTypes = [
  "normal", "fire", "water", "electric", "grass", "ice", "fighting", "poison",
  "ground", "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy",
] as const;

export type PokemonType = typeof pokemonTypes[number];
export type Pokemon = {
  national_dex_number: number;
  name: string;
  types: PokemonType[];
  sprite_url: string | null;
};
export const NATIONAL_DEX_TOTAL = 1025;
export const BOX_SIZE = 30;

export type PokemonList = { results: Pokemon[] };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export async function fetchPokemonPage(offset: number, signal?: AbortSignal): Promise<PokemonList> {
  return requestPokemon(`?offset=${offset}&limit=${BOX_SIZE}`, signal);
}

async function requestPokemon(query: string, signal?: AbortSignal): Promise<PokemonList> {
  const response = await fetch(`${apiBaseUrl}/api/v1/pokemon${query}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("Pokemon catalog is unavailable");
  const payload: unknown = await response.json();
  if (!isPokemonList(payload)) throw new Error("Invalid Pokemon catalog");
  return payload;
}

function isPokemonList(value: unknown): value is PokemonList {
  if (
    typeof value !== "object" || value === null ||
    !("results" in value) || !Array.isArray(value.results)
  ) return false;

  const numbers = new Set<number>();
  return value.results.length <= BOX_SIZE && value.results.every((item: unknown) => {
    if (!isPokemon(item) || numbers.has(item.national_dex_number)) return false;
    numbers.add(item.national_dex_number);
    return true;
  });
}

export function isPokemon(value: unknown): value is Pokemon {
  if (typeof value !== "object" || value === null) return false;
  const pokemon = value as Record<string, unknown>;
  return (
    typeof pokemon.national_dex_number === "number" &&
    Number.isInteger(pokemon.national_dex_number) &&
    pokemon.national_dex_number >= 1 && pokemon.national_dex_number <= NATIONAL_DEX_TOTAL &&
    typeof pokemon.name === "string" && pokemon.name.trim().length > 0 &&
    Array.isArray(pokemon.types) && pokemon.types.length >= 1 && pokemon.types.length <= 2 &&
    pokemon.types.every((type: unknown) => pokemonTypes.some((known) => known === type)) &&
    (pokemon.sprite_url === null || (
      typeof pokemon.sprite_url === "string" && isHttpsUrl(pokemon.sprite_url)
    ))
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}


export type SpeciesMatch = Pick<Pokemon, "national_dex_number" | "name">;

export async function searchPokemon(query: string, signal?: AbortSignal): Promise<SpeciesMatch[]> {
  const response = await fetch(`${apiBaseUrl}/api/v1/pokemon/search?q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) throw new Error("Pokemon search unavailable");
  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null || !("results" in payload) ||
    !Array.isArray(payload.results) || payload.results.length > 8 ||
    !payload.results.every((item: unknown) => {
      if (typeof item !== "object" || item === null) return false;
      const match = item as Record<string, unknown>;
      return typeof match.name === "string" && match.name.length > 0 &&
        typeof match.national_dex_number === "number" && Number.isInteger(match.national_dex_number) &&
        match.national_dex_number >= 1 && match.national_dex_number <= NATIONAL_DEX_TOTAL;
    })) throw new Error("Invalid search response");
  return payload.results as SpeciesMatch[];
}

// --- The species index (Iteration 9B): all 1025 species, from a fixed file served by the API ---

export type SpeciesRow = { national_dex_number: number; name_en: string; name_es: string; types: PokemonType[] };

export type Generation = { id: number; roman: string; from: number; to: number; region: { es: string; en: string } };
/** The nine generations by National Dex range (fixed: a tenth would need new ranges here). */
export const GENERATIONS: readonly Generation[] = [
  { id: 1, roman: "I", from: 1, to: 151, region: { es: "Kanto", en: "Kanto" } },
  { id: 2, roman: "II", from: 152, to: 251, region: { es: "Johto", en: "Johto" } },
  { id: 3, roman: "III", from: 252, to: 386, region: { es: "Hoenn", en: "Hoenn" } },
  { id: 4, roman: "IV", from: 387, to: 493, region: { es: "Sinnoh", en: "Sinnoh" } },
  { id: 5, roman: "V", from: 494, to: 649, region: { es: "Teselia", en: "Unova" } },
  { id: 6, roman: "VI", from: 650, to: 721, region: { es: "Kalos", en: "Kalos" } },
  { id: 7, roman: "VII", from: 722, to: 809, region: { es: "Alola", en: "Alola" } },
  { id: 8, roman: "VIII", from: 810, to: 905, region: { es: "Galar", en: "Galar" } },
  { id: 9, roman: "IX", from: 906, to: 1025, region: { es: "Paldea", en: "Paldea" } },
];

function valid(number: number) {
  if (!Number.isInteger(number) || number < 1 || number > NATIONAL_DEX_TOTAL) throw new RangeError("Not a National Dex number");
  return number;
}
export function generationOf(number: number): Generation {
  valid(number);
  return GENERATIONS.find((generation) => number >= generation.from && number <= generation.to)!;
}

const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
/** Image addresses are built only from a validated whole number: nothing else can reach them. */
export const spriteUrl = (number: number) => `${SPRITES}/${valid(number)}.png`;
export const artworkUrl = (number: number) => `${SPRITES}/other/official-artwork/${valid(number)}.png`;
/** The Black/White animated sprite exists for #1-649 only. */
export const animatedSpriteUrl = (number: number) => valid(number) <= 649 ? `${SPRITES}/versions/generation-v/black-white/animated/${number}.gif` : null;

/** Lower case, no accents or punctuation; ♀ and ♂ become f and m (same rule as the API). */
export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/♀/g, "f").replace(/♂/g, "m").normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
}

/** Name (either language) or number search over the loaded index: no request while typing. */
export function searchSpecies(rows: readonly SpeciesRow[], query: string, limit = Infinity): SpeciesRow[] {
  const text = query.trim();
  const numeric = text.replace(/^#/, "");
  const number = /^\d+$/.test(numeric) ? Number(numeric) : null;
  if (number !== null && (number < 1 || number > NATIONAL_DEX_TOTAL)) return [];
  const wanted = normalizeName(text);
  if (!wanted) return [];
  const found: { exact: boolean; row: SpeciesRow }[] = [];
  for (const row of rows) {
    if (number !== null) { if (row.national_dex_number === number) found.push({ exact: true, row }); continue; }
    const names = [normalizeName(row.name_en), normalizeName(row.name_es)];
    if (names.some((name) => name.includes(wanted))) found.push({ exact: names.includes(wanted), row });
  }
  found.sort((a, b) => Number(b.exact) - Number(a.exact) || a.row.national_dex_number - b.row.national_dex_number);
  return found.slice(0, limit).map((item) => item.row);
}

export function isSpeciesRow(value: unknown): value is SpeciesRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const name = (text: unknown) => typeof text === "string" && text.trim().length > 0;
  return Object.keys(row).length === 4 && typeof row.national_dex_number === "number" && Number.isInteger(row.national_dex_number)
    && row.national_dex_number >= 1 && row.national_dex_number <= NATIONAL_DEX_TOTAL && name(row.name_en) && name(row.name_es)
    && Array.isArray(row.types) && row.types.length >= 1 && row.types.length <= 2 && new Set(row.types).size === row.types.length
    && row.types.every((type) => pokemonTypes.some((known) => known === type));
}
