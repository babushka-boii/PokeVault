import { useEffect } from "react";
import { BrowserRouter, MemoryRouter, parsePath } from "react-router-dom";

import { AuthProvider } from "../auth/AuthProvider";
import { CurrencyProvider } from "../components/prices/CurrencyProvider";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { removeRetiredPreferences } from "../services/retiredPreferences";
import { RouteMemory } from "./RouteMemory";
import { AppRoutes } from "./router";


export function App({ initialEntries }: { initialEntries?: string[] }) {
  useEffect(() => { removeRetiredPreferences(); }, []);
  const Router = initialEntries ? MemoryRouter : BrowserRouter;
  const routerProps = initialEntries ? { initialEntries: initialEntries.map((path, i) => ({ ...parsePath(path), key: `entry-${i}` })) } : {};

  return (
    <LocaleProvider>
      <AuthProvider>
        <CurrencyProvider>
          <Router {...routerProps}>
            <RouteMemory initialEntries={initialEntries}><AppRoutes /></RouteMemory>
          </Router>
        </CurrencyProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
