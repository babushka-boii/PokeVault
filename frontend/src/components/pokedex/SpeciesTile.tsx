import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { REDUCED_MOTION_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { useLocale } from "../../i18n/LocaleProvider";
import { animatedSpriteUrl, spriteUrl, type SpeciesRow } from "../../services/pokemon";
import "../typeBadge.css";
import "./pokedex.css";

const pad = (n: number) => `#${String(n).padStart(3, "0")}`;

/** Static sprite; the animated one only while the tile is on screen, owned, and motion is welcome. */
export function SpeciesSprite({ number, name, animate }: { number: number; name: string; animate: boolean }) {
  const { dictionary } = useLocale();
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const frame = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState<"gif" | "png" | null>(null);
  const wantsGif = animate && !reduced && animatedSpriteUrl(number) !== null && failed === null;
  useEffect(() => {
    const element = frame.current;
    if (!wantsGif || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setVisible(entries.some((entry) => entry.isIntersecting)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [wantsGif]);
  const src = wantsGif && visible ? animatedSpriteUrl(number)! : spriteUrl(number);
  return <span ref={frame} className="pv-sprite">
    {failed === "png" ? <span className="pv-sprite__missing" title={dictionary.pokedex.noSprite} aria-hidden="true">◇</span>
      : <img src={src} alt="" width={96} height={96} loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false}
        data-animated={src !== spriteUrl(number) || undefined} onError={() => setFailed(src === spriteUrl(number) ? "png" : "gif")} />}
    <span className="pv-sr-only">{name}</span>
  </span>;
}

/** One species: a single link. Owned = colour, animated, gold label; not owned = dimmed (a living dex). */
export function SpeciesTile({ row, cards, ownership, returnTo, onOpen }: {
  row: SpeciesRow; cards: number; ownership: "known" | "unknown"; returnTo: string; onOpen: () => void;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.pokedex;
  const name = locale === "es" ? row.name_es : row.name_en;
  const types = row.types.map((type) => dictionary.pokemonTypes[type]).join(", ");
  const owned = ownership === "known" && cards > 0;
  const count = text.cardCount[cards === 1 ? "one" : "other"].replace("{count}", String(cards));
  const label = ownership === "unknown" ? text.tilePlain : owned ? text.tileOwned : text.tileNone;
  const state = ownership === "unknown" ? "plain" : owned ? "owned" : "missing";
  return <li className="pv-tile" data-state={state}>
    <Link to={`/pokemon/${row.national_dex_number}?${new URLSearchParams({ returnTo })}`} onClick={onOpen}
      aria-label={label.replace("{number}", pad(row.national_dex_number)).replace("{name}", name).replace("{types}", types).replace("{cards}", count)}>
      <span className="pv-tile__number" aria-hidden="true">{pad(row.national_dex_number)}</span>
      <SpeciesSprite number={row.national_dex_number} name={name} animate={owned} />
      <span className="pv-tile__name" aria-hidden="true">{name}</span>
      <span className="pv-tile__types" aria-hidden="true">{row.types.map((type) => <i key={type} className={`pv-typedot type-badge--${type}`} />)}</span>
      {owned && <span className="pv-tile__count" aria-hidden="true">{count}</span>}
    </Link>
  </li>;
}
