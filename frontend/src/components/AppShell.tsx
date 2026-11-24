import { useRef, type MouseEvent } from "react";
import { Outlet } from "react-router-dom";

import { MOBILE_QUERY, useMediaQuery } from "../hooks/useMediaQuery";
import { useLocale } from "../i18n/LocaleProvider";
import { useCurrency } from "./prices/currency";
import { DesktopHeader, MobileHeader } from "./shell/Headers";
import { TabBar } from "./shell/TabBar";
import "./shell/shell.css";


/**
 * Exactly one primary navigation exists at a time: the desktop header nav (>= 768px)
 * or the mobile bottom bar. Without matchMedia (jsdom) the desktop layout is used.
 */
export function AppShell() {
  const { dictionary } = useLocale();
  const { saveFailed } = useCurrency();
  const mobile = useMediaQuery(MOBILE_QUERY);
  const main = useRef<HTMLElement>(null);

  function skipToContent(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    main.current?.focus();
  }

  return (
    <div className={`app-shell pv-shell ${mobile ? "pv-shell--mobile" : "pv-shell--desktop"}`}>
      <a className="pv-skip-link" href="#contenido" onClick={skipToContent}>{dictionary.shell.skip}</a>
      {mobile ? <MobileHeader /> : <DesktopHeader />}
      {saveFailed && <p className="pv-shell-notice">{dictionary.shell.currencyLocalOnly}</p>}
      <main className="content" id="contenido" ref={main} tabIndex={-1}>
        <Outlet />
      </main>
      {mobile && <TabBar />}
    </div>
  );
}
