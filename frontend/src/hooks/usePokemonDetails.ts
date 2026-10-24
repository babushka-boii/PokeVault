import { useEffect, useRef, useState } from "react";
import type { Locale } from "../i18n/LocaleProvider";
import { fetchPokemonDetails, type PokemonDetails } from "../services/pokemonDetails";

type DetailState = { kind: "loading" } | { kind: "error" } | { kind: "loaded"; details: PokemonDetails };

export function usePokemonDetails(number: number | undefined, locale: Locale) {
  const cache = useRef(new Map<string, { expires: number; data: PokemonDetails }>());
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; state: DetailState }>();
  const key = `${number}:${locale}`;
  useEffect(() => {
    if (number === undefined) return;
    const controller = new AbortController();
    const cached = cache.current.get(key);
    const request = cached && cached.expires > Date.now()
      ? Promise.resolve(cached.data) : fetchPokemonDetails(number, locale, controller.signal);
    request.then((details) => {
      if (controller.signal.aborted) return;
      cache.current.set(key, { expires: cached && cached.expires > Date.now() ? cached.expires : Date.now() + 300_000, data: details });
      if (cache.current.size > 32) cache.current.delete(cache.current.keys().next().value!);
      setResult({ key, attempt, state: { kind: "loaded", details } });
    }, () => {
      if (!controller.signal.aborted) setResult({ key, attempt, state: { kind: "error" } });
    });
    return () => controller.abort();
  }, [key, number, locale, attempt]);
  const state: DetailState = result?.key === key && result.attempt === attempt ? result.state : { kind: "loading" };
  return { state, retry: () => setAttempt((value) => value + 1) };
}
