import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { Valuation } from "../../services/prices";
import { useCardMetadata } from "../cards/cardMetadata";
import { formatMoney } from "./format";
import { CurrencySwitch, PriceText, RatesAttribution, ReferenceNote } from "./PriceDisplay";
import { useCollectionValuation } from "./useCollectionValuation";

export function ValueTotal({ value }: { value: Valuation }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.prices;
  const originals = Object.entries(value.original_totals)
    .map(([code, amount]) => formatMoney(amount, code as "EUR" | "USD", locale, true)).join(" + ");
  return <>
    {value.total !== null ? <p className="price-total">{formatMoney(value.total, value.currency, locale)}</p>
      : <><p className="price-total">{originals}</p><p className="price-meta">{text.conversionUnavailable}</p></>}
    <p>{text.priced.replace("{priced}", String(value.priced_count)).replace("{count}", String(value.copy_count))}</p>
    {value.total !== null && value.priced_count > 0 && originals && <p className="price-meta">{text.originalTotals.replace("{amounts}", originals)}</p>}
    {value.stale_count > 0 && <p className="price-meta">{text.staleCount.replace("{count}", String(value.stale_count))}</p>}
  </>;
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
