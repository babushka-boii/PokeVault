import type { Locale } from "../../i18n/LocaleProvider";

const tag = (locale: Locale) => (locale === "es" ? "es-CL" : "en-US");

/** Converted amounts arrive rounded (CLP whole pesos, USD cents); originals keep up to 4 decimals. */
export function formatMoney(amount: string, currency: "CLP" | "USD" | "EUR", locale: Locale, original = false): string {
  const fixed = currency === "CLP" ? 0 : 2;
  return new Intl.NumberFormat(tag(locale), {
    style: "currency", currency, minimumFractionDigits: fixed, maximumFractionDigits: original ? Math.max(fixed, 4) : fixed,
  }).format(Number(amount));
}

export function formatDate(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(tag(locale), { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}
