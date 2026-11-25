import { useCallback, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { binderAmount } from "../components/binders/amount";
import { Cover } from "../components/binders/Cover";
import { fill, plural } from "../components/binders/labels";
import { useCurrency } from "../components/prices/currency";
import { RatesAttribution } from "../components/prices/PriceDisplay";
import { Button, ButtonLink } from "../components/ui/Button";
import { Chip } from "../components/ui/Chip";
import { CutPanel } from "../components/ui/CutPanel";
import { InlineError } from "../components/ui/InlineError";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { useBinderMutations, type BinderErrorKey } from "../hooks/useBinderMutations";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { BindersError, createBinder, deleteBinder, fetchBinders, fetchCopyView, renameBinder, reorderBinders, type BinderSummary } from "../services/binders";
import { fetchBinderValues, PricesError, type BinderValue } from "../services/prices";
import "../components/binders/binders.css";

function BinderCard({ binder, value, valuesLoading, index, total, busy, onRename, onMove, onDelete }: {
  binder: BinderSummary; value?: BinderValue; valuesLoading: boolean; index: number; total: number; busy: boolean;
  onRename: (name: string) => Promise<boolean>; onMove: (delta: number) => void; onDelete: () => void;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.binders;
  const { currency } = useCurrency();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(binder.name);
  const titleId = `binder-${binder.id}-title`;
  const amount = binderAmount(value, currency, locale);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (await onRename(name)) setEditing(false);
  }
  return <li className="pv-shelf__item">
    <article className="pv-shelf__binder" aria-labelledby={titleId}>
      <Cover binderId={binder.id} cover={binder.cover} stickers={binder.stickers} />
      <div className="pv-shelf__facts">
        <h2 id={titleId}><Link to={`/binders/${encodeURIComponent(binder.id)}`}>{binder.name}</Link></h2>
        <p className="pv-binder__hint">{plural(text.cards, binder.copy_count)}</p>
        {valuesLoading ? <Skeleton shape="text" /> : amount && <p className="pv-shelf__value price-amount" aria-label={`${text.value}: ${amount}`}>{amount}</p>}
      </div>
      <details className="pv-shelf__manage">
        <summary>{fill(text.manage, { name: binder.name })}</summary>
        {!editing && <Button disabled={busy} onClick={() => setEditing(true)}>{text.rename}</Button>}
        {editing && <form onSubmit={(event) => void save(event)} className="pv-shelf__form">
          <label className="pv-field">{text.nameLabel}<input value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label>
          <Button type="submit" variant="primary" disabled={busy || !name.trim()}>{text.saveName}</Button>
          <Button onClick={() => { setEditing(false); setName(binder.name); }}>{text.cancel}</Button>
        </form>}
        <Button disabled={busy || index === 0} onClick={() => onMove(-1)}>{text.earlier}</Button>
        <Button disabled={busy || index >= total - 1} onClick={() => onMove(1)}>{text.later}</Button>
        {!confirming && <Button disabled={busy} onClick={() => setConfirming(true)}>{text.delete}</Button>}
        {confirming && <div className="pv-shelf__confirm" role="group" aria-label={text.delete}>
          <p>{fill(text.deleteQuestion, { name: binder.name })}</p>
          <p className="pv-binder__hint">{text.deleteNote}</p>
          <Button disabled={busy} onClick={onDelete}>{text.confirmDelete}</Button>
          <Button onClick={() => setConfirming(false)}>{text.cancel}</Button>
        </div>}
      </details>
    </article>
  </li>;
}

function Shelf() {
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const { busy, run } = useBinderMutations();
  const [version, setVersion] = useState(0);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState<BinderErrorKey | null>(null);
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    const code = error instanceof BindersError || error instanceof PricesError ? error.status : 0;
    if (!signal.aborted && code === 401) retrySession();
    throw error;
  }, [retrySession]);
  const listRequest = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource(`binders:${version}`, listRequest);
  const valuesRequest = useCallback((signal: AbortSignal) => fetchBinderValues(currency, signal).catch((e: unknown) => guard(e, signal)), [currency, guard]);
  const values = useTcgResource(ready ? `values:${currency}:${version}` : undefined, valuesRequest);
  const trayRequest = useCallback((signal: AbortSignal) => fetchCopyView("unassigned", 0, signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const tray = useTcgResource("shelf-tray", trayRequest);
  const binders = list.state.kind === "loaded" ? list.state.data.results : [];
  const byId = values.state.kind === "loaded" ? Object.fromEntries(values.state.data.results.map((v) => [v.binder_id, v])) : {};
  const loose = tray.state.kind === "loaded" ? tray.state.data.total : 0;

  async function mutate<T>(action: (csrf: string, signal: AbortSignal) => Promise<T>) {
    const outcome = await run(action);
    if (!outcome) return false;
    if (outcome.ok) { setProblem(null); setVersion((v) => v + 1); return true; }
    setProblem(outcome.error); setStatus(""); setVersion((v) => v + 1); return false;
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (name && await mutate((csrf, signal) => createBinder(name, csrf, signal))) setNewName("");
  }
  function move(index: number, delta: number) {
    const ids = binders.map((b) => b.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void mutate((csrf, signal) => reorderBinders(ids, csrf, signal));
  }

  const form = <form className="pv-shelf__form" onSubmit={(event) => void create(event)}>
    <label className="pv-field">{text.newName}<input value={newName} maxLength={80} required onChange={(event) => setNewName(event.target.value)} /></label>
    <Button type="submit" variant="primary" disabled={busy || !newName.trim()}>{text.createAction}</Button>
  </form>;

  return <>
    <p className="pv-binder__status" role="status" aria-live="polite">{status}</p>
    {problem && <p className="pv-binder__problem" role="alert">{text.errors[problem]}</p>}
    {loose > 0 && binders.length > 0 && <Chip to={`/binders/${encodeURIComponent(binders[0].id)}`}>{plural(text.unassigned, loose)}</Chip>}
    {list.state.kind === "loading" && <LoadingStatus label={text.loading}><ul className="pv-shelf">{[0, 1, 2].map((i) => <li key={i}><Skeleton shape="block" /></li>)}</ul></LoadingStatus>}
    {list.state.kind === "error" && <InlineError message={text.loadError} retryLabel={text.retry} onRetry={list.retry} />}
    {list.state.kind === "loaded" && binders.length === 0 && <CutPanel tone="value" className="pv-shelf__empty" aria-labelledby="pv-shelf-empty">
      <h2 id="pv-shelf-empty">{text.empty}</h2>
      <p className="pv-binder__hint">{text.emptyText}</p>
      {form}
      <ButtonLink to="/scanner" variant="secondary">{dictionary.home.scanAction}</ButtonLink>
    </CutPanel>}
    {binders.length > 0 && <>
      <ul className="pv-shelf">{binders.map((binder, index) => <BinderCard key={binder.id} binder={binder} value={byId[binder.id]}
        valuesLoading={values.state.kind === "loading"} index={index} total={binders.length} busy={busy}
        onRename={(name) => mutate((csrf, signal) => renameBinder(binder.id, name, csrf, signal))}
        onMove={(delta) => move(index, delta)} onDelete={() => void mutate((csrf, signal) => deleteBinder(binder.id, csrf, signal))} />)}</ul>
      {values.state.kind === "loaded" && values.state.data.results.some((v) => v.total !== null && v.priced_count > 0) && <RatesAttribution rates={values.state.data.rates} />}
      <details className="pv-shelf__create"><summary>{text.create}</summary>{form}</details>
    </>}
  </>;
}

export function BindersPage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  return <section className="pv-binders" aria-labelledby="pv-binders-title">
    <h1 id="pv-binders-title">{text.title}</h1>
    <p className="pv-binder__hint">{text.description}</p>
    <SessionNotice />
    {auth.status === "unauthenticated" && <><p>{text.signIn}</p><Link to="/login">{dictionary.auth.signIn}</Link></>}
    {auth.status === "authenticated" && !auth.loggingOut && <Shelf key={auth.user.id} />}
  </section>;
}
