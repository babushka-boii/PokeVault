import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchBinderValue, PricesError } from "../../services/prices";
import { ValueAmount, ValueDetails } from "./CollectionValue";
import { useCurrency } from "./currency";
import { RatesAttribution } from "./PriceDisplay";

/**
 * A binder's total as one header line: the amount in gold, a foldable "Detalles" with the
 * rest, and the rates attribution (always visible). ``version`` changes whenever the
 * binder contents change, so the total is refetched.
 */
export function BinderValue({ binderId, version }: { binderId: string; version: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.prices;
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchBinderValue(binderId, currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [binderId, currency, retrySession]);
  const { state, retry } = useTcgResource(ready ? `${binderId}:${version}:${currency}` : undefined, request);
  const value = state.kind === "loaded" ? state.data : null;
  const attributed = value !== null && value.total !== null && value.priced_count > 0;
  return <section className="pv-binder-value" aria-label={text.binderValue}>
    {state.kind === "loading" && <span className="price-meta" aria-live="polite">{text.loading}</span>}
    {state.kind === "error" && <span className="price-meta">{text.error} <button type="button" onClick={retry}>{text.retry}</button></span>}
    {value && (value.copy_count === 0 ? <span className="price-meta">{text.empty}</span> : <>
      <ValueAmount value={value} />
      <details className="pv-binder-value__more">
        <summary>{text.valueDetails}</summary>
        <div className="pv-binder-value__panel">
          <ValueDetails value={value} />
          {value.pending_count > 0 && <p className="price-meta">{text.pending.replace("{count}", String(value.pending_count))} <button type="button" onClick={retry}>{text.retry}</button></p>}
        </div>
      </details>
      {attributed && <RatesAttribution rates={value.rates} />}
    </>)}
  </section>;
}
