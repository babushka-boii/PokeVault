import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchBinder, fetchBinders, fetchCopyView } from "../../services/binders";
import { mostRecent } from "../binders/recent";
import { useCardMetadata } from "../cards/cardMetadata";
import { cardIdentity, fill } from "../binders/labels";
import { CardArtwork } from "../cards/CardArtwork";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { plural } from "./plural";
import "../binders/binders.css";
import "./home.css";

/** Home "Mis carpetas": a read-only page of the most recent binder and the tray count. */
export function BinderPreview() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const { retrySession } = useAuth();
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    if (!signal.aborted && error instanceof BindersError && error.status === 401) retrySession();
    throw error;
  }, [retrySession]);
  const listRequest = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource("home-binders", listRequest);
  const chosen = list.state.kind === "loaded" ? mostRecent(list.state.data.results) : undefined;
  const detailRequest = useCallback((signal: AbortSignal) => fetchBinder(chosen!.id, signal).catch((e: unknown) => guard(e, signal)), [chosen, guard]);
  const detail = useTcgResource(chosen?.id, detailRequest);
  const trayRequest = useCallback((signal: AbortSignal) => fetchCopyView("unassigned", 0, signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const tray = useTcgResource("home-tray", trayRequest);
  const binder = detail.state.kind === "loaded" ? detail.state.data : undefined;
  const latest = binder?.pockets.reduce<(typeof binder.pockets)[number] | undefined>((best, pocket) => !best || Date.parse(pocket.placed_at) > Date.parse(best.placed_at) ? pocket : best, undefined);
  const page = latest?.page ?? 1;
  const pockets = binder?.pockets.filter((pocket) => pocket.page === page) ?? [];
  const metadata = useCardMetadata(pockets.map((pocket) => pocket.copy.card_id), locale);
  const loose = tray.state.kind === "loaded" ? tray.state.data.total : 0;
  const open = chosen ? `/binders/${encodeURIComponent(chosen.id)}?page=${page}` : "/binders";
  const noBinders = list.state.kind === "loaded" && !chosen;

  return <CutPanel className="pv-home__pc pv-home-binders" aria-labelledby="home-binders-title">
    <div className="pv-home__section-head">
      <h2 id="home-binders-title">{text.bindersTitle}</h2>
      {chosen && <Link to={open}>{text.bindersOpen}</Link>}
    </div>
    {(list.state.kind === "loading" || (chosen && detail.state.kind === "loading")) && <LoadingStatus label={text.bindersLoading}><Skeleton shape="block" /></LoadingStatus>}
    {list.state.kind === "error" && <InlineError message={text.bindersError} retryLabel={text.retry} onRetry={list.retry} />}
    {detail.state.kind === "error" && <InlineError message={text.bindersError} retryLabel={text.retry} onRetry={detail.retry} />}
    {noBinders && <div className="pv-home__pc-empty">
      <h3>{text.firstBinder}</h3>
      <p className="pv-home__meta">{text.firstBinderText}</p>
    </div>}
    {binder && <>
      <p className="pv-home__meta">{fill(text.bindersPage, { name: binder.name, page })}</p>
      <ol className="pv-home-binders__page" aria-label={fill(text.bindersPreview, { name: binder.name, page })}>
        {Array.from({ length: 9 }, (_, index) => {
          const held = pockets.find((pocket) => pocket.pocket === index + 1);
          const card = held ? metadata.cards[held.copy.card_id] : undefined;
          return <li key={index} className={`pv-home-binders__pocket${held ? "" : " pv-pocket--empty"}`}>
            <span className="pv-pocket__sleeve" aria-hidden="true">
              {held ? card ? <CardArtwork card={card} /> : <span className="pv-pocket__fallback">{held.copy.card_id}</span> : <span className="pv-pocket__number">{index + 1}</span>}
              <span className="pv-pocket__shine" />
            </span>
            {held && <span className="pv-pocket__name">{cardIdentity(held.copy, card)}</span>}
          </li>;
        })}
      </ol>
    </>}
    <div className="pv-home__actions">
      {loose > 0 && <Link className="pv-chip pv-chip--link" to={open}>{plural(text.unassigned, loose)}</Link>}
      <ButtonLink to="/binders" variant="secondary">{text.newBinder}</ButtonLink>
    </div>
  </CutPanel>;
}
