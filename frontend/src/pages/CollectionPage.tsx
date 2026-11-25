import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { CardArtwork } from "../components/cards/CardArtwork";
import { CollectionHeader } from "../components/inventory/CollectionHeader";
import { OwnedCopy } from "../components/inventory/OwnedCopy";
import { useCurrency } from "../components/prices/currency";
import { PriceOrReason, RatesAttribution } from "../components/prices/PriceDisplay";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { type TcgCard } from "../services/cards";
import { conditions, InventoryError, physicalLanguages, variants, type InventoryCopy } from "../services/inventory";
import { fetchCopyPrices, PricesError, type CopyPrice } from "../services/prices";
import { fetchCollectionCopies, COLLECTION_COPY_LIMIT } from "../services/collectionCopies";
import { useCollectionMetadata, COLLECTION_NAME_LIMIT } from "../components/inventory/useCollectionMetadata";
import "../components/inventory/inventory.css";

function CardGroup({ card, id, copies, quantity, onChanged, activeCopy, onActiveChange, prices, pricesLoading }: { card?: TcgCard; id: string; copies: InventoryCopy[]; quantity: number; onChanged: (message: "updated" | "removed") => void; activeCopy: string | null; onActiveChange: (id: string | null) => void; prices: Map<string, CopyPrice>; pricesLoading: boolean }) {
  const { dictionary } = useLocale();
  const text = dictionary.inventory;
  return <article className="inventory-group">
    <div className="inventory-card-summary">
      {card && <div className="inventory-art"><CardArtwork card={card} /></div>}
      <div><h2><Link to={`/cards/${encodeURIComponent(id)}`}>{card?.name ?? text.unnamedCard}</Link></h2>
        <p>{text.copies.replace("{count}", String(quantity))}</p>
        {card && <p lang={card.set.name_language}>{card.set.name}</p>}
        {!card && <p className="inventory-hint">{text.nameUnavailable}</p>}
      </div>
    </div>
    <ul className="inventory-copies">{copies.map((copy) => {
      const price = prices.get(copy.id);
      return <OwnedCopy key={copy.id} copy={copy} onChanged={onChanged} locked={activeCopy !== null && activeCopy !== copy.id} onActiveChange={onActiveChange}
        price={price ? <PriceOrReason price={price.price} reason={price.reason} /> : pricesLoading ? <span className="price-meta">{dictionary.prices.loading}</span> : null} />;
    })}</ul>
  </article>;
}

