import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BindersError, fetchBinders, fetchLocations } from "../../services/binders";
import { fill } from "./labels";

/**
 * "¿Dónde está esta carta?": the binder, page and pocket of one owned copy, or a
 * shortcut to store it. A failed request simply omits the line.
 */
export function CopyLocation({ copyId }: { copyId: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  const { retrySession } = useAuth();
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    if (!signal.aborted && error instanceof BindersError && error.status === 401) retrySession();
    throw error;
  }, [retrySession]);
  const locate = useCallback((signal: AbortSignal) => fetchLocations([copyId], signal).catch((e: unknown) => guard(e, signal)), [copyId, guard]);
  const location = useTcgResource(`location:${copyId}`, locate);
  const placed = location.state.kind === "loaded" ? location.state.data[0] : undefined;
  const loose = location.state.kind === "loaded" && !placed;
  const listRequest = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const binders = useTcgResource(loose ? "location-binders" : undefined, listRequest);
  const first = binders.state.kind === "loaded" ? binders.state.data.results[0] : undefined;
  if (location.state.kind !== "loaded") return null;
  return <section className="pv-location" aria-labelledby={`location-${copyId}`}>
    <h2 id={`location-${copyId}`}>{text.locationTitle}</h2>
    {placed ? <Link to={`/binders/${encodeURIComponent(placed.binder_id)}?page=${placed.page}&pocket=${placed.pocket}`}>
      {fill(text.location, { binder: placed.binder_name, page: placed.page, pocket: placed.pocket })}</Link>
      : <Link to={first ? `/binders/${encodeURIComponent(first.id)}` : "/binders"}>{text.locationNone}</Link>}
  </section>;
}
