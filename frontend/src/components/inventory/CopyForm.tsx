import { useEffect, useId, useRef, useState } from "react";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { conditions, InventoryError, physicalLanguages, saveCopy, variants, type CopyAttributes, type InventoryCopy } from "../../services/inventory";
import "./inventory.css";

export function CopyForm({ cardId, copy, onSaved, onCancel }: {
  cardId: string; copy?: InventoryCopy; onSaved: () => void; onCancel: () => void;
}) {
  const { dictionary } = useLocale();
  const text = dictionary.inventory;
  const auth = useAuth();
  const prefix = useId();
  const [values, setValues] = useState<CopyAttributes>(() => copy ? {
    condition: copy.condition, language: copy.language, variant: copy.variant,
    acquired_on: copy.acquired_on, notes: copy.notes,
  } : { condition: "unknown", language: "en", variant: "unknown", acquired_on: null, notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => { first.current?.focus(); return () => pending.current?.abort(); }, []);
  return <form className="inventory-form" onSubmit={(event) => {
    event.preventDefault();
    if (pending.current) return;
    const token = auth.getCsrfToken();
    if (!token) { setError(401); return; }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true); setError(null);
    void saveCopy(cardId, values, token, controller.signal, copy?.id).then(() => {
      if (!controller.signal.aborted) onSaved();
    }, (reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(reason instanceof InventoryError ? reason.status : 0);
        if (reason instanceof InventoryError && reason.status === 401) auth.retrySession();
      }
    }).finally(() => {
      if (!controller.signal.aborted) { pending.current = null; setBusy(false); }
    });
  }}>
    <fieldset disabled={busy}>
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
    {error !== null && <p role="alert">{error === 401 || error === 403 ? text.expired : error === 422 ? text.invalid : error === 404 ? text.missing : text.mutationError}</p>}
    <div className="inventory-actions"><button type="submit" disabled={busy}>{busy ? text.saving : text.save}</button>
      <button type="button" disabled={busy} onClick={onCancel}>{text.cancel}</button></div>
    <p className="inventory-hint">{text.physicalNote}</p>
  </form>;
}
