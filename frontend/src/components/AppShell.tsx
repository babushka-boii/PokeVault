import { NavLink, Outlet } from "react-router-dom";

import { useLocale } from "../i18n/LocaleProvider";


export function AppShell() {
  const { dictionary, toggleLocale } = useLocale();
  const links = [
    ["/", dictionary.nav.home],
    ["/boxes", dictionary.nav.boxes],
    ["/pokedex", dictionary.nav.pokedex],
    ["/profile", dictionary.nav.profile],
  ] as const;

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink className="brand" to="/">
          PokéVault
        </NavLink>
        <button className="locale-button" type="button" onClick={toggleLocale}>
          {dictionary.languageAction}
        </button>
      </header>
      <nav className="navigation" aria-label={dictionary.nav.label}>
        {links.map(([path, label]) => (
          <NavLink key={path} to={path} end={path === "/"}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
