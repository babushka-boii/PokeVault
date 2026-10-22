import { useState } from "react";
import { measureMenuIcon, type IconBounds } from "../../services/menuIconBounds";
import type { Pokemon } from "../../services/pokemon";
import { getMenuIconCandidates, type MenuIconSource, type SpriteMode } from "../../services/menuIcons";
import { useLocale } from "../../i18n/LocaleProvider";

type MenuIconProps = {
  pokemon: Pick<Pokemon, "national_dex_number">;
  mode: SpriteMode;
  fallbackLabel?: string;
};

export function MenuIcon({ pokemon, mode, fallbackLabel }: MenuIconProps) {
  const { dictionary } = useLocale();
  const dex = pokemon.national_dex_number;
  return <MenuIconImage key={`${dex}:${mode}`} candidates={getMenuIconCandidates(dex, mode)}
    fallbackLabel={fallbackLabel ?? dictionary.pokedex.noSprite} />;
}

function MenuIconImage({ candidates, fallbackLabel }: {
  candidates: readonly MenuIconSource[];
  fallbackLabel: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const source = candidates[attempt];
  const [measured, setMeasured] = useState<{ url: string; bounds?: IconBounds }>();

  if (!source) return <span className="pc-menu-icon pc-missing" role="img"
    title={fallbackLabel} aria-label={fallbackLabel}>◇</span>;

  const bounds = measured?.url === source.url ? measured.bounds : undefined;
  // A 75% visible footprint gives 48px desktop / 36px mobile, leaving room
  // around the subject for spacing and the small native APNG frame movement.
  const size = bounds ? Math.max(bounds.width, bounds.height) : 1;
  const framing = bounds ? {
    width: `${75 * bounds.canvasWidth / size}%`,
    height: `${75 * bounds.canvasHeight / size}%`,
    transform: `translate(${-100 * (bounds.left + bounds.width / 2) / bounds.canvasWidth}%, ${-100 * (bounds.top + bounds.height / 2) / bounds.canvasHeight}%)`,
  } : {};

  return <span className="pc-menu-icon-frame"><img key={source.url} className="pc-menu-icon" src={source.url} alt="" width={32} height={32}
    crossOrigin="anonymous" style={{ objectFit: "contain", ...framing }} draggable={false} referrerPolicy="no-referrer"
    data-menu-family={source.family} data-menu-animated={source.animated}
    onLoad={(event) => setMeasured({ url: source.url, bounds: measureMenuIcon(event.currentTarget) })}
    onError={() => setAttempt((current) => current === attempt ? current + 1 : current)} /></span>;
}
