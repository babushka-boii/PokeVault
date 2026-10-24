import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ExpansionSelector } from "../components/cards/ExpansionSelector";
import { CardPreview } from "../components/cards/CardPreview";
import { TypeBadge } from "../components/TypeBadge";
import { PokemonSprite } from "../components/boxes/PokemonSprite";
import { pokemonName } from "../components/boxes/pokemonLabels";
import { usePokemonDetails } from "../hooks/usePokemonDetails";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { fetchPokemonCards, isSetId, MAX_CARD_PAGE, parsePokemonNumber, safeReturnTo, type CardSort } from "../services/cards";
import "../components/cards/cards.css";

export function PokemonCardsPage() {
  const { number: rawNumber } = useParams();
  const number = parsePokemonNumber(rawNumber);
  const { dictionary, locale } = useLocale();
  const text = dictionary.cards;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPage = searchParams.get("page") ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.min(MAX_CARD_PAGE, Math.max(1, Number(rawPage))) : 1;
  const rawSort = searchParams.get("sort");
  const sort: CardSort = rawSort === "id" || rawSort === "newest" || rawSort === "oldest" ? rawSort : "name";
  const rawSetId = searchParams.get("set_id") ?? "";
  const setId = isSetId(rawSetId) ? rawSetId : "";
  const request = useCallback((signal: AbortSignal) => fetchPokemonCards(number!, locale, { page, sort, setId }, signal), [number, locale, page, sort, setId]);
  const { state, retry } = useTcgResource(number === undefined ? undefined : `${number}:${locale}:${page}:${sort}:${setId}`, request);
  const pokemon = usePokemonDetails(number, locale);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [location.pathname]);
  useEffect(() => {
    if (rawPage === String(page)) return;
    const params = new URLSearchParams(searchParams);
    params.set("page", String(page));
    setSearchParams(params, { replace: true });
  }, [rawPage, page, searchParams, setSearchParams]);

  function pageHref(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
    return `${location.pathname}?${params}`;
  }

  function updateFilter(name: "set_id" | "sort", value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(name, value); else params.delete(name);
    params.set("page", "1");
    setSearchParams(params);
  }

  const knownSets = state.kind === "loaded" ? state.data.sets : [];
  return <section className="panel tcg-page" aria-labelledby="tcg-title">
    <Link className="tcg-back" to={safeReturnTo(searchParams.get("returnTo"))}><span aria-hidden="true">← </span>{text.back}</Link>
    <h1 id="tcg-title" tabIndex={-1} ref={heading}>{text.title}{number !== undefined ? ` · #${String(number).padStart(3, "0")}` : ""}</h1>
    {number === undefined ? <p role="alert">{text.invalidPokemon}</p> : <>
      <section className="tcg-species" aria-label={dictionary.pokemonDetails.info} aria-busy={pokemon.state.kind === "loading"}>
        {pokemon.state.kind === "loading" && <p role="status">{dictionary.pokemonDetails.loading}</p>}
        {pokemon.state.kind === "error" && <div><p role="alert">{dictionary.pokemonDetails.error}</p>
          <button type="button" onClick={pokemon.retry}>{dictionary.pokemonDetails.retry}</button></div>}
        {pokemon.state.kind === "loaded" && <>
          <div className="tcg-species-portrait"><PokemonSprite pokemon={pokemon.state.details} large /></div>
          <div><h2 lang={pokemon.state.details.name_language ?? undefined}>{pokemonName(pokemon.state.details)}</h2>
            <ul className="pokemon-types" aria-label={dictionary.pokedex.types}>
              {pokemon.state.details.types.map((type) => <li key={type}><TypeBadge type={type} /></li>)}
            </ul>
          </div>
        </>}
      </section>
      <p className="tcg-coverage">{text.coverage}</p>
      <div className="tcg-filters">
        <ExpansionSelector key={`${number}:${locale}`} sets={knownSets} selectedId={setId} status={state.kind} onSelect={(id) => updateFilter("set_id", id)} onRetry={retry} />
        <div className="tcg-sort-control"><label htmlFor="tcg-sort">{text.sort}</label>
          <select id="tcg-sort" name="sort" value={sort} onChange={(event) => updateFilter("sort", event.target.value)}>
            <option value="newest">{text.sortNewest}</option><option value="oldest">{text.sortOldest}</option>
            <option value="name">{text.sortName}</option><option value="id">{text.sortId}</option>
          </select>
        </div>
        <button className="tcg-clear-filters" type="button" onClick={() => {
          const params = new URLSearchParams(searchParams); params.delete("set_id"); params.delete("sort"); params.set("page", "1"); setSearchParams(params);
        }}>{text.clear}</button>
      </div>
      <div className="tcg-results" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && <><p role="status">{text.loading}</p><div className="tcg-skeletons" aria-hidden="true">{[0, 1, 2, 3].map((value) => <div key={value} className="tcg-artwork tcg-artwork--loading" />)}</div></>}
        {state.kind === "error" && <div className="system-status--degraded"><p role="alert">{text.error}</p><button type="button" onClick={retry}>{text.retry}</button></div>}
        {state.kind === "loaded" && <>
          {state.data.results.length === 0 ? <p role="status">{text.empty}</p> :
            <ul className="tcg-grid" aria-label={text.title}>{state.data.results.map((card) => <CardPreview key={card.id} card={card} returnTo={`${location.pathname}${location.search}`} />)}</ul>}
          <nav className="tcg-pagination" aria-label={text.title}>
            {page > 1 ? <Link to={pageHref(page - 1)}>{text.previous}</Link> : <span aria-disabled="true">{text.previous}</span>}
            <span>{text.page} {page}</span>
            {state.data.has_more && page < MAX_CARD_PAGE ? <Link to={pageHref(page + 1)}>{text.next}</Link> : <span aria-disabled="true">{text.next}</span>}
          </nav>
        </>}
      </div>
      <p className="tcg-source">{text.source}</p>
    </>}
  </section>;
}
