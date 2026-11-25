import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchFavoriteState, FavoritesError, setFavorite } from "../../services/favorites";
import "./cards.css";

type Message = { kind: "added" | "removed" | "full" | "error" } | null;

function Toggle({ cardId }: { cardId: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.favorites;
  const { retrySession, getCsrfToken } = useAuth();
  const request = useCallback((signal: AbortSignal) => fetchFavoriteState(cardId, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof FavoritesError && error.status === 401) retrySession();
    throw error;
  }), [cardId, retrySession]);
  const { state, retry } = useTcgResource(cardId, request);
  // The confirmed state, once the user has changed it; before that, what the server said.
  const [changed, setChanged] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const loaded = state.kind === "loaded";
  const favorite = changed ?? (loaded ? state.data : false);

  async function toggle() {
    const csrf = getCsrfToken();
    if (!csrf) { retrySession(); setMessage({ kind: "error" }); return; }
    const next = !favorite;
    const current = new AbortController(); controller.current = current;
    setPending(true); setMessage(null);
    try {
      const confirmed = await setFavorite(cardId, next, csrf, current.signal);
      if (current.signal.aborted) return;
      setChanged(confirmed); setMessage({ kind: confirmed ? "added" : "removed" });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      const status = error instanceof FavoritesError ? error.status : 0;
      if (status === 401) retrySession();
      setMessage({ kind: status === 409 && (error as FavoritesError).detail === "favorites_full" ? "full" : "error" });
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }

  return <div className="pv-favorite">
    <button type="button" className="pv-favorite__button" aria-pressed={favorite} disabled={!loaded || pending} onClick={() => void toggle()}>
      <span aria-hidden="true">{favorite ? "★" : "☆"}</span> {text.label}
    </button>
    {state.kind === "error" && <p className="pv-favorite__note">{text.loadError} <button type="button" onClick={retry}>{dictionary.home.retry}</button></p>}
    {message && (message.kind === "added" || message.kind === "removed")
      ? <p role="status" className="pv-favorite__note">{message.kind === "added" ? text.added : text.removed}</p>
      : message && <p role="alert" className="pv-favorite__note">{message.kind === "full" ? text.full : text.saveError}</p>}
  </div>;
}

/**
 * A star on a catalog card (not on a physical copy). It changes only once the server
 * confirms. Guests are invited to sign in; the state is per signed-in user and card.
 */
export function FavoriteStar({ cardId }: { cardId: string }) {
  const auth = useAuth();
  const { dictionary } = useLocale();
  if (auth.status === "unauthenticated") return <p className="pv-favorite"><Link to="/login">{dictionary.favorites.signIn}</Link></p>;
  if (auth.status !== "authenticated" || auth.loggingOut || auth.validating) return null;
  return <Toggle key={`${auth.user.id}:${cardId}`} cardId={cardId} />;
}
