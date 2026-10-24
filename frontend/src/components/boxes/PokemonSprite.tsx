import { useState } from "react";
import type { Pokemon } from "../../services/pokemon";
import { useLocale } from "../../i18n/LocaleProvider";

export function PokemonSprite({ pokemon, large = false }: { pokemon: Pokemon; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const { dictionary } = useLocale();
  return pokemon.sprite_url && failed !== pokemon.sprite_url
    ? <img src={pokemon.sprite_url} alt="" width={large ? 192 : 48} height={large ? 192 : 48}
        draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(pokemon.sprite_url)} />
    : <span className="pc-missing" title={dictionary.pokedex.noSprite} aria-label={dictionary.pokedex.noSprite}>◇</span>;
}
