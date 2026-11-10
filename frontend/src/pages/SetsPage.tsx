import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { SetLogo } from "../components/cards/SetLogo";
import { SetProgress } from "../components/sets/SetProgress";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { CardRequestError, isSetId } from "../services/cards";
import { fetchSetProgress, fetchSets, MAX_SET_PAGE, type SetFilters, type SetProgress as Progress, type SetSummary } from "../services/sets";
import "../components/cards/cards.css";
import "../components/sets/sets.css";

function ExplorerFilters({ filters, series, onApply }: { filters: SetFilters; series: { id: string; name: string }[]; onApply: (filters: SetFilters) => void }) {
  const { dictionary } = useLocale();
  const text = dictionary.sets;
  const [draft, setDraft] = useState(filters);
  return <form className="tcg-filters set-filters" role="search" onSubmit={(event) => { event.preventDefault(); onApply({ ...draft, page: 1, q: draft.q.trim() }); }}>
    <div><label htmlFor="set-search">{text.search}</label><input id="set-search" type="search" maxLength={100} value={draft.q} onChange={(event) => setDraft({ ...draft, q: event.target.value })} /></div>
    <div><label htmlFor="set-series">{text.series}</label><select id="set-series" value={draft.seriesId} onChange={(event) => setDraft({ ...draft, seriesId: event.target.value })}>
      <option value="">{text.allSeries}</option>
      {draft.seriesId && !series.some((item) => item.id === draft.seriesId) && <option value={draft.seriesId}>{draft.seriesId}</option>}
      {series.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></div>
    <div><label htmlFor="set-sort">{dictionary.cards.sort}</label><select id="set-sort" value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.target.value as SetFilters["sort"] })}>
      <option value="newest">{dictionary.cards.sortNewest}</option><option value="oldest">{dictionary.cards.sortOldest}</option>
    </select></div>
    <button type="submit">{dictionary.cards.apply}</button>
    <button className="tcg-clear-filters" type="button" onClick={() => onApply({ page: 1, q: "", seriesId: "", sort: "newest" })}>{dictionary.cards.clear}</button>
  </form>;
}

function SetList({ sets, progress }: { sets: SetSummary[]; progress?: Progress[] }) {
  const { dictionary, locale } = useLocale();
  const location = useLocation();
  const text = dictionary.sets;
  return <ul className="set-grid" aria-label={text.title}>{sets.map((set) => <li className="set-summary" key={set.id}>
    <SetLogo set={set} decorative />
    <h2><Link lang={set.name_language} to={`/sets/${encodeURIComponent(set.id)}?${new URLSearchParams({ returnTo: location.pathname + location.search })}`}>{set.name}</Link></h2>
    <p><code>{set.id}</code></p>
    <p>{set.serie?.name ?? dictionary.cards.unavailable}</p>
    <p><time dateTime={set.release_date ?? undefined}>{set.release_date ?? dictionary.cards.unavailable}</time></p>
    <dl className="set-summary-counts"><div><dt>{text.officialCount}</dt><dd>{set.official_count ?? dictionary.cards.unavailable}</dd></div>
      <div><dt>{text.providerTotal}</dt><dd>{set.provider_total ?? dictionary.cards.unavailable}</dd></div></dl>
    {set.name_language !== locale && <p className="tcg-language-note">{set.name_language === "en" ? text.englishFallback : text.spanishFallback}</p>}
    {progress?.find((item) => item.set_id === set.id) && <SetProgress compact progress={progress.find((item) => item.set_id === set.id)!} />}
  </li>)}</ul>;
}

function PersonalSetList({ sets }: { sets: SetSummary[] }) {
  const { dictionary } = useLocale();
  const { retrySession } = useAuth();
  const ids = sets.map((set) => set.id).join(",");
  const request = useCallback((signal: AbortSignal) => fetchSetProgress(ids.split(","), signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof CardRequestError && error.status === 401) retrySession();
    throw error;
  }), [ids, retrySession]);
  const { state, retry } = useTcgResource(ids || undefined, request);
  return <>
    {state.kind === "loading" && <p role="status">{dictionary.sets.progressLoading}</p>}
    {state.kind === "error" && <div><p role="alert">{dictionary.sets.progressError}</p><button type="button" onClick={retry}>{dictionary.sets.progressRetry}</button></div>}
    <SetList sets={sets} progress={state.kind === "loaded" ? state.data : undefined} />
  </>;
}

export function SetsPage() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.sets;
  const auth = useAuth();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const rawPage = params.get("page") ?? "1";
  const page = /^\d+$/.test(rawPage) ? Math.min(MAX_SET_PAGE, Math.max(1, Number(rawPage))) : 1;
  const q = (params.get("q") ?? "").slice(0, 100);
  const rawSeries = params.get("series_id") ?? "";
  const seriesId = isSetId(rawSeries) ? rawSeries : "";
  const sort = params.get("sort") === "oldest" ? "oldest" : "newest";
  const filters = useMemo<SetFilters>(() => ({ page, q, seriesId, sort }), [page, q, seriesId, sort]);
  const request = useCallback((signal: AbortSignal) => fetchSets(locale, filters, signal), [locale, filters]);
  const { state, retry } = useTcgResource(JSON.stringify([locale, page, q, seriesId, sort]), request);
  useEffect(() => { heading.current?.focus(); }, [location.pathname]);
  const apply = (next: SetFilters) => {
    const nextParams = new URLSearchParams();
    if (next.q) nextParams.set("q", next.q);
    if (next.seriesId) nextParams.set("series_id", next.seriesId);
    if (next.sort !== "newest") nextParams.set("sort", next.sort);
    nextParams.set("page", String(next.page));
    setParams(nextParams);
  };
  const pageHref = (next: number) => {
    const nextParams = new URLSearchParams(params); nextParams.set("page", String(next));
    return `${location.pathname}?${nextParams}`;
  };
  const data = state.kind === "loaded" ? state.data : null;
  const personal = auth.status === "authenticated" && !auth.loggingOut && !auth.validating;
  return <section className="panel tcg-page sets-page" aria-labelledby="sets-title">
    <h1 id="sets-title" ref={heading} tabIndex={-1}>{text.title}</h1><p>{text.description}</p>
    <p className="tcg-coverage">{text.coverage}</p>
    <ExplorerFilters key={JSON.stringify(filters)} filters={filters} series={data?.series ?? []} onApply={apply} />
    <SessionNotice />
    <div aria-busy={state.kind === "loading"}>
      {state.kind === "loading" && <p role="status">{text.loading}</p>}
      {state.kind === "error" && <><p role="alert">{text.error}</p><button type="button" onClick={retry}>{text.retry}</button></>}
      {data && <>
        <p>{text.results.replace("{count}", String(data.total))}</p>
        {data.results.length === 0 ? <p role="status">{text.empty}</p> : personal
          ? <PersonalSetList key={auth.user.id} sets={data.results} /> : <SetList sets={data.results} />}
        <nav className="tcg-pagination" aria-label={text.title}>
          {page > 1 ? <Link to={pageHref(page - 1)}>{dictionary.cards.previous}</Link> : <span aria-disabled="true">{dictionary.cards.previous}</span>}
          <span>{dictionary.cards.page} {page}</span>
          {page * 12 < data.total && page < MAX_SET_PAGE ? <Link to={pageHref(page + 1)}>{dictionary.cards.next}</Link> : <span aria-disabled="true">{dictionary.cards.next}</span>}
        </nav>
      </>}
    </div>
    <p className="tcg-source">{text.source}</p>
  </section>;
}
