import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { DEFAULT_TOP, fetchCollectionValue, PricesError } from "../../services/prices";
import { useCurrency } from "./currency";

/**
 * The signed-in user's collection valuation in the display currency. Waits for the
 * account currency preference; a 401 re-checks the session. Shared by Profile and Home.
 * `top` is how many of the most valuable copies come back (Home's carousel asks for 12).
 */
export function useCollectionValuation(top = DEFAULT_TOP) {
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchCollectionValue(currency, signal, top).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [currency, top, retrySession]);
  return useTcgResource(ready ? `${currency}:${top}` : undefined, request);
}
