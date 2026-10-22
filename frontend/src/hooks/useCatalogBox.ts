import { useEffect, useRef, useState } from "react";
import { BOX_SIZE, fetchPokemonPage, type Pokemon } from "../services/pokemon";

type BoxState = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; pokemon: Pokemon[] };

export function useCatalogBox(page: number) {
  const cache = useRef(new Map<number, { expires: number; pokemon: Pokemon[] }>());
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ page: number; attempt: number; state: BoxState }>();
  useEffect(() => {
    const controller = new AbortController();
    const cached = cache.current.get(page);
    const request = cached && cached.expires > Date.now()
      ? Promise.resolve({ results: cached.pokemon })
      : fetchPokemonPage(page * BOX_SIZE, controller.signal);
    request.then(({ results }) => {
      if (controller.signal.aborted) return;
      cache.current.set(page, { expires: cached && cached.expires > Date.now() ? cached.expires : Date.now() + 300_000, pokemon: results });
      if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
      setResult({ page, attempt, state: { kind: "loaded", pokemon: results } });
    }, () => {
      if (!controller.signal.aborted) setResult({ page, attempt, state: { kind: "error" } });
    });
    return () => controller.abort();
  }, [page, attempt]);
  const state: BoxState = result?.page === page && result.attempt === attempt
    ? result.state : { kind: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
