import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchBinders, fetchCopyView } from "../../services/binders";
import { fetchBinderValues, PricesError } from "../../services/prices";
import { binderAmount } from "../binders/amount";
import { Cover } from "../binders/Cover";
import { fill, plural } from "../binders/labels";
import { useCurrency } from "../prices/currency";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import "../binders/binders.css";
import "./home.css";

const MAX_COVERS = 6;
const SHELF_SIZE = 3;   // three covers per wooden shelf, two shelves
/** Six empty places: the bookcase drawn without covers (loading, or no binders yet). */
const fillers = (covers: number) => Array.from({ length: MAX_COVERS - covers }, (_, index) => <span key={index} className="pv-bookcase__item pv-bookcase__item--empty" />);

/**
 * Home "Mis carpetas": a retro bookcase of two dark-wood shelves with three covers each
 * (at most six), with name, card count and gold value, each linked to its binder, plus the
 * "cards not in a binder" notice. The value
 * request is separate, so a price outage only hides the values.
 */
export function BinderShelf() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    const status = error instanceof BindersError || error instanceof PricesError ? error.status : 0;
    if (!signal.aborted && status === 401) retrySession();
    throw error;
  }, [retrySession]);
  const listRequest = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource("home-binders", listRequest);
  const valuesRequest = useCallback((signal: AbortSignal) => fetchBinderValues(currency, signal).catch((e: unknown) => guard(e, signal)), [currency, guard]);
  const values = useTcgResource(ready ? `home-values:${currency}` : undefined, valuesRequest);
  const trayRequest = useCallback((signal: AbortSignal) => fetchCopyView("unassigned", 0, signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const tray = useTcgResource("home-tray", trayRequest);
  const binders = list.state.kind === "loaded" ? list.state.data.results : [];
  const shown = binders.slice(0, MAX_COVERS);
  const byId = values.state.kind === "loaded" ? Object.fromEntries(values.state.data.results.map((v) => [v.binder_id, v])) : {};
  const loose = tray.state.kind === "loaded" ? tray.state.data.total : 0;
  const first = binders[0];

  return <CutPanel className="pv-home__pc pv-home-shelf" aria-labelledby="home-binders-title">
    <div className="pv-home__section-head">
      <h2 id="home-binders-title">{text.bindersTitle}</h2>
      <Link to="/binders">{text.bindersAll}</Link>
    </div>
    {list.state.kind === "loading" && <LoadingStatus label={text.bindersLoading}><Skeleton shape="block" /></LoadingStatus>}
    {list.state.kind === "error" && <InlineError message={text.bindersError} retryLabel={text.retry} onRetry={list.retry} />}
    {list.state.kind === "loading" && <div className="pv-bookcase pv-bookcase--skeleton" aria-hidden="true">{fillers(0)}</div>}
    {list.state.kind === "loaded" && !first && <>
      <div className="pv-bookcase pv-bookcase--empty" aria-hidden="true">{fillers(0)}</div>
      <div className="pv-home__pc-empty">
        <h3>{text.firstBinder}</h3>
        <p className="pv-home__meta">{text.firstBinderText}</p>
      </div>
    </>}
    {shown.length > 0 && <ul className="pv-bookcase">
      {shown.map((binder, index) => {
        const amount = binderAmount(byId[binder.id], currency, locale);
        return <li key={binder.id} className="pv-bookcase__item pv-home-shelf__item" data-shelf={index < SHELF_SIZE ? 1 : 2}>
          <Cover binderId={binder.id} />
          <h3 className="pv-home-shelf__name"><Link to={`/binders/${encodeURIComponent(binder.id)}`}>{binder.name}</Link></h3>
          <p className="pv-home__meta">{plural(dictionary.binders.cards, binder.copy_count)}</p>
          {values.state.kind === "loading" ? <Skeleton shape="text" /> : amount && <p className="pv-home-shelf__value price-amount" aria-label={`${dictionary.binders.value}: ${amount}`}>{amount}</p>}
        </li>;
      })}
      {/* Empty places keep both planks whole; they are decoration, not list items. */}
      {Array.from({ length: MAX_COVERS - shown.length }, (_, index) => <li key={`empty-${index}`} className="pv-bookcase__item pv-bookcase__item--empty" role="presentation" aria-hidden="true" />)}
    </ul>}
    {binders.length > MAX_COVERS && <p className="pv-home__meta">{fill(text.bindersMore, { count: binders.length - MAX_COVERS })}</p>}
    <div className="pv-home__actions">
      {loose > 0 && first && <Link className="pv-chip pv-chip--link" to={`/binders/${encodeURIComponent(first.id)}`}>{plural(text.unassigned, loose)}</Link>}
      <ButtonLink to="/binders" variant="secondary">{text.newBinder}</ButtonLink>
    </div>
  </CutPanel>;
}
