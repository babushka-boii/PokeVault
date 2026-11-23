import { BrowserRouter, MemoryRouter } from "react-router-dom";

import { AuthProvider } from "../auth/AuthProvider";
import { CurrencyProvider } from "../components/prices/CurrencyProvider";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { AppRoutes } from "./router";


export function App({ initialEntries }: { initialEntries?: string[] }) {
  const Router = initialEntries ? MemoryRouter : BrowserRouter;
  const routerProps = initialEntries ? { initialEntries } : {};

  return (
    <LocaleProvider>
      <AuthProvider>
        <CurrencyProvider>
          <Router {...routerProps}>
            <AppRoutes />
          </Router>
        </CurrencyProvider>
      </AuthProvider>
    </LocaleProvider>
  );
}
