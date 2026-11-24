import type { SpeciesMatch } from "../../services/pokemon";

export const pokemonName = (pokemon: SpeciesMatch) => pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);
export const dexNumber = (pokemon: SpeciesMatch) => `#${String(pokemon.national_dex_number).padStart(3, "0")}`;

