import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { plural } from "../components/home/plural";
import { SpeciesTile } from "../components/pokedex/SpeciesTile";
import { Button } from "../components/ui/Button";
import { InlineError } from "../components/ui/InlineError";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { GENERATIONS, pokemonTypes, searchSpecies, type PokemonType, type SpeciesRow } from "../services/pokemon";
import { fetchSpeciesCounts, fetchSpeciesIndex, type Show } from "../services/species";
import "../components/pokedex/pokedex.css";

const PAGE = 60;
const RETRIES = 3;
const RETRY_MS = 5000;
const SHOWS: Show[] = ["all", "owned", "missing"];

/** Everything lives in the URL: ?gen=&type=&show=&q= (invalid values quietly become the defaults). */
function readState(params: URLSearchParams) {
  const gen = /^[1-9]$/.test(params.get("gen") ?? "") ? Number(params.get("gen")) : 1;
  const type = pokemonTypes.find((known) => known === params.get("type")) ?? null;
  const show = SHOWS.find((known) => known === params.get("show")) ?? "all";
  const q = (params.get("q") ?? "").slice(0, 40);
  return { gen, type, show, q };
}

type Saved = { count: number; y: number };
const storageKey = (search: string) => `pv-pokedex:${search}`;
function load(search: string): Saved | null {
  try { return JSON.parse(sessionStorage.getItem(storageKey(search)) ?? "null"); } catch { return null; }
}

