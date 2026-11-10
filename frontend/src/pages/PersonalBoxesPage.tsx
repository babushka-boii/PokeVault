import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { AudioControls } from "../components/boxes/AudioControls";
import { PersonalDetails } from "../components/boxes/personalDetails";
import { PersonalGrid } from "../components/boxes/personalGrid";
import { generationGroup, usePersonalMetadata } from "../components/boxes/personalMetadata";
import { wallpapers, type Wallpaper } from "../components/boxes/wallpapers";
import { useRetroAudio } from "../hooks/useRetroAudio";
import { useSpriteMode } from "../hooks/useSpriteMode";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { BoxesError, createBox, deleteBox, fetchBox, fetchBoxes, fetchBoxView, placeCopy, removePlacement, reorderBoxes, updateBox, type BoxSummary, type BoxView } from "../services/boxes";
import "../components/boxes/personal.css";

type Mutation = (csrf: string, signal: AbortSignal) => Promise<unknown>;

function BoxEditor({ box, busy, save, remove, reorder, index, total }: { box: BoxSummary; busy: boolean;
  save: (name: string, wallpaper: Wallpaper) => void; remove: () => void; reorder: (offset: number) => void; index: number; total: number }) {
  const { dictionary } = useLocale(); const text = dictionary.personalBoxes;
  const [name, setName] = useState(box.name); const [wallpaper, setWallpaper] = useState(box.wallpaper);
  const [confirm, setConfirm] = useState(false);
  return <div className="pc-box-management">
    <form onSubmit={(event) => { event.preventDefault(); save(name, wallpaper); }}><fieldset disabled={busy}>
      <legend>{text.manage}</legend>
      <label>{text.name}<input value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label>
      <label>{dictionary.boxes.wallpaper}<select value={wallpaper} onChange={(event) => setWallpaper(event.target.value as Wallpaper)}>
        {wallpapers.map((w) => <option key={w} value={w}>{dictionary.boxes[w]}</option>)}
      </select></label>
      <button type="submit" disabled={!name.trim()}>{text.save}</button>
      <button type="button" disabled={index <= 0} onClick={() => reorder(-1)}>{text.earlier}</button>
      <button type="button" disabled={index >= total - 1} onClick={() => reorder(1)}>{text.later}</button>
      {!confirm && <button type="button" onClick={() => setConfirm(true)}>{text.delete}</button>}
    </fieldset></form>
    {confirm && <div className="pc-delete-confirm"><p>{text.deleteQuestion}</p><p>{text.retained}</p>
      <button type="button" disabled={busy} onClick={remove}>{text.confirmDelete}</button>
      <button type="button" disabled={busy} onClick={() => setConfirm(false)}>{dictionary.inventory.cancel}</button></div>}
  </div>;
}

