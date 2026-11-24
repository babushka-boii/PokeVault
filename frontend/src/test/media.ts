import { vi } from "vitest";

export type MediaState = { mobile?: boolean; reducedMotion?: boolean; hover?: boolean; coarse?: boolean };

/**
 * Stubs window.matchMedia for the media queries PokéVault uses. jsdom has no matchMedia,
 * so without this stub the shell renders the desktop layout. `set` updates the state and
 * fires `change` to every subscribed query (wrap it in act()).
 */
export function stubMedia(initial: MediaState = {}) {
  const state: MediaState = { ...initial };
  const listeners = new Set<() => void>();
  const matches = (query: string) => {
    if (query.includes("max-width: 767px")) return !!state.mobile;
    if (query.includes("prefers-reduced-motion")) return !!state.reducedMotion;
    if (query.includes("hover: hover")) return !!state.hover;
    if (query.includes("any-pointer: coarse")) return !!state.coarse;
    return false;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    media: query,
    get matches() { return matches(query); },
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    addListener: (listener: () => void) => { listeners.add(listener); },
    removeListener: (listener: () => void) => { listeners.delete(listener); },
    dispatchEvent: () => false,
  }));
  return {
    set(next: MediaState) {
      Object.assign(state, next);
      listeners.forEach((listener) => listener());
    },
    listenerCount: () => listeners.size,
  };
}
