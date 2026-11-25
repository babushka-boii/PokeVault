import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";

export type Stats = { copies: number | null; sets: number | null; favorites: number | null; withoutVariant: number | null };

/** Four counts, 2x2. The last one is the way to set the variant of copies that have none. */
export function StatGrid({ stats }: { stats: Stats }) {
  const text = useLocale().dictionary.profilePage;
  const show = (value: number | null) => value === null ? "–" : String(value);
  return <ul className="pv-stats" aria-label={text.statsLabel}>
    <li><span className="pv-stats__n">{show(stats.copies)}</span><span>{text.copies}</span></li>
    <li><span className="pv-stats__n">{show(stats.sets)}</span><span>{text.sets}</span></li>
    <li><span className="pv-stats__n pv-stats__n--gold">{show(stats.favorites)}</span><span>{text.favorites}</span></li>
    <li className="pv-stats__warn"><Link to="/collection?variant=unknown"><span className="pv-stats__n pv-stats__n--gold">{show(stats.withoutVariant)}</span><span>{text.withoutVariant}</span></Link></li>
  </ul>;
}
