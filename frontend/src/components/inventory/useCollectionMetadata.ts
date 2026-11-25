import { useEffect, useRef, useState } from "react";
import { fetchTcgCard, type TcgCard } from "../../services/cards";
import type { Locale } from "../../i18n/LocaleProvider";
export const COLLECTION_NAME_LIMIT = 100;
/** One owner-scoped cache shared by search, ordering and every visible group. */
export function useCollectionMetadata(ids: string[], locale: Locale) {
  const key = JSON.stringify([...new Set(ids)].slice(0, COLLECTION_NAME_LIMIT));
  const cache = useRef(new Map<string, TcgCard | null>());
  const [snapshot, setSnapshot] = useState<{ key: string; locale: Locale; cards: Record<string, TcgCard>; completed: number; failed: number }>();
  useEffect(() => {
    const controller = new AbortController();
    const requested = JSON.parse(key) as string[];
    const cards: Record<string, TcgCard> = {};
    let completed = 0; let failed = 0; let cursor = 0;
    const publish = () => { if (!controller.signal.aborted) setSnapshot({ key, locale, cards: { ...cards }, completed, failed }); };
    async function worker() {
      while (!controller.signal.aborted && cursor < requested.length) {
        const id = requested[cursor++]; const cacheKey = `${locale}:${id}`;
        let card = cache.current.get(cacheKey);
        if (card === undefined) {
          try { card = await fetchTcgCard(id, locale, controller.signal); }
          catch { card = null; }
          if (controller.signal.aborted) return;
          cache.current.set(cacheKey, card);
          if (cache.current.size > 200) cache.current.delete(cache.current.keys().next().value!);
        }
        if (card) cards[id] = card; else failed++;
        completed++; publish();
      }
    }
    publish();
    void Promise.all(Array.from({ length: Math.min(4, requested.length) }, worker));
    return () => controller.abort();
  }, [key, locale]);
  const current = snapshot?.key === key && snapshot.locale === locale ? snapshot : undefined;
  return { cards: current?.cards ?? {}, completed: current?.completed ?? 0, failed: current?.failed ?? 0, total: (JSON.parse(key) as string[]).length };
}
