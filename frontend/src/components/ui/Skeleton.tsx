import type { ReactNode } from "react";
import "./ui.css";

export type SkeletonShape = "text" | "number" | "block" | "card" | "bar";

/** Placeholder with the shape of the content that is loading. Hidden from assistive tech. */
export function Skeleton({ shape, lines = 1 }: { shape: SkeletonShape; lines?: number }) {
  return <>{Array.from({ length: lines }, (_, index) => <span key={index} className={`pv-skeleton pv-skeleton--${shape}`} aria-hidden="true" />)}</>;
}

/** Busy region: announces a status text and holds skeletons. No spinners. */
export function LoadingStatus({ label, children }: { label: string; children: ReactNode }) {
  return <div className="pv-loading" aria-busy="true">
    <span className="pv-sr-only" role="status">{label}</span>
    {children}
  </div>;
}
