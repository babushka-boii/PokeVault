import { useEffect, useId, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { ExploreIcon } from "./icons";

/** Mobile-only menu for the sections that do not fit the bottom bar (Pokédex, expansions). */
export function ExploreMenu() {
  const { dictionary } = useLocale();
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    }
    function onPointer(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const close = () => setOpen(false);
  return <div className="pv-explore" ref={root}>
    <button ref={trigger} type="button" className="pv-explore__trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
      <ExploreIcon /><span>{dictionary.shell.explore}</span>
    </button>
    <div id={id} className="pv-explore__panel" hidden={!open}>
      {open && <ul>
        <li><NavLink to="/pokedex" onClick={close}>{dictionary.shell.nav.pokedex}</NavLink></li>
        <li><NavLink to="/sets" onClick={close}>{dictionary.shell.nav.sets}</NavLink></li>
      </ul>}
    </div>
  </div>;
}
