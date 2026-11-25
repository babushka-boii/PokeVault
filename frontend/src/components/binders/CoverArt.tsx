import { useState } from "react";
import type { Cover, Sticker } from "../../services/binders";
import { PIXELS, stickerImage } from "./stickers";

/** One sticker: its centre is x/y percent of the 3:4 cover and its box is 20% x scale of the cover's width. */
export function StickerLayer({ sticker, index }: { sticker: Sticker; index: number }) {
  const [failed, setFailed] = useState(false);
  const image = stickerImage(sticker);
  const style = { left: `${sticker.x}%`, top: `${sticker.y}%`, width: `${20 * sticker.scale}%`, transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg)`, zIndex: index };
  return <span className="pv-sticker" data-kind={sticker.kind} aria-hidden="true" style={style}>
    {sticker.kind === "pixel" && sticker.pixel_key
      ? <svg viewBox="0 0 10 10" shapeRendering="crispEdges" className={`pv-sticker__pixel pv-sticker__pixel--${sticker.pixel_key}`}><path d={PIXELS[sticker.pixel_key].path} /></svg>
      : image && !failed ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
        : <span className="pv-sticker__missing">◇</span>}
  </span>;
}

/** The cover itself: material, stitching and stickers, with no link. The same drawing everywhere (shelf, Home, editor). */
export function CoverArt({ cover, stickers, className = "", children }: { cover: Cover; stickers: readonly Sticker[]; className?: string; children?: React.ReactNode }) {
  return <span className={`pv-coverart ${className}`.trim()} data-cover={cover}>
    <span className="pv-coverart__stitch" aria-hidden="true" />
    {stickers.map((sticker, index) => <StickerLayer key={index} sticker={sticker} index={index} />)}
    {children}
  </span>;
}
