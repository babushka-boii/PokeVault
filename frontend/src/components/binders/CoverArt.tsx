import { useState } from "react";
import type { Cover, Sticker } from "../../services/binders";
import { PIXELS, stickerImage, stickerStyle } from "./stickers";

/** The picture of a sticker: a pixel design, or the species artwork (a placeholder if it fails to load). */
export function StickerArt({ sticker }: { sticker: Sticker }) {
  const [failed, setFailed] = useState(false);
  const image = stickerImage(sticker);
  if (sticker.kind === "pixel" && sticker.pixel_key) return <svg viewBox="0 0 10 10" shapeRendering="crispEdges" className={`pv-sticker__pixel pv-sticker__pixel--${sticker.pixel_key}`} aria-hidden="true"><path d={PIXELS[sticker.pixel_key].path} /></svg>;
  return image && !failed ? <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setFailed(true)} />
    : <span className="pv-sticker__missing" aria-hidden="true">◇</span>;
}

export function StickerLayer({ sticker, index }: { sticker: Sticker; index: number }) {
  return <span className="pv-sticker" data-kind={sticker.kind} aria-hidden="true" style={stickerStyle(sticker, index)}><StickerArt sticker={sticker} /></span>;
}

/** The cover itself: material, stitching and stickers, with no link. The same drawing everywhere (shelf, Home, editor). */
export function CoverArt({ cover, stickers, className = "", children }: { cover: Cover; stickers: readonly Sticker[]; className?: string; children?: React.ReactNode }) {
  return <span className={`pv-coverart ${className}`.trim()} data-cover={cover}>
    <span className="pv-coverart__stitch" aria-hidden="true" />
    {stickers.map((sticker, index) => <StickerLayer key={index} sticker={sticker} index={index} />)}
    {children}
  </span>;
}
