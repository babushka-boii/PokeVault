import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AuthContext } from "./context";
import { createAuthStore } from "./store";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createAuthStore);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);

  useEffect(() => {
    store.activate();
    const onFocus = () => store.revalidate("focus");
    const onBlur = () => store.markAway();
    const onPageShow = (event: PageTransitionEvent) => store.revalidate(event.persisted ? "bfcache" : "pageshow");
    const onVisibility = () => { if (document.visibilityState === "visible") store.revalidate("visible"); else store.markAway(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      store.deactivate();
    };
  }, [store]);

  const value = useMemo(() => ({ ...state, retrySession: store.retrySession, logout: store.logout, getCsrfToken: store.getCsrfToken }), [state, store]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
