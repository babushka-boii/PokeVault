import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { Pokemon } from "../../services/pokemon";
import { usePokemonDetails } from "../../hooks/usePokemonDetails";
import { TypeBadge } from "../TypeBadge";
import { PokemonSprite } from "./PokemonSprite";
import { dexNumber, pokemonName } from "./pokemonLabels";

export function SelectedPokemon({ pokemon, cardCatalogHref }: { pokemon?: Pokemon; cardCatalogHref?: string }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.pokemonDetails;
  const { state, retry } = usePokemonDetails(pokemon?.national_dex_number, locale);
  const details = state.kind === "loaded" ? state.details : undefined;
  const display = details ?? pokemon;
  const format = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  return <aside className="pc-details" aria-label={dictionary.boxes.selected}>
    <p className="pc-caption">{dictionary.boxes.selected}</p>
    {display ? <>
      <div className="pc-portrait"><PokemonSprite pokemon={display} large /></div>
      <div className="pc-details-heading">
        <p className="eyebrow">{dexNumber(display)}</p>
        <h2>{pokemonName(display)}</h2>
        <ul className="pokemon-types" aria-label={dictionary.pokedex.types}>
          {display.types.map((type) => <li key={type}><TypeBadge type={type} /></li>)}
        </ul>
        {cardCatalogHref && <Link className="tcg-action" to={cardCatalogHref}>{dictionary.cards.view}</Link>}
      </div>
      <div className="pc-facts" role="region" tabIndex={0} aria-label={text.info} aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && <p role="status">{text.loading}</p>}
        {state.kind === "error" && <div><p role="alert">{text.error}</p>
          <button type="button" onClick={retry}>{text.retry}</button></div>}
        {details && <>
          <dl className="pc-measures">
            <div><dt>{text.height}</dt><dd>{format(details.height_m)} m</dd></div>
            <div><dt>{text.weight}</dt><dd>{format(details.weight_kg)} kg</dd></div>
          </dl>
          <dl className="pc-abilities">
            <div><dt>{text.abilities}</dt><dd>{details.abilities.filter((ability) => !ability.is_hidden).map((ability, index) =>
              <span key={index} lang={ability.language ?? undefined}>{ability.name}</span>)}
              {!details.abilities.some((ability) => !ability.is_hidden) && text.unavailable}</dd></div>
            <div><dt>{text.hiddenAbility}</dt><dd>{details.abilities.filter((ability) => ability.is_hidden).map((ability, index) =>
              <span key={index} lang={ability.language ?? undefined}>{ability.name}</span>)}
              {!details.abilities.some((ability) => ability.is_hidden) && text.unavailable}</dd></div>
          </dl>
          <section className="pc-description" aria-label={text.description}>
            <h3>{text.description}</h3>
            <p lang={details.description_language ?? undefined}>{details.description ?? text.noDescription}</p>
            {details.description_language && details.description_language !== locale && <p className="pc-language-note">{text.englishFallback}</p>}
            <p className="pc-source">{text.source}</p>
          </section>
        </>}
      </div>
    </> : <p>{dictionary.boxes.choose}</p>}
  </aside>;
}
