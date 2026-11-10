import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { CardArtwork } from "../components/cards/CardArtwork";
import { CardLanguageNote } from "../components/cards/CardLanguageNote";
import { SetLogo } from "../components/cards/SetLogo";
import { AddToCollection } from "../components/inventory/AddToCollection";
import { SetProgress } from "../components/sets/SetProgress";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { CardRequestError, isSetId, safeReturnTo } from "../services/cards";
import { fetchSet, fetchSetCards, fetchSetCollection, MAX_SET_PAGE, type ChecklistFilters, type Ownership, type SetCardPage, type SetDetail } from "../services/sets";
import "../components/cards/cards.css";
import "../components/sets/sets.css";

function SetSymbol({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : <img className="set-symbol" src={url} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

function Metadata({ set }: { set: SetDetail }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.sets;
  return <>
    <header className="set-heading"><SetLogo set={set} decorative /><div><h1 id="set-title" lang={set.name_language}>{set.name}</h1>
      <p><code>{set.id}</code>{set.symbol_url && <SetSymbol key={set.symbol_url} url={set.symbol_url} />}</p></div></header>
    {set.name_language !== locale && <p className="tcg-language-note">{set.name_language === "en" ? text.englishFallback : text.spanishFallback}</p>}
    <dl className="set-facts set-metadata">
      <div><dt>{text.series}</dt><dd>{set.serie?.name ?? dictionary.cards.unavailable}</dd></div>
      <div><dt>{text.release}</dt><dd><time dateTime={set.release_date ?? undefined}>{set.release_date ?? dictionary.cards.unavailable}</time></dd></div>
      <div><dt>{text.officialCount}</dt><dd>{set.official_count ?? dictionary.cards.unavailable}</dd></div>
      <div><dt>{text.providerTotal}</dt><dd>{set.provider_total ?? dictionary.cards.unavailable}</dd></div>
      <div><dt>{text.checklistSize}</dt><dd>{set.checklist_status === "verified" ? set.checklist_size : dictionary.cards.unavailable}</dd></div>
    </dl>
    <p className="tcg-coverage">{text.semantics}</p>
    {set.checklist_status !== "verified" && <p role="status" className="set-coverage-note">{set.checklist_status === "empty" ? text.emptyChecklist : text.incomplete}</p>}
  </>;
}

type ControlActions = { onApply: (q: string, sort: ChecklistFilters["sort"]) => void; onOwnership: (ownership: Ownership) => void; onClear: () => void };

function ChecklistControls({ filters, ownershipEnabled, onApply, onOwnership, onClear, disabled = false }: {
  filters: ChecklistFilters; ownershipEnabled: boolean; disabled?: boolean;
} & ControlActions) {
  const { dictionary } = useLocale();
  const text = dictionary.sets;
  const [q, setQ] = useState(filters.q);
  const [sort, setSort] = useState(filters.sort);
  return <form className="tcg-filters set-filters" role="search" onSubmit={(event) => { event.preventDefault(); onApply(q.trim(), sort); }}>
    <div><label htmlFor="checklist-search">{text.searchCards}</label><input id="checklist-search" type="search" disabled={disabled} maxLength={100} value={q} onChange={(event) => setQ(event.target.value)} /></div>
    <div><label htmlFor="checklist-sort">{dictionary.cards.sort}</label><select id="checklist-sort" disabled={disabled} value={sort} onChange={(event) => setSort(event.target.value as ChecklistFilters["sort"])}>
      <option value="number">{text.numberSort}</option><option value="name">{text.nameSort}</option>
    </select></div>
    <div><label htmlFor="checklist-ownership">{dictionary.inventory.title}</label><select id="checklist-ownership" disabled={disabled || !ownershipEnabled} value={filters.ownership} onChange={(event) => onOwnership(event.target.value as Ownership)}>
      <option value="all">{text.all}</option><option value="owned">{text.owned}</option><option value="missing">{text.missing}</option>
    </select></div>
    <button type="submit" disabled={disabled}>{dictionary.cards.apply}</button>
    <button className="tcg-clear-filters" type="button" disabled={disabled} onClick={() => { setQ(""); setSort("number"); onClear(); }}>{dictionary.cards.clear}</button>
  </form>;
}

function ChecklistRows({ data, quantities, onSaved, activeCard = null, onActiveChange }: { data: SetCardPage; quantities?: Record<string, number>; onSaved?: () => void; activeCard?: string | null; onActiveChange?: (id: string | null) => void }) {
  const { dictionary } = useLocale();
  const text = dictionary.sets;
  const location = useLocation();
  const [params] = useSearchParams();
  const pageHref = (page: number) => {
    const next = new URLSearchParams(params); next.set("page", String(page)); return `${location.pathname}?${next}`;
  };
  return <>
    <p>{text.results.replace("{count}", String(data.total))}</p>
    {data.results.length === 0 ? <p role="status">{text.checklistEmpty}</p> : <ul className="tcg-grid set-checklist" aria-label={text.checklist}>{data.results.map((card) => <li className="tcg-preview" key={card.id}>
      <Link className="tcg-preview-link" aria-label={card.name} to={`/cards/${encodeURIComponent(card.id)}?${new URLSearchParams({ returnTo: location.pathname + location.search })}`}><CardArtwork card={card} /></Link>
      <h3 lang={card.language}>{card.name}</h3><p>#{card.local_id} · <code>{card.id}</code></p>
      <CardLanguageNote card={card} />
      {quantities && <div className="set-ownership"><p className={(quantities[card.id] ?? 0) > 0 ? "set-owned" : "set-missing"}>{(quantities[card.id] ?? 0) > 0 ? text.ownedState : text.missingState}</p>
        <p>{text.quantity.replace("{count}", String(quantities[card.id] ?? 0))}</p>
        <AddToCollection cardId={card.id} onSaved={onSaved} locked={activeCard !== null && activeCard !== card.id} onActiveChange={(open) => onActiveChange?.(open ? card.id : null)} />
      </div>}
    </li>)}</ul>}
    <nav className="tcg-pagination" aria-label={text.checklist}>
      {data.page > 1 && activeCard === null ? <Link to={pageHref(data.page - 1)}>{dictionary.cards.previous}</Link> : <span aria-disabled="true">{dictionary.cards.previous}</span>}
      <span>{dictionary.cards.page} {data.page}</span>
      {data.page * data.page_size < data.total && data.page < MAX_SET_PAGE && activeCard === null ? <Link to={pageHref(data.page + 1)}>{dictionary.cards.next}</Link> : <span aria-disabled="true">{dictionary.cards.next}</span>}
    </nav>
  </>;
}

function PublicChecklist({ id, filters }: { id: string; filters: ChecklistFilters }) {
  const { dictionary, locale } = useLocale();
  const { page, q, sort } = filters;
  const request = useCallback((signal: AbortSignal) => fetchSetCards(id, locale, { page, q, sort, ownership: "all" }, signal), [id, locale, page, q, sort]);
  const { state, retry } = useTcgResource(JSON.stringify([id, locale, page, q, sort]), request);
  return <div aria-busy={state.kind === "loading"}>
    {state.kind === "loading" && <p role="status">{dictionary.sets.checklistLoading}</p>}
    {state.kind === "error" && <><p role="alert">{dictionary.sets.checklistError}</p><button type="button" onClick={retry}>{dictionary.sets.checklistRetry}</button></>}
    {state.kind === "loaded" && <ChecklistRows data={state.data} />}
  </div>;
}

function PersonalChecklist({ metadata, filters, refreshMetadata, resetPage, onApply, onOwnership, onClear }: { metadata: SetDetail; filters: ChecklistFilters; refreshMetadata: () => void; resetPage: () => void } & ControlActions) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.sets;
  const { retrySession } = useAuth();
  const { page, q, sort, ownership } = filters;
  const id = metadata.id;
  const [activeCard, setActiveCard] = useState<string | null>(null);
  const request = useCallback((signal: AbortSignal) => fetchSetCollection(id, locale, { page, q, sort, ownership }, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof CardRequestError && error.status === 401) retrySession();
    throw error;
  }), [id, locale, page, q, sort, ownership, retrySession]);
  const { state, retry } = useTcgResource(JSON.stringify([id, locale, page, q, sort, ownership]), request);
  const matching = state.kind === "loaded" && state.data.set.checklist_revision === metadata.checklist_revision &&
    state.data.set.checklist_size === metadata.checklist_size && state.data.set.checklist_status === metadata.checklist_status;
  const refresh = () => { if (page !== 1) resetPage(); else retry(); };
  const retryAll = () => { retry(); refreshMetadata(); };
  return <>
    <ChecklistControls key={`${filters.q}:${filters.sort}`} filters={filters} ownershipEnabled={metadata.checklist_status === "verified" && metadata.checklist_size > 0} disabled={activeCard !== null} onApply={onApply} onOwnership={onOwnership} onClear={onClear} />
    {state.kind === "loading" && <p role="status">{text.progressLoading}</p>}
    {(state.kind === "error" || (state.kind === "loaded" && !matching)) && <div><p role="alert">{text.progressError}</p><button type="button" onClick={retryAll}>{text.progressRetry}</button></div>}
    {state.kind === "loaded" && matching ? <>
      <SetProgress progress={state.data.progress} />
      <p><Link to="/collection">{text.manage}</Link></p>
      <ChecklistRows data={state.data} quantities={state.data.progress.status === "verified" ? state.data.quantities : undefined} onSaved={refresh} activeCard={activeCard} onActiveChange={setActiveCard} />
    </> : ownership === "all" ? <PublicChecklist id={id} filters={filters} /> : null}
  </>;
}

