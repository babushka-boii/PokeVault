import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { SessionNotice } from "../../auth/SessionNotice";
import { useLocale } from "../../i18n/LocaleProvider";
import { CopyForm } from "./CopyForm";

type AddOptions = { onSaved?: () => void; locked?: boolean; onActiveChange?: (open: boolean) => void };

function AddCopy({ cardId, onSaved, locked = false, onActiveChange }: { cardId: string } & AddOptions) {
  const { dictionary } = useLocale();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className="inventory-add">
    {saved && <p role="status">{dictionary.inventory.added}</p>}
    {open ? <CopyForm cardId={cardId} onCancel={() => { setOpen(false); onActiveChange?.(false); }} onSaved={() => { setOpen(false); setSaved(true); onActiveChange?.(false); onSaved?.(); }} />
      : <button type="button" disabled={locked} onClick={() => { setOpen(true); setSaved(false); onActiveChange?.(true); }}>{dictionary.inventory.add}</button>}
  </div>;
}
export function AddToCollection({ cardId, onSaved, locked, onActiveChange }: { cardId: string } & AddOptions) {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <div className="inventory-add"><SessionNotice />
    {auth.status === "unauthenticated" && <Link to="/login">{dictionary.auth.signIn} · {dictionary.inventory.add}</Link>}
    {auth.status === "authenticated" && !auth.loggingOut && !auth.validating && <AddCopy key={`${auth.user.id}:${cardId}`} cardId={cardId} onSaved={onSaved} locked={locked} onActiveChange={onActiveChange} />}
  </div>;
}
