import { BrowserRouter, MemoryRouter } from "react-router-dom";

import { LocaleProvider } from "../i18n/LocaleProvider";
import { AppRoutes } from "./router";


export function App({ initialEntries }: { initialEntries?: string[] }) {
  const Router = initialEntries ? MemoryRouter : BrowserRouter;
  const routerProps = initialEntries ? { initialEntries } : {};

  return (
    <LocaleProvider>
      <Router {...routerProps}>
        <AppRoutes />
      </Router>
    </LocaleProvider>
  );
}
