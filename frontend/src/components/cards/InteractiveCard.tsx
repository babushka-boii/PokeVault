import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { TcgCard } from "../../services/cards";
import "./interactive-card.css";

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const TOUCH_QUERY = "(any-pointer: coarse)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function useMediaQuery(query: string) {
  const snapshot = useCallback(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches, [query]);
  const subscribe = useCallback((listener: () => void) => {
    if (typeof window.matchMedia !== "function") return () => {};
    const media = window.matchMedia(query);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [query]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

type InteractiveCardProps = {
  card: TcgCard;
  large?: boolean;
  children: ReactNode;
  touchLabel?: string;
  touchActiveLabel?: string;
};

const restingStyle = {
  "--card-rotate-x": "0deg", "--card-rotate-y": "0deg",
  "--card-light-x": "50%", "--card-light-y": "50%",
} as CSSProperties;

type TouchGesture = { id: number; startX: number; startY: number; moved: boolean };

function hasIridescentMetadata(card: TcgCard) {
  const rarity = card.rarity?.toLowerCase() ?? "";
  const explicitlyHolo = /\bholo(?:graphic)?\b/.test(rarity) && !/\bnon[ -]?holo\b/.test(rarity);
  // Variants describe available printings, not a selected physical finish.
  // Mixed or unknown printings keep the generic reflection; all effects are simulated.
  const onlyFoilPrintings = card.variants.length > 0 && card.variants.every((variant) =>
    ["holo", "reverse", "reverseholo", "holographic"].includes(variant.type.toLowerCase().replace(/[\s_-]/g, "")));
  return explicitlyHolo || onlyFoilPrintings;
}

export function InteractiveCard({ card, children, large = false, touchLabel = "Tilt card", touchActiveLabel = "Finish interaction" }: InteractiveCardProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<TouchGesture | null>(null);
  const blockClickRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);
  const [touchArmed, setTouchArmed] = useState(false);
  const hoverEnabled = useMediaQuery(HOVER_QUERY);
  const coarsePointer = useMediaQuery(TOUCH_QUERY);
  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const touchEnabled = touchArmed && !reducedMotion;
  const iridescent = hasIridescentMetadata(card);

  const clearClickBlock = useCallback(() => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    blockClickRef.current = false;
  }, []);

  const reset = useCallback((blockDragClick = false) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (blockDragClick && gesture?.moved) {
      blockClickRef.current = true;
      if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = window.setTimeout(clearClickBlock, 600);
    }
    const surface = surfaceRef.current;
    if (!surface) return;
    if (gesture && surface.hasPointerCapture?.(gesture.id)) surface.releasePointerCapture(gesture.id);
    surface.style.setProperty("--card-rotate-x", "0deg");
    surface.style.setProperty("--card-rotate-y", "0deg");
    surface.dataset.active = "false";
  }, [clearClickBlock]);

  useEffect(() => {
    reset(true);
  }, [card.id, hoverEnabled, reducedMotion, reset]);

  useEffect(() => {
    const surface = surfaceRef.current;
    return () => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      if (gesture && surface?.hasPointerCapture?.(gesture.id)) surface.releasePointerCapture(gesture.id);
      clearClickBlock();
    };
  }, [clearClickBlock]);

  function illuminate(event: PointerEvent<HTMLDivElement>) {
    const surface = event.currentTarget;
    const bounds = surface.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const limit = large ? 8 : 4;
    surface.style.setProperty("--card-rotate-x", `${(1 - y * 2) * limit}deg`);
    surface.style.setProperty("--card-rotate-y", `${(x * 2 - 1) * limit}deg`);
    surface.style.setProperty("--card-light-x", `${x * 100}%`);
    surface.style.setProperty("--card-light-y", `${y * 100}%`);
    surface.dataset.active = "true";
  }

  function down(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || gestureRef.current) return;
    clearClickBlock();
    if (event.pointerType !== "touch") return;
    gestureRef.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false };
    if (touchEnabled) illuminate(event);
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") {
      if (hoverEnabled && !reducedMotion) illuminate(event);
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) gesture.moved = true;
    if (!touchEnabled) return;
    if (gesture.moved && !event.currentTarget.hasPointerCapture?.(gesture.id)) event.currentTarget.setPointerCapture?.(gesture.id);
    if (event.cancelable && gesture.moved) event.preventDefault();
    illuminate(event);
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.id === event.pointerId) reset(true);
  }

  return <div className={`tcg-interactive-card${large ? " tcg-interactive-card--large" : ""}`}
    onKeyDown={(event) => { if (event.key === "Escape") { reset(true); setTouchArmed(false); } }}>
    <div ref={surfaceRef} className="tcg-interactive-surface" style={{ ...restingStyle, touchAction: touchEnabled ? "none" : "pan-y pinch-zoom" }}
      data-active="false" data-reflection={iridescent ? "iridescent" : "subtle"}
      onPointerDown={down} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}
      onLostPointerCapture={(event) => { if (event.target === event.currentTarget) finish(event); }}
      onPointerLeave={() => { if (!touchEnabled || !gestureRef.current) reset(true); }}
      onClickCapture={(event) => {
        if (blockClickRef.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          clearClickBlock();
        }
      }}>
      {children}
      {!reducedMotion && <>
        <span className="tcg-card-glare" aria-hidden="true" />
        {iridescent && <span className="tcg-card-iridescence" aria-hidden="true" />}
      </>}
    </div>
    {!reducedMotion && (!hoverEnabled || coarsePointer) && <button type="button" className="tcg-card-touch-toggle" aria-pressed={touchEnabled}
      onClick={() => { reset(true); setTouchArmed((armed) => !armed); }}>
      {touchEnabled ? touchActiveLabel : touchLabel}
    </button>}
  </div>;
}
