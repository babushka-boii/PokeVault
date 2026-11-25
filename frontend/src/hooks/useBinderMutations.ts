import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/context";
import { BindersError } from "../services/binders";

export type BinderErrorKey = "pocket_occupied" | "binder_full" | "pocket_changed" | "binder_limit_reached" | "missing" | "expired" | "error";
export type MutationOutcome<T> = { ok: true; value: T } | { ok: false; error: BinderErrorKey };
const CONFLICTS: BinderErrorKey[] = ["pocket_occupied", "binder_full", "pocket_changed", "binder_limit_reached"];

/**
 * One binder write at a time, with the session's CSRF token. Pending writes abort on
 * unmount (account switch or session validation unmounts the owner tree), and late
 * responses are ignored. A 401 re-checks the session.
 */
export function useBinderMutations() {
  const { retrySession, getCsrfToken, validating } = useAuth();
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    const active = controllers.current;
    return () => { active.forEach((controller) => controller.abort()); active.clear(); };
  }, []);
  const run = useCallback(async <T,>(action: (csrf: string, signal: AbortSignal) => Promise<T>): Promise<MutationOutcome<T> | null> => {
    if (pending.current) return null;
    const csrf = getCsrfToken();
    if (!csrf) { retrySession(); return { ok: false, error: "expired" }; }
    pending.current = true; setBusy(true);
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      const value = await action(csrf, controller.signal);
      return controller.signal.aborted ? null : { ok: true, value };
    } catch (error: unknown) {
      if (controller.signal.aborted) return null;
      const status = error instanceof BindersError ? error.status : 0;
      const detail = error instanceof BindersError ? error.detail : null;
      if (status === 401) retrySession();
      const key: BinderErrorKey = status === 409 ? (CONFLICTS.find((code) => code === detail) ?? "pocket_changed")
        : status === 404 ? "missing" : status === 401 || status === 403 ? "expired" : "error";
      return { ok: false, error: key };
    } finally {
      controllers.current.delete(controller);
      if (!controller.signal.aborted) { pending.current = false; setBusy(false); }
    }
  }, [getCsrfToken, retrySession]);
  // While the session is being confirmed in the background nothing can be written (no CSRF token).
  return { busy: busy || Boolean(validating), run };
}
