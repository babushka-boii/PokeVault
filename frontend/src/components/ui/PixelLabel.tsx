import type { ReactNode } from "react";
import "./ui.css";

/** Short uppercase label in the pixel font (never body text). */
export function PixelLabel({ tone = "muted", id, children }: { tone?: "gold" | "cyan" | "muted"; id?: string; children: ReactNode }) {
  return <span id={id} className={`pv-pixel pv-label pv-label--${tone}`}>{children}</span>;
}
