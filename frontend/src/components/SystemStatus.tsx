import { useCallback, useEffect, useState } from "react";

import { useLocale } from "../i18n/LocaleProvider";
import { fetchHealth, type HealthResponse } from "../services/health";


type StatusState =
  | { kind: "loading" }
  | { kind: "loaded"; health: HealthResponse }
  | { kind: "unreachable" };

export function SystemStatus({
  loadHealth = fetchHealth,
}: {
  loadHealth?: (signal?: AbortSignal) => Promise<HealthResponse>;
}) {
  const { dictionary } = useLocale();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<StatusState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    loadHealth(controller.signal).then(
      (health) => setState({ kind: "loaded", health }),
      (error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setState({ kind: "unreachable" });
        }
      },
    );
    return () => controller.abort();
  }, [attempt, loadHealth]);

  const retry = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((value) => value + 1);
  }, []);

  if (state.kind === "loading") {
    return <p role="status">{dictionary.status.loading}</p>;
  }
  if (state.kind === "unreachable") {
    return (
      <div className="system-status system-status--degraded" role="status">
        <p>{dictionary.status.unreachable}</p>
        <button type="button" onClick={retry}>
          {dictionary.status.retry}
        </button>
      </div>
    );
  }

  return (
    <>
      <dl className="system-status" aria-label={dictionary.status.title}>
        <div>
          <dt>API</dt>
          <dd>{dictionary.status.apiHealthy}</dd>
        </div>
        <div>
          <dt>PostgreSQL</dt>
          <dd>
            {state.health.database === "healthy"
              ? dictionary.status.databaseHealthy
              : dictionary.status.databaseUnavailable}
          </dd>
        </div>
      </dl>
      {state.health.database === "unavailable" && (
        <button className="status-retry" type="button" onClick={retry}>
          {dictionary.status.retry}
        </button>
      )}
    </>
  );
}
