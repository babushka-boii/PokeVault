import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useAuth } from "../../auth/context";
import type { BinderErrorKey } from "../../hooks/useBinderMutations";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { covers, MAX_STICKERS, pixelKeys, type Appearance, type Cover, type PixelKey, type Sticker } from "../../services/binders";
import { searchSpecies, spriteUrl } from "../../services/pokemon";
import { fetchSpeciesIndex } from "../../services/species";
import { fill } from "./labels";
import { CoverArt, StickerArt } from "./CoverArt";
import { PIXELS, stickerStyle } from "./stickers";
import "./binders.css";

type Look = { cover: Cover; stickers: Sticker[] };
const FOCUSABLE = "button:not([disabled]), input, [href], [tabindex]:not([tabindex='-1'])";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const step = (n: number, unit: number) => Math.round(n / unit) * unit;
/** Rounds away float noise (1.2000000000000002), so only clean numbers are ever drafted or sent. */
const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;
const tidy = (s: Sticker): Sticker => ({ ...s, x: round(s.x, 2), y: round(s.y, 2), rotation: round(s.rotation, 1), scale: round(s.scale, 2) });
const fresh = (partial: Pick<Sticker, "kind" | "species_id" | "pixel_key">): Sticker => ({ ...partial, x: 50, y: 50, rotation: 0, scale: 1 });
const pad = (n: number) => `#${String(n).padStart(3, "0")}`;

/**
 * "Personalizar portada": a preview with draggable stickers and the controls beside it. Everything
 * is a local draft until "Guardar portada"; nothing is stored in the browser. Each sticker can also be
 * moved with the arrow keys or the number fields, so dragging is never the only way.
 */
