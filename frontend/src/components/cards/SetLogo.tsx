import { useState } from "react";
import type { CardSet } from "../../services/cards";
import { setLogoCandidates } from "../../services/setImages";

/** Set artwork uses complete provider logo URLs, never card quality suffixes. */
export function SetLogo({ set, decorative = false, onUnavailable }: { set: CardSet; decorative?: boolean; onUnavailable?: () => void }) {
  const urls = setLogoCandidates(set);
  return <LogoImage key={`${set.id}:${urls.join("|")}`} urls={urls} name={set.name} decorative={decorative} onUnavailable={onUnavailable} />;
}

function LogoImage({ urls, name, decorative, onUnavailable }: { urls: string[]; name: string; decorative: boolean; onUnavailable?: () => void }) {
  const [index, setIndex] = useState(0);
  const source = urls[index];
  if (!source) return <span className="tcg-set-logo tcg-set-logo--missing" aria-hidden="true"><span>◇</span></span>;
  return <img className="tcg-set-logo" src={source} alt={decorative ? "" : name} loading="lazy" decoding="async" onError={() => {
    setIndex((current) => current + 1);
    if (index + 1 === urls.length) onUnavailable?.();
  }} />;
}
