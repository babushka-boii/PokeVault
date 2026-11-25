import { useCallback, useState } from "react";
import { useAuth } from "../auth/context";
import { FavoritesError, fetchFavoriteStatus, MAX_STATUS } from "../services/favorites";
import { useFavoriteWrite } from "./useFavoriteWrite";
import { useTcgResource } from "./useTcgResource";

export type StarNotice = "added" | "removed" | "full" | "error" | null;

/**
 * Star state for a row of catalog cards: one request says which are starred, a click changes
 * the star at once and goes back (with a notice) if the server refuses.
 */
export function useStarState(cardIds: string[], enabled: boolean) {
  const { retrySession } = useAuth();
  const write = useFavoriteWrite();
  const ids = enabled ? [...new Set(cardIds)].slice(0, MAX_STATUS).join(",") : "";
  const request = useCallback((signal: AbortSignal) => fetchFavoriteStatus(ids.split(","), signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof FavoritesError && error.status === 401) retrySession();
    throw error;
  }), [ids, retrySession]);
  const status = useTcgResource(ids ? `status:${ids}` : undefined, request);
  const [chosen, setChosen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [notice, setNotice] = useState<StarNotice>(null);
  const starred = (id: string) => chosen[id] ?? (status.state.kind === "loaded" && status.state.data.has(id));
  return {
    notice,
    starred,
    ready: (id: string) => id in chosen || status.state.kind === "loaded",
    pending: (id: string) => busy.has(id),
    async toggle(id: string) {
      const next = !starred(id);
      setChosen((previous) => ({ ...previous, [id]: next }));
      setBusy((previous) => new Set(previous).add(id)); setNotice(null);
      const result = await write(id, next);
      if (result === "aborted") return;
      setBusy((previous) => { const rest = new Set(previous); rest.delete(id); return rest; });
      if (result === "ok") setNotice(next ? "added" : "removed");
      else { setChosen((previous) => ({ ...previous, [id]: !next })); setNotice(result); }
    },
  };
}
