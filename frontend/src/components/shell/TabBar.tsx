import { NavLink } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { BinderIcon, CardsIcon, HomeIcon, ScanIcon, UserIcon } from "./icons";

/**
 * Mobile bottom navigation for the user's daily tasks; the scan action is the featured
 * middle button. The Pokédex and expansions are exploration and live in the Explore menu.
 */
export function TabBar() {
  const { dictionary } = useLocale();
  const tabs = dictionary.shell.tabs;
  return <nav className="pv-tabbar" aria-label={dictionary.nav.label}>
    <ul>
      <li><NavLink to="/" end><HomeIcon /><span>{tabs.home}</span></NavLink></li>
      <li><NavLink to="/binders"><BinderIcon /><span>{tabs.binders}</span></NavLink></li>
      <li className="pv-tabbar__scan"><NavLink to="/scanner" className="pv-cut pv-cut--sm"><ScanIcon /><span>{tabs.scan}</span></NavLink></li>
      <li><NavLink to="/collection"><CardsIcon /><span>{tabs.collection}</span></NavLink></li>
      <li><NavLink to="/profile"><UserIcon /><span>{tabs.profile}</span></NavLink></li>
    </ul>
  </nav>;
}
