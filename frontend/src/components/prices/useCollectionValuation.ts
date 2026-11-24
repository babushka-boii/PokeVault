import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { fetchCollectionValue, PricesError } from "../../services/prices";
import { useCurrency } from "./currency";

/**
 * The signed-in user's collection valuation in the display currency. Waits for the
 * account currency preference; a 401 re-checks the session. Shared by Profile and Home.
 */
export function useCollectionValuation() {
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchCollectionValue(currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof PricesError && error.status === 401) retrySession();
    throw error;
  }), [currency, retrySession]);
  return useTcgResource(ready ? currency : undefined, request);
}
