import { useLocale } from "../../i18n/LocaleProvider";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import { PixelLabel } from "../ui/PixelLabel";
import { ScannerCard } from "./ScannerCard";
import "./home.css";

/** Signed-out Home. Public only: it never requests private data. */
export function GuestHome() {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  return <div className="pv-home__grid">
    <CutPanel tone="value" className="pv-home__hero" aria-labelledby="home-guest-title">
      <PixelLabel tone="gold">{text.guestLabel}</PixelLabel>
      <h2 id="home-guest-title" className="pv-home__guest-title">{text.guestTitle}</h2>
      <p className="pv-home__lead">{text.guestText}</p>
      <ButtonLink to="/login">{dictionary.auth.signIn}</ButtonLink>
    </CutPanel>
    <div className="pv-home__side"><ScannerCard /></div>
    <div className="pv-home__wide pv-home__public">
      <CutPanel tone="default" className="pv-home__link-panel"><ButtonLink to="/pokedex" variant="secondary">{text.exploreDex}</ButtonLink></CutPanel>
      <CutPanel tone="default" className="pv-home__link-panel"><ButtonLink to="/sets" variant="secondary">{text.exploreSets}</ButtonLink></CutPanel>
    </div>
  </div>;
}
