import { useLocale } from "../../i18n/LocaleProvider";
import type { Currency } from "../../services/prices";
import { formatMoney } from "../prices/format";
import "./home.css";

/**
 * The change against the latest record at least seven days old. It compares the live total
 * with that record, so it includes cards added or removed meanwhile (the note says so).
 * Direction is drawn (▲ ▼ =) and announced in words, never carried by colour alone.
 */
export function ValueChange({ total, baseline, currency }: { total: string; baseline: string; currency: Currency }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const difference = Number(total) - Number(baseline);
  const digits = currency === "CLP" ? 0 : 2;
  const direction = Number(difference.toFixed(digits)) === 0 ? "flat" : difference > 0 ? "up" : "down";
  const base = Number(baseline);
  const percent = base > 0 && direction !== "flat"
    ? new Intl.NumberFormat(locale === "es" ? "es-CL" : "en-US", { style: "percent", maximumFractionDigits: 1 }).format(Math.abs(difference) / base) : null;
  const amount = formatMoney(Math.abs(difference).toFixed(digits), currency, locale);
  return <>
    <p className="pv-home__change" data-direction={direction}>
      {direction === "flat"
        ? <><span aria-hidden="true">= </span>{text.changeFlat}</>
        : <><span aria-hidden="true">{direction === "up" ? "▲" : "▼"} </span><span className="pv-sr-only">{direction === "up" ? text.changeUp : text.changeDown} </span>
          {amount}{percent ? ` (${percent})` : ""} {text.changeSpan}</>}
    </p>
    <p className="pv-home__meta">{text.changeNote}</p>
  </>;
}
