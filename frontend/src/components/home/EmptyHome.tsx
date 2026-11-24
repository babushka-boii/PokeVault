import { useLocale } from "../../i18n/LocaleProvider";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import "./home.css";

/** Shown instead of the data sections when the signed-in user owns no copies yet. */
export function EmptyHome() {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  return <CutPanel tone="value" className="pv-home__hero pv-home__empty" aria-labelledby="home-empty-title">
    <h2 id="home-empty-title" className="pv-home__guest-title">{text.emptyTitle}</h2>
    <p className="pv-home__lead">{text.emptyText}</p>
    <div className="pv-home__actions">
      <ButtonLink to="/scanner">{text.scanAction}</ButtonLink>
      <ButtonLink to="/sets" variant="secondary">{text.emptySearch}</ButtonLink>
    </div>
  </CutPanel>;
}
