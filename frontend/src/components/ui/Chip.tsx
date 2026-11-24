import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import "./ui.css";

/** Small fact or shortcut. With `to` it is a link with a 44px target. */
export function Chip({ to, children }: { to?: string; children: ReactNode }) {
  return to ? <Link className="pv-chip pv-chip--link" to={to}>{children}</Link> : <span className="pv-chip">{children}</span>;
}
