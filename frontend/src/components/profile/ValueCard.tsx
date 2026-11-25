import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { historyRanges, type HistoryRange } from "../../services/history";
import { formatMoney } from "../prices/format";
import { useHistory } from "../prices/useHistory";
import type { useCollectionValuation } from "../prices/useCollectionValuation";
import { chartPaths, H, W } from "./chartPaths";
import { InlineError } from "../ui/InlineError";
import { PixelLabel } from "../ui/PixelLabel";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";

export function ValueCard({ valuation }: { valuation: ReturnType<typeof useCollectionValuation> }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.profilePage;
  const [range, setRange] = useState<HistoryRange>("30d");
  const history = useHistory(range);
  const value = valuation.state.kind === "loaded" ? valuation.state.data : null;
  const paths = history.state.kind === "loaded" ? chartPaths(history.state.data.points) : null;
  const amount = value ? (value.total !== null ? formatMoney(value.total, value.currency, locale)
    : Object.entries(value.original_totals).map(([code, total]) => formatMoney(total, code as "EUR" | "USD", locale, true)).join(" + ") || formatMoney("0", value.currency, locale)) : null;
  return <section className="pv-value" aria-labelledby="profile-value-label">
    <div className="pv-value__top">
      <PixelLabel id="profile-value-label" tone="gold">{text.valueLabel}</PixelLabel>
      <div role="group" aria-label={text.range} className="pv-value__ranges">
        {historyRanges.map((key) => <button key={key} type="button" aria-pressed={range === key} onClick={() => setRange(key)}>{text.ranges[key]}</button>)}
      </div>
    </div>
    {valuation.state.kind === "loading" && <LoadingStatus label={text.valueLoading}><Skeleton shape="number" /></LoadingStatus>}
    {valuation.state.kind === "error" && <InlineError calm message={text.valueError} retryLabel={text.retry} onRetry={valuation.retry} />}
    {value && <p className="pv-value__amount"><span className="pv-value__total">{amount}</span>{value.total !== null && <span className="pv-value__currency">{value.currency}</span>}</p>}
    {history.state.kind === "loading" && <div className="pv-value__chart" aria-busy="true"><Skeleton shape="text" lines={1} /></div>}
    {history.state.kind === "error" && <InlineError calm message={text.chartError} retryLabel={text.retry} onRetry={history.retry} />}
    {history.state.kind === "loaded" && (paths
      ? <svg className="pv-value__chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={text.chart.replace("{range}", text.ranges[range])} preserveAspectRatio="none">
        <path d={paths.area} className="pv-value__area" /><path d={paths.line} className="pv-value__line" vectorEffect="non-scaling-stroke" />
      </svg>
      : <p className="pv-value__empty" role="status">{text.chartEmpty}</p>)}
  </section>;
}
