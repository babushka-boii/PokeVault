import { useEffect, useRef, useState } from "react";
import { REDUCED_MOTION_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { useLocale } from "../../i18n/LocaleProvider";
import { animatedSpriteUrl, spriteUrl } from "../../services/pokemon";
import "./pokedex.css";

/**
 * With `fit`, the sprite is shown larger and standing on its feet: the animated one (about 40 to 90 px)
 * grows by a whole number so that it stays at most `max` px tall; the 96 px still one is shown at `still` px.
 */
export type SpriteFit = { max: number; still: number };

/** Static sprite; the animated one only while it is on screen, `animate` is true and motion is welcome. */
export function SpeciesSprite({ number, name, animate, fit }: { number: number; name: string; animate: boolean; fit?: SpriteFit }) {
  const { dictionary } = useLocale();
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState<"gif" | "png" | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const wantsGif = animate && !reduced && animatedSpriteUrl(number) !== null && failed === null;
  useEffect(() => {
    const element = frame.current;
    if (!wantsGif || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [wantsGif]);
  const src = wantsGif && visible ? animatedSpriteUrl(number)! : spriteUrl(number);
  const isGif = src !== spriteUrl(number);
  let size: { width: number; height: number } | undefined;
  if (fit && !isGif) size = { width: fit.still, height: fit.still };
  else if (fit && natural) {
    const scale = Math.max(1, Math.floor(fit.max / Math.max(natural.width, natural.height)));
    size = { width: natural.width * scale, height: natural.height * scale };
  }
  return <span ref={frame} className={`pv-sprite${fit ? " pv-sprite--fit" : ""}`}>
    {failed === "png" ? <span className="pv-sprite__missing" title={dictionary.pokedex.noSprite} aria-hidden="true">◇</span>
      : <img src={src} alt="" width={size?.width ?? (fit ? undefined : 96)} height={size?.height ?? (fit ? undefined : 96)} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
        data-animated={isGif || undefined} onLoad={(event) => { if (fit && isGif) setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); }}
        onError={() => setFailed(isGif ? "gif" : "png")} />}
    <span className="pv-sr-only">{name}</span>
  </span>;
}
