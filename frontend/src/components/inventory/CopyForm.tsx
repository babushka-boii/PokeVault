import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { conditions, createCopyIdempotencyKey, InventoryError, physicalLanguages, saveCopy, variants, type CopyAttributes, type InventoryCopy } from "../../services/inventory";
import "./inventory.css";

export type CopyDefaults = Pick<CopyAttributes, "condition" | "language" | "variant">;

export function CopyForm({ cardId, copy, defaults, onSaved, onCancel, suspended = false }: {
  cardId: string; copy?: InventoryCopy; defaults?: CopyDefaults; onSaved: (copy: InventoryCopy) => void; onCancel: () => void; suspended?: boolean;
}) {
  const { dictionary } = useLocale();
  const text = dictionary.inventory;
  const auth = useAuth();
  const prefix = useId();
  const [values, setValues] = useState<CopyAttributes>(() => copy ? {
    condition: copy.condition, language: copy.language, variant: copy.variant,
    acquired_on: copy.acquired_on, notes: copy.notes,
  } : { condition: defaults?.condition ?? "unknown", language: defaults?.language ?? "en", variant: defaults?.variant ?? "unknown", acquired_on: null, notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [idempotencyKey] = useState(() => copy ? undefined : createCopyIdempotencyKey());
  const submitted = useRef<CopyAttributes | null>(null);
  const pending = useRef<AbortController | null>(null);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); return () => pending.current?.abort(); }, []);
  useEffect(() => {
    if (suspended && pending.current) {
      pending.current.abort(); pending.current = null;
      // Aborting the browser cannot undo an already committed create. Keep its
      // intent/key and original values for an explicit retry after validation.
      setBusy(false); setError(0); setUncertain(!copy);
    }
  }, [suspended, copy]);
  return <form className="inventory-form" onSubmit={(event) => {
    event.preventDefault();
    if (suspended || pending.current) return;
    const token = auth.getCsrfToken();
    if (!token) { setError(401); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(null);
    const attributes = !copy && submitted.current ? submitted.current : { ...values };
    if (!copy) submitted.current = attributes;
    void saveCopy(cardId, attributes, token, controller.signal, copy?.id, idempotencyKey).then((saved) => {
      if (!controller.signal.aborted) onSaved(saved);
    }, (reason: unknown) => {
      if (!controller.signal.aborted) {
        const status = reason instanceof InventoryError ? reason.status : 0;
        setError(status);
        const unknownOutcome = !copy && (status === 0 || status >= 500 || status === 408);
        setUncertain(unknownOutcome);
        if (!unknownOutcome && status !== 409) submitted.current = null;
        if (status === 401 || status === 403) auth.retrySession();
      }
    }).finally(() => {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); }
    });
  }}>
    <fieldset disabled={suspended || busy || uncertain || error === 409}>
      <legend>{copy ? text.edit : text.add}</legend>
      <label htmlFor={`${prefix}-condition`}>{text.condition}</label>
      <select ref={first} id={`${prefix}-condition`} value={values.condition} onChange={(e) => setValues({ ...values, condition: e.target.value as CopyAttributes["condition"] })}>
        {conditions.map((v) => <option key={v} value={v}>{text.conditions[v]}</option>)}
      </select>
      <label htmlFor={`${prefix}-language`}>{text.language}</label>
      <select id={`${prefix}-language`} value={values.language} onChange={(e) => setValues({ ...values, language: e.target.value as CopyAttributes["language"] })}>
        {physicalLanguages.map((v) => <option key={v} value={v}>{text.languages[v]}</option>)}
      </select>
      <label htmlFor={`${prefix}-variant`}>{text.variant}</label>
      <select id={`${prefix}-variant`} value={values.variant} onChange={(e) => setValues({ ...values, variant: e.target.value as CopyAttributes["variant"] })}>
        {variants.map((v) => <option key={v} value={v}>{text.variants[v]}</option>)}
      </select>
      <label htmlFor={`${prefix}-date`}>{text.date}</label>
      <input id={`${prefix}-date`} type="date" min="0001-01-01" max="9999-12-31" value={values.acquired_on ?? ""} onChange={(e) => setValues({ ...values, acquired_on: e.target.value || null })} />
      <label htmlFor={`${prefix}-notes`}>{text.notes}</label>
      <textarea id={`${prefix}-notes`} maxLength={2000} rows={3} value={values.notes} onChange={(e) => setValues({ ...values, notes: e.target.value })} />
    </fieldset>
    {error !== null && <p role="alert">{uncertain ? text.uncertain : error === 409 ? text.conflict : error === 401 || error === 403 ? text.expired : error === 422 ? text.invalid : error === 404 ? text.missing : text.mutationError}</p>}
    <div className="inventory-actions"><button type="submit" disabled={suspended || busy || error === 409}>{busy ? text.saving : uncertain ? text.retrySame : text.save}</button>
      <button type="button" disabled={suspended || busy} onClick={onCancel}>{text.cancel}</button></div>
    <p className="inventory-hint">{text.physicalNote}</p>
  </form>;
}
