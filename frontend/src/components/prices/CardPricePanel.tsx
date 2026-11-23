import { useCallback } from "react";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchCardPrices } from "../../services/prices";
import { useCurrency } from "./currency";
import { CurrencySwitch, PriceOrReason, RatesAttribution, ReferenceNote } from "./PriceDisplay";

export function CardPricePanel({ cardId }: { cardId: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.prices;
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchCardPrices(cardId, currency, signal), [cardId, currency]);
  const { state, retry } = useTcgResource(ready ? `${cardId}:${currency}` : undefined, request);
  const data = state.kind === "loaded" ? state.data : null;
  const rows = data?.variants.filter((row) => row.reason !== "variant_not_in_catalog") ?? [];
  return <section className="tcg-detail-section price-panel" aria-labelledby="tcg-prices">
    <h2 id="tcg-prices">{text.title}</h2>
    <ReferenceNote />
    {state.kind === "loading" && <p className="price-meta" aria-live="polite">{text.loading}</p>}
    {state.kind === "error" && <p className="price-meta">{text.error} <button type="button" onClick={retry}>{text.retry}</button></p>}
    {data && (rows.length === 0 ? <p className="price-meta">{text.noCatalogVariants}</p>
      : <ul>{rows.map((row) => <li key={row.variant}>
        <span>{dictionary.inventory.variants[row.variant]}</span>
        <PriceOrReason price={row.price} reason={row.reason} />
      </li>)}</ul>)}
    <CurrencySwitch />
    {data && rows.some((row) => row.price?.amount != null) && <RatesAttribution rates={data.rates} />}
  </section>;
}
