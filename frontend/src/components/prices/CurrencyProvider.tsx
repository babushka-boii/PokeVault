import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../auth/context";
import { fetchCurrencySetting, saveCurrencySetting, type Currency } from "../../services/prices";
import { CurrencyContext, storeCurrency, storedCurrency } from "./currency";

/**
 * Signed out: CLP/USD lives in localStorage, like the ES/EN locale.
 * Signed in: the account preference wins on sign-in and overwrites the local value;
 * changes are saved to both.
 */
export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const userId = auth.status === "authenticated" ? auth.user.id : null;
  const [currency, setLocal] = useState<Currency>(storedCurrency);
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const saving = useRef<AbortController | null>(null);
  const { getCsrfToken } = auth;

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetchCurrencySetting(controller.signal).then((preferred) => {
      if (controller.signal.aborted) return;
      setLocal(preferred); storeCurrency(preferred); setSyncedFor(userId);
    }, () => { if (!controller.signal.aborted) setSyncedFor(userId); });
    return () => { controller.abort(); saving.current?.abort(); };
  }, [userId]);

  const setCurrency = useCallback((next: Currency) => {
    setLocal(next); storeCurrency(next); setSaveFailed(false);
    if (!userId) return;
    const csrf = getCsrfToken();
    if (!csrf) { setSaveFailed(true); return; }
    saving.current?.abort();
    const controller = new AbortController(); saving.current = controller;
    saveCurrencySetting(next, csrf, controller.signal).catch(() => { if (!controller.signal.aborted) setSaveFailed(true); });
  }, [userId, getCsrfToken]);

  const ready = userId === null ? auth.status !== "loading" : syncedFor === userId;
  const value = useMemo(() => ({ currency, ready, saveFailed, setCurrency }), [currency, ready, saveFailed, setCurrency]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}
