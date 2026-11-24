import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { SystemStatus } from "../SystemStatus";
import "./home.css";

/** Closed by default: the health check only runs (and aborts on close) while the footer is open. */
export function SystemStatusFooter() {
  const { dictionary } = useLocale();
  const [open, setOpen] = useState(false);
  return <details className="pv-home__status" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary>{dictionary.home.statusSummary}</summary>
    {open && <SystemStatus />}
  </details>;
}
