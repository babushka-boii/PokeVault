import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { CardArtwork } from "../components/cards/CardArtwork";
import { OwnedCopy } from "../components/inventory/OwnedCopy";
import { useCurrency } from "../components/prices/currency";
import { CurrencySwitch, PriceOrReason, RatesAttribution } from "../components/prices/PriceDisplay";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { fetchTcgCard, isCardId } from "../services/cards";
import { conditions, fetchInventory, InventoryError, physicalLanguages, variants, type InventoryCopy, type InventoryFilters } from "../services/inventory";
import { fetchCopyPrices, PricesError, type CopyPrice } from "../services/prices";
import "../components/inventory/inventory.css";

function CardGroup({ id, copies, quantity, onChanged, activeCopy, onActiveChange, prices, pricesLoading }: { id: string; copies: InventoryCopy[]; quantity: number; onChanged: (message: "updated" | "removed") => void; activeCopy: string | null; onActiveChange: (id: string | null) => void; prices: Map<string, CopyPrice>; pricesLoading: boolean }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.inventory;
  const request = useCallback((signal: AbortSignal) => fetchTcgCard(id, locale, signal), [id, locale]);
  const { state, retry } = useTcgResource(`${id}:${locale}`, request);
  const card = state.kind === "loaded" ? state.data : null;
  return <article className="inventory-group">
    <div className="inventory-card-summary">
      {card && <div className="inventory-art"><CardArtwork card={card} /></div>}
      <div><h2><Link to={`/cards/${encodeURIComponent(id)}`}>{card?.name ?? id}</Link></h2>
        <p>{text.copies.replace("{count}", String(quantity))}</p>
        {card && <p lang={card.set.name_language}>{card.set.name}</p>}
        {state.kind === "loading" && <p role="status">{dictionary.cards.detailLoading}</p>}
        {state.kind === "error" && <><p>{text.providerError}</p><button type="button" onClick={retry}>{text.providerRetry}</button></>}
      </div>
    </div>
    <ul className="inventory-copies">{copies.map((copy) => {
      const price = prices.get(copy.id);
      return <OwnedCopy key={copy.id} copy={copy} onChanged={onChanged} locked={activeCopy !== null && activeCopy !== copy.id} onActiveChange={onActiveChange}
        price={price ? <PriceOrReason price={price.price} reason={price.reason} /> : pricesLoading ? <span className="price-meta">{dictionary.prices.loading}</span> : null} />;
    })}</ul>
  </article>;
}
const initialFilters: InventoryFilters = { offset: 0, card_id: "", language: "", condition: "", variant: "" };
const isVariant = (value: string | null): value is string => variants.some((variant) => variant === value);

