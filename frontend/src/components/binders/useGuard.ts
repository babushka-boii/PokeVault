import { useCallback } from "react";
import { useAuth } from "../../auth/context";
import { BindersError } from "../../services/binders";
import { PricesError } from "../../services/prices";

/** Re-checks the session after a 401 from a binder or price request, then rethrows. */
export function useGuard() {
  const { retrySession } = useAuth();
  return useCallback((error: unknown, signal: AbortSignal): never => {
    const status = error instanceof BindersError || error instanceof PricesError ? error.status : 0;
    if (!signal.aborted && status === 401) retrySession();
    throw error;
  }, [retrySession]);
}
