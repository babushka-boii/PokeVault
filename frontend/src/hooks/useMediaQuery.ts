import { useCallback, useSyncExternalStore } from "react";

/** Live CSS media query match. Returns false when matchMedia is unavailable (jsdom, SSR). */
export function useMediaQuery(query: string): boolean {
  const snapshot = useCallback(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches, [query]);
  const subscribe = useCallback((listener: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia(query);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

export const MOBILE_QUERY = "(max-width: 767px)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
