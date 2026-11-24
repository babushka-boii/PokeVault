import { NavLink } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { ButtonLink } from "../ui/Button";
import { AvatarLink } from "./AvatarLink";
import { ExploreMenu } from "./ExploreMenu";
import { LogoLink } from "./Logo";
import { CurrencyToggle, LocaleToggle } from "./Toggles";

export function DesktopHeader() {
  const { dictionary } = useLocale();
  const text = dictionary.shell.nav;
  const links = [["/", text.home], ["/pokedex", text.pokedex], ["/sets", text.sets], ["/binders", text.binders], ["/collection", text.collection]] as const;
  return <header className="pv-header">
    <div className="pv-header__inner">
      <LogoLink />
      <nav className="pv-nav" aria-label={dictionary.nav.label}>
        <ul>{links.map(([path, label]) => <li key={path}><NavLink to={path} end={path === "/"}>{label}</NavLink></li>)}</ul>
      </nav>
      <div className="pv-header__actions">
        <ButtonLink to="/scanner" className="pv-header__scan">{dictionary.shell.scan}</ButtonLink>
        <CurrencyToggle />
        <LocaleToggle />
        <AvatarLink />
      </div>
    </div>
  </header>;
}

export function MobileHeader() {
  return <header className="pv-header pv-header--mobile">
    <div className="pv-header__inner">
      <LogoLink compact />
      <ExploreMenu />
      <div className="pv-header__actions">
        <CurrencyToggle />
        <LocaleToggle />
      </div>
    </div>
  </header>;
}
