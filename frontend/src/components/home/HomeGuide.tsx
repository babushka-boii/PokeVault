import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { closeGuide, fetchGuide, HomeError, type Guide } from "../../services/home";
import { CutPanel } from "../ui/CutPanel";
import "./home.css";

/**
 * Three first steps, each crossed out when done. It disappears for good when all three are
 * done (the server records that) or when closed. It is optional: while loading or on error
 * nothing is shown.
 */
export function HomeGuide() {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  const { retrySession, getCsrfToken } = useAuth();
  const request = useCallback((signal: AbortSignal) => fetchGuide(signal).catch((error: unknown) => {
    if (!signal.aborted && error instanceof HomeError && error.status === 401) retrySession();
    throw error;
  }), [retrySession]);
  const { state } = useTcgResource("home-guide", request);
  const [closed, setClosed] = useState(false);
  const [problem, setProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  if (state.kind !== "loaded" || state.data.dismissed || closed) return null;
  const guide: Guide = state.data;
  const steps = [
    { done: guide.has_copy, label: text.guideScan, to: "/scanner" },
    { done: guide.has_stored, label: text.guideStore, to: "/binders" },
    { done: guide.has_favorite, label: text.guideFavorite, to: "/collection" },
  ];
  async function close() {
    const csrf = getCsrfToken();
    if (!csrf) { retrySession(); setProblem(true); return; }
    setBusy(true); setProblem(false);
    try { await closeGuide(csrf, new AbortController().signal); setClosed(true); }
    catch (error: unknown) { if (error instanceof HomeError && error.status === 401) retrySession(); setProblem(true); }
    finally { setBusy(false); }
  }
  return <CutPanel className="pv-home__guide pv-home__wide" aria-labelledby="home-guide-title">
    <div className="pv-home__section-head">
      <h2 id="home-guide-title">{text.guideTitle}</h2>
      <button type="button" className="pv-button pv-button--secondary" disabled={busy} onClick={() => void close()}>{text.guideClose}</button>
    </div>
    {problem && <p role="alert" className="pv-home__meta">{text.guideCloseError}</p>}
    <ol className="pv-home__steps" aria-label={text.guideTitle}>
      {steps.map((step) => <li key={step.to} data-done={step.done}>
        <span className="pv-home__step-mark" aria-hidden="true">{step.done ? "✓" : "○"}</span>
        <Link to={step.to} style={step.done ? { textDecoration: "line-through" } : undefined}>{step.label}</Link>
        {step.done && <span className="pv-sr-only">{text.guideDone}</span>}
      </li>)}
    </ol>
  </CutPanel>;
}
