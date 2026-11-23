import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchBoxValue, PricesError } from "../../services/prices";
import { ValueTotal } from "./CollectionValue";
import { useCurrency } from "./currency";
import { RatesAttribution } from "./PriceDisplay";

/** ``version`` changes whenever the box contents change, so the total is refetched. */
export function BoxValue({ boxId, version }: { boxId: string; version: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.prices;
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchBoxValue(boxId, currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [boxId, currency, retrySession]);
  const { state, retry } = useTcgResource(ready ? `${boxId}:${version}:${currency}` : undefined, request);
  const value = state.kind === "loaded" ? state.data : null;
  return <section className="price-value pc-box-value" aria-labelledby="box-value-title">
    <h3 id="box-value-title">{text.boxValue}</h3>
    {state.kind === "loading" && <p className="price-meta" aria-live="polite">{text.loading}</p>}
    {state.kind === "error" && <p className="price-meta">{text.error} <button type="button" onClick={retry}>{text.retry}</button></p>}
    {value && (value.copy_count === 0 ? <p className="price-meta">{text.empty}</p> : <>
      <ValueTotal value={value} />
      {value.pending_count > 0 && <p className="price-meta">{text.pending.replace("{count}", String(value.pending_count))} <button type="button" onClick={retry}>{text.retry}</button></p>}
      {value.total !== null && value.priced_count > 0 && <RatesAttribution rates={value.rates} />}
    </>)}
  </section>;
}
