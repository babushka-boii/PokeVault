import { useCallback, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchCopyView } from "../../services/binders";
import { FavoritesError, fetchFavoriteCards } from "../../services/favorites";
import { fetchCopyPrices, PricesError } from "../../services/prices";
import { useCardMetadata } from "../cards/cardMetadata";
import { useCurrency } from "../prices/currency";
import { CutPanel } from "../ui/CutPanel";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { Reel, type ReelItem } from "./Reel";
import type { ValuationResource } from "./ValueHero";
import "./home.css";

export const CAROUSEL_SIZE = 12;
type Tab = "valuable" | "favorites" | "added";
const TABS: Tab[] = ["valuable", "favorites", "added"];

/** A resource reduced to what the carousel needs: loading, failed (with retry) or its items. */
type Source = { state: "loading" } | { state: "error"; retry: () => void } | { state: "ready"; items: ReelItem[] };

function useGuard() {
  const { retrySession } = useAuth();
  return useCallback((error: unknown, signal: AbortSignal) => {
    const status = error instanceof BindersError || error instanceof FavoritesError || error instanceof PricesError ? error.status : 0;
    if (!signal.aborted && status === 401) retrySession();
    throw error;
  }, [retrySession]);
}

/**
 * "Tus cartas": three views of the user's cards in one drifting carousel. The valuable view
 * reuses the page's valuation request; the others are requested when first selected and kept
 * while the page is open.
 */
export function CardCarousel({ valuation }: { valuation: ValuationResource }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const { currency, ready } = useCurrency();
  const guard = useGuard();
  const id = useId();
  const [tab, setTab] = useState<Tab>("valuable");
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(["valuable"]));
  const buttons = useRef(new Map<Tab, HTMLButtonElement>());

  const favoritesRequest = useCallback((signal: AbortSignal) => fetchFavoriteCards(currency, signal).catch((e: unknown) => guard(e, signal)), [currency, guard]);
  const favorites = useTcgResource(visited.has("favorites") && ready ? `favorites:${currency}` : undefined, favoritesRequest);
  const addedRequest = useCallback((signal: AbortSignal) => fetchCopyView("added", 0, signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const added = useTcgResource(visited.has("added") ? "added" : undefined, addedRequest);
  const addedIds = added.state.kind === "loaded" ? added.state.data.results.slice(0, CAROUSEL_SIZE).map((copy) => copy.id).join(",") : "";
  const addedPricesRequest = useCallback((signal: AbortSignal) => fetchCopyPrices(addedIds.split(","), currency, signal).catch((e: unknown) => guard(e, signal)), [addedIds, currency, guard]);
  const addedPrices = useTcgResource(visited.has("added") && ready && addedIds ? `added-prices:${addedIds}:${currency}` : undefined, addedPricesRequest);

  const sources: Record<Tab, Source> = {
    valuable: valuation.state.kind === "loading" ? { state: "loading" } : valuation.state.kind === "error" ? { state: "error", retry: valuation.retry }
      : { state: "ready", items: valuation.state.data.top.map((row) => ({ key: row.copy_id, cardId: row.card_id, to: `/collection/${encodeURIComponent(row.copy_id)}`, price: row.price })) },
    favorites: !visited.has("favorites") || favorites.state.kind === "loading" ? { state: "loading" } : favorites.state.kind === "error" ? { state: "error", retry: favorites.retry }
      : { state: "ready", items: favorites.state.data.results.map((row) => ({ key: row.card_id, cardId: row.card_id, to: `/cards/${encodeURIComponent(row.card_id)}`, price: row.price })) },
    added: !visited.has("added") || added.state.kind === "loading" ? { state: "loading" } : added.state.kind === "error" ? { state: "error", retry: added.retry }
      : added.state.kind === "loaded" && added.state.data.results.length === 0 ? { state: "ready", items: [] }
      : addedPrices.state.kind === "loading" ? { state: "loading" }
      // Prices failing never hides the cards: they just show without a price.
      : { state: "ready", items: (added.state.kind === "loaded" ? added.state.data.results.slice(0, CAROUSEL_SIZE) : []).map((copy) => ({ key: copy.id, cardId: copy.card_id, to: `/collection/${encodeURIComponent(copy.id)}`,
        price: addedPrices.state.kind === "loaded" ? addedPrices.state.data.results.find((row) => row.copy_id === copy.id)?.price ?? null : null })) },
  };
  const source = sources[tab];
  const cardIds = source.state === "ready" ? source.items.map((item) => item.cardId) : [];
  const metadata = useCardMetadata(cardIds, locale);

  function select(next: Tab) {
    setTab(next);
    setVisited((previous) => previous.has(next) ? previous : new Set(previous).add(next));
  }
  function keyDown(event: KeyboardEvent, current: Tab) {
    const index = TABS.indexOf(current);
    const target = event.key === "ArrowRight" ? TABS[(index + 1) % TABS.length] : event.key === "ArrowLeft" ? TABS[(index + TABS.length - 1) % TABS.length]
      : event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : null;
    if (!target) return;
    event.preventDefault(); select(target); buttons.current.get(target)?.focus();
  }
  const labels: Record<Tab, string> = { valuable: text.tabValuable, favorites: text.tabFavorites, added: text.tabAdded };
  const empty: Record<Tab, { message: string; to: string; link: string }> = {
    valuable: { message: text.topEmpty, to: "/collection", link: text.viewCollection },
    favorites: { message: text.favoritesEmpty, to: "/collection", link: text.viewCollection },
    added: { message: text.addedEmpty, to: "/scanner", link: text.scanAction },
  };

  return <section className="pv-home__section pv-home__wide" aria-labelledby="home-top-title">
    <div className="pv-home__section-head">
      <h2 id="home-top-title">{text.cardsTitle}</h2>
      <div className="pv-segmented" role="tablist" aria-label={text.cardsTitle}>
        {TABS.map((name) => <button key={name} type="button" role="tab" id={`${id}-tab-${name}`} aria-selected={tab === name} aria-controls={`${id}-panel`}
          tabIndex={tab === name ? 0 : -1} ref={(node) => { if (node) buttons.current.set(name, node); else buttons.current.delete(name); }}
          onClick={() => select(name)} onKeyDown={(event) => keyDown(event, name)}>{labels[name]}</button>)}
      </div>
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`}>
      {source.state === "loading" && <LoadingStatus label={text.cardsLoading}>
        <ul className="pv-reel__skeleton">{[0, 1, 2, 3, 4].map((index) => <li key={index}><Skeleton shape="card" /></li>)}</ul>
      </LoadingStatus>}
      {/* The hero already shows the alert for the shared valuation; this view explains and retries only itself. */}
      {source.state === "error" && (tab === "valuable"
        ? <p className="pv-home__meta">{text.topError}</p>
        : <InlineError message={tab === "favorites" ? text.favoritesError : text.addedError} retryLabel={text.retry} onRetry={source.retry} />)}
      {source.state === "ready" && (source.items.length === 0
        ? <CutPanel as="div"><p className="pv-home__meta">{empty[tab].message}</p><Link to={empty[tab].to}>{empty[tab].link}</Link></CutPanel>
        : <Reel key={tab} items={source.items} cards={metadata.cards} loading={metadata.loading} label={labels[tab]} />)}
    </div>
  </section>;
}
