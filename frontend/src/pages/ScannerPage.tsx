import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import type { CopyDefaults } from "../components/inventory/CopyForm";
import { ExpansionSearch } from "../components/scanner/ExpansionSearch";
import { ScannerConfirmation } from "../components/scanner/ScannerConfirmation";
import { ScannerResults } from "../components/scanner/ScannerResults";
import { useLocale } from "../i18n/LocaleProvider";
import type { Dictionary } from "../i18n/dictionaries";
import type { InventoryCopy } from "../services/inventory";
import { fetchScanCapabilities, matchScan, recognizeScan, ScanError, scanImageFormats, scanImageType, type MatchResult, type ScanCandidate, type ScanCapabilities, type ScanClues } from "../services/scanner";
import "../components/cards/cards.css";
import "../components/scanner/scanner.css";

const emptyClues = (): ScanClues => ({ name: "", local_number: "", printed_total: null, set_id: null, set_hint: "", category: null, language: null });
function errorMessage(reason: unknown, dictionary: Dictionary) {
  const text = dictionary.scanner;
  if (!(reason instanceof ScanError)) return text.errors.generic;
  if (reason.status === 401 || reason.status === 403) return dictionary.inventory.expired;
  if (reason.status === 413) return text.errors.size;
  if (reason.status === 415) return text.errors.format;
  if (reason.status === 422) return text.errors.invalid;
  if (reason.status === 429) return text.errors.busy;
  if (reason.status === 504) return text.errors.timeout;
  if (reason.status === 503) {
    if (reason.code === "ocr_unavailable") return text.unavailable;
    if (reason.code === "ocr_engine_failed" || reason.code === "ocr_output_invalid") return text.errors.ocr;
    if (reason.code === "provider_unavailable") return text.errors.provider;
  }
  return text.errors.generic;
}

