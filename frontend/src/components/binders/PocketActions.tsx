import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchBinders } from "../../services/binders";
import { Button, ButtonLink } from "../ui/Button";
import { fill } from "./labels";
import { useGuard } from "./useGuard";
import { placePopover } from "./albumLayout";
import type { PocketRef } from "./PageGrid";

const WIDTH = 288;

export type PocketFacts = { identity: string; details: string; price: ReactNode; copyHref: string };

type Props = {
  anchor: HTMLElement; target: PocketRef; binderId: string; mobile: boolean; busy: boolean;
  /** Present for an occupied pocket; an empty one offers the tray instead. */
  facts?: PocketFacts;
  onClose: () => void;
  onMovePocket: () => void; onMoveBinder: (destinationId: string) => void; onTakeOut: () => void; onChooseFromTray: () => void;
};

function BinderChooser({ current, onConfirm, busy }: { current: string; onConfirm: (id: string) => void; busy: boolean }) {
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  const guard = useGuard();
  const [value, setValue] = useState(current);
  const request = useCallback((signal: AbortSignal) => fetchBinders(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource("move-targets", request);
  const binders = list.state.kind === "loaded" ? list.state.data.results : [];
  return <div className="pv-actions__chooser">
    <label className="pv-field">{text.moveBinder}
      <select value={value} onChange={(event) => setValue(event.target.value)}>
        {!binders.some((binder) => binder.id === current) && <option value={current}>…</option>}
        {binders.map((binder) => <option key={binder.id} value={binder.id}>{binder.name}</option>)}
      </select>
    </label>
    <Button variant="primary" disabled={busy} onClick={() => onConfirm(value)}>{text.moveNext}</Button>
  </div>;
}

/**
 * Contextual controls for one pocket: a popover anchored to it on desktop (non-modal), a
 * bottom sheet on phones (modal, focus contained). It is a labelled dialog of native
 * buttons, rendered in a portal so the spread's perspective and overflow never clip it.
 * Escape, the close button or a press outside dismiss it and give focus back to the pocket;
 * the press that dismisses it never activates what is underneath.
 */
export function PocketActions({ anchor, target, binderId, mobile, busy, facts, onClose, onMovePocket, onMoveBinder, onTakeOut, onChooseFromTray }: Props) {
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [choosingBinder, setChoosingBinder] = useState(false);
  const [place, setPlace] = useState<{ left: number; top: number; side: "left" | "right" } | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  // Position (desktop): measured after render, and again when the viewport or anchor moves.
  useLayoutEffect(() => {
    if (mobile) return;
    const measure = () => {
      if (!anchor.isConnected) { close.current(); return; }
      const box = panel.current?.getBoundingClientRect();
      setPlace(placePopover(anchor.getBoundingClientRect(), { width: WIDTH, height: box?.height ?? 200 }, { width: window.innerWidth, height: window.innerHeight }));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [anchor, mobile, choosingBinder]);

  // The first control takes focus when it opens.
  useEffect(() => { panel.current?.querySelector<HTMLElement>("a, button, select")?.focus(); }, []);

  // A press outside closes it, and the click that follows is swallowed.
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      const swallow = (click: Event) => { click.stopPropagation(); click.preventDefault(); };
      document.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener("click", swallow, true), 500);
      close.current();
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, []);

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); onClose(); return; }
    if (event.key !== "Tab" || !mobile) return;   // the sheet is modal: Tab stays inside it
    const items = [...(panel.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), select") ?? [])];
    if (items.length === 0) return;
    const first = items[0]; const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const style: CSSProperties | undefined = mobile ? undefined : { left: place?.left ?? 0, top: place?.top ?? 0, width: WIDTH, visibility: place ? "visible" : "hidden" };
  const title = fill(text.selectedTitle, target);
  const surface = <div className={mobile ? "pv-actions-layer pv-actions-layer--sheet" : "pv-actions-layer"}>
    <div ref={panel} className={`pv-actions ${mobile ? "pv-actions--sheet" : "pv-actions--popover"}`} role="dialog" aria-modal={mobile || undefined}
      aria-labelledby={titleId} data-side={place?.side} style={style} onKeyDown={keyDown}>
      <div className="pv-actions__head">
        <h2 id={titleId}>{facts ? facts.identity : title}</h2>
        <button type="button" className="pv-actions__close" aria-label={text.closeActions} onClick={onClose}>×</button>
      </div>
      {facts ? <>
        <p className="pv-actions__facts">{title}<br />{facts.details}</p>
        <p className="pv-actions__price">{facts.price}</p>
        <div className="pv-actions__list">
          <ButtonLink variant="secondary" to={facts.copyHref}>{text.viewCopy}</ButtonLink>
          <Button disabled={busy} onClick={onMovePocket}>{text.move}</Button>
          <Button aria-expanded={choosingBinder} disabled={busy} onClick={() => setChoosingBinder((value) => !value)}>{text.moveToBinder}</Button>
          {choosingBinder && <BinderChooser current={binderId} busy={busy} onConfirm={onMoveBinder} />}
          <Button disabled={busy} onClick={onTakeOut}>{text.takeOut}</Button>
        </div>
      </> : <>
        <p className="pv-actions__facts">{text.emptyPocket} · {title}</p>
        <div className="pv-actions__list"><Button disabled={busy} onClick={onChooseFromTray}>{text.fillFromTray}</Button></div>
      </>}
    </div>
  </div>;
  return createPortal(surface, document.body);
}
