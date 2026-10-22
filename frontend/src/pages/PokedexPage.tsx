import { useEffect, useState } from "react";

import { PokemonCard } from "../components/PokemonCard";
import { useLocale } from "../i18n/LocaleProvider";
import { fetchPokemon, type PokemonList } from "../services/pokemon";

type CatalogState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; catalog: PokemonList };

export function PokedexPage() {
  const { dictionary } = useLocale();
  const [state, setState] = useState<CatalogState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchPokemon(controller.signal).then(
      (catalog) => {
        if (!controller.signal.aborted) setState({ kind: "loaded", catalog });
      },
      () => {
        if (!controller.signal.aborted) setState({ kind: "error" });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  function retry() {
    setState({ kind: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <section className="panel" aria-labelledby="pokedex-title">
      <h1 id="pokedex-title">{dictionary.pokedex.title}</h1>
      <p>{dictionary.pokedex.description}</p>
      {state.kind === "loading" && <p role="status">{dictionary.pokedex.loading}</p>}
      {state.kind === "error" && (
        <div className="system-status--degraded">
          <p role="alert">{dictionary.pokedex.error}</p>
          <button className="status-retry" type="button" onClick={retry}>
            {dictionary.status.retry}
          </button>
        </div>
      )}
      {state.kind === "loaded" && (
        state.catalog.results.length === 0 ? (
          <p role="status">{dictionary.pokedex.empty}</p>
        ) : (
          <ul className="pokedex-grid" aria-label={dictionary.pokedex.title}>
            {state.catalog.results.map((pokemon) => (
              <PokemonCard key={pokemon.national_dex_number} pokemon={pokemon} />
            ))}
          </ul>
        )
      )}
    </section>
  );
}