function ScannerSession({ suspended }: { suspended: boolean }) {
  const auth = useAuth(); const { dictionary, locale } = useLocale(); const text = dictionary.scanner; const id = useId();
  const retrySession = auth.retrySession; const getCsrfToken = auth.getCsrfToken;
  const [capabilities, setCapabilities] = useState<ScanCapabilities | null>(null); const [capabilitiesFailed, setCapabilitiesFailed] = useState(false);
  const [capabilitiesRevision, setCapabilitiesRevision] = useState(0);
  const [image, setImage] = useState<{ file: File; url: string | null } | null>(null); const preview = useRef<string | null>(null);
  const queuedRecognition = useRef<File | null>(null);
  const focusNextCapture = useRef(false);
  const captureRef = useCallback((input: HTMLInputElement | null) => {
    if (input && focusNextCapture.current) { focusNextCapture.current = false; input.focus(); }
  }, []);
  const [clues, setClues] = useState<ScanClues>(emptyClues); const [result, setResult] = useState<MatchResult | null>(null);
  const [selected, setSelected] = useState<ScanCandidate | null>(null); const [saved, setSaved] = useState<InventoryCopy | null>(null);
  const [copyDefaults, setCopyDefaults] = useState<CopyDefaults>();
  const [manualOpen, setManualOpen] = useState(false);
  const [busy, setBusy] = useState<"recognize" | "match" | null>(null); const [error, setError] = useState<string | null>(null); const [cancelled, setCancelled] = useState(false);
  const pending = useRef<AbortController | null>(null); const success = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (suspended) return;
    const controller = new AbortController();
    void fetchScanCapabilities(controller.signal).then((data) => { if (!controller.signal.aborted) { setCapabilities(data); if (!data.available) setManualOpen(true); } }, (reason: unknown) => {
      if (!controller.signal.aborted) {
        setCapabilitiesFailed(true);
        setManualOpen(true);
        if (reason instanceof ScanError && (reason.status === 401 || reason.status === 403)) retrySession();
      }
    });
    return () => controller.abort();
  }, [capabilitiesRevision, retrySession, suspended]);
  useEffect(() => {
    if (!suspended) return;
    if (pending.current) {
      pending.current.abort(); pending.current = null;
      setBusy(null); setCancelled(true);
    }
  }, [suspended]);
  useEffect(() => () => { pending.current?.abort(); if (preview.current) URL.revokeObjectURL(preview.current); }, []);
  useEffect(() => { if (saved) success.current?.focus(); }, [saved]);
  const invalidate = useCallback(() => { queuedRecognition.current = null; pending.current?.abort(); pending.current = null; setBusy(null); setResult(null); setError(null); setCancelled(false); }, []);
  const changeClues = (next: Partial<ScanClues>) => { invalidate(); setClues((current) => ({ ...current, ...next })); };
  const removeImage = () => { invalidate(); if (preview.current) URL.revokeObjectURL(preview.current); preview.current = null; setImage(null); };
  const chooseImage = (file: File | undefined) => {
    if (!file) return;
    const formats = capabilities?.formats ?? scanImageFormats;
    const type = scanImageType(file);
    if (!formats.includes(type)) { setError(text.errors.format); return; }
    if (!file.size) { setError(text.errors.empty); return; }
    if (file.size > (capabilities?.max_upload_bytes ?? 8388608)) { setError(text.errors.size); return; }
    invalidate(); if (preview.current) URL.revokeObjectURL(preview.current);
    const url = type === "image/heic" || type === "image/heif" ? null : URL.createObjectURL(file);
    preview.current = url; queuedRecognition.current = file; setImage({ file, url }); setClues(emptyClues()); setManualOpen(capabilitiesFailed || capabilities?.available === false);
  };
  const identify = useCallback((kind: "recognize" | "match", selectedFile = image?.file) => {
    if (suspended) return;
    queuedRecognition.current = null;
    const token = getCsrfToken();
    if (!token) { setError(dictionary.inventory.expired); retrySession(); return; }
    if (kind === "recognize" && !selectedFile) return;
    invalidate(); const controller = new AbortController(); pending.current = controller; setBusy(kind);
    const request = kind === "match" ? matchScan(clues, locale, token, controller.signal)
      : capabilities?.formats.includes(scanImageType(selectedFile!)) ? recognizeScan(selectedFile!, locale, token, controller.signal)
      : Promise.reject(new ScanError(415));
    void request.then((data) => { if (!controller.signal.aborted) { setClues(data.clues); setResult(data); if (data.status !== "matches") setManualOpen(true); } }, (reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(errorMessage(reason, dictionary));
        setManualOpen(true);
        if (reason instanceof ScanError && (reason.status === 401 || reason.status === 403)) retrySession();
      }
    }).finally(() => { if (!controller.signal.aborted) { pending.current = null; setBusy(null); } });
  }, [suspended, image, getCsrfToken, retrySession, dictionary, invalidate, locale, clues, capabilities]);
  useEffect(() => {
    if (suspended || !capabilities || !image || queuedRecognition.current !== image.file) return;
    // A photo returned by the native camera during validation waits for this
    // owner to be confirmed. Once started, cancellation never queues it again.
    if (!capabilities.available) return;
    const timer = window.setTimeout(() => {
      if (queuedRecognition.current === image.file) identify("recognize", image.file);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [suspended, capabilities, image, identify]);
  const imagePreview = image && <figure className="scanner-photo">{image.url ? <img src={image.url} alt={text.preview} /> : <p className="scanner-hint">{text.previewUnavailable}</p>}<figcaption>{image.file.name}</figcaption></figure>;
  if (saved && selected) return <section className="scanner-success" aria-labelledby="scanner-saved"><h2 id="scanner-saved" tabIndex={-1} ref={success}>{dictionary.inventory.added}</h2>
    <div className="scanner-actions"><Link to={`/collection/${encodeURIComponent(saved.id)}`}>{text.savedCopy}</Link>
      <Link to="/binders">{text.storeInBinder}</Link>
      <Link to={`/cards/${encodeURIComponent(saved.card_id)}?returnTo=%2Fscanner`}>{text.savedCard}</Link>
      <Link to={`/sets/${encodeURIComponent(selected.set.id)}`}>{text.savedSet}</Link></div>
    <button type="button" onClick={() => { focusNextCapture.current = true; removeImage(); setClues(emptyClues()); setSelected(null); setSaved(null); setManualOpen(!capabilities?.available || capabilitiesFailed); }}>{text.another}</button></section>;
  if (selected) return <>{imagePreview}<ScannerConfirmation key={selected.card.id} candidate={selected} defaults={copyDefaults} suspended={suspended} onSaved={(copy) => {
    setCopyDefaults({ condition: copy.condition, language: copy.language, variant: copy.variant }); setSaved(copy);
  }} onCancel={() => setSelected(null)} /></>;
  const formats = capabilities?.formats ?? scanImageFormats;
  const accept = [...formats, ...(formats.includes("image/heic") ? [".heic"] : []), ...(formats.includes("image/heif") ? [".heif"] : [])].join(",");
  return <>
    <section className="scanner-image" aria-labelledby="scanner-image-title"><h2 id="scanner-image-title">{text.imageTitle}</h2>
      <p className="scanner-hint">{text.formats.replace("{formats}", formats.map((format) => format.slice("image/".length).toUpperCase()).join(", "))}</p>
      <div className="scanner-upload-controls"><div><label htmlFor={`${id}-upload`}>{text.upload}</label><input ref={captureRef} id={`${id}-upload`} type="file" accept={accept} onChange={(event) => { chooseImage(event.target.files?.[0]); event.target.value = ""; }} /></div>
        <div><label htmlFor={`${id}-capture`}>{text.capture}</label><input id={`${id}-capture`} type="file" capture="environment" accept={accept} onChange={(event) => { chooseImage(event.target.files?.[0]); event.target.value = ""; }} /></div></div>
      <p className="scanner-hint">{text.cameraHint}</p>{imagePreview}
      <div className="scanner-actions"><button type="button" disabled={!image || !capabilities?.available || busy !== null} onClick={() => identify("recognize")}>{busy === "recognize" ? text.recognizing : text.recognize}</button>
        {image && <button type="button" onClick={removeImage}>{text.remove}</button>}
        {busy === "recognize" && <button type="button" onClick={() => { invalidate(); setCancelled(true); }}>{text.cancelRecognition}</button>}</div>
      {!capabilities && !capabilitiesFailed && <p role="status">{text.capabilitiesLoading}</p>}
      {capabilitiesFailed && <div><p role="status">{text.capabilitiesError}</p><button type="button" onClick={() => { setCapabilitiesFailed(false); setCapabilitiesRevision((value) => value + 1); }}>{text.retryCapabilities}</button></div>}
      {capabilities && (!capabilities.available ? <p role="status">{text.unavailable}</p> : <p className="scanner-hint">{text.engine}: {capabilities.languages.map((language) => text.engineLanguages[language]).join(", ")}</p>)}
    </section>
    {error && <p role="alert">{error}</p>}{cancelled && <p role="status">{text.cancelled}</p>}
    {result && <ScannerResults result={result} onSelect={(candidate) => { pending.current?.abort(); setSelected(candidate); }} />}
    <section className="scanner-manual" aria-labelledby="scanner-manual-title"><h2 id="scanner-manual-title"><button type="button" className="scanner-disclosure" aria-expanded={manualOpen} aria-controls={`${id}-manual`} onClick={() => setManualOpen((value) => !value)}>{text.manual}</button></h2>
      <div id={`${id}-manual`} hidden={!manualOpen}><p>{text.manualHint}</p>
      <form className="scanner-clues" onSubmit={(event) => { event.preventDefault(); identify("match"); }}>
        <div><label htmlFor={`${id}-name`}>{text.name}</label><input id={`${id}-name`} maxLength={100} value={clues.name} onChange={(event) => changeClues({ name: event.target.value })} /></div>
        <div><label htmlFor={`${id}-number`}>{text.number}</label><input id={`${id}-number`} maxLength={20} value={clues.local_number} onChange={(event) => changeClues({ local_number: event.target.value })} /></div>
        <div><label htmlFor={`${id}-total`}>{text.total}</label><input id={`${id}-total`} type="number" min={1} max={2000} step={1} value={clues.printed_total ?? ""} onChange={(event) => changeClues({ printed_total: event.target.value ? Number(event.target.value) : null })} /></div>
        <div><label htmlFor={`${id}-hint`}>{text.setHint}</label><input id={`${id}-hint`} maxLength={100} value={clues.set_hint} onChange={(event) => changeClues({ set_hint: event.target.value, set_id: null })} /></div>
        <div><label htmlFor={`${id}-category`}>{text.category}</label><select id={`${id}-category`} value={clues.category ?? ""} onChange={(event) => changeClues({ category: (event.target.value || null) as ScanClues["category"] })}>
          <option value="">{text.anyCategory}</option><option value="Pokemon">{dictionary.cards.categoryPokemon}</option><option value="Trainer">{dictionary.cards.categoryTrainer}</option><option value="Energy">{dictionary.cards.categoryEnergy}</option></select></div>
        <div><label htmlFor={`${id}-language`}>{text.clueLanguage}</label><select id={`${id}-language`} value={clues.language ?? ""} onChange={(event) => changeClues({ language: (event.target.value || null) as ScanClues["language"] })}>
          <option value="">{text.anyLanguage}</option><option value="en">{dictionary.inventory.languages.en}</option><option value="es">{dictionary.inventory.languages.es}</option></select></div>
        {clues.set_id && <p className="scanner-selected-expansion">{text.expansionSelected}: <code>{clues.set_id}</code> <button type="button" onClick={() => changeClues({ set_id: null, set_hint: "" })}>{text.clearExpansion}</button></p>}
        <div className="scanner-actions"><button type="submit">{busy === "match" ? text.matching : text.search}</button>
          {busy === "match" && <button type="button" onClick={() => { invalidate(); setCancelled(true); }}>{text.cancelSearch}</button>}</div>
      </form>
      <ExpansionSearch suspended={suspended || !manualOpen} onSelect={(set) => changeClues({ set_id: set.id, set_hint: set.name.slice(0, 100) })} />
      </div>
    </section>
  </>;
}

export function ScannerPage() {
  const auth = useAuth(); const { dictionary } = useLocale(); const text = dictionary.scanner;
  return <section className="panel tcg-page scanner-page" aria-labelledby="scanner-title"><h1 id="scanner-title">{text.title}</h1><p>{text.description}</p>
    <p className="scanner-hint">{text.privacy}</p><SessionNotice />
    {auth.status === "unauthenticated" && <p><Link to="/login">{text.signIn}</Link></p>}
    <p><Link to="/sets">{text.browse}</Link></p>
    {auth.status === "authenticated" && !auth.loggingOut && <div key={auth.user.id}>
      <ScannerSession suspended={Boolean(auth.validating)} />
    </div>}
  </section>;
}
