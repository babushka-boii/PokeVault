import { Link } from "react-router-dom";

/** The "Unova Noir" binder cover. A pointer/touch shortcut: the name link is the accessible one. */
export function Cover({ binderId }: { binderId: string }) {
  return <Link className="pv-cover" to={`/binders/${encodeURIComponent(binderId)}`} aria-hidden="true" tabIndex={-1}>
    <span className="pv-cover__spine" aria-hidden="true" />
    <span className="pv-cover__label" aria-hidden="true">PV</span>
  </Link>;
}
