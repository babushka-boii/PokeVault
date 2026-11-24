import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { PokedexSearch } from "../components/PokedexSearch";
import { PokemonCard } from "../components/PokemonCard";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { BOX_SIZE, fetchPokemonPage, NATIONAL_DEX_TOTAL } from "../services/pokemon";

const TOTAL_PAGES = Math.ceil(NATIONAL_DEX_TOTAL / BOX_SIZE);

/** `?page=` is 1..35; anything else (missing, malformed, out of range) is the first page. */
function pageNumber(raw: string | null) {
  if (!raw || !/^[1-9]\d{0,2}$/.test(raw)) return 1;
  const value = Number(raw);
  return value <= TOTAL_PAGES ? value : 1;
}
const pageLink = (page: number) => (page === 1 ? "/pokedex" : `/pokedex?page=${page}`);

export function PokedexPage() {
  const { dictionary } = useLocale();
  const text = dictionary.pokedex;
  const [params] = useSearchParams();
  const page = pageNumber(params.get("page"));
  const request = useCallback((signal: AbortSignal) => fetchPokemonPage((page - 1) * BOX_SIZE, signal), [page]);
  const { state, retry } = useTcgResource(String(page), request);

  return (
    <section className="panel" aria-labelledby="pokedex-title">
      <h1 id="pokedex-title">{text.title}</h1>
      <p>{text.description}</p>
      <PokedexSearch />
      {state.kind === "loading" && <p role="status">{text.loading}</p>}
      {state.kind === "error" && (
        <div className="system-status--degraded">
          <p role="alert">{text.error}</p>
          <button className="status-retry" type="button" onClick={retry}>
            {dictionary.status.retry}
          </button>
        </div>
      )}
      {state.kind === "loaded" && (
        state.data.results.length === 0 ? (
          <p role="status">{text.empty}</p>
        ) : (
          <ul className="pokedex-grid" aria-label={text.title}>
            {state.data.results.map((pokemon) => (
              <PokemonCard key={pokemon.national_dex_number} pokemon={pokemon} returnTo={pageLink(page)} />
            ))}
          </ul>
        )
      )}
      {/* A labelled group, not a <nav>: the shell has exactly one navigation landmark. */}
      <div className="pokedex-pager" role="group" aria-label={text.pages}>
        {page > 1 && <Link className="tcg-action" to={pageLink(page - 1)}>{text.previous}</Link>}
        <span>{text.pageOf.replace("{page}", String(page)).replace("{total}", String(TOTAL_PAGES))}</span>
        {page < TOTAL_PAGES && <Link className="tcg-action" to={pageLink(page + 1)}>{text.next}</Link>}
      </div>
    </section>
  );
}
