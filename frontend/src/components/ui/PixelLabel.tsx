import type { ReactNode } from "react";
import "./ui.css";

/** Short uppercase label in the pixel font (never body text). */
export function PixelLabel({ tone = "muted", children }: { tone?: "gold" | "cyan" | "muted"; children: ReactNode }) {
  return <span className={`pv-pixel pv-label pv-label--${tone}`}>{children}</span>;
}
