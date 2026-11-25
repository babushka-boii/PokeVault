import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useFavoriteWrite } from "../../hooks/useFavoriteWrite";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchFavoriteState, FavoritesError } from "../../services/favorites";
import "./cards.css";

type Message = "added" | "removed" | "full" | "error" | null;

function Toggle({ cardId }: { cardId: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.favorites;
  const { retrySession } = useAuth();
  const write = useFavoriteWrite();
  const request = useCallback((signal: AbortSignal) => fetchFavoriteState(cardId, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof FavoritesError && error.status === 401) retrySession();
    throw error;
  }), [cardId, retrySession]);
  const { state, retry } = useTcgResource(cardId, request);
  // What the user chose, shown at once; before any choice, what the server said.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const loaded = state.kind === "loaded";
  const favorite = chosen ?? (loaded ? state.data : false);

  async function toggle() {
    const next = !favorite;
    setChosen(next); setPending(true); setMessage(null);          // the star changes now…
    const result = await write(cardId, next);
    if (result === "aborted") return;
    setPending(false);
    if (result === "ok") setMessage(next ? "added" : "removed");
    else { setChosen(!next); setMessage(result); }                // …and goes back if the server said no
  }

  return <div className="pv-favorite">
    <button type="button" className="pv-favorite__button" aria-pressed={favorite} disabled={!loaded || pending} onClick={() => void toggle()}>
      <span aria-hidden="true">{favorite ? "★" : "☆"}</span> {text.label}
    </button>
    {state.kind === "error" && <p className="pv-favorite__note">{text.loadError} <button type="button" onClick={retry}>{dictionary.home.retry}</button></p>}
    {message && <p role="status" className="pv-favorite__note">{message === "added" ? text.added : message === "removed" ? text.removed : message === "full" ? text.full : text.saveError}</p>}
  </div>;
}

/**
 * A star on a catalog card (not on a physical copy). It changes at once and goes back with
 * a quiet notice if the server refuses. Guests are invited to sign in; the state is per
 * signed-in user and card.
 */
export function FavoriteStar({ cardId }: { cardId: string }) {
  const auth = useAuth();
  const { dictionary } = useLocale();
  if (auth.status === "unauthenticated") return <p className="pv-favorite"><Link to="/login">{dictionary.favorites.signIn}</Link></p>;
  if (auth.status !== "authenticated" || auth.loggingOut || auth.validating) return null;
  return <Toggle key={`${auth.user.id}:${cardId}`} cardId={cardId} />;
}
