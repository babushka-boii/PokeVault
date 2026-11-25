import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { Link, Navigate, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { CardPreview } from "../components/cards/CardPreview";
import { ExpansionSelector } from "../components/cards/ExpansionSelector";
import { plural } from "../components/home/plural";
import { SpeciesSprite } from "../components/pokedex/SpeciesTile";
import { formatMoney } from "../components/prices/format";
import { useCurrency } from "../components/prices/currency";
import { RatesAttribution } from "../components/prices/PriceDisplay";
import { TypeBadge } from "../components/TypeBadge";
import { Button } from "../components/ui/Button";
import { InlineError } from "../components/ui/InlineError";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { usePokemonDetails } from "../hooks/usePokemonDetails";
import { useStarState } from "../hooks/useStarState";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { isSetId, MAX_CARD_PAGE, parsePokemonNumber, safeReturnTo, type CardSort } from "../services/cards";
import { artworkUrl, generationOf, NATIONAL_DEX_TOTAL } from "../services/pokemon";
import { fetchSpeciesCards, fetchSpeciesCollection, fetchSpeciesIndex, type Show } from "../services/species";
import "../components/cards/cards.css";
import "../components/pokedex/pokedex.css";

const pad = (n: number) => `#${String(n).padStart(3, "0")}`;
const SHOWS: Show[] = ["all", "owned", "missing"];

/** `/pokemon/:n/cards` was the old gallery: it now opens the species sheet with the same filters. */
export function SpeciesGalleryRedirect() {
  const { number } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/pokemon/${number}${search}`} replace />;
}

export function SpeciesPage() {
  const { number: rawNumber } = useParams();
  const number = parsePokemonNumber(rawNumber);
  const { dictionary, locale } = useLocale();
  const text = dictionary.pokedex;
  const cardText = dictionary.cards;
  const auth = useAuth();
  const signedIn = auth.status === "authenticated" && !auth.loggingOut && !auth.validating;
  const userId = signedIn ? auth.user.id : "";
  const { currency, ready } = useCurrency();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const rawPage = params.get("page") ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.min(MAX_CARD_PAGE, Math.max(1, Number(rawPage))) : 1;
  const rawSort = params.get("sort");
  const sort: CardSort = rawSort === "id" || rawSort === "newest" || rawSort === "oldest" ? rawSort : "name";
  const setId = isSetId(params.get("set_id") ?? "") ? params.get("set_id")! : "";
  const rawShow = SHOWS.find((known) => known === params.get("show")) ?? "all";
  const show: Show = signedIn ? rawShow : "all";
  const returnTo = safeReturnTo(params.get("returnTo"));

  const index = useTcgResource(number === undefined ? undefined : "species-index", fetchSpeciesIndex);
  const details = usePokemonDetails(number, locale);
  const collectionRequest = useCallback((signal: AbortSignal) => fetchSpeciesCollection(number!, currency, signal), [number, currency]);
  const collection = useTcgResource(signedIn && number !== undefined && ready ? `collection:${userId}:${number}:${currency}` : undefined, collectionRequest);
  const cardsRequest = useCallback((signal: AbortSignal) => fetchSpeciesCards(number!, locale, { page, sort, show, setId: setId || undefined, guest: !signedIn }, signal),
    [number, locale, page, sort, show, setId, signedIn]);
  const cards = useTcgResource(number === undefined ? undefined : `cards:${userId}:${number}:${locale}:${page}:${sort}:${show}:${setId}`, cardsRequest);
  const pageCards = cards.state.kind === "loaded" ? cards.state.data.results : [];
  const stars = useStarState(pageCards.map((card) => card.id), signedIn && cards.state.kind === "loaded");

  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [location.pathname]);
  useEffect(() => {
    if (rawPage === String(page)) return;
    const next = new URLSearchParams(params); next.set("page", String(page)); setParams(next, { replace: true });
  }, [rawPage, page, params, setParams]);
  useEffect(() => {
    if (params.get("show") && !signedIn && auth.status !== "loading" && !auth.validating) { const next = new URLSearchParams(params); next.delete("show"); setParams(next, { replace: true }); }
  }, [params, signedIn, auth.status, auth.validating, setParams]);

  if (number === undefined) return <section className="pv-dex" aria-labelledby="species-title">
    <h1 id="species-title" tabIndex={-1} ref={heading}>{text.gridTitle}</h1>
    <p role="alert">{text.invalidSpecies}</p><Link to="/pokedex">{text.backToPokedex}</Link>
  </section>;

  const rows = index.state.kind === "loaded" ? index.state.data : [];
  const row = rows[number - 1];
  const previous = number > 1 ? rows[number - 2] : undefined;
  const next = number < NATIONAL_DEX_TOTAL ? rows[number] : undefined;
  const name = details.state.kind === "loaded" && details.state.details.name ? (row ? (locale === "es" ? row.name_es : row.name_en) : details.state.details.name) : row ? (locale === "es" ? row.name_es : row.name_en) : pad(number);
  const types = row?.types ?? (details.state.kind === "loaded" ? details.state.details.types : []);
  const generation = generationOf(number);
  const rowName = (r: { name_es: string; name_en: string }) => (locale === "es" ? r.name_es : r.name_en);
  const owned = collection.state.kind === "loaded" ? collection.state.data : null;
  const cardOwned = (id: string) => cards.state.kind === "loaded" && signedIn ? cards.state.data.owned_ids.includes(id) : undefined;

  function update(change: Record<string, string>) {
    const out = new URLSearchParams(params);
    for (const [key, value] of Object.entries(change)) { if (value) out.set(key, value); else out.delete(key); }
    out.set("page", "1");
    setParams(out);
  }
  const pageHref = (target: number) => { const out = new URLSearchParams(params); out.set("page", String(target)); return `${location.pathname}?${out}`; };
  const sheetUrl = `${location.pathname}${location.search}`;
  const knownSets = cards.state.kind === "loaded" ? cards.state.data.sets : [];
  const filtered = Boolean(setId || show !== "all");
  const star = (id: string) => signedIn ? { starred: stars.starred(id), ready: stars.ready(id), pending: stars.pending(id), onToggle: () => void stars.toggle(id) } : undefined;

  return <section className="pv-dex pv-species" aria-labelledby="species-title">
    <div className="pv-species__bar">
      <Link className="tcg-back" to={returnTo}><span aria-hidden="true">← </span>{returnTo.startsWith("/pokedex") ? text.backToPokedex : cardText.back}</Link>
      <div className="pv-species__siblings">
        {previous && <Link to={`/pokemon/${previous.national_dex_number}?${new URLSearchParams({ returnTo })}`} aria-label={text.previousSpecies.replace("{number}", pad(previous.national_dex_number)).replace("{name}", rowName(previous))}>
          <span aria-hidden="true">‹ {pad(previous.national_dex_number)} {rowName(previous)}</span></Link>}
        {next && <Link to={`/pokemon/${next.national_dex_number}?${new URLSearchParams({ returnTo })}`} aria-label={text.nextSpecies.replace("{number}", pad(next.national_dex_number)).replace("{name}", rowName(next))}>
          <span aria-hidden="true">{rowName(next)} {pad(next.national_dex_number)} ›</span></Link>}
      </div>
    </div>

    <div className="pv-species__hero">
      <div className="pv-species__art">
        <img src={artworkUrl(number)} alt="" width={320} height={320} loading="lazy" referrerPolicy="no-referrer" />
        <span className="pv-species__corner"><SpeciesSprite number={number} name={name} animate /></span>
      </div>
      <div>
        <p className="pv-tile__number">{pad(number)} · {text.heroGeneration.replace("{roman}", generation.roman).replace("{region}", generation.region[locale])}</p>
        <h1 id="species-title" tabIndex={-1} ref={heading}>{name}</h1>
        {types.length > 0 && <ul className="pokemon-types" aria-label={text.types}>{types.map((type) => <li key={type}><TypeBadge type={type} /></li>)}</ul>}
        {details.state.kind === "loading" && <LoadingStatus label={dictionary.pokemonDetails.loading}><Skeleton shape="text" lines={3} /></LoadingStatus>}
        {details.state.kind === "error" && <InlineError calm message={text.detailsError.replace("{name}", name)} retryLabel={dictionary.pokemonDetails.retry} onRetry={details.retry} />}
        {details.state.kind === "loaded" && <>
          {details.state.details.description && <p lang={details.state.details.description_language ?? undefined}>{details.state.details.description}</p>}
          <dl className="pv-species__facts">
            <div><dt>{text.height}</dt><dd>{details.state.details.height_m.toLocaleString(locale === "es" ? "es-CL" : "en-US")} m</dd></div>
            <div><dt>{text.weight}</dt><dd>{details.state.details.weight_kg.toLocaleString(locale === "es" ? "es-CL" : "en-US")} kg</dd></div>
            <div><dt>{text.abilities}</dt><dd>{details.state.details.abilities.map((ability) => <span key={ability.name} lang={ability.language ?? undefined}>{ability.name}{ability.is_hidden ? ` ${text.hiddenAbility}` : ""}</span>).reduce<ReactNode[]>((all, item, i) => i ? [...all, ", ", item] : [item], [])}</dd></div>
          </dl>
        </>}
      </div>
    </div>

    <section className="pv-species__mine" aria-labelledby="species-collection">
      <h2 id="species-collection">{text.collectionTitle}</h2>
      {!signedIn && auth.status !== "loading" && <p><Link to="/login">{text.collectionSignIn.replace("{name}", name)}</Link></p>}
      {signedIn && collection.state.kind === "loading" && <p className="pv-home__meta" role="status">{text.collectionLoading}</p>}
      {signedIn && collection.state.kind === "error" && <InlineError calm message={text.collectionError.replace("{name}", name)} retryLabel={dictionary.home.retry} onRetry={collection.retry} />}
      {owned && (owned.copies === 0 ? <p>{text.collectionNone.replace("{name}", name)}</p> : <>
        <p>{plural(text.collectionSome, owned.copies, { name })} · {plural(text.collectionCards, owned.distinct_cards)}</p>
        <p className="pv-species__value">{text.collectionValue}: <strong className="price-amount">{owned.value.total !== null ? formatMoney(owned.value.total, owned.value.currency, locale) : formatMoney(owned.value.original_totals.EUR ?? owned.value.original_totals.USD ?? "0", owned.value.original_totals.EUR ? "EUR" : "USD", locale, true)}</strong></p>
        {owned.value.total !== null && owned.value.priced_count > 0 && <RatesAttribution rates={owned.value.rates} />}
      </>)}
      {owned?.catalog_total != null && <p className="pv-home__meta">{text.collectionCatalog.replace("{total}", String(owned.catalog_total)).replace("{name}", name)}</p>}
      {owned && owned.pending > 0 && <p className="pv-home__meta" role="status">{text.collectionPending}</p>}
      {signedIn && owned && <Button onClick={() => update({ show: "missing" })}>{text.seeMissing}</Button>}
    </section>

    <section aria-labelledby="species-cards">
      <h2 id="species-cards">{text.cardsTitle.replace("{name}", name)}</h2>
      <div className="tcg-filters">
        <div className="pv-dex__show" role="radiogroup" aria-label={text.cardsShow}>
          {SHOWS.map((value) => <button key={value} type="button" role="radio" aria-checked={show === value} disabled={value !== "all" && !signedIn}
            title={value !== "all" && !signedIn ? text.showNeedsLogin : undefined} onClick={() => update({ show: value === "all" ? "" : value })}>
            {value === "all" ? text.showAll : value === "owned" ? text.showOwned : text.showMissing}</button>)}
        </div>
        <ExpansionSelector key={`${number}:${locale}`} sets={knownSets} selectedId={setId} status={cards.state.kind} onSelect={(id) => update({ set_id: id })} onRetry={cards.retry} />
        <div className="tcg-sort-control"><label htmlFor="tcg-sort">{cardText.sort}</label>
          <select id="tcg-sort" name="sort" value={sort} onChange={(event) => update({ sort: event.target.value })}>
            <option value="newest">{cardText.sortNewest}</option><option value="oldest">{cardText.sortOldest}</option>
            <option value="name">{cardText.sortName}</option><option value="id">{cardText.sortId}</option>
          </select>
        </div>
        <button className="tcg-clear-filters" type="button" onClick={() => { const out = new URLSearchParams(params); ["set_id", "sort", "show"].forEach((key) => out.delete(key)); out.set("page", "1"); setParams(out); }}>{cardText.clear}</button>
      </div>
      {!signedIn && auth.status !== "loading" && <p className="pv-home__meta">{text.cardsGuestHint}</p>}
      <div className="tcg-results" aria-busy={cards.state.kind === "loading"}>
        {cards.state.kind === "loading" && <LoadingStatus label={cardText.loading}><div className="tcg-skeletons">{[0, 1, 2, 3].map((value) => <Skeleton key={value} shape="card" />)}</div></LoadingStatus>}
        {cards.state.kind === "error" && <InlineError calm message={text.cardsError.replace("{name}", name)} retryLabel={cardText.retry} onRetry={cards.retry} />}
        {cards.state.kind === "loaded" && <>
          {cards.state.data.results.length === 0
            ? <div role="status"><p>{filtered ? text.cardsNoMatch : text.cardsEmptyCatalog.replace("{name}", name)}</p>
              {filtered && <Button onClick={() => { const out = new URLSearchParams(params); ["set_id", "show"].forEach((key) => out.delete(key)); out.set("page", "1"); setParams(out); }}>{text.clearFilters}</Button>}</div>
            : <ul className="tcg-grid" aria-label={text.cardsTitle.replace("{name}", name)}>
              {cards.state.data.results.map((card) => <CardPreview key={card.id} card={card} returnTo={sheetUrl} owned={cardOwned(card.id)} star={star(card.id)} />)}
            </ul>}
          {stars.notice && <p role="status" className="pv-home__meta">{stars.notice === "added" ? dictionary.favorites.added : stars.notice === "removed" ? dictionary.favorites.removed : stars.notice === "full" ? dictionary.favorites.full : dictionary.favorites.saveError}</p>}
          {/* A labelled group, not a second <nav>: the shell has exactly one navigation landmark. */}
          <div className="tcg-pagination" role="group" aria-label={text.cardsPages}>
            {page > 1 ? <Link to={pageHref(page - 1)}>{cardText.previous}</Link> : <span aria-disabled="true">{cardText.previous}</span>}
            <span>{cardText.page} {page}</span>
            {cards.state.data.has_more && page < MAX_CARD_PAGE ? <Link to={pageHref(page + 1)}>{cardText.next}</Link> : <span aria-disabled="true">{cardText.next}</span>}
          </div>
        </>}
      </div>
      <p className="tcg-source">{cardText.source}</p>
    </section>
  </section>;
}