function Dex({ signedIn, resolving, userId }: { signedIn: boolean; resolving: boolean; userId: string }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.pokedex;
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { gen, type, show, q } = readState(params);
  const index = useTcgResource("species-index", fetchSpeciesIndex);
  const ownershipRequest = useCallback((signal: AbortSignal) => fetchSpeciesCounts(signal), []);
  const ownership = useTcgResource(signedIn ? `species-counts:${userId}` : undefined, ownershipRequest);
  const counts = ownership.state.kind === "loaded" ? ownership.state.data : null;
  const known = signedIn && counts !== null;
  const [attempts, setAttempts] = useState(0);
  const retryOwnership = ownership.retry;
  const pending = counts?.pending ?? 0;
  useEffect(() => {
    if (pending === 0 || attempts >= RETRIES) return;
    const timer = window.setTimeout(() => { setAttempts((value) => value + 1); retryOwnership(); }, RETRY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, attempts, retryOwnership]);

  const [saved] = useState(() => load(location.search));
  const [shown, setShown] = useState(() => Math.max(PAGE, saved?.count ?? PAGE));
  const [resetKey, setResetKey] = useState(location.search);
  if (resetKey !== location.search) { setResetKey(location.search); setShown(PAGE); }

  function update(change: Partial<{ gen: number; type: PokemonType | null; show: Show; q: string }>, push = false) {
    const next = { gen, type, show, q, ...change };
    const out = new URLSearchParams();
    if (next.gen !== 1) out.set("gen", String(next.gen));
    if (next.type) out.set("type", next.type);
    if (next.show !== "all") out.set("show", next.show);
    if (next.q) out.set("q", next.q);
    setParams(out, { replace: !push });
  }
  // A filter the user cannot use here (owned/missing without ownership) quietly becomes "all".
  const effectiveShow: Show = known ? show : "all";
  useEffect(() => {
    if (show !== "all" && !known && !resolving && ownership.state.kind !== "loading") update({ show: "all" });
  });

  const indexed = index.state.kind === "loaded" ? index.state.data : null;
  const rows = useMemo<SpeciesRow[]>(() => indexed ?? [], [indexed]);
  const generation = GENERATIONS[gen - 1];
  const region = generation.region[locale];
  const matches = useMemo(() => {
    const base = q.trim() ? searchSpecies(rows, q) : rows.filter((row) => row.national_dex_number >= generation.from && row.national_dex_number <= generation.to);
    return base.filter((row) => (!type || row.types.includes(type))
      && (effectiveShow === "all" || ((counts?.counts[row.national_dex_number] ?? 0) > 0) === (effectiveShow === "owned")));
  }, [rows, q, type, effectiveShow, counts, generation]);

  // Restore the scroll once, after the rows exist.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || rows.length === 0 || !saved) return;
    restored.current = true;
    window.scrollTo?.(0, saved.y);
  }, [rows.length, saved]);
  const sentinel = useRef<HTMLDivElement>(null);
  const more = matches.length > shown;
  useEffect(() => {
    const element = sentinel.current;
    if (!more || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setShown((value) => value + PAGE); }, { rootMargin: "400px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [more, shown]);

  const owned = counts?.species_owned ?? 0;
  const total = rows.length || 1025;
  const returnTo = `/pokedex${location.search}`;
  const remember = () => { try { sessionStorage.setItem(storageKey(location.search), JSON.stringify({ count: shown, y: window.scrollY })); } catch { /* storage is optional */ } };
  const perGen = (g: (typeof GENERATIONS)[number]) => counts ? Object.keys(counts.counts).filter((n) => Number(n) >= g.from && Number(n) <= g.to).length : null;
  const filtered = Boolean(type || effectiveShow !== "all" || q);

  return <section className="pv-dex" aria-labelledby="pokedex-title">
    <div className="pv-dex__head">
      <h1 id="pokedex-title">{text.gridTitle}</h1>
      {signedIn && known && <>
        <p>{text.progress.replace("{owned}", String(owned)).replace("{total}", String(total))}</p>
        <div className="pv-dex__bar" role="progressbar" aria-label={text.progressLabel} aria-valuemin={0} aria-valuemax={total} aria-valuenow={owned}><span style={{ width: `${(owned / total) * 100}%` }} /></div>
        {pending > 0 && <p className="pv-home__meta" role="status">{text.progressPending.replace("{count}", String(pending))}{attempts >= RETRIES && <> <Button onClick={() => { setAttempts(0); retryOwnership(); }}>{dictionary.home.retry}</Button></>}</p>}
      </>}
      {signedIn && !known && ownership.state.kind === "loading" && <p className="pv-home__meta" role="status">{text.progressLoading}</p>}
      {signedIn && ownership.state.kind === "error" && <InlineError calm message={text.ownershipError} retryLabel={dictionary.home.retry} onRetry={ownership.retry} />}
      {!signedIn && !resolving && <p><Link to="/login">{text.progressGuest}</Link></p>}
    </div>

    <div className="pv-dex__tabs" role="tablist" aria-label={text.generations}>
      {GENERATIONS.map((g) => {
        const count = perGen(g);
        return <button key={g.id} type="button" role="tab" aria-selected={!q && gen === g.id} tabIndex={gen === g.id ? 0 : -1}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const target = GENERATIONS[(g.id - 1 + step + GENERATIONS.length) % GENERATIONS.length];
            update({ gen: target.id, q: "" }, true);
            (event.currentTarget.parentElement?.children[target.id - 1] as HTMLElement | undefined)?.focus();
          }}
          onClick={() => update({ gen: g.id, q: "" }, true)}>
          {text.generationTab.replace("{roman}", g.roman).replace("{region}", g.region[locale])}
          <small>{count === null ? text.generationRange.replace("{from}", String(g.from)).replace("{to}", String(g.to)) : text.generationOwned.replace("{owned}", String(count)).replace("{total}", String(g.to - g.from + 1))}</small>
        </button>;
      })}
    </div>

    <div className="pv-dex__filters" role="search">
      <label>{text.searchLabel}
        <input type="search" autoComplete="off" maxLength={40} value={q} placeholder={text.searchPlaceholder} onChange={(event) => update({ q: event.target.value })} />
      </label>
      <div className="pv-dex__show" role="radiogroup" aria-label={text.showLabel}>
        {SHOWS.map((value) => <button key={value} type="button" role="radio" aria-checked={effectiveShow === value}
          disabled={value !== "all" && !known} title={value !== "all" && !known ? text.showNeedsLogin : undefined} onClick={() => update({ show: value })}>
          {value === "all" ? text.showAll : value === "owned" ? text.showOwned : text.showMissing}</button>)}
      </div>
    </div>
    <div className="pv-dex__types" role="group" aria-label={text.typesLabel}>
      {pokemonTypes.map((kind) => <button key={kind} type="button" className="pv-chipbtn" aria-pressed={type === kind} onClick={() => update({ type: type === kind ? null : kind })}>
        <i className={`pv-typedot type-badge--${kind}`} aria-hidden="true" />{dictionary.pokemonTypes[kind]}</button>)}
    </div>

    {index.state.kind === "loading" && <LoadingStatus label={text.loading}><div className="pv-dex__skeleton">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} shape="card" />)}</div></LoadingStatus>}
    {index.state.kind === "error" && <InlineError calm message={text.pokedexError} retryLabel={dictionary.home.retry} onRetry={index.retry} />}
    {index.state.kind === "loaded" && <>
      <p className="pv-sr-only" role="status">{plural(text.resultCount, matches.length)}</p>
      {matches.length === 0 ? <div className="pv-home__meta" role="status"><p>{q && !filtered ? text.searchNone : q ? text.searchNone : text.noMatch}</p>
        {filtered && <Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>{text.clearFilters}</Button>}</div>
        : <ul className="pv-dex__grid" aria-label={q ? text.resultsLabel : text.listLabel.replace("{region}", region)}>
          {matches.slice(0, shown).map((row) => <SpeciesTile key={row.national_dex_number} row={row} cards={counts?.counts[row.national_dex_number] ?? 0}
            ownership={known ? "known" : "unknown"} returnTo={returnTo} onOpen={remember} />)}
        </ul>}
      {more && <div ref={sentinel}><Button onClick={() => setShown((value) => value + PAGE)}>{text.more.replace("{count}", String(matches.length - shown))}</Button></div>}
    </>}
  </section>;
}

export function PokedexPage() {
  const auth = useAuth();
  const resolving = auth.status === "loading";
  const signedIn = auth.status === "authenticated" && !auth.loggingOut;
  // One component for guests and users: the public index is requested once; ownership is keyed by user.
  return <Dex signedIn={signedIn} resolving={resolving} userId={signedIn ? auth.user.id : ""} />;
}
