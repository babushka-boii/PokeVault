import { Link } from "react-router-dom";
import type { Cover as CoverId, Sticker } from "../../services/binders";
import { CoverArt } from "./CoverArt";

/** A binder's cover. A pointer/touch shortcut: the name link is the accessible one. */
export function Cover({ binderId, cover = "noir", stickers = [] }: { binderId: string; cover?: CoverId; stickers?: readonly Sticker[] }) {
  return <Link className="pv-cover" data-cover={cover} to={`/binders/${encodeURIComponent(binderId)}`} aria-hidden="true" tabIndex={-1}>
    <CoverArt cover={cover} stickers={stickers}>
      <span className="pv-cover__spine" aria-hidden="true" />
      <span className="pv-cover__label" aria-hidden="true">PV</span>
    </CoverArt>
  </Link>;
}
