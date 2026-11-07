import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { deleteCopy, InventoryError, type InventoryCopy } from "../../services/inventory";
import { CopyForm } from "./CopyForm";

export function OwnedCopy({ copy, onChanged, locked, onActiveChange }: { copy: InventoryCopy; onChanged: (message: "updated" | "removed") => void; locked: boolean; onActiveChange: (id: string | null) => void }) {
  const { dictionary } = useLocale();
  const text = dictionary.inventory;
  const auth = useAuth();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<number | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  return <li className="inventory-copy">
    <p>{text.conditions[copy.condition]} · {text.languages[copy.language]} · {text.variants[copy.variant]}</p>
    {copy.acquired_on && <p>{text.date}: <time dateTime={copy.acquired_on}>{copy.acquired_on}</time></p>}
    {copy.notes && <p className="inventory-notes">{copy.notes}</p>}
    {mode === "edit" ? <CopyForm cardId={copy.card_id} copy={copy} onCancel={() => { setMode("view"); onActiveChange(null); }} onSaved={() => onChanged("updated")} />
      : mode === "confirm" ? <div className="inventory-confirm">
        <p>{text.confirmText}</p>
        <button type="button" disabled={busy} onClick={() => {
          if (pending.current) return;
          const token = auth.getCsrfToken();
          if (!token) { setError(401); return; }
          const controller = new AbortController(); pending.current = controller; setBusy(true); setError(null);
          void deleteCopy(copy.id, token, controller.signal).then(() => {
            if (!controller.signal.aborted) onChanged("removed");
          }, (reason: unknown) => {
            if (!controller.signal.aborted) {
              setError(reason instanceof InventoryError ? reason.status : 0);
              if (reason instanceof InventoryError && reason.status === 401) auth.retrySession();
            }
          }).finally(() => { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } });
        }}>{busy ? text.saving : text.confirm}</button>
        <button type="button" disabled={busy} onClick={() => { setMode("view"); onActiveChange(null); }}>{text.cancel}</button>
      </div> : <div className="inventory-actions">
        <button type="button" disabled={locked} onClick={() => { setMode("edit"); onActiveChange(copy.id); }}>{text.edit}</button>
        <button type="button" disabled={locked} onClick={() => { setMode("confirm"); setError(null); onActiveChange(copy.id); }}>{text.remove}</button>
      </div>}
    {error !== null && <p role="alert">{error === 401 || error === 403 ? text.expired : error === 404 ? text.missing : text.mutationError}</p>}
  </li>;
}
