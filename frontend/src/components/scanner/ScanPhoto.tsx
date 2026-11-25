import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { CardCorners } from "../../services/scanner";
import { IDENTITY_MATRIX, straighten } from "./perspective";

/** The sweep stays at least this long, so a fast answer does not flash. */
export const MIN_SCAN_MS = 1200;
const FULL = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
const polygon = (corners: CardCorners) => `polygon(${corners.map(([x, y]) => `${(x * 100).toFixed(2)}% ${(y * 100).toFixed(2)}%`).join(", ")})`;

/**
 * The photo while it is read: a cyan beam sweeps it inside viewfinder corners, then, if the card was
 * found, it is cropped to the card and laid flat. Without a preview (HEIC), only the status text shows.
 * Without corners, or after an error, the original photo stays as it is.
 */
export function ScanPhoto({ url, name, scanning, corners }: { url: string | null; name: string; scanning: boolean; corners: CardCorners | null }) {
  const { dictionary } = useLocale();
  const text = dictionary.scanner;
  const frame = useRef<HTMLDivElement>(null);
  const startedAt = useRef(0);
  const [settled, setSettled] = useState(true);   // false from the start of a scan until the minimum time has passed
  const [ratio, setRatio] = useState(0.75);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (scanning) {
      startedAt.current = Date.now();
      const timer = window.setTimeout(() => setSettled(false), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setSettled(true), Math.max(0, MIN_SCAN_MS - (Date.now() - startedAt.current)));
    return () => window.clearTimeout(timer);
  }, [scanning]);
  const sweeping = scanning || !settled;

  // The frame's size in pixels, which the straightening needs; the observer reports it when it first looks.
  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [url]);

  const cropped = Boolean(url && corners && !sweeping);
  const matrix = cropped && corners && size ? straighten(corners, size.width, size.height) : null;

  return <figure className="scanner-photo">
    {url ? <div ref={frame} className="scan-frame" data-scanning={sweeping || undefined} data-cropped={cropped || undefined} style={{ "--scan-ratio": ratio } as React.CSSProperties}>
      <img src={url} alt={dictionary.scanner.preview} onLoad={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth && naturalHeight) setRatio(naturalWidth / naturalHeight); }}
        style={cropped && corners ? { clipPath: polygon(corners), transform: matrix ?? IDENTITY_MATRIX } : { clipPath: FULL, transform: IDENTITY_MATRIX }} />
      {sweeping && <span className="scan-frame__overlay" aria-hidden="true"><i className="scan-frame__beam" /><i /><i /><i /><i /></span>}
    </div> : <p className="scanner-hint">{text.previewUnavailable}</p>}
    {sweeping && <p className="scan-frame__status" role="status">{text.analyzing}</p>}
    <figcaption>{name}</figcaption>
  </figure>;
}
