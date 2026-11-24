import type { HTMLAttributes, ReactNode } from "react";
import { classes } from "./classes";
import "./ui.css";

export type PanelTone = "default" | "scan" | "value";

/** Featured panel with the diagonal cut corner. Use sparingly (hero, scanner, Mi PC). */
export function CutPanel({ as: Tag = "section", tone = "default", className, children, ...rest }: HTMLAttributes<HTMLElement> & {
  as?: "section" | "div" | "article"; tone?: PanelTone; children: ReactNode;
}) {
  return <Tag className={classes("pv-panel", "pv-cut", `pv-panel--${tone}`, className)} {...rest}>{children}</Tag>;
}
