import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fitAlbum } from "./albumLayout";

/** Measures the available workspace; small windows retain readable pockets and scroll. */
export function AlbumFrame({ mobile, turn, children }: { mobile: boolean; turn: "next" | "prev" | null; children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 900, height: 460 });
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      const tray = document.querySelector(".pv-tray")?.getBoundingClientRect().height ?? 160;
      const bar = document.querySelector(".pv-tabbar")?.getBoundingClientRect().height ?? 0;
      setDimensions({ width: rect.width, height: window.innerHeight - rect.top - tray - bar - 48 });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    const tray = document.querySelector(".pv-tray");
    if (tray) observer?.observe(tray);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [mobile]);
  const fit = fitAlbum({ ...dimensions, pages: mobile ? 1 : 2, gap: 8, pagePadding: 12, spineWidth: 28, framePadding: 12, captionHeight: 38, minSleeveWidth: 64 });
  return <div ref={host} className="pv-album" data-overflow={fit.overflow || undefined}
    style={{ "--pv-album-sleeve": `${fit.sleeveWidth}px` } as CSSProperties}>
    <div className="pv-spread" data-turn={turn ?? undefined}>
      {children}
      <div className="pv-album__rings" aria-hidden="true"><i /><i /><i /></div>
    </div>
  </div>;
}
