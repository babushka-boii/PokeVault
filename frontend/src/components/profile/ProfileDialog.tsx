import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLocale } from "../../i18n/LocaleProvider";

const FOCUSABLE = "button:not([disabled]), input, [href], [tabindex]:not([tabindex='-1'])";

/** A modal sheet: Escape and the backdrop close it, Tab stays inside, and focus goes back to what opened it. */
export function ProfileDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { dictionary } = useLocale();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    return () => opener?.focus();
  }, []);
  return <div className="pv-pdialog" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={panel} className="pv-pdialog__panel" role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <div className="pv-pdialog__head"><h2 id={id}>{title}</h2>
        <button type="button" className="pv-pdialog__close" aria-label={dictionary.profilePage.close} onClick={onClose}>×</button></div>
      {children}
    </div>
  </div>;
}
