import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "../auth/context";
import { FavoritesError, setFavorite } from "../services/favorites";

export type FavoriteWrite = "ok" | "full" | "error" | "aborted";

/**
 * Writes one star with the session's CSRF token. The caller shows the new state at once
 * and goes back when this answers anything but "ok". Pending writes are cancelled when the
 * component goes away (an account switch or a page change), and then answer "aborted".
 */
export function useFavoriteWrite() {
  const { retrySession, getCsrfToken } = useAuth();
  const controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    const active = controllers.current;
    return () => { active.forEach((controller) => controller.abort()); active.clear(); };
  }, []);
  return useCallback(async (cardId: string, favorite: boolean): Promise<FavoriteWrite> => {
    const csrf = getCsrfToken();
    if (!csrf) { retrySession(); return "error"; }
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      await setFavorite(cardId, favorite, csrf, controller.signal);
      return controller.signal.aborted ? "aborted" : "ok";
    } catch (error: unknown) {
      if (controller.signal.aborted) return "aborted";
      const status = error instanceof FavoritesError ? error.status : 0;
      if (status === 401) retrySession();
      return status === 409 && error instanceof FavoritesError && error.detail === "favorites_full" ? "full" : "error";
    } finally { controllers.current.delete(controller); }
  }, [getCsrfToken, retrySession]);
}
