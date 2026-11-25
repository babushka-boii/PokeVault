import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Cover } from "../../services/binders";
import { fitAlbum, swipeDirection } from "./albumLayout";

/** Measures the available workspace; small windows retain readable pockets and scroll. */
export function AlbumFrame({ mobile, turn, swipeEnabled, onSwipe, cover = "noir", children }: {
  mobile: boolean; cover?: Cover; turn: "next" | "prev" | null; children: ReactNode;
  /** Off while a sheet is open or a copy is being written. */
  swipeEnabled: boolean; onSwipe: (direction: 1 | -1) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const touches = useRef(new Set<number>());
  const dropSwallow = useRef<(() => void) | null>(null);
  useEffect(() => () => dropSwallow.current?.(), []);
  // Only touch and pen swipe: a mouse drag keeps selecting and clicking as usual.
  const track = (event: PointerEvent) => event.pointerType === "touch" || event.pointerType === "pen";
  function down(event: PointerEvent) {
    if (!track(event)) return;
    dropSwallow.current?.();   // a new touch is never the click that ended the last swipe
    touches.current.add(event.pointerId);
    // A second finger (pinch) ends any gesture: never a page turn.
    gesture.current = touches.current.size === 1 && swipeEnabled ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
  }
  function up(event: PointerEvent) {
    if (!track(event)) return;
    touches.current.delete(event.pointerId);
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    if (direction === 0) return;
    // The click that follows a swipe must not activate the pocket under the finger.
    const stop = () => {
      document.removeEventListener("click", swallow, true); document.removeEventListener("pointerdown", stop, true);
      window.clearTimeout(timer); dropSwallow.current = null;
    };
    const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); stop(); };
    const timer = window.setTimeout(stop, 400);
    document.addEventListener("click", swallow, true);
    document.addEventListener("pointerdown", stop, true);   // any new press is a new interaction
    dropSwallow.current = stop;
    onSwipe(direction);
  }
  function cancel(event: PointerEvent) {
    touches.current.delete(event.pointerId);
    gesture.current = null;
  }
  const [dimensions, setDimensions] = useState({ width: 900, height: 460 });
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const tray = document.querySelector(".pv-tray")?.getBoundingClientRect().height ?? 160;
      const bar = document.querySelector(".pv-tabbar")?.getBoundingClientRect().height ?? 0;
      // The page's own top (not the viewport's): scrolling must not change the size.
      element.parentElement?.style.setProperty("--pv-reserve", `${tray}px`);   // room under the stage for the fixed tray
      setDimensions({ width: rect.width, height: window.innerHeight - (rect.top + window.scrollY) - tray - bar - 24 });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    const tray = document.querySelector(".pv-tray");
    if (tray) observer?.observe(tray);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [mobile]);
  const fit = fitAlbum({ width: dimensions.width, height: dimensions.height, pages: mobile ? 1 : 2, gap: 8, pagePadding: 12, spineWidth: 28, framePadding: 12, captionHeight: 24, minSleeveWidth: 140 });
  return <div ref={host} className="pv-album" data-cover={cover} data-overflow={fit.overflow || undefined}
    onPointerDown={down} onPointerUp={up} onPointerCancel={cancel}
    style={{ "--pv-album-sleeve": `${fit.sleeveWidth}px` } as CSSProperties}>
    <div className="pv-spread" data-turn={turn ?? undefined}>
      {children}
      <div className="pv-album__rings" aria-hidden="true"><i /><i /><i /></div>
    </div>
  </div>;
}