function usePagePrices(idKey: string) {
  const { currency, ready } = useCurrency();
  const { retrySession } = useAuth();
  // Prices load after the list and never block it; a failure only hides the prices.
  const priceRequest = useCallback((signal: AbortSignal) => fetchCopyPrices(idKey.split(","), currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [idKey, currency, retrySession]);
  return useTcgResource(ready && idKey ? `${idKey}:${currency}` : undefined, priceRequest);
}

function PersonalCollection() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.inventory;
  const { retrySession } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = { variant: params.get("variant") ?? "", condition: params.get("condition") ?? "", language: params.get("language") ?? "" };
  const query = params.get("q") ?? "";
  const [offset, setOffset] = useState(0);
  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true }); setOffset(0); setMessage(null);
  }
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [activeCopy, setActiveCopy] = useState<string | null>(null);
  const [message, setMessage] = useState<"updated" | "removed" | null>(null);
  const request = useCallback((signal: AbortSignal) => fetchCollectionCopies(signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof InventoryError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]);
  const { state, retry } = useTcgResource("collection-copies", request);
  const changed = (next: "updated" | "removed") => {
    setSummaryVersion((version) => version + 1);
    setActiveCopy(null);
    setMessage(next);
    setOffset(0); retry();
  };
  const data = state.kind === "loaded" ? state.data : null;
  const metadata = useCollectionMetadata(data?.results.map((copy) => copy.card_id) ?? [], locale);
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale);
  const matching = (data?.results ?? []).filter((copy) =>
    (!filters.variant || copy.variant === filters.variant) && (!filters.condition || copy.condition === filters.condition)
    && (!filters.language || copy.language === filters.language)
    && (!query.trim() || (metadata.cards[copy.card_id] && normalize(metadata.cards[copy.card_id].name).includes(normalize(query.trim())))));
  const pageOffset = Math.min(offset, Math.max(0, Math.ceil(matching.length / 24) - 1) * 24);
  const visible = matching.slice(pageOffset, pageOffset + 24);
  const idKey = visible.map((copy) => copy.id).join(",");
  const priceState = usePagePrices(idKey);
  const priceData = priceState.state.kind === "loaded" ? priceState.state.data : null;
  const prices = new Map((priceData?.results ?? []).map((row) => [row.copy_id, row]));
  const groups = new Map<string, InventoryCopy[]>();
  for (const copy of visible) groups.set(copy.card_id, [...(groups.get(copy.card_id) ?? []), copy]);
  const filtered = !!(query || filters.condition || filters.language || filters.variant);
  return <>
    <CollectionHeader key={summaryVersion} />
    <section className="pv-collection-filters" aria-label={text.filtersLabel}>
      <fieldset disabled={activeCopy !== null}>
        <label>{text.searchName}<input type="search" maxLength={100} value={query} onChange={(e) => updateFilter("q", e.target.value)} /></label>
        {([ ["variant", text.variantFilter, variants, text.variants], ["condition", text.condition, conditions, text.conditions], ["language", text.language, physicalLanguages, text.languages] ] as const).map(([key, label, options, labels]) => <fieldset key={key}>
          <legend>{label}</legend><div className="pv-collection-filter-chips">
            <button type="button" aria-pressed={!filters[key]} onClick={() => updateFilter(key, "")}>{text.all}</button>
            {options.map((value) => <button key={value} type="button" aria-pressed={filters[key] === value} onClick={() => updateFilter(key, filters[key] === value ? "" : value)}>{key === "variant" && value === "unknown" ? text.unknownChip : (labels as Record<string, string>)[value]}</button>)}
          </div></fieldset>)}
        <button type="button" onClick={() => { const next = new URLSearchParams(params); ["q", "variant", "condition", "language"].forEach((key) => next.delete(key)); setParams(next, { replace: true }); setOffset(0); setMessage(null); }}>{text.clear}</button>
      </fieldset>
      {metadata.completed < metadata.total && <p role="status">{text.namesLoading.replace("{done}", String(metadata.completed)).replace("{total}", String(metadata.total))}</p>}
      {metadata.failed > 0 && <p className="inventory-hint">{text.namesFailed}</p>}
      {new Set(data?.results.map((copy) => copy.card_id)).size > COLLECTION_NAME_LIMIT && <p className="inventory-hint">{text.namesLimited}</p>}
      {data && data.total > COLLECTION_COPY_LIMIT && <p className="inventory-hint">{text.copiesLimited}</p>}
    </section>
    {message && <p role="status">{text[message]}</p>}
    {state.kind === "loading" && <p role="status">{text.loading}</p>}
    {state.kind === "error" && <><p role="alert">{text.loadError}</p><button type="button" onClick={retry}>{text.retry}</button></>}
    {data && <>
      <p>{text.total.replace("{count}", String(matching.length))}</p>
      {filters.variant === "unknown" && <p className="inventory-hint">{text.withoutVariantFilter}</p>}
      {priceState.state.kind === "error" && <p className="price-meta">{dictionary.prices.error} <button type="button" onClick={priceState.retry}>{dictionary.prices.retry}</button></p>}
      {matching.length === 0 ? <p>{filtered ? text.noMatches : text.empty}</p> : <>
        <p className="inventory-hint">{text.physicalNote}</p>
        {[...groups].map(([id, copies]) => <CardGroup key={id} id={id} card={metadata.cards[id]} copies={copies} quantity={matching.filter((copy) => copy.card_id === id).length} onChanged={changed} activeCopy={activeCopy} onActiveChange={setActiveCopy} prices={prices} pricesLoading={priceState.state.kind === "loading" && !!idKey} />)}
        {priceData && priceData.results.some((row) => row.price?.amount != null) && <RatesAttribution rates={priceData.rates} />}
      </>}
      <div className="inventory-actions">
        <button type="button" disabled={activeCopy !== null || pageOffset === 0} onClick={() => setOffset(Math.max(0, pageOffset - 24))}>{text.previous}</button>
        <button type="button" disabled={activeCopy !== null || pageOffset + 24 >= matching.length} onClick={() => setOffset(pageOffset + 24)}>{text.next}</button>
      </div>
    </>}
  </>;
}
export function CollectionPage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <section className="panel inventory-page" aria-labelledby="collection-title">
    {auth.status !== "authenticated" && <h1 id="collection-title">{dictionary.inventory.title}</h1>}
    <SessionNotice />
    {auth.status === "unauthenticated" && <Link to="/login">{dictionary.auth.signIn}</Link>}
    {auth.status === "authenticated" && !auth.loggingOut && <PersonalCollection key={auth.user.id} />}
    <p><Link to="/pokedex">{dictionary.inventory.browse}</Link></p>
  </section>;
}
