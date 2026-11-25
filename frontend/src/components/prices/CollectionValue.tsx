import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { Valuation } from "../../services/prices";
import { useCardMetadata } from "../cards/cardMetadata";
import { formatMoney } from "./format";
import { CurrencySwitch, PriceText, RatesAttribution, ReferenceNote } from "./PriceDisplay";
import { useCollectionValuation } from "./useCollectionValuation";

function useOriginals(value: Valuation) {
  const { locale } = useLocale();
  return Object.entries(value.original_totals)
    .map(([code, amount]) => formatMoney(amount, code as "EUR" | "USD", locale, true)).join(" + ");
}

/** The detail lines under a total: how many copies are priced, original-currency totals, stale prices. */
export function ValueDetails({ value }: { value: Valuation }) {
  const { dictionary } = useLocale();
  const text = dictionary.prices;
  const originals = useOriginals(value);
  return <>
    <p>{text.priced.replace("{priced}", String(value.priced_count)).replace("{count}", String(value.copy_count))}</p>
    {value.total !== null && value.priced_count > 0 && originals && <p className="price-meta">{text.originalTotals.replace("{amounts}", originals)}</p>}
    {value.stale_count > 0 && <p className="price-meta">{text.staleCount.replace("{count}", String(value.stale_count))}</p>}
  </>;
}

export function ValueTotal({ value }: { value: Valuation }) {
  const { dictionary, locale } = useLocale();
  const originals = useOriginals(value);
  return <>
    {value.total !== null ? <p className="price-total">{formatMoney(value.total, value.currency, locale)}</p>
      : <><p className="price-total">{originals}</p><p className="price-meta">{dictionary.prices.conversionUnavailable}</p></>}
    <ValueDetails value={value} />
  </>;
}

/** The amount alone, in gold (no paragraph), for one-line headers. */
export function ValueAmount({ value }: { value: Valuation }) {
  const { locale } = useLocale();
  const originals = useOriginals(value);
  return <span className="price-total pv-binder-value__total">{value.total !== null ? formatMoney(value.total, value.currency, locale) : originals}</span>;
}

export function CollectionValue() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.prices;
  const { state, retry } = useCollectionValuation();
  const value = state.kind === "loaded" ? state.data : null;
  const names = useCardMetadata(value?.top.map((item) => item.card_id) ?? [], locale);
  const withoutVariant = value?.unpriced_by_reason.variant_unknown ?? 0;
  return <section className="price-value" aria-labelledby="collection-value-title">
    <h2 id="collection-value-title">{text.collectionValue}</h2>
    <ReferenceNote />
    {state.kind === "loading" && <p className="price-meta" aria-live="polite">{text.loading}</p>}
    {state.kind === "error" && <p className="price-meta">{text.error} <button type="button" onClick={retry}>{text.retry}</button></p>}
    {value && <>
      <ValueTotal value={value} />
      {withoutVariant > 0 && <p>{text.withoutVariant.replace("{count}", String(withoutVariant))} <Link to="/collection?variant=unknown">{text.editVariants}</Link></p>}
      {value.pending_count > 0 && <p className="price-meta">{text.pending.replace("{count}", String(value.pending_count))} <button type="button" onClick={retry}>{text.retry}</button></p>}
      <h3>{text.top}</h3>
      {value.top.length === 0 ? <p className="price-meta">{text.noTop}</p> : <ol>{value.top.map((item) => <li key={item.copy_id}>
        <span>{names.cards[item.card_id]?.name ?? item.card_id} · {dictionary.inventory.variants[item.variant as keyof typeof dictionary.inventory.variants] ?? item.variant}</span>
        {item.price && <PriceText quote={item.price} />}
        <Link to={`/collection/${encodeURIComponent(item.copy_id)}`}>{text.viewCopy}</Link>
      </li>)}</ol>}
      {value.total !== null && value.priced_count > 0 && <RatesAttribution rates={value.rates} />}
    </>}
    <CurrencySwitch />
  </section>;
}
