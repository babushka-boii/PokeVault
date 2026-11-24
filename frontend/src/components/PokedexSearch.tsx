import { useEffect, useId, useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../i18n/LocaleProvider";
import { searchPokemon, type SpeciesMatch } from "../services/pokemon";
import { dexNumber, pokemonName } from "./pokemon/pokemonLabels";

type SearchState = { kind: "error" } | { kind: "loaded"; matches: SpeciesMatch[] };

/**
 * Species search by name or National Dex number. Typing waits 300 ms, an older response
 * never replaces a newer one, and each result links to the species' TCG gallery.
 */
export function PokedexSearch() {
  const { dictionary } = useLocale();
  const text = dictionary.pokedex;
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ query: string; attempt: number; state: SearchState }>();
  const id = useId();
  const normalized = query.trim();

  useEffect(() => {
    if (!normalized || normalized.length > 40) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPokemon(normalized, controller.signal).then(
        (matches) => { if (!controller.signal.aborted) setResult({ query: normalized, attempt, state: { kind: "loaded", matches } }); },
        () => { if (!controller.signal.aborted) setResult({ query: normalized, attempt, state: { kind: "error" } }); },
      );
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [normalized, attempt]);

  const current = result && result.query === normalized && result.attempt === attempt ? result.state : undefined;
  const matches = current?.kind === "loaded" ? current.matches : [];
  return <div className="pokedex-search" role="search">
    <label htmlFor={`${id}-field`}>{text.searchLabel}</label>
    <div className="pokedex-search__field">
      <input id={`${id}-field`} type="search" autoComplete="off" maxLength={40} value={query} placeholder={text.searchPlaceholder}
        aria-controls={normalized ? `${id}-results` : undefined} onChange={(event) => setQuery(event.target.value)} />
      {query && <button type="button" aria-label={text.searchClear} onClick={() => setQuery("")}>×</button>}
    </div>
    {normalized && !current && <p role="status">{text.searchLoading}</p>}
    {current?.kind === "error" && <div><p role="alert">{text.searchError}</p>
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>{dictionary.status.retry}</button></div>}
    {current?.kind === "loaded" && matches.length === 0 && <p role="status">{text.searchEmpty}</p>}
    {matches.length > 0 && <ul id={`${id}-results`} className="pokedex-search__results" aria-label={text.searchResults}>
      {matches.map((match) => <li key={match.national_dex_number}>
        <Link className="tcg-action" to={`/pokemon/${match.national_dex_number}/cards?returnTo=%2Fpokedex`}>
          <span>{dexNumber(match)}</span> {pokemonName(match)}
        </Link>
      </li>)}
    </ul>}
  </div>;
}
