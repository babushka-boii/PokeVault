import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource, type Resource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchBinders } from "../../services/binders";
import { fetchSet } from "../../services/sets";
import { type BinderValues, type SetValues, type Currency } from "../../services/prices";
import { formatMoney } from "../prices/format";
import { InlineError } from "../ui/InlineError";
import { PixelLabel } from "../ui/PixelLabel";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";

type Row = { key: string; label: string; total: number; shown: string };
const SHOWN = 5;

function Card({ title, state, retry, rows, empty }: { title: string; state: "loading" | "error" | "loaded"; retry: () => void; rows: Row[]; empty: string }) {
  const text = useLocale().dictionary.profilePage;
  const sum = rows.reduce((all, row) => all + row.total, 0);
  return <section className="pv-break" aria-label={title}>
    <PixelLabel>{title}</PixelLabel>
    {state === "loading" && <LoadingStatus label={text.loading}><Skeleton shape="text" lines={2} /></LoadingStatus>}
    {state === "error" && <InlineError calm message={text.breakdownError} retryLabel={text.retry} onRetry={retry} />}
    {state === "loaded" && rows.length === 0 && <p className="pv-break__empty">{empty}</p>}
    {state === "loaded" && rows.map((row) => <div key={row.key} className="pv-break__row">
      <div><span>{row.label}</span><span className="pv-break__value">{row.shown}</span></div>
      <div className="pv-break__bar" aria-hidden="true"><div style={{ width: `${sum > 0 ? Math.round(row.total / sum * 100) : 0}%` }} /></div>
    </div>)}
  </section>;
}

const amount = (value: { total: string | null; original_totals: Partial<Record<"EUR" | "USD", string>> }, currency: Currency, locale: "es" | "en") =>
  value.total !== null ? formatMoney(value.total, currency, locale) : Object.entries(value.original_totals).map(([code, original]) => formatMoney(original, code as "EUR" | "USD", locale, true)).join(" + ") || formatMoney("0", currency, locale);
const total = (value: { total: string | null }) => Number(value.total ?? 0);

/** "Valor por carpeta" and "Valor por expansión": each row's bar is its share of the rows shown. */
export function Breakdowns({ binderValues, setValues }: { binderValues: Resource<BinderValues>; setValues: Resource<SetValues> }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.profilePage;
  const { retrySession } = useAuth();
  const binderNames = useTcgResource("profile-binders", useCallback((signal: AbortSignal) => fetchBinders(signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof BindersError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]));
  const top = setValues.state.kind === "loaded" ? setValues.state.data.results.slice(0, SHOWN).map((row) => row.set_id) : [];
  const key = top.join(",");
  const names = useTcgResource(key ? `profile-set-names:${locale}:${key}` : undefined, useCallback(async (signal: AbortSignal) => {
    const found = await Promise.allSettled(key.split(",").map((id) => fetchSet(id, locale, signal)));
    return Object.fromEntries(found.flatMap((item, index) => item.status === "fulfilled" ? [[key.split(",")[index], item.value.name]] : []));
  }, [key, locale]));
  const nameOfSet = (id: string) => (names.state.kind === "loaded" ? names.state.data[id] : undefined) ?? id.toUpperCase();

  const binderRows: Row[] = binderValues.state.kind === "loaded" && binderNames.state.kind === "loaded"
    ? binderValues.state.data.results.flatMap((row) => { const binder = binderNames.state.kind === "loaded" ? binderNames.state.data.results.find((item) => item.id === row.binder_id) : undefined;
      const currency = binderValues.state.kind === "loaded" ? binderValues.state.data.currency : "CLP";
      return binder ? [{ key: row.binder_id, label: binder.name, total: total(row), shown: amount(row, currency, locale) }] : []; })
    : [];
  const setRows: Row[] = setValues.state.kind === "loaded"
    ? setValues.state.data.results.slice(0, SHOWN).map((row) => ({ key: row.set_id, label: nameOfSet(row.set_id), total: total(row), shown: amount(row, setValues.state.kind === "loaded" ? setValues.state.data.currency : "CLP", locale) }))
    : [];
  const binderState = binderValues.state.kind === "error" || binderNames.state.kind === "error" ? "error" : binderValues.state.kind === "loading" || binderNames.state.kind === "loading" ? "loading" : "loaded";
  return <div className="pv-breaks">
    <Card title={text.byBinder} state={binderState} rows={binderRows} empty={text.noBinders} retry={() => { binderValues.retry(); binderNames.retry(); }} />
    <Card title={text.bySet} state={setValues.state.kind} rows={setRows} empty={text.noSets} retry={setValues.retry} />
  </div>;
}
