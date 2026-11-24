import { NavLink } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { BoxIcon, CardsIcon, HomeIcon, ScanIcon, UserIcon } from "./icons";

/** Mobile bottom navigation. The scan action sits in the middle as the featured button. */
export function TabBar() {
  const { dictionary } = useLocale();
  const tabs = dictionary.shell.tabs;
  return <nav className="pv-tabbar" aria-label={dictionary.nav.label}>
    <ul>
      <li><NavLink to="/" end><HomeIcon /><span>{tabs.home}</span></NavLink></li>
      <li><NavLink to="/boxes"><BoxIcon /><span>{tabs.boxes}</span></NavLink></li>
      <li className="pv-tabbar__scan"><NavLink to="/scanner" className="pv-cut pv-cut--sm"><ScanIcon /><span>{tabs.scan}</span></NavLink></li>
      <li><NavLink to="/collection"><CardsIcon /><span>{tabs.collection}</span></NavLink></li>
      <li><NavLink to="/profile"><UserIcon /><span>{tabs.profile}</span></NavLink></li>
    </ul>
  </nav>;
}