function PersonalCollection() {
  const { dictionary } = useLocale();
  const text = dictionary.inventory;
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const [searchParams] = useSearchParams();
  const linked = searchParams.get("variant");
  const [filters, setFilters] = useState<InventoryFilters>(() => ({ ...initialFilters, variant: isVariant(linked) ? linked : "" }));
  const [draft, setDraft] = useState(filters);
  const [activeCopy, setActiveCopy] = useState<string | null>(null);
  const [message, setMessage] = useState<"updated" | "removed" | null>(null);
  const request = useCallback((signal: AbortSignal) => fetchInventory(filters, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof InventoryError && error.status === 401) retrySession();
    throw error;
  }), [filters, retrySession]);
  const { state, retry } = useTcgResource(JSON.stringify(filters), request);
  const changed = (next: "updated" | "removed") => {
    setActiveCopy(null);
    setMessage(next);
    if (filters.offset > 0) setFilters({ ...filters, offset: 0 });
    else retry();
  };
  const data = state.kind === "loaded" ? state.data : null;
  const idKey = data?.results.map((copy) => copy.id).join(",") ?? "";
  // Prices load after the list and never block it; a failure only hides the prices.
  const priceRequest = useCallback((signal: AbortSignal) => fetchCopyPrices(idKey.split(","), currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [idKey, currency, retrySession]);
  const priceState = useTcgResource(ready && idKey ? `${idKey}:${currency}` : undefined, priceRequest);
  const priceData = priceState.state.kind === "loaded" ? priceState.state.data : null;
  const prices = new Map((priceData?.results ?? []).map((row) => [row.copy_id, row]));
  const groups = new Map<string, InventoryCopy[]>();
  for (const copy of data?.results ?? []) groups.set(copy.card_id, [...(groups.get(copy.card_id) ?? []), copy]);
  const filtered = !!(filters.card_id || filters.condition || filters.language || filters.variant);
  return <>
    <form className="inventory-filter-form" onSubmit={(event) => { event.preventDefault(); setMessage(null); setFilters({ ...draft, offset: 0 }); }}>
      <fieldset className="inventory-filters" disabled={activeCopy !== null}>
      <label>{text.cardId}<input maxLength={100} value={draft.card_id} onChange={(e) => setDraft({ ...draft, card_id: e.target.value })} /></label>
      <label>{text.condition}<select value={draft.condition} onChange={(e) => setDraft({ ...draft, condition: e.target.value })}>
        <option value="">{text.all}</option>{conditions.map((v) => <option key={v} value={v}>{text.conditions[v]}</option>)}
      </select></label>
      <label>{text.language}<select value={draft.language} onChange={(e) => setDraft({ ...draft, language: e.target.value })}>
        <option value="">{text.all}</option>{physicalLanguages.map((v) => <option key={v} value={v}>{text.languages[v]}</option>)}
      </select></label>
      <label>{text.variantFilter}<select value={draft.variant} onChange={(e) => setDraft({ ...draft, variant: e.target.value })}>
        <option value="">{text.all}</option>{variants.map((v) => <option key={v} value={v}>{text.variants[v]}</option>)}
      </select></label>
      <button type="submit" disabled={!!draft.card_id && !isCardId(draft.card_id)}>{text.filter}</button>
      <button type="button" onClick={() => { setDraft(initialFilters); setFilters(initialFilters); setMessage(null); }}>{text.clear}</button>
      </fieldset>
    </form>
    {message && <p role="status">{text[message]}</p>}
    {state.kind === "loading" && <p role="status">{text.loading}</p>}
    {state.kind === "error" && <><p role="alert">{text.loadError}</p><button type="button" onClick={retry}>{text.retry}</button></>}
    {data && <>
      <p>{text.total.replace("{count}", String(data.total))}</p>
      {filters.variant === "unknown" && <p className="inventory-hint">{text.withoutVariantFilter}</p>}
      {data.total > 0 && <CurrencySwitch />}
      {priceState.state.kind === "error" && <p className="price-meta">{dictionary.prices.error} <button type="button" onClick={priceState.retry}>{dictionary.prices.retry}</button></p>}
      {data.total === 0 ? <p>{filtered ? text.noMatches : text.empty}</p> : <>
        <p className="inventory-hint">{text.physicalNote}</p>
        {[...groups].map(([id, copies]) => <CardGroup key={id} id={id} copies={copies} quantity={data.quantities[id]} onChanged={changed} activeCopy={activeCopy} onActiveChange={setActiveCopy} prices={prices} pricesLoading={priceState.state.kind === "loading" && !!idKey} />)}
        {priceData && priceData.results.some((row) => row.price?.amount != null) && <RatesAttribution rates={priceData.rates} />}
      </>}
      <div className="inventory-actions">
        <button type="button" disabled={activeCopy !== null || filters.offset === 0} onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - 24) })}>{text.previous}</button>
        <button type="button" disabled={activeCopy !== null || filters.offset + 24 >= data.total} onClick={() => setFilters({ ...filters, offset: filters.offset + 24 })}>{text.next}</button>
      </div>
    </>}
  </>;
}
export function CollectionPage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <section className="panel inventory-page" aria-labelledby="collection-title">
    <h1 id="collection-title">{dictionary.inventory.title}</h1>
    <SessionNotice />
    {auth.status === "unauthenticated" && <Link to="/login">{dictionary.auth.signIn}</Link>}
    {auth.status === "authenticated" && !auth.loggingOut && <PersonalCollection key={auth.user.id} />}
    <p><Link to="/pokedex">{dictionary.inventory.browse}</Link></p>
  </section>;
}