export function CoverEditor({ name: initialName, owner, year, initial, onSave, onClose }: {
  name: string; owner: string; year: number; initial: Appearance; onSave: (look: Appearance, name: string) => Promise<true | BinderErrorKey>; onClose: () => void;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.binders.editor;
  const titleId = useId();
  const blocked = Boolean(useAuth().validating);   // nothing is saved while the session is being confirmed
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; x: number; y: number; ox: number; oy: number; width: number; height: number } | null>(null);
  const [name, setName] = useState(initialName);
  const [look, setLook] = useState<Look>({ cover: initial.cover, stickers: initial.stickers });
  const [selected, setSelected] = useState<number | null>(null);
  const [plop, setPlop] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<BinderErrorKey | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const index = useTcgResource("species-index", fetchSpeciesIndex);
  const rows = index.state.kind === "loaded" ? index.state.data : null;
  const dirty = name.trim() !== initialName || look.cover !== initial.cover || JSON.stringify(look.stickers) !== JSON.stringify(initial.stickers);
  const results = useMemo(() => (rows && query.trim() ? searchSpecies(rows, query, 8) : []), [rows, query]);
  const full = look.stickers.length >= MAX_STICKERS;
  const speciesName = (n: number) => { const row = rows?.[n - 1]; return row ? (locale === "es" ? row.name_es : row.name_en) : pad(n); };
  const labelOf = (sticker: Sticker) => sticker.kind === "pixel" && sticker.pixel_key ? text.pixels[sticker.pixel_key] : speciesName(sticker.species_id ?? 1);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>("input")?.focus();
    return () => opener?.focus();
  }, []);

  function close() { if (dirty && !busy) setAsking(true); else onClose(); }
  function change(i: number, patch: Partial<Sticker>) { setLook((l) => ({ ...l, stickers: l.stickers.map((s, k) => (k === i ? tidy({ ...s, ...patch }) : s)) })); }
  function add(partial: Pick<Sticker, "kind" | "species_id" | "pixel_key">) {
    if (full || busy) return;
    setLook((l) => ({ ...l, stickers: [...l.stickers, fresh(partial)] }));
    setSelected(look.stickers.length); setPlop(look.stickers.length); setNote(text.added);
  }
  function remove(i: number) {
    setLook((l) => ({ ...l, stickers: l.stickers.filter((_, k) => k !== i) }));
    setSelected(null); setNote(text.removed);
  }
  function reorder(i: number, delta: number) {
    const to = i + delta;
    if (to < 0 || to >= look.stickers.length) return;
    setLook((l) => { const list = [...l.stickers]; [list[i], list[to]] = [list[to], list[i]]; return { ...l, stickers: list }; });
    setSelected(to);
  }
  const announceMove = (s: Sticker) => setNote(fill(text.moved, { x: String(s.x), y: String(s.y) }));

  function down(event: PointerEvent<HTMLButtonElement>, i: number) {
    if (busy || !canvas.current) return;
    const box = canvas.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    const s = look.stickers[i];
    drag.current = { index: i, x: event.clientX, y: event.clientY, ox: s.x, oy: s.y, width: box.width, height: box.height };
    setSelected(i);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const g = drag.current; if (!g) return;
    change(g.index, { x: clamp(Math.round((g.ox + (event.clientX - g.x) / g.width * 100) * 10) / 10, 0, 100), y: clamp(Math.round((g.oy + (event.clientY - g.y) / g.height * 100) * 10) / 10, 0, 100) });
  }
  function up(event: PointerEvent<HTMLButtonElement>) {
    const g = drag.current; drag.current = null;
    if (!g) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.type === "pointerup") announceMove(look.stickers[g.index]);   // a cancelled drag keeps the draft but announces nothing
  }
  function keys(event: KeyboardEvent<HTMLButtonElement>, i: number) {
    const unit = event.shiftKey ? 5 : 1; const s = look.stickers[i];
    const deltas: Record<string, [number, number]> = { ArrowLeft: [-unit, 0], ArrowRight: [unit, 0], ArrowUp: [0, -unit], ArrowDown: [0, unit] };
    if (event.key in deltas) {
      event.preventDefault();
      const [dx, dy] = deltas[event.key];
      change(i, { x: clamp(s.x + dx, 0, 100), y: clamp(s.y + dy, 0, 100) });
      setNote(fill(text.moved, { x: String(clamp(s.x + dx, 0, 100)), y: String(clamp(s.y + dy, 0, 100)) }));
    } else if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); remove(i); }
  }

  async function save() {
    setBusy(true); setFailed(null);
    const result = await onSave({ cover: look.cover, stickers: look.stickers.map(tidy) }, name.trim());
    setBusy(false);
    if (result === true) onClose(); else setFailed(result);   // the draft stays for another try
  }
  const current = selected !== null ? look.stickers[selected] : null;

  return <div className="pv-editor" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div ref={panel} className="pv-editor__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}>
      <div className="pv-editor__stage">
        <div ref={canvas} className="pv-editor__canvas" role="group" aria-label={text.canvas}>
          <CoverArt cover={look.cover} stickers={[]} className="pv-editor__cover">
            <span className="pv-editor__spine" aria-hidden="true" />
            <span className="pv-editor__layers">
              {look.stickers.map((sticker, i) => <button key={i} type="button" className="pv-editor__sticker pv-sticker" data-selected={selected === i || undefined} data-plop={plop === i || undefined}
                style={{ ...stickerStyle(sticker, i), "--pv-rot": `${sticker.rotation}deg` } as React.CSSProperties} aria-label={fill(text.onCover, { n: String(i + 1), name: labelOf(sticker) })} aria-pressed={selected === i}
                onPointerDown={(event) => down(event, i)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={(event) => keys(event, i)} onClick={() => setSelected(i)} onAnimationEnd={() => setPlop(null)}>
                <StickerArt sticker={sticker} />
              </button>)}
            </span>
            <span className="pv-editor__plate"><strong>{name.trim() || initialName}</strong><small>{fill(text.plate, { owner, year: String(year) })}</small></span>
          </CoverArt>
        </div>
      </div>

      <div className="pv-editor__side">
        <h2 id={titleId}>{text.title}</h2>
        <label className="pv-editor__field">{text.name}<input value={name} maxLength={80} disabled={busy} onChange={(event) => setName(event.target.value)} /></label>

        <div role="group" aria-label={text.cover} className="pv-editor__group">
          <span className="pv-editor__label">{text.cover}</span>
          <div className="pv-editor__covers">
            {covers.map((id) => <button key={id} type="button" data-cover={id} aria-pressed={look.cover === id} aria-label={text.covers[id]} disabled={busy} onClick={() => setLook((l) => ({ ...l, cover: id }))} />)}
          </div>
          <small>{text.covers[look.cover]}</small>
        </div>

        <div role="group" aria-label={text.stickers} className="pv-editor__group">
          <div className="pv-editor__row"><span className="pv-editor__label">{text.stickers}</span>
            <button type="button" className="pv-editor__quiet" disabled={busy || look.stickers.length === 0} onClick={() => { setLook((l) => ({ ...l, stickers: [] })); setSelected(null); setNote(text.removed); }}>{text.clearAll}</button></div>
          <div className="pv-editor__palette">
            {pixelKeys.map((key: PixelKey) => <button key={key} type="button" disabled={busy || full} aria-label={fill(text.add, { name: text.pixels[key] })} onClick={() => add({ kind: "pixel", species_id: null, pixel_key: key })}>
              <svg viewBox="0 0 10 10" shapeRendering="crispEdges" aria-hidden="true" className={`pv-sticker__pixel pv-sticker__pixel--${key}`}><path d={PIXELS[key].path} /></svg></button>)}
          </div>
          <label className="pv-editor__field pv-editor__field--search">{text.search}<input type="search" value={query} autoComplete="off" disabled={busy || full || !rows} onChange={(event) => setQuery(event.target.value)} /></label>
          {query.trim() && rows && (results.length === 0 ? <p role="status" className="pv-editor__hint">{text.searchEmpty}</p> : <ul className="pv-editor__results">
            {results.map((row) => { const nm = locale === "es" ? row.name_es : row.name_en;
              return <li key={row.national_dex_number}><button type="button" disabled={busy || full} aria-label={fill(text.add, { name: nm })} onClick={() => add({ kind: "pokemon", species_id: row.national_dex_number, pixel_key: null })}>
                <img src={spriteUrl(row.national_dex_number)} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" /><span>{pad(row.national_dex_number)} {nm}</span></button></li>; })}
          </ul>)}
          <p className="pv-editor__hint">{fill(text.count, { count: String(look.stickers.length), max: String(MAX_STICKERS) })}{full && <> · {fill(text.full, { max: String(MAX_STICKERS) })}</>}</p>
          <p className="pv-editor__hint">{text.hint} {text.source}</p>
        </div>

        {look.stickers.length > 0 && <div role="group" aria-label={text.layers} className="pv-editor__group">
          <ol className="pv-editor__list">
            {look.stickers.map((sticker, i) => <li key={i}><button type="button" aria-pressed={selected === i} onClick={() => setSelected(i)}>{fill(text.layer, { n: String(i + 1), name: labelOf(sticker) })}</button></li>)}
          </ol>
        </div>}

        <div role="group" aria-label={text.selected} className="pv-editor__group">
          {current && selected !== null ? <>
            <div className="pv-editor__pair">
              <label className="pv-editor__field">{text.x}<input type="number" min={0} max={100} step={0.1} value={current.x} disabled={busy} onChange={(event) => { const v = Number(event.target.value); if (Number.isFinite(v)) change(selected, { x: clamp(Math.round(v * 10) / 10, 0, 100) }); }} /></label>
              <label className="pv-editor__field">{text.y}<input type="number" min={0} max={100} step={0.1} value={current.y} disabled={busy} onChange={(event) => { const v = Number(event.target.value); if (Number.isFinite(v)) change(selected, { y: clamp(Math.round(v * 10) / 10, 0, 100) }); }} /></label>
            </div>
            <div className="pv-editor__tools">
              <button type="button" disabled={busy} aria-label={text.rotateLeft} onClick={() => change(selected, { rotation: clamp(current.rotation - 5, -180, 180) })}>↺ 5°</button>
              <button type="button" disabled={busy} aria-label={text.rotateRight} onClick={() => change(selected, { rotation: clamp(current.rotation + 5, -180, 180) })}>↻ 5°</button>
              <button type="button" disabled={busy || current.scale <= 0.5} aria-label={text.smaller} onClick={() => change(selected, { scale: clamp(step(current.scale - 0.1, 0.05), 0.5, 2) })}>−</button>
              <button type="button" disabled={busy || current.scale >= 2} aria-label={text.larger} onClick={() => change(selected, { scale: clamp(step(current.scale + 0.1, 0.05), 0.5, 2) })}>+</button>
              <button type="button" disabled={busy || selected >= look.stickers.length - 1} onClick={() => reorder(selected, 1)}>{text.forward}</button>
              <button type="button" disabled={busy || selected === 0} onClick={() => reorder(selected, -1)}>{text.backward}</button>
              <button type="button" disabled={busy} onClick={() => remove(selected)}>{text.remove}</button>
            </div>
          </> : <p className="pv-editor__hint">{text.none}</p>}
        </div>

        <p className="pv-sr-only" role="status" aria-live="polite">{note}</p>
        {failed && <p role="alert" className="pv-editor__error">{failed === "invalid" ? text.saveInvalid : failed === "expired" || failed === "missing" ? `${dictionary.binders.errors[failed]} ${text.saveKept}` : text.saveError}</p>}
        {asking && <div role="alertdialog" aria-label={text.discardAsk} className="pv-editor__ask">
          <p>{text.discardAsk}</p>
          <button type="button" className="pv-editor__quiet" onClick={onClose}>{text.discard}</button>
          <button type="button" className="pv-editor__quiet" onClick={() => setAsking(false)}>{text.keep}</button>
        </div>}
        <div className="pv-editor__actions">
          <button type="button" className="pv-editor__cancel" disabled={busy} onClick={close}>{text.cancel}</button>
          <button type="button" className="pv-editor__save" disabled={busy || blocked || !name.trim()} onClick={() => void save()}>{busy ? text.saving : text.save}</button>
        </div>
      </div>
    </div>
  </div>;
}
