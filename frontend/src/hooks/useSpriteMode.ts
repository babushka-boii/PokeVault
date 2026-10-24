import { useEffect, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { SpriteMode } from "../services/menuIcons";

const STORAGE_KEY = "pokevault.spriteMode";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readMode(): SpriteMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "animated" ? "animated" : "static";
  } catch {
    return "static";
  }
}

function getReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useSpriteMode(): {
  mode: SpriteMode;
  setMode: Dispatch<SetStateAction<SpriteMode>>;
  reducedMotion: boolean;
  effectiveMode: SpriteMode;
} {
  const [mode, setMode] = useState<SpriteMode>(readMode);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch { /* Keep the preference for this session when storage is unavailable. */ }
  }, [mode]);

  return { mode, setMode, reducedMotion, effectiveMode: reducedMotion ? "static" : mode };
}
