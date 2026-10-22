import { useState } from "react";

import { useLocale } from "../i18n/LocaleProvider";
import type { Pokemon } from "../services/pokemon";

export function PokemonCard({ pokemon }: { pokemon: Pokemon }) {
  const { dictionary } = useLocale();
  const [failedSprite, setFailedSprite] = useState<string | null>(null);
  const name = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);

  return (
    <li className="pokemon-card">
      <span className="eyebrow">
        #{String(pokemon.national_dex_number).padStart(3, "0")}
      </span>
      <div className="pokemon-sprite">
        {pokemon.sprite_url && failedSprite !== pokemon.sprite_url ? (
          <img
            src={pokemon.sprite_url}
            alt={name}
            width="96"
            height="96"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailedSprite(pokemon.sprite_url)}
          />
        ) : (
          <span>{dictionary.pokedex.noSprite}</span>
        )}
      </div>
      <h2>{name}</h2>
      <ul className="pokemon-types" aria-label={dictionary.pokedex.types}>
        {pokemon.types.map((type) => (
          <li key={type} className={`pokemon-type pokemon-type--${type}`}>
            {dictionary.pokemonTypes[type]}
          </li>
        ))}
      </ul>
    </li>
  );
}
