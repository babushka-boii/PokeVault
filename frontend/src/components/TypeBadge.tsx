import { useLocale } from "../i18n/LocaleProvider";
import type { PokemonType } from "../services/pokemon";
import "./typeBadge.css";

// Original geometric symbols; no game artwork or fixed-language image labels.
const symbols: Record<PokemonType, string> = {
  normal: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
  fire: "M13 2c2 6-4 6-1 10 2-1 4-3 4-5 6 7 4 15-4 15S2 12 7 7c-1 4 1 5 2 5-2-4 3-6 4-10",
  water: "M12 2C9 7 4 11 4 15a8 8 0 0 0 16 0c0-4-5-8-8-13m-4 13a4 4 0 0 0 4 4v-2a2 2 0 0 1-2-2z",
  electric: "M14 2 5 13h6l-1 9 10-13h-7z",
  grass: "M21 3C8 1 2 7 4 16l3 3C18 22 22 12 21 3M5 21 17 8l-8 6z",
  ice: "m11 1 2 0v7l5-4 1 2-5 4 7 1v2l-7 1 5 4-1 2-5-4v7h-2v-7l-5 4-1-2 5-4-7-1v-2l7-1-5-4 1-2 5 4z",
  fighting: "M4 10V7h3V4h3V2h4v3h3v3h3v9l-4 5H8l-4-7z",
  poison: "M7 3h10l4 8-4 6h-3v3h3v2H7v-2h3v-3H7l-4-6zm1 6v4h3V9zm6 0v4h3V9z",
  ground: "M2 18 8 5l4 9 4-12 6 16zm0 3h20v2H2z",
  flying: "M2 5h20l-5 4H8l-2 3h12l-5 4H8l-4 5-2-2 5-8H2z",
  psychic: "M12 2a10 10 0 1 1-8 16l2-2a7 7 0 1 0 0-8c-2 3-1 6 2 7s6-1 5-4c-1-2-3-1-3 0H8c0-5 7-5 8 0 1 6-6 10-11 6C-1 12 3 2 12 2",
  bug: "m6 2 4 4h4l4-4 2 2-4 4 4 3v7l-6 4h-4l-6-4v-7l4-3-4-4zm5 9v8h2v-8z",
  rock: "m8 2 9 2 5 10-6 8H7l-5-8zm2 3-5 9 4 5h6l4-6-4-7z",
  ghost: "M3 21V11a9 9 0 0 1 18 0v11l-5-3-4 3-4-3zm4-11v4h3v-4zm7 0v4h3v-4z",
  dragon: "m2 20 4-5-2-7 7 2 4-7 7-1-4 5 3 5-4 1 1 6-7 3zm10-7 3 2 2-4z",
  dark: "M15 2a10 10 0 1 1-10 17c10 3 15-8 10-17",
  steel: "m6 2 12 0 6 10-6 10H6L0 12zm6 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  fairy: "m12 1 3 7 7 3-7 3-3 9-3-9-7-3 7-3zm7 16 1 3 3 1-3 1-1 2-1-2-2-1 2-1z",
};

export function TypeBadge({ type }: { type: PokemonType }) {
  const { dictionary } = useLocale();
  return <span className={`type-badge type-badge--${type}`} data-type={type}>
    <span className="type-badge-symbol" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false"><path fillRule="evenodd" d={symbols[type]} /></svg>
    </span>
    <span className="type-badge-label">{dictionary.pokemonTypes[type]}</span>
  </span>;
}
