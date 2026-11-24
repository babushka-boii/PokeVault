import { useEffect, useRef, useState } from "react";
import { fetchTcgCard, type TcgCard } from "../../services/cards";
import type { Locale } from "../../i18n/LocaleProvider";

/** Public card (printing) metadata, 4 requests at a time. Private inventory never enters this cache. */
export function useCardMetadata(ids: string[], locale: Locale) {
  const key = JSON.stringify([...new Set(ids)].sort());
  const cache = useRef(new Map<string, TcgCard>());
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; locale: Locale; cards: Record<string, TcgCard>; failed: boolean }>();
  useEffect(() => {
    const controller = new AbortController();
    const currentIds = JSON.parse(key) as string[];
    let cursor = 0;
    const entries: [string, TcgCard | undefined][] = [];
    async function worker() {
      while (!controller.signal.aborted && cursor < currentIds.length) {
        const id = currentIds[cursor++];
        const cacheKey = `${locale}:${id}`;
        const cached = cache.current.get(cacheKey);
        if (cached) { entries.push([id, cached]); continue; }
        try {
          const card = await fetchTcgCard(id, locale, controller.signal);
          if (!controller.signal.aborted) {
            cache.current.set(cacheKey, card);
            if (cache.current.size > 120) cache.current.delete(cache.current.keys().next().value!);
          }
          entries.push([id, card]);
        } catch { entries.push([id, undefined]); }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, currentIds.length) }, worker)).then(() => {
      if (controller.signal.aborted) return;
      setSnapshot({ key, locale, cards: Object.fromEntries(entries.filter((entry): entry is [string, TcgCard] => entry[1] !== undefined)), failed: entries.some((entry) => entry[1] === undefined) });
    });
    return () => controller.abort();
  }, [key, locale, attempt]);
  const current = snapshot?.key === key && snapshot.locale === locale ? snapshot : undefined;
  return { cards: current?.cards ?? {}, loading: !current, failed: current?.failed ?? false, retry: () => setAttempt((n) => n + 1) };
}
