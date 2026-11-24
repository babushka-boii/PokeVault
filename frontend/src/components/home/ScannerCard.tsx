import { useLocale } from "../../i18n/LocaleProvider";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import { PixelLabel } from "../ui/PixelLabel";
import "./home.css";

/** Scanner entry point. Static scanline background; one short sweep on hover or focus only. */
export function ScannerCard() {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  return <CutPanel tone="scan" className="pv-home-scanner" aria-labelledby="home-scanner-title">
    <span className="pv-home-scanner__sweep" aria-hidden="true" />
    <PixelLabel tone="cyan">{text.scannerLabel}</PixelLabel>
    <h2 id="home-scanner-title" className="pv-sr-only">{dictionary.scanner.title}</h2>
    <p className="pv-home-scanner__text">{text.scannerText}</p>
    <ButtonLink to="/scanner">{text.scanAction}</ButtonLink>
  </CutPanel>;
}
