import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { historyRanges, type History, type HistoryRange } from "../../services/history";
import { formatMoney } from "../prices/format";
import { useHistory } from "../prices/useHistory";
import type { Currency } from "../../services/prices";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { CHART, line, plot, ticks } from "./chartMath";
import "./chart.css";

type Resource = ReturnType<typeof useHistory>;

function dayLabel(day: string, locale: "es" | "en", long = false) {
  return new Intl.DateTimeFormat(locale === "es" ? "es-CL" : "en-US", { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

function Plot({ history, currency }: { history: History; currency: Currency }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.chart;
  const points = history.points;
  const plotted = plot(points);
  const money = (total: string | number) => formatMoney(String(total), currency, locale);
  const first = points[0]; const last = points[points.length - 1];
  const summary = points.length === 1
    ? text.summaryOne.replace("{day}", dayLabel(first.day, locale, true)).replace("{value}", money(first.total))
    : text.summary.replace("{from}", dayLabel(first.day, locale, true)).replace("{to}", dayLabel(last.day, locale, true)).replace("{start}", money(first.total)).replace("{end}", money(last.total));
  return <>
    <svg className="pv-chart__svg" viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={summary} preserveAspectRatio="xMidYMid meet">
      {ticks(points).map((tick) => <g key={tick.y}>
        <line className="pv-chart__grid" x1={CHART.left} x2={CHART.width - CHART.right} y1={tick.y} y2={tick.y} />
        <text className="pv-chart__tick" x={CHART.left - 8} y={tick.y + 4} textAnchor="end">{money(Math.round(tick.value * 100) / 100)}</text>
      </g>)}
      {plotted.length > 1 && <path className="pv-chart__line" d={line(plotted)} fill="none" />}
      {plotted.map((point) => <circle key={point.day} className="pv-chart__dot" cx={point.x} cy={point.y} r={4} data-day={point.day} />)}
      <text className="pv-chart__tick" x={plotted[0].x} y={CHART.height - 10} textAnchor={plotted.length > 1 ? "start" : "middle"}>{dayLabel(first.day, locale)}</text>
      {plotted.length > 1 && <text className="pv-chart__tick" x={plotted[plotted.length - 1].x} y={CHART.height - 10} textAnchor="end">{dayLabel(last.day, locale)}</text>}
    </svg>
    {/* The same data for screen readers: only the days that were recorded. */}
    <table className="pv-sr-only">
      <caption>{text.tableCaption}</caption>
      <thead><tr><th scope="col">{text.day}</th><th scope="col">{text.value}</th></tr></thead>
      <tbody>{points.map((point) => <tr key={point.day}><th scope="row">{dayLabel(point.day, locale, true)}</th><td>{money(point.total)}</td></tr>)}</tbody>
    </table>
  </>;
}

/**
 * The collection's value over time, in the display currency. Only recorded days are drawn,
 * each as a dot, and consecutive records are joined by a line (also across days with no
 * record). Nothing is ever interpolated. Reusable: Profile will mount it too.
 * `shared` is a 30-day history already requested by the page, so the default range makes no
 * second request.
 */
export function ValueChart({ shared }: { shared?: Resource }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.chart;
  const [range, setRange] = useState<HistoryRange>("30d");
  const own = useHistory(range, !(shared && range === "30d"));
  const resource = shared && range === "30d" ? shared : own;
  const { state } = resource;
  const history = state.kind === "loaded" ? state.data : null;
  const currency = history?.currency ?? "CLP";
  const labels: Record<HistoryRange, string> = { "7d": text.range7, "30d": text.range30, "1y": text.range365 };
  return <section className="pv-home__section pv-home__wide pv-chart" aria-labelledby="home-chart-title">
    <div className="pv-home__section-head">
      <h2 id="home-chart-title">{text.title}</h2>
      <div className="pv-segmented" role="group" aria-label={text.rangeLabel}>
        {historyRanges.map((name) => <button key={name} type="button" aria-pressed={range === name} onClick={() => setRange(name)}>{labels[name]}</button>)}
      </div>
    </div>
    <div className="pv-chart__body">
      {state.kind === "loading" && <LoadingStatus label={text.loading}><Skeleton shape="block" /></LoadingStatus>}
      {state.kind === "error" && <InlineError calm message={text.error} retryLabel={dictionary.home.retry} onRetry={resource.retry} />}
      {history && history.points.length === 0 && <p className="pv-home__meta pv-chart__empty">
        {history.started_on === null ? text.noRecords : text.noPeriodRecords.replace("{currency}", history.currency)}</p>}
      {history && history.points.length >= 1 && <Plot history={history} currency={currency} />}
      {history && history.points.length === 1 && <p className="pv-home__meta pv-chart__empty">{text.startedOn.replace("{day}", dayLabel(history.started_on ?? history.points[0].day, locale, true))}</p>}
    </div>
  </section>;
}
