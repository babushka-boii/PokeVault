import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchCopyView } from "../../services/binders";
import { CardRequestError } from "../../services/cards";
import { fetchSetProgress } from "../../services/sets";
import { useCardMetadata } from "../cards/cardMetadata";
import { SetProgress } from "../sets/SetProgress";
import { CutPanel } from "../ui/CutPanel";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import "../sets/sets.css";
import "./home.css";

const MAX_ROWS = 6;

/**
 * Expansions of the 30 most recent copies (no "owned sets" endpoint exists yet; see ROADMAP debt).
 * Set ids come from public card metadata, never from guessing card ids.
 */
export function SetsProgress() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const { retrySession } = useAuth();
  const recentRequest = useCallback((signal: AbortSignal) => fetchCopyView("recent", 0, signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof BindersError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]);
  const recent = useTcgResource("recent", recentRequest);
  const cardIds = recent.state.kind === "loaded" ? [...new Set(recent.state.data.results.map((copy) => copy.card_id))] : [];
  const metadata = useCardMetadata(cardIds, locale);
  const sets: { id: string; name: string; language: string }[] = [];
  for (const id of cardIds) {
    const set = metadata.cards[id]?.set;
    if (set && !sets.some((known) => known.id === set.id) && sets.length < MAX_ROWS) sets.push({ id: set.id, name: set.name, language: set.name_language });
  }
  const ready = recent.state.kind === "loaded" && !metadata.loading;
  const setKey = sets.map((set) => set.id).join(",");
  const progressRequest = useCallback((signal: AbortSignal) => fetchSetProgress(setKey.split(","), signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof CardRequestError && error.status === 401) retrySession();
    throw error;
  }), [setKey, retrySession]);
  const progress = useTcgResource(ready && setKey ? setKey : undefined, progressRequest);
  const loading = recent.state.kind === "loading" || (recent.state.kind === "loaded" && metadata.loading) || (ready && !!setKey && progress.state.kind === "loading");
  const failed = recent.state.kind === "error" || progress.state.kind === "error";
  const empty = ready && !setKey;
  const retry = () => { if (recent.state.kind === "error") recent.retry(); else progress.retry(); };

  return <CutPanel className="pv-home__sets" aria-labelledby="home-sets-title">
    <div className="pv-home__section-head">
      <h2 id="home-sets-title">{text.setsTitle}</h2>
      <Link to="/sets">{text.setsAll}</Link>
    </div>
    <p className="pv-home__meta">{text.setsSource}</p>
    {loading && <LoadingStatus label={text.setsLoading}><Skeleton shape="bar" lines={3} /></LoadingStatus>}
    {failed && <InlineError message={text.setsError} retryLabel={text.retry} onRetry={retry} />}
    {empty && <p className="pv-home__meta">{text.setsEmpty}</p>}
    {progress.state.kind === "loaded" && <ul className="pv-home__sets-list">
      {sets.map((set) => {
        const row = progress.state.kind === "loaded" ? progress.state.data.find((item) => item.set_id === set.id) : undefined;
        return <li key={set.id}>
          <Link to={`/sets/${encodeURIComponent(set.id)}`} lang={set.language}>{set.name}</Link>
          {row && <SetProgress compact progress={row} />}
        </li>;
      })}
    </ul>}
  </CutPanel>;
}
