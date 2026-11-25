import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { fetchHistory, HistoryError, type HistoryRange } from "../../services/history";
import { useCurrency } from "./currency";

/** The recorded value history in the display currency. Reading it also records today's value, server side. */
/** `enabled` is false when another request already serves this range (nothing is fetched then). */
export function useHistory(range: HistoryRange, enabled = true) {
  const { retrySession } = useAuth();
  const { currency, ready } = useCurrency();
  const request = useCallback((signal: AbortSignal) => fetchHistory(range, currency, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof HistoryError && error.status === 401) retrySession();
    throw error;
  }), [range, currency, retrySession]);
  return useTcgResource(ready && enabled ? `${range}:${currency}` : undefined, request);
}
