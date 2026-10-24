import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthContext } from "./context";
import { createAuthStore } from "./store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createAuthStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.activate();
    const onVisibility = () => { if (document.visibilityState === "visible") store.restore(); };
    window.addEventListener("focus", store.restore);
    window.addEventListener("pageshow", store.restore);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", store.restore);
      window.removeEventListener("pageshow", store.restore);
      document.removeEventListener("visibilitychange", onVisibility);
      store.deactivate();
    };
  }, [store]);

  const value = useMemo(() => ({ ...state, retrySession: store.retrySession, logout: store.logout }), [state, store]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
