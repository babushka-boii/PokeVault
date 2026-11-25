import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { History } from "../../services/history";
import { formatMoney } from "../prices/format";
import { RatesAttribution } from "../prices/PriceDisplay";
import type { useCollectionValuation } from "../prices/useCollectionValuation";
import type { useHistory } from "../prices/useHistory";
import { CutPanel } from "../ui/CutPanel";
import { Chip } from "../ui/Chip";
import { ButtonLink } from "../ui/Button";
import { InlineError } from "../ui/InlineError";
import { PixelLabel } from "../ui/PixelLabel";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { priceAge } from "./age";
import { Greeting } from "./Greeting";
import { plural } from "./plural";
import { ValueChange } from "./ValueChange";
import "./home.css";

export type ValuationResource = ReturnType<typeof useCollectionValuation>;
export type HistoryResource = ReturnType<typeof useHistory>;

/** "Precios de referencia · actualizados hace 3 h": the only price disclosure on the page. */
function PriceNote({ updatedAt }: { updatedAt: string | null }) {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  const [now] = useState(() => Date.now());   // the age is read once per visit, not on every render
  if (updatedAt === null) return <p className="price-note">{text.pricesNote}</p>;
  const age = priceAge(updatedAt, now);
  const when = age.unit === "lessThanHour" ? text.pricesAge.lessThanHour : text.pricesAge[age.unit].replace("{count}", String(age.count));
  return <p className="price-note">{text.pricesNote} · {when}</p>;
}

/** Greeting, collection value in gold with its change over seven days, counts and the one price note. */
export function ValueHero({ resource, history }: { resource: ValuationResource; history: HistoryResource }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const prices = dictionary.prices;
  const { state, retry } = resource;
  const value = state.kind === "loaded" ? state.data : null;
  const originals = value ? Object.entries(value.original_totals).map(([code, amount]) => formatMoney(amount, code as "EUR" | "USD", locale, true)).join(" + ") : "";
  const withoutVariant = value?.unpriced_by_reason.variant_unknown ?? 0;
  const recorded: History | null = history.state.kind === "loaded" ? history.state.data : null;
  const showChange = value !== null && value.total !== null && recorded?.baseline != null && recorded.currency === value.currency;
  return <CutPanel tone="value" className="pv-home__hero" aria-labelledby="home-value-label">
    <Greeting />
    <PixelLabel id="home-value-label" tone="gold">{text.valueLabel}</PixelLabel>
    {state.kind === "loading" && <LoadingStatus label={text.valueLoading}><Skeleton shape="number" /><Skeleton shape="text" lines={2} /></LoadingStatus>}
    {state.kind === "error" && <InlineError message={text.valueError} retryLabel={text.retry} onRetry={retry} />}
    {value && <>
      <p className="pv-home__total pv-tabular">{value.total !== null ? formatMoney(value.total, value.currency, locale) : originals || formatMoney("0", value.currency, locale)}</p>
      {value.total === null && <p className="pv-home__meta">{prices.conversionUnavailable}</p>}
      {showChange && <ValueChange total={value.total!} baseline={recorded!.baseline!.total} currency={value.currency} />}
      {value.copy_count === 0 ? <>
        <p className="pv-home__lead">{text.valueEmpty}</p>
        <p className="pv-home__meta">{text.emptyText}</p>
        <div className="pv-home__actions"><ButtonLink to="/sets" variant="secondary">{text.emptySearch}</ButtonLink></div>
      </> : <>
        <ul className="pv-home__chips">
          <li><Chip>{plural(text.copies, value.copy_count)}</Chip></li>
          <li><Chip>{text.priced.replace("{count}", String(value.priced_count))}</Chip></li>
          {withoutVariant > 0 && <li><Chip to="/collection?variant=unknown">{text.withoutVariant.replace("{count}", String(withoutVariant))}</Chip></li>}
          {value.pending_count > 0 && <li><button type="button" className="pv-chip pv-chip--link pv-chip--button" onClick={retry}>{text.pendingChip.replace("{count}", String(value.pending_count))}</button></li>}
          {value.stale_count > 0 && <li><Chip>{prices.staleCount.replace("{count}", String(value.stale_count))}</Chip></li>}
        </ul>
        <PriceNote updatedAt={value.prices_updated_at} />
        {value.total !== null && value.priced_count > 0 && <RatesAttribution rates={value.rates} />}
      </>}
    </>}
  </CutPanel>;
}
