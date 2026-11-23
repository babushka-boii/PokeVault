import { useLocale } from "../../i18n/LocaleProvider";
import { ATTRIBUTION_URL, currencies, type Currency, type NoPriceReason, type Quote, type RatesInfo } from "../../services/prices";
import { useCurrency } from "./currency";
import { formatDate, formatMoney } from "./format";
import "./prices.css";

export function PriceText({ quote }: { quote: Quote }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.prices;
  const original = formatMoney(quote.original_amount, quote.original_currency, locale, true);
  const parts = { source: text.sources[quote.source], metric: text.metrics[quote.metric] };
  const origin = (quote.updated_at ? text.sourceLine.replace("{date}", formatDate(quote.updated_at, locale)) : text.sourceUndated)
    .replace("{source}", parts.source).replace("{metric}", parts.metric);
  return <span className="price">
    <strong className="price-amount">{quote.amount === null ? original : formatMoney(quote.amount, quote.currency, locale)}</strong>
    <small className="price-meta">
      {quote.amount !== null && <>{text.original.replace("{amount}", original)} · </>}{origin}
      {quote.stale && <> · <span className="price-stale">{text.stale}</span></>}
    </small>
    {quote.amount === null && <small className="price-meta">{text.conversionUnavailable}</small>}
  </span>;
}

export function NoPriceText({ reason }: { reason: NoPriceReason }) {
  const { dictionary } = useLocale();
  return <span className={`price price-missing price-missing--${reason}`}>{dictionary.prices.reasons[reason]}</span>;
}

export function PriceOrReason({ price, reason }: { price: Quote | null; reason: NoPriceReason | null }) {
  if (price) return <PriceText quote={price} />;
  return reason ? <NoPriceText reason={reason} /> : null;
}

/** Required by ExchangeRate-API terms wherever converted amounts are shown. */
export function RatesAttribution({ rates }: { rates: RatesInfo }) {
  const { dictionary, locale } = useLocale();
  if (!rates.available) return null;
  return <p className="price-attribution">
    {rates.updated_at && <>{dictionary.prices.rateDate.replace("{date}", formatDate(rates.updated_at, locale))} · </>}
    <a href={ATTRIBUTION_URL} target="_blank" rel="noopener noreferrer">Rates By Exchange Rate API</a>
  </p>;
}

export function CurrencySwitch() {
  const { dictionary } = useLocale();
  const { currency, setCurrency, saveFailed } = useCurrency();
  return <div className="price-currency">
    <label>{dictionary.prices.currency}
      <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
        {currencies.map((code) => <option key={code} value={code}>{dictionary.prices.currencies[code]}</option>)}
      </select>
    </label>
    {saveFailed && <p className="price-meta">{dictionary.prices.saveError}</p>}
  </div>;
}

export function ReferenceNote() {
  const { dictionary } = useLocale();
  return <p className="price-note">{dictionary.prices.referenceNote}</p>;
}
