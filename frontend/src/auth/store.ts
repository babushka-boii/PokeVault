import { endSession, fetchSession, type AuthErrorCode, type AuthSession, type AuthUser } from "../services/auth";

export type AuthState = {
  status: "loading" | "unauthenticated" | "error";
  user: null;
  error: AuthErrorCode | null;
  loggingOut: false;
} | {
  status: "authenticated";
  user: AuthUser;
  error: AuthErrorCode | null;
  loggingOut: boolean;
};

const unauthenticated: AuthState = { status: "unauthenticated", user: null, error: null, loggingOut: false };

// Each mounted application owns its own in-memory session. No provider tokens or
// reusable session credentials are available to React or browser storage.
export function createAuthStore() {
  let state: AuthState = { status: "loading", user: null, error: null, loggingOut: false };
  let session: AuthSession | null = null;
  let active = false;
  let generation = 0;
  let pending: Promise<void> | null = null;
  let sessionController: AbortController | null = null;
  let logoutController: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AuthState) => { state = next; listeners.forEach((listener) => listener()); };

  function restore() {
    if (!active || state.loggingOut || pending) return;
    const currentGeneration = generation;
    const controller = new AbortController();
    sessionController = controller;
    const request = fetchSession(controller.signal).then((result) => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      session = result;
      publish(result ? { status: "authenticated", user: result.user, error: null, loggingOut: false } : unauthenticated);
    }).catch(() => {
      if (!active || controller.signal.aborted || currentGeneration !== generation) return;
      session = null;
      publish({ status: "error", user: null, error: "session_unavailable", loggingOut: false });
    }).finally(() => {
      if (pending === request) { pending = null; sessionController = null; }
    });
    pending = request;
  }

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
      publish({ status: "loading", user: null, error: null, loggingOut: false });
      restore();
    },
    restore,
    logout,
  };
}