export function SetPage() {
  const { setId = "" } = useParams();
  const { dictionary, locale } = useLocale();
  const text = dictionary.sets;
  const auth = useAuth();
  const location = useLocation();
  const heading = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const valid = isSetId(setId);
  const request = useCallback((signal: AbortSignal) => fetchSet(setId, locale, signal), [setId, locale]);
  const { state, retry } = useTcgResource(valid ? `${setId}:${locale}` : undefined, request);
  useEffect(() => { heading.current?.focus(); }, [location.pathname, state.kind]);
  const metadata = state.kind === "loaded" ? state.data : null;
  const personal = auth.status === "authenticated" && !auth.validating && !auth.loggingOut;
  const canFilter = personal && metadata?.checklist_status === "verified" && metadata.checklist_size > 0;
  const rawPage = params.get("page") ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.min(MAX_SET_PAGE, Math.max(1, Number(rawPage))) : 1;
  const rawOwnership = params.get("ownership");
  const ownership: Ownership = canFilter && (rawOwnership === "owned" || rawOwnership === "missing") ? rawOwnership : "all";
  const filters: ChecklistFilters = { page, q: (params.get("q") ?? "").slice(0, 100), sort: params.get("sort") === "name" ? "name" : "number", ownership };
  function update(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    next.set("page", "1"); setParams(next);
  }
  const safeBack = safeReturnTo(params.get("returnTo"));
  const back = safeBack === "/sets" || safeBack.startsWith("/sets?") ? safeBack : "/sets";
  return <section className="panel tcg-page sets-page" aria-labelledby="set-title">
    <Link className="tcg-back" to={back}><span aria-hidden="true">← </span>{text.back}</Link>
    {!valid ? <><h1 id="set-title">{text.title}</h1><p role="alert">{text.invalid}</p></> : <>
      {state.kind === "loading" && <><h1 id="set-title">{text.title}</h1><p role="status">{text.detailLoading}</p></>}
      {state.kind === "error" && <><h1 id="set-title">{text.title}</h1><p role="alert">{state.notFound ? text.notFound : text.detailError}</p>
        {!state.notFound && <button type="button" onClick={retry}>{text.retry}</button>}</>}
      {metadata && <>
        <div ref={heading} tabIndex={-1}><Metadata set={metadata} /></div>
        <h2>{text.checklist}</h2>
        <SessionNotice />
        {auth.status === "unauthenticated" && <p><Link to="/login">{text.signIn}</Link></p>}
        {personal ? <PersonalChecklist key={JSON.stringify([auth.user.id, setId, locale, page, filters.q, filters.sort, ownership])} metadata={metadata} filters={filters} refreshMetadata={retry} resetPage={() => update({})}
          onApply={(q, sort) => update({ q, sort: sort === "number" ? "" : sort })} onOwnership={(value) => update({ ownership: value === "all" ? "" : value })} onClear={() => update({ q: "", sort: "", ownership: "" })} />
          : <><ChecklistControls key={`${filters.q}:${filters.sort}`} filters={filters} ownershipEnabled={false} onApply={(q, sort) => update({ q, sort: sort === "number" ? "" : sort })} onOwnership={() => {}} onClear={() => update({ q: "", sort: "", ownership: "" })} /><PublicChecklist id={setId} filters={filters} /></>}
        <p className="tcg-source">{text.source}</p>
      </>}
    </>}
  </section>;
}
