import { endSession, fetchSession, type AuthErrorCode, type AuthSession, type AuthUser } from "../services/auth";

export type AuthState = {
  status: "loading" | "unauthenticated" | "error";
  user: null;
  error: AuthErrorCode | null;
  loggingOut: false;
  validating?: false;
} | {
  status: "authenticated";
  user: AuthUser;
  error: AuthErrorCode | null;
  loggingOut: boolean;
  validating?: boolean;
};

/** Coming back to the page revalidates only after this long away, or when the last check is this old. */
export const AWAY_MS = 30_000;
export const STALE_MS = 60_000;
export type RevalidateReason = "focus" | "visible" | "pageshow" | "bfcache";

const unauthenticated: AuthState = { status: "unauthenticated", user: null, error: null, loggingOut: false };

// Each mounted application owns its own in-memory session. No provider tokens or
// reusable session credentials are available to React or browser storage.
export function createAuthStore() {
  let state: AuthState = { status: "loading", user: null, error: null, loggingOut: false };
  let session: AuthSession | null = null;
  let active = false;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let lastValidated = 0;
  let awayAt: number | null = null;
  let sessionController: AbortController | null = null;
  let logoutController: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AuthState) => { state = next; listeners.forEach((listener) => listener()); };

  function restore() {
    if (!active || state.loggingOut || pending) return;
    // While the cookie is revalidated the page stays as it is (nothing unmounts), but the CSRF token
    // is withheld, so nothing can be written until the server has confirmed the session again.
    const previous = state;
    lastValidated = Date.now();
    publish(previous.status === "authenticated"
      ? { ...previous, validating: true }
      : { status: "loading", user: null, error: null, loggingOut: false });
    const currentGeneration = generation;
    const controller = new AbortController();
    sessionController = controller;
    const request = fetchSession(controller.signal).then((result) => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      session = result;
      lastValidated = Date.now();
      publish(result ? { status: "authenticated", user: result.user, error: null, loggingOut: false } : unauthenticated);
    }).catch(() => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      // A network or server failure is not a logout: keep what was shown and say so calmly.
      // Only a definite "no session" answer (above) clears the private data.
      if (previous.status === "authenticated" && session) {
        publish({ status: "authenticated", user: previous.user, error: "session_unavailable", loggingOut: false });
        return;
      }
      session = null;
      publish({ status: "error", user: null, error: "session_unavailable", loggingOut: false });
    }).finally(() => {
      if (pending === request) { pending = null; sessionController = null; }
    });
    pending = request;
  }

  /** Called on focus, visibility and pageshow; one check per return, and only when it is worth it. */
  function revalidate(reason: RevalidateReason) {
    if (!active || state.loggingOut || pending) return;
    const now = Date.now();
    const awayLong = awayAt !== null && now - awayAt > AWAY_MS;
    const stale = now - lastValidated > STALE_MS;
    awayAt = null;
    if (reason === "bfcache" || awayLong || stale) restore();
  }

  function markAway() { if (awayAt === null) awayAt = Date.now(); }

  function logout() {
    if (!active || !session || state.loggingOut) return;
    const currentSession = session;
    generation += 1;
    const currentGeneration = generation;
    sessionController?.abort();
    sessionController = null;
    pending = null;
    const controller = new AbortController();
    logoutController = controller;
    publish({ status: "authenticated", user: currentSession.user, error: null, loggingOut: true });
    void endSession(currentSession.csrf_token, controller.signal).then(() => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      session = null;
      publish(unauthenticated);
    }).catch(() => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      publish({ status: "authenticated", user: currentSession.user, error: "logout_failed", loggingOut: false });
    }).finally(() => { if (logoutController === controller) logoutController = null; });
  }

  return {
    getSnapshot: () => state,
    getCsrfToken: () => state.status === "authenticated" && !state.loggingOut && !state.validating ? session?.csrf_token ?? null : null,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    activate: () => { active = true; restore(); },
    deactivate: () => {
      active = false;
      // StrictMode immediately activates the same store again. Defer disposal
      // so its initial request is reused, but real unmounts cancel requests.
      queueMicrotask(() => {
        if (active) return;
        generation += 1;
        sessionController?.abort();
        logoutController?.abort();
        pending = null;
        session = null;
      });
    },
    retrySession: () => {
      if (pending || state.loggingOut) return;
      if (state.status === "authenticated") { restore(); return; }   // a failed private request: check again in the background
      publish({ status: "loading", user: null, error: null, loggingOut: false });
      restore();
    },
    restore,
    revalidate,
    markAway,
    logout,
  };
}
