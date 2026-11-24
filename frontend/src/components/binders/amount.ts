import type { Locale } from "../../i18n/LocaleProvider";
import type { Currency, BinderValue } from "../../services/prices";
import { formatMoney } from "../prices/format";

/** Converted total, or the original-currency totals when no rates exist; null without a value. */
export function binderAmount(value: BinderValue | undefined, currency: Currency, locale: Locale): string | null {
  if (!value) return null;
  if (value.total !== null) return formatMoney(value.total, currency, locale);
  return Object.entries(value.original_totals).map(([code, total]) => formatMoney(total, code as "EUR" | "USD", locale, true)).join(" + ") || null;
}