function MoveForm({ boxes, boxId, position, busy, move }: { boxes: BoxSummary[]; boxId: string; position: number; busy: boolean; move: (id: string, position: number) => void }) {
  const { dictionary } = useLocale(); const text = dictionary.personalBoxes;
  const [destination, setDestination] = useState(boxId); const [slot, setSlot] = useState(position + 1);
  return <form onSubmit={(event) => { event.preventDefault(); move(destination, slot - 1); }}>
    <fieldset disabled={busy}><legend>{text.move}</legend>
      <label>{text.destination}<select value={destination} onChange={(event) => setDestination(event.target.value)}>
        {boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>
      <label>{text.destinationSlot}<input type="number" min={1} max={30} required value={slot} onChange={(event) => setSlot(Number(event.target.value))} /></label>
      <button type="submit" disabled={!destination || !Number.isInteger(slot) || slot < 1 || slot > 30}>{text.move}</button>
    </fieldset>
  </form>;
}

function PersonalWorkspace() {
  const { dictionary, locale } = useLocale(); const text = dictionary.personalBoxes;
  const { retrySession, getCsrfToken } = useAuth();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0); const [view, setView] = useState<"manual" | BoxView>("manual");
  const [offset, setOffset] = useState(0); const [picker, setPicker] = useState(false); const [pickerOffset, setPickerOffset] = useState(0);
  const [grouped, setGrouped] = useState(false); const [newName, setNewName] = useState("");
  const [focusRequest, setFocusRequest] = useState(false);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<"saved" | "conflict" | "error" | "invalid" | "missing" | "expired" | null>(null);
  const controllers = useRef(new Set<AbortController>()); const pending = useRef(false);
  useEffect(() => {
    const active = controllers.current;
    return () => { active.forEach((c) => c.abort()); active.clear(); };
  }, []);
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    if (!signal.aborted && error instanceof BoxesError && error.status === 401) retrySession();
    throw error;
  }, [retrySession]);
  const listRequest = useCallback((signal: AbortSignal) => fetchBoxes(signal).catch((e: unknown) => guard(e, signal)), [guard]);
  const list = useTcgResource("boxes", listRequest);
  const boxes = list.state.kind === "loaded" ? list.state.data.results : [];
  const boxId = boxes.find((b) => b.id === chosenId)?.id ?? boxes[0]?.id;
  const index = boxes.findIndex((b) => b.id === boxId);
  const detailRequest = useCallback((signal: AbortSignal) => fetchBox(boxId!, signal).catch((e: unknown) => guard(e, signal)), [boxId, guard]);
  const detail = useTcgResource(view === "manual" ? boxId : undefined, detailRequest);
  const box = view === "manual" && detail.state.kind === "loaded" ? detail.state.data : undefined;
  const viewRequest = useCallback((signal: AbortSignal) => fetchBoxView(view as BoxView, offset, signal).catch((e: unknown) => guard(e, signal)), [view, offset, guard]);
  const derived = useTcgResource(view !== "manual" ? `${view}:${offset}` : undefined, viewRequest);
  const page = view !== "manual" && derived.state.kind === "loaded" ? derived.state.data : undefined;
  const pickerRequest = useCallback((signal: AbortSignal) => fetchBoxView("unassigned", pickerOffset, signal).catch((e: unknown) => guard(e, signal)), [pickerOffset, guard]);
  const pickerEnabled = view === "manual" && !!box && picker;
  const unassigned = useTcgResource(pickerEnabled ? `picker:${pickerOffset}` : undefined, pickerRequest);
  const candidates = pickerEnabled && unassigned.state.kind === "loaded" ? unassigned.state.data : undefined;
  const slots = box?.slots ?? page?.results.map((copy, position) => ({ copy, position })) ?? [];
  const copy = slots.find((s) => s.position === selected)?.copy;
  const metadata = usePersonalMetadata([...slots.map((s) => s.copy.card_id), ...(candidates?.results.map((c) => c.card_id) ?? [])], locale);
  const audio = useRetroAudio(); const sprites = useSpriteMode();
  function refresh() { list.retry(); detail.retry(); derived.retry(); unassigned.retry(); }
  async function mutate(action: Mutation, after?: () => void) {
    if (pending.current) return;
    const csrf = getCsrfToken(); if (!csrf) { retrySession(); return; }
    pending.current = true; setBusy(true); setMessage(null);
    const controller = new AbortController(); controllers.current.add(controller);
    try {
      await action(csrf, controller.signal); if (controller.signal.aborted) return;
      after?.(); setFocusRequest(true); refresh(); setMessage("saved"); audio.play("confirm");
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      const status = error instanceof BoxesError ? error.status : 0;
      if (status === 401) retrySession();
      if (status === 409 || status === 404) refresh();
      setMessage(status === 409 ? "conflict" : status === 422 ? "invalid" : status === 404 ? "missing" : status === 401 || status === 403 ? "expired" : "error");
    } finally {
      controllers.current.delete(controller);
      if (!controller.signal.aborted) { pending.current = false; setBusy(false); }
    }
  }
  function chooseBox(id: string) { setChosenId(id); setSelected(0); setPicker(false); setMessage(null); audio.play("switch"); }
  function select(position: number) { setSelected(position); setPicker(false); audio.play("select"); }
  function reorder(delta: number) {
    const ids = boxes.map((b) => b.id); [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void mutate((csrf, signal) => reorderBoxes(ids, csrf, signal));
  }
  const groups = new Map<string, { position: number; copy: typeof copy }[]>();
  if (grouped && page) for (const slot of slots) {
    const group = generationGroup(metadata.cards[slot.copy.card_id]); groups.set(group, [...(groups.get(group) ?? []), slot]);
  }
  const readError = list.state.kind === "error" || (view === "manual" && boxId && detail.state.kind === "error") || (view !== "manual" && derived.state.kind === "error");
  const loading = list.state.kind === "loading" || (view === "manual" && boxId && detail.state.kind === "loading") || (view !== "manual" && derived.state.kind === "loading");
  return <>
    <div className="pc-personal-toolbar"><label>{text.view}<select disabled={busy} value={view} onChange={(event) => {
      setView(event.target.value as typeof view); setOffset(0); setSelected(0); setPicker(false); setMessage(null);
    }}><option value="manual">{text.manual}</option><option value="owned">{text.owned}</option><option value="unassigned">{text.unassigned}</option><option value="recent">{text.recent}</option></select></label>
      <Link to="/collection">{dictionary.inventory.title}</Link></div>
    {message && <p role={message === "saved" ? "status" : "alert"}>{text[message]}</p>}
    {readError && <div><p role="alert">{text.loadError}</p><button type="button" onClick={refresh}>{dictionary.status.retry}</button></div>}
    {loading && <p role="status">{text.loading}</p>}
    {view === "manual" && <>
      <form className="pc-create-box" onSubmit={(event) => { event.preventDefault(); void mutate(async (csrf, signal) => {
        const created = await createBox(newName, "classic", csrf, signal);
        if (!signal.aborted) { setChosenId(created.id); setSelected(0); setNewName(""); setPicker(false); }
      }); }}><fieldset disabled={busy || list.state.kind !== "loaded" || boxes.length >= 100}>
        <legend>{text.create}</legend><label>{text.newName}<input value={newName} maxLength={80} required onChange={(event) => setNewName(event.target.value)} /></label>
        <button type="submit" disabled={!newName.trim()}>{text.create}</button></fieldset></form>
      {list.state.kind === "loaded" && !boxes.length && <p>{text.empty}</p>}
      {!!boxes.length && <label className="pc-box-select">{text.chooseBox}<select value={boxId} disabled={busy} onChange={(event) => chooseBox(event.target.value)}>
        {boxes.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select></label>}
    </>}
    {(box || page) && <>
      <div className="pc-console">
        <PersonalDetails copy={copy} card={copy && metadata.cards[copy.card_id]} position={selected} mode={sprites.effectiveMode} />
        <section className={`pc-storage pc-wallpaper--${box?.wallpaper ?? "classic"}`} aria-labelledby="personal-box-title">
          <header className="pc-box-header pc-personal-header">
            <button type="button" aria-label={view === "manual" ? dictionary.boxes.previous : dictionary.inventory.previous} disabled={busy || (view === "manual" ? index <= 0 : offset === 0)} onClick={() => {
              if (view === "manual") chooseBox(boxes[index - 1].id); else { setOffset(Math.max(0, offset - 30)); setSelected(0); audio.play("switch"); }
            }}>◀</button>
            <div><h2 id="personal-box-title">{box?.name ?? text[view]}</h2><span>{view === "manual" ? `${box?.copy_count ?? 0}/30` : (page?.results.length ? `${offset + 1}–${offset + page.results.length} / ${page.total}` : `0 / ${page?.total ?? 0}`)}</span></div>
            <button type="button" aria-label={view === "manual" ? dictionary.boxes.next : dictionary.inventory.next} disabled={busy || (view === "manual" ? index >= boxes.length - 1 : offset + 30 >= (page?.total ?? 0))} onClick={() => {
              if (view === "manual") chooseBox(boxes[index + 1].id); else { setOffset(offset + 30); setSelected(0); audio.play("switch"); }
            }}>▶</button>
          </header>
          <div className="pc-screen"><PersonalGrid slots={slots} selected={selected} select={select} cards={metadata.cards} mode={sprites.effectiveMode} disabled={busy} focusRequest={focusRequest} onFocused={() => setFocusRequest(false)} /></div>
          <footer className="pc-help">{dictionary.boxes.keyboard}</footer>
        </section>
      </div>
      {metadata.loading && <p role="status">{dictionary.cards.detailLoading}</p>}
      {metadata.failed && <p>{dictionary.inventory.providerError} <button type="button" onClick={metadata.retry}>{dictionary.inventory.providerRetry}</button></p>}
      {box && <div className="pc-personal-actions">
        <BoxEditor key={`${box.id}:${box.name}:${box.wallpaper}`} box={box} busy={busy} index={index} total={boxes.length} reorder={reorder}
          save={(name, wallpaper) => void mutate((csrf, signal) => updateBox(box.id, name, wallpaper, csrf, signal))}
          remove={() => void mutate((csrf, signal) => deleteBox(box.id, csrf, signal), () => { setChosenId(null); setSelected(0); setPicker(false); })} />
        {copy ? <div>
          <MoveForm key={`${copy.id}:${box.id}:${selected}`} boxes={boxes} boxId={box.id} position={selected} busy={busy}
            move={(destination, position) => void mutate((csrf, signal) => placeCopy(destination, position, copy.id, csrf, signal), () => { setChosenId(destination); setSelected(position); setPicker(false); })} />
          <p>{text.removeNote}</p><button type="button" disabled={busy} onClick={() => void mutate((csrf, signal) => removePlacement(box.id, selected, copy.id, csrf, signal))}>{text.remove}</button>
        </div> : <div><button type="button" disabled={busy} onClick={() => { setPicker(true); setPickerOffset(0); }}>{text.placeHere}</button>
          {pickerEnabled && <section className="pc-copy-picker" aria-label={text.picker}>
            <h3>{text.picker}</h3><p>{text.onlyUnassigned}</p>
            {unassigned.state.kind === "loading" && <p role="status">{text.loading}</p>}
            {unassigned.state.kind === "error" && <><p role="alert">{text.loadError}</p><button type="button" onClick={unassigned.retry}>{dictionary.status.retry}</button></>}
            {candidates && <><p>{text.total.replace("{count}", String(candidates.total))}</p>
              {!candidates.results.length && <p>{text.noCopies}</p>}
              <ul>{candidates.results.map((candidate) => <li key={candidate.id}>
                <span>{metadata.cards[candidate.card_id]?.name ?? candidate.card_id} · {candidate.card_id}</span>
                <span>{dictionary.inventory.languages[candidate.language]} · {dictionary.inventory.variants[candidate.variant]} · {dictionary.inventory.conditions[candidate.condition]}</span>
                <button type="button" disabled={busy} onClick={() => void mutate((csrf, signal) => placeCopy(box.id, selected, candidate.id, csrf, signal), () => setPicker(false))}>{text.place} {candidate.id}</button>
              </li>)}</ul>
              <div className="pc-pagination"><button type="button" disabled={busy || pickerOffset === 0} onClick={() => setPickerOffset(Math.max(0, pickerOffset - 30))}>{dictionary.inventory.previous}</button>
                <button type="button" disabled={busy || pickerOffset + 30 >= candidates.total} onClick={() => setPickerOffset(pickerOffset + 30)}>{dictionary.inventory.next}</button></div>
            </>}
            <button type="button" disabled={busy} onClick={() => setPicker(false)}>{dictionary.inventory.cancel}</button>
          </section>}
        </div>}
      </div>}
      {page && <div className="pc-derived-groups"><p>{text.readonly}</p>
        {!page.results.length && <p>{text.noCopies}</p>}
        <label><input type="checkbox" checked={grouped} onChange={(event) => setGrouped(event.target.checked)} />{text.group}</label>
        {grouped && <><p>{text.groupNote}</p>{[...groups].map(([group, members]) => <section key={group}>
          <h3>{group === "unknown" ? text.unknownGeneration : group === "mixed" ? text.mixedGeneration : group === "Trainer" ? dictionary.cards.categoryTrainer : group === "Energy" ? dictionary.cards.categoryEnergy : `${text.generation} ${group}`}</h3>
          <ul>{members.map((member) => <li key={member.copy!.id}><button type="button" onClick={() => select(member.position)}>{metadata.cards[member.copy!.card_id]?.name ?? member.copy!.card_id} · {member.copy!.id}</button></li>)}</ul>
        </section>)}</>}
      </div>}
    </>}
    <div className="pc-settings"><fieldset className="pc-sprite-modes"><legend>{dictionary.boxes.sprites}</legend>
      <label><input type="radio" name="personal-sprite-mode" checked={sprites.mode === "static"} onChange={() => sprites.setMode("static")} />{dictionary.boxes.staticSprites}</label>
      <label><input type="radio" name="personal-sprite-mode" checked={sprites.mode === "animated"} onChange={() => sprites.setMode("animated")} />{dictionary.boxes.animatedSprites}</label>
      {sprites.reducedMotion && <p>{dictionary.boxes.reducedMotion}</p>}
    </fieldset><AudioControls {...audio} /></div>
  </>;
}

export function PersonalBoxesPage() {
  const auth = useAuth(); const { dictionary } = useLocale(); const text = dictionary.personalBoxes;
  return <section className="pc-page pc-personal-page" aria-labelledby="personal-boxes-title">
    <div className="pc-intro"><div><p className="eyebrow">{dictionary.boxes.terminal}</p><h1 id="personal-boxes-title">{text.title}</h1></div><p className="pc-preview">{text.description}</p></div>
    <SessionNotice />
    {auth.status === "unauthenticated" && <><p>{text.signIn}</p><Link to="/login">{dictionary.auth.signIn}</Link></>}
    {auth.status === "authenticated" && !auth.loggingOut && !auth.validating && <PersonalWorkspace key={auth.user.id} />}
  </section>;
}
