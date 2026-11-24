import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { useCardMetadata } from "../components/cards/cardMetadata";
import { CardArtwork } from "../components/cards/CardArtwork";
import { cardIdentity, fill, plural } from "../components/binders/labels";
import { PageGrid, type PocketRef } from "../components/binders/PageGrid";
import { BinderValue } from "../components/prices/BinderValue";
import { useCurrency } from "../components/prices/currency";
import { Button, ButtonLink } from "../components/ui/Button";
import { InlineError } from "../components/ui/InlineError";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { useBinderMutations, type BinderErrorKey } from "../hooks/useBinderMutations";
import { MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import {
  BindersError, fetchBinder, fetchBinders, fetchCopyView, MAX_PAGES, placeInPocket, removeFromPocket, spreadStart, storeNext,
  type Binder, type CopyViewPage, type StoreResult,
} from "../services/binders";
import type { InventoryCopy } from "../services/inventory";
import { fetchCopyPrices, PricesError } from "../services/prices";
import "../components/binders/binders.css";

type Mode = { kind: "idle" } | { kind: "fill"; target: PocketRef } | { kind: "move"; copy: InventoryCopy; from: PocketRef; binderId: string };
const key = (target: PocketRef) => `${target.page}:${target.pocket}`;
const clampPage = (value: number, pages: number) => Number.isInteger(value) ? Math.min(Math.max(value, 1), pages) : 1;

function useGuard() {
  const { retrySession } = useAuth();
  return useCallback((error: unknown, signal: AbortSignal): never => {
    const status = error instanceof BindersError || error instanceof PricesError ? error.status : 0;
    if (!signal.aborted && status === 401) retrySession();
    throw error;
  }, [retrySession]);
}

function Tray({ mode, binderId, busy, onStore, version, onCancel }: {
  mode: Mode; binderId: string; busy: boolean; version: number;
  onStore: (copy: InventoryCopy) => void; onCancel: () => void;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.binders;
  const guard = useGuard();
  const [offset, setOffset] = useState(0);
  const request = useCallback((signal: AbortSignal) => fetchCopyView("unassigned", offset, signal).catch((e: unknown) => guard(e, signal)), [offset, guard]);
  const tray = useTcgResource<CopyViewPage>(`${binderId}:${offset}:${version}`, request);
  const page = tray.state.kind === "loaded" ? tray.state.data : undefined;
  const metadata = useCardMetadata(page?.results.map((copy) => copy.card_id) ?? [], locale);
  const fillTarget = mode.kind === "fill" ? mode.target : null;
  return <section className="pv-tray" aria-labelledby="pv-tray-title">
    <div className="pv-tray__head">
      <h2 id="pv-tray-title" tabIndex={-1}>{text.tray}</h2>
      {page && <span className="pv-tray__count">{fill(text.trayTotal, { count: page.total })}</span>}
    </div>
    <p className="pv-binder__hint">{fillTarget ? fill(text.trayTargetHint, fillTarget) : text.trayHint}</p>
    {fillTarget && <Button onClick={onCancel}>{text.trayCancel}</Button>}
    {tray.state.kind === "loading" && <LoadingStatus label={text.trayLoading}><Skeleton shape="text" lines={3} /></LoadingStatus>}
    {tray.state.kind === "error" && <InlineError message={text.trayError} retryLabel={text.retry} onRetry={tray.retry} />}
    {page && page.results.length === 0 && <p className="pv-binder__hint">{text.trayEmpty}</p>}
    {page && page.results.length > 0 && <ul className="pv-tray__list">
      {page.results.map((copy) => {
        const card = metadata.cards[copy.card_id];
        const identity = cardIdentity(copy, card);
        const label = fillTarget ? fill(text.storeHere, { card: identity, ...fillTarget }) : fill(text.storeNext, { card: identity });
        return <li key={copy.id}>
          <button type="button" className="pv-tray__item" disabled={busy} aria-label={label} onClick={() => onStore(copy)}>
            <span className="pv-tray__thumb" aria-hidden="true">{card ? <CardArtwork card={card} /> : <span className="pv-pocket__fallback">{copy.card_id}</span>}</span>
            <span className="pv-tray__facts">
              <strong>{identity}</strong>
              <span>{dictionary.inventory.variants[copy.variant]} · {dictionary.inventory.languages[copy.language]} · {dictionary.inventory.conditions[copy.condition]}</span>
            </span>
          </button>
        </li>;
      })}
    </ul>}
    {page && page.total > 30 && <div className="pv-tray__pages">
      <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>{text.trayPrevious}</Button>
      <Button disabled={offset + 30 >= page.total} onClick={() => setOffset(offset + 30)}>{text.trayNext}</Button>
    </div>}
  </section>;
}

function MoveTargets({ current, value, onChange }: { current: string; value: string; onChange: (id: string) => void }) {
  const { dictionary } = useLocale();
  const guard = useGuard();
  const request = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource("move-targets", request);
  const binders = list.state.kind === "loaded" ? list.state.data.results : [];
  return <label className="pv-field">{dictionary.binders.moveBinder}
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {!binders.some((b) => b.id === current) && <option value={current}>…</option>}
      {binders.map((binder) => <option key={binder.id} value={binder.id}>{binder.name}</option>)}
    </select>
  </label>;
}

function BinderWorkspace({ binderId }: { binderId: string }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.binders;
  const { currency, ready } = useCurrency();
  const [params, setParams] = useSearchParams();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const guard = useGuard();
  const { busy, run } = useBinderMutations();
  const request = useCallback((signal: AbortSignal) => fetchBinder(binderId, signal).catch((e: unknown) => guard(e, signal)), [binderId, guard]);
  const detail = useTcgResource(binderId, request);
  const loaded = detail.state.kind === "loaded" ? detail.state.data : undefined;
  const [local, setLocal] = useState<{ base: Binder; value: Binder }>();
  const binder = local && local.base === loaded ? local.value : loaded;
  const pageCount = binder?.page_count ?? 2;
  const [requestedPage, setRequestedPage] = useState(() => Number(params.get("page") ?? 1));
  const currentPage = clampPage(requestedPage, pageCount);
  const first = mobile ? currentPage : spreadStart(currentPage);
  const visible = mobile ? [first] : [first, first + 1].filter((p) => p <= pageCount);
  const [selected, setSelected] = useState<PocketRef | null>(() => {
    const page = Number(params.get("page")); const pocket = Number(params.get("pocket"));
    return Number.isInteger(page) && Number.isInteger(pocket) && page >= 1 && page <= MAX_PAGES && pocket >= 1 && pocket <= 9 ? { page, pocket } : null;
  });
  const [mode, setMode] = useState<Mode>({ kind: "idle" });
  const [arrived, setArrived] = useState<PocketRef | null>(null);
  const [turn, setTurn] = useState<"next" | "prev" | null>(null);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState<BinderErrorKey | null>(null);
  const [trayVersion, setTrayVersion] = useState(0);
  const [focusRequest, setFocusRequest] = useState<PocketRef | null>(() => selected);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const register = useCallback((target: PocketRef) => (node: HTMLButtonElement | null) => {
    if (node) buttons.current.set(key(target), node); else buttons.current.delete(key(target));
  }, []);
  // Motion marks clear just after their animation (600 ms drop, 280 ms turn). A timer
  // also works when reduced motion removes the animation and no animationend fires.
  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setArrived(null), 700);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  useEffect(() => {
    if (!turn) return;
    const timer = window.setTimeout(() => setTurn(null), 350);
    return () => window.clearTimeout(timer);
  }, [turn, first]);
  useEffect(() => {
    if (!focusRequest || !binder) return;
    buttons.current.get(key(focusRequest))?.focus();
  }, [focusRequest, binder, first]);

  const visiblePockets = binder?.pockets.filter((p) => visible.includes(p.page)) ?? [];
  const metadata = useCardMetadata(visiblePockets.map((p) => p.copy.card_id), locale);
  const ids = visiblePockets.map((p) => p.copy.id).join(",");
  const pricesRequest = useCallback((signal: AbortSignal) => fetchCopyPrices(ids.split(","), currency, signal).catch((e: unknown) => guard(e, signal)), [ids, currency, guard]);
  const prices = useTcgResource(ready && ids ? `${ids}:${currency}` : undefined, pricesRequest);
  const priceById = prices.state.kind === "loaded" ? Object.fromEntries(prices.state.data.results.map((row) => [row.copy_id, row])) : {};

  function goTo(page: number, direction?: "next" | "prev") {
    const next = clampPage(page, pageCount);
    if (next === currentPage) return;
    setRequestedPage(next);
    setTurn(direction ?? (next > currentPage ? "next" : "prev"));
    const updated = new URLSearchParams(params); updated.set("page", String(next)); updated.delete("pocket"); setParams(updated, { replace: true });
  }
  function turnPage(direction: 1 | -1) {
    const step = mobile ? 1 : 2;
    const target = first + direction * step;
    if (target < 1 || target > pageCount) return;
    goTo(target, direction === 1 ? "next" : "prev");
    const focus = { page: target, pocket: 1 }; setSelected(focus); setFocusRequest(focus);
  }
  function select(target: PocketRef) {
    setSelected(target); setFocusRequest(target); setArrived(null); setProblem(null);
    if (mode.kind === "move" && mode.binderId === binderId && !binder?.pockets.some((p) => p.page === target.page && p.pocket === target.pocket)) {
      void moveTo(target);
    } else if (mode.kind === "fill") setMode({ kind: "idle" });
  }

  function announce(result: StoreResult) {
    const where = { binder: result.binder.name, page: result.page, pocket: result.pocket };
    if (!result.moved_from) setStatus(fill(text.stored, where));
    else if (result.moved_from.binder_id === result.binder.id) setStatus(fill(text.movedWithin, where));
    else setStatus(fill(text.movedFrom, { ...where, from: result.moved_from.binder_name }));
  }
  function landed(result: StoreResult) {
    announce(result);
    setMode({ kind: "idle" }); setProblem(null);
    if (result.binder.id === binderId) {
      if (loaded) setLocal({ base: loaded, value: result.binder });
      const target = { page: result.page, pocket: result.pocket };
      setArrived(target); setSelected(target); setFocusRequest(target);
      if (!visible.includes(result.page)) goTo(result.page);
    } else if (binder && loaded && result.moved_from) {
      // Moved out of this binder: drop it here without refetching the whole binder.
      const from = result.moved_from;
      setLocal({ base: loaded, value: { ...binder, copy_count: binder.copy_count - 1,
        pockets: binder.pockets.filter((p) => !(p.page === from.page && p.pocket === from.pocket)) } });
    }
    setTrayVersion((v) => v + 1);
  }
  function failed(error: BinderErrorKey) {
    setProblem(error); setStatus("");
    if (error !== "expired" && error !== "error") detail.retry();
    if (error === "missing") setTrayVersion((v) => v + 1);
  }

  async function store(copy: InventoryCopy) {
    const target = mode.kind === "fill" ? mode.target : null;
    const outcome = await run((csrf, signal) => target ? placeInPocket(binderId, target, copy.id, csrf, signal) : storeNext(binderId, copy.id, csrf, signal));
    if (!outcome) return;
    if (outcome.ok) landed(outcome.value); else failed(outcome.error);
  }
  async function moveTo(target: PocketRef | "next") {
    if (mode.kind !== "move") return;
    const { copy, binderId: destination } = mode;
    const outcome = await run((csrf, signal) => target === "next" ? storeNext(destination, copy.id, csrf, signal) : placeInPocket(destination, target, copy.id, csrf, signal));
    if (!outcome) return;
    if (outcome.ok) landed(outcome.value); else failed(outcome.error);
  }
  async function takeOut(target: PocketRef, copy: InventoryCopy) {
    const outcome = await run((csrf, signal) => removeFromPocket(binderId, target, copy.id, csrf, signal));
    if (!outcome) return;
    if (!outcome.ok) { failed(outcome.error); return; }
    if (binder && loaded) setLocal({ base: loaded, value: { ...binder, copy_count: binder.copy_count - 1,
      pockets: binder.pockets.filter((p) => !(p.page === target.page && p.pocket === target.pocket)) } });
    setStatus(text.removed); setProblem(null); setArrived(null); setTrayVersion((v) => v + 1);
    setFocusRequest(null); document.getElementById("pv-tray-title")?.focus();
  }

  if (detail.state.kind === "loading") return <LoadingStatus label={text.loading}><Skeleton shape="block" /><Skeleton shape="block" /></LoadingStatus>;
  if (detail.state.kind === "error" || !binder) return <InlineError message={detail.state.kind === "error" && detail.state.notFound ? text.errors.missing : text.loadError} retryLabel={text.retry} onRetry={detail.retry} />;

  const held = selected ? binder.pockets.find((p) => p.page === selected.page && p.pocket === selected.pocket) : undefined;
  const heldCard = held ? metadata.cards[held.copy.card_id] : undefined;
  const label = visible.length === 2 ? fill(text.spread, { from: visible[0], to: visible[1], total: pageCount }) : fill(text.single, { page: visible[0], total: pageCount });

  return <>
    <header className="pv-binder__head">
      <div>
        <Link className="pv-binder__back" to="/binders">‹ {text.back}</Link>
        <h1 id="pv-binder-title">{binder.name}</h1>
        <p className="pv-binder__hint">{plural(text.cards, binder.copy_count)}</p>
      </div>
      <BinderValue binderId={binder.id} version={binder.pockets.map((p) => `${key(p)}:${p.copy.id}`).join(",")} />
    </header>
    <p className="pv-binder__status" role="status" aria-live="polite">{status}</p>
    {problem && <p className="pv-binder__problem" role="alert">{text.errors[problem]}</p>}
    <div className="pv-binder__layout">
      <div className="pv-binder__main">
        <nav className="pv-binder__pager" aria-label={label}>
          <Button disabled={first <= 1} onClick={() => turnPage(-1)}>‹ {text.previous}</Button>
          <span className="pv-binder__pages">{label}</span>
          <Button disabled={first + (mobile ? 1 : 2) > pageCount} onClick={() => turnPage(1)}>{text.next} ›</Button>
        </nav>
        <div className="pv-spread" data-turn={turn ?? undefined}>
          {visible.map((page) => <PageGrid key={page} page={page} pockets={binder.pockets} cards={metadata.cards} prices={priceById}
            selected={selected} arrived={arrived} targetable={mode.kind === "move" && mode.binderId === binderId}
            select={select} onTurn={turnPage} register={register} />)}
        </div>
        <p className="pv-binder__hint">{text.keyboard}</p>
      </div>
      <aside className="pv-selection" aria-label={text.selected}>
        <h2>{selected ? fill(text.selectedTitle, selected) : text.selected}</h2>
        {!selected && <p className="pv-binder__hint">{text.chooseHint}</p>}
        {selected && held && mode.kind !== "move" && <>
          <p className="pv-selection__name">{cardIdentity(held.copy, heldCard)}</p>
          <p className="pv-binder__hint">{dictionary.inventory.variants[held.copy.variant]} · {dictionary.inventory.languages[held.copy.language]} · {dictionary.inventory.conditions[held.copy.condition]}</p>
          <div className="pv-selection__actions">
            <ButtonLink to={`/collection/${encodeURIComponent(held.copy.id)}`} variant="secondary">{text.viewCopy}</ButtonLink>
            <Button disabled={busy} onClick={() => setMode({ kind: "move", copy: held.copy, from: selected, binderId })}>{text.move}</Button>
            <Button disabled={busy} onClick={() => void takeOut(selected, held.copy)}>{text.takeOut}</Button>
          </div>
        </>}
        {selected && held && mode.kind === "move" && <div className="pv-selection__move">
          <h3>{text.moveTitle}</h3>
          <p className="pv-binder__hint">{text.moveHint}</p>
          <MoveTargets current={binderId} value={mode.binderId} onChange={(id) => setMode({ ...mode, binderId: id })} />
          <div className="pv-selection__actions">
            <Button variant="primary" disabled={busy} onClick={() => void moveTo("next")}>{text.moveNext}</Button>
            <Button disabled={busy} onClick={() => setMode({ kind: "idle" })}>{text.cancel}</Button>
          </div>
        </div>}
        {selected && !held && <>
          <p className="pv-binder__hint">{text.emptyPocket}</p>
          <Button disabled={busy} onClick={() => setMode({ kind: "fill", target: selected })}>{text.fillFromTray}</Button>
        </>}
      </aside>
      <Tray mode={mode} binderId={binderId} busy={busy} version={trayVersion} onStore={(copy) => void store(copy)} onCancel={() => setMode({ kind: "idle" })} />
    </div>
  </>;
}

export function BinderPage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  const { binderId = "" } = useParams();
  return <section className="pv-binder" aria-labelledby="pv-binder-title">
    <SessionNotice />
    {auth.status === "unauthenticated" && <><h1 id="pv-binder-title">{dictionary.binders.title}</h1><p>{dictionary.binders.signIn}</p><Link to="/login">{dictionary.auth.signIn}</Link></>}
    {auth.status === "authenticated" && !auth.loggingOut && !auth.validating && <BinderWorkspace key={`${auth.user.id}:${binderId}`} binderId={binderId} />}
  </section>;
}
