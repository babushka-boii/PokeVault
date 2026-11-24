import { useLocale } from "../../i18n/LocaleProvider";
import { currencies } from "../../services/prices";
import { useCurrency } from "../prices/currency";

/** CLP | USD segmented control. Uses the shared currency preference (account or browser). */
export function CurrencyToggle() {
  const { dictionary } = useLocale();
  const { currency, setCurrency } = useCurrency();
  return <div className="pv-toggle" role="group" aria-label={dictionary.shell.currencyGroup}>
    {currencies.map((code) => <button key={code} type="button" className="pv-toggle__option" aria-pressed={currency === code} onClick={() => setCurrency(code)}>{code}</button>)}
  </div>;
}

/** Shows the short code of the other language; its accessible name is the language name. */
export function LocaleToggle() {
  const { locale, dictionary, toggleLocale } = useLocale();
  const target = locale === "es" ? "en" : "es";
  return <button type="button" className="pv-locale" lang={target} aria-label={dictionary.languageAction} onClick={toggleLocale}>
    <span aria-hidden="true">{target.toUpperCase()}</span>
  </button>;
}
