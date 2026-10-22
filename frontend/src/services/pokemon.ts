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
export type PokemonList = { results: Pokemon[] };

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(
  /\/$/,
  "",
);

export async function fetchPokemon(signal?: AbortSignal): Promise<PokemonList> {
  const response = await fetch(`${apiBaseUrl}/api/v1/pokemon`, {
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
  return value.results.length <= 20 && value.results.every((item: unknown) => {
    if (!isPokemon(item) || numbers.has(item.national_dex_number)) return false;
    numbers.add(item.national_dex_number);
    return true;
  });
}

function isPokemon(value: unknown): value is Pokemon {
  if (typeof value !== "object" || value === null) return false;
  const pokemon = value as Record<string, unknown>;
  return (
    typeof pokemon.national_dex_number === "number" &&
    Number.isInteger(pokemon.national_dex_number) &&
    pokemon.national_dex_number >= 1 && pokemon.national_dex_number <= 20 &&
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
