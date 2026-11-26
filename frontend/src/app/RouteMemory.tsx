import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { PreviousRoute } from "./routeHistory";
type Entry = { key: string; path: string };
/** Only observed in-app entries qualify for history fallback. No external history guessing. */
export function RouteMemory({ children, initialEntries }: { children: ReactNode; initialEntries?: string[] }) {
  const location = useLocation();
  const action = useNavigationType();
  const path = location.pathname + location.search;
  const [history, setHistory] = useState(() => ({
    entries: initialEntries?.map((path, i) => ({ key: `entry-${i}`, path })) ?? [{ key: location.key, path }],
    index: (initialEntries?.length ?? 1) - 1, key: location.key,
  }));
  let current = history;
  if (history.key !== location.key) {
    const entry: Entry = { key: location.key, path };
    const found = history.entries.findIndex((item) => item.key === location.key);
    current = action === "POP" && found >= 0 ? { ...history, index: found, key: location.key }
      : action === "REPLACE" ? { entries: history.entries.map((item, i) => i === history.index ? entry : item), index: history.index, key: location.key }
      : { entries: [...history.entries.slice(0, history.index + 1), entry], index: history.index + 1, key: location.key };
    setHistory(current);
  }
  const positions = useRef(new Map<string, number>());
  const lastPathname = useRef(location.pathname);
  useEffect(() => {
    const target = positions.current.get(path);
    if (target === 0 || (target === undefined && lastPathname.current !== location.pathname)) window.scrollTo(0, 0);
    lastPathname.current = location.pathname;
    let restoring = target !== undefined && target > 0;
    let position = target ?? 0;
    const remember = () => { if (!restoring) position = window.scrollY; };
    const restore = () => {
      if (!restoring) return;
      window.scrollTo(0, target!);
      if (window.scrollY >= target! - 1) { restoring = false; observer.disconnect(); }
    };
    const observer = new MutationObserver(restore);
    if (restoring) { observer.observe(document.body, { childList: true, subtree: true }); restore(); }
    const stop = () => { restoring = false; observer.disconnect(); position = window.scrollY; };
    const timer = window.setTimeout(stop, 5000);
    window.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    const map = positions.current;
    return () => {
      map.set(path, position); if (map.size > 100) map.delete(map.keys().next().value!);
      observer.disconnect(); window.clearTimeout(timer);
      window.removeEventListener("scroll", remember); window.removeEventListener("wheel", stop); window.removeEventListener("touchstart", stop);
    };
  }, [path, location.pathname]);
  return <PreviousRoute.Provider value={current.entries[current.index - 1]?.path}>{children}</PreviousRoute.Provider>;
}
