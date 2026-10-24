import { useEffect, useState } from "react";
import { CardRequestError } from "../services/cards";

type ResourceState<T> = { kind: "loading" } | { kind: "loaded"; data: T } | { kind: "error"; notFound: boolean };

export function useTcgResource<T>(key: string | undefined, request: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; state: ResourceState<T> }>();

  useEffect(() => {
    if (key === undefined) return;
    const controller = new AbortController();
    request(controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ key, attempt, state: { kind: "loaded", data } });
    }, (error: unknown) => {
      if (!controller.signal.aborted) setResult({ key, attempt, state: {
        kind: "error", notFound: error instanceof CardRequestError && error.status === 404,
      } });
    });
    return () => controller.abort();
  }, [key, request, attempt]);

  const state: ResourceState<T> = result && result.key === key && result.attempt === attempt ? result.state : { kind: "loading" };
  return { state, retry: () => setAttempt((current) => current + 1) };
}
