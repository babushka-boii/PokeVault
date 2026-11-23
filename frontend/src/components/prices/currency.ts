import { createContext, useContext } from "react";
import type { Currency } from "../../services/prices";

export const CURRENCY_STORAGE_KEY = "pokevault.currency";
export type CurrencyContextValue = {
  currency: Currency;
  /** False while a signed-in account's preference is still loading. */
  ready: boolean;
  saveFailed: boolean;
  setCurrency: (currency: Currency) => void;
};
export const CurrencyContext = createContext<CurrencyContextValue | null>(null);

export function storedCurrency(): Currency {
  try { return localStorage.getItem(CURRENCY_STORAGE_KEY) === "USD" ? "USD" : "CLP"; } catch { return "CLP"; }
}
export function storeCurrency(currency: Currency) {
  try { localStorage.setItem(CURRENCY_STORAGE_KEY, currency); } catch { /* private mode: keep it in memory */ }
}
export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error("useCurrency must be used within CurrencyProvider");
  return context;
}
