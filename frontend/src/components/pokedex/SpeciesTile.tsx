import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { SpeciesRow } from "../../services/pokemon";
import { SpeciesSprite } from "./SpeciesSprite";
import "../typeBadge.css";
import "./pokedex.css";

const pad = (n: number) => `#${String(n).padStart(3, "0")}`;

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
