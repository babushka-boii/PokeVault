import { useLocale } from "../../i18n/LocaleProvider";
import { formatMoney } from "../prices/format";
import { RatesAttribution, ReferenceNote } from "../prices/PriceDisplay";
import type { useCollectionValuation } from "../prices/useCollectionValuation";
import { CutPanel } from "../ui/CutPanel";
import { Chip } from "../ui/Chip";
import { InlineError } from "../ui/InlineError";
import { PixelLabel } from "../ui/PixelLabel";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { plural } from "./plural";
import "./home.css";

export type ValuationResource = ReturnType<typeof useCollectionValuation>;

/** Collection value: gold pixel label, large Space Grotesk total, facts and the price disclosures. */
export function ValueHero({ resource }: { resource: ValuationResource }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const prices = dictionary.prices;
  const { state, retry } = resource;
  const value = state.kind === "loaded" ? state.data : null;
  const originals = value ? Object.entries(value.original_totals).map(([code, amount]) => formatMoney(amount, code as "EUR" | "USD", locale, true)).join(" + ") : "";
  const withoutVariant = value?.unpriced_by_reason.variant_unknown ?? 0;
  return <CutPanel tone="value" className="pv-home__hero" aria-labelledby="home-value-label">
    <PixelLabel id="home-value-label" tone="gold">{text.valueLabel}</PixelLabel>
    {state.kind === "loading" && <LoadingStatus label={text.valueLoading}><Skeleton shape="number" /><Skeleton shape="text" lines={2} /></LoadingStatus>}
    {state.kind === "error" && <InlineError message={text.valueError} retryLabel={text.retry} onRetry={retry} />}
    {value && <>
      <p className="pv-home__total pv-tabular">{value.total !== null ? formatMoney(value.total, value.currency, locale) : originals || formatMoney("0", value.currency, locale)}</p>
      {value.total === null && <p className="pv-home__meta">{prices.conversionUnavailable}</p>}
      <ul className="pv-home__chips">
        <li><Chip>{plural(text.copies, value.copy_count)}</Chip></li>
        <li><Chip>{text.priced.replace("{count}", String(value.priced_count))}</Chip></li>
        {withoutVariant > 0 && <li><Chip to="/collection?variant=unknown">{text.withoutVariant.replace("{count}", String(withoutVariant))}</Chip></li>}
        {value.pending_count > 0 && <li><button type="button" className="pv-chip pv-chip--link pv-chip--button" onClick={retry}>{text.pendingChip.replace("{count}", String(value.pending_count))}</button></li>}
        {value.stale_count > 0 && <li><Chip>{prices.staleCount.replace("{count}", String(value.stale_count))}</Chip></li>}
      </ul>
      <ReferenceNote />
      {value.total !== null && value.priced_count > 0 && <RatesAttribution rates={value.rates} />}
    </>}
  </CutPanel>;
}
