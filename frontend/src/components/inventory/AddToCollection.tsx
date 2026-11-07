import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { SessionNotice } from "../../auth/SessionNotice";
import { useLocale } from "../../i18n/LocaleProvider";
import { CopyForm } from "./CopyForm";

function AddCopy({ cardId }: { cardId: string }) {
  const { dictionary } = useLocale();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  return <div className="inventory-add">
    {saved && <p role="status">{dictionary.inventory.added}</p>}
    {open ? <CopyForm cardId={cardId} onCancel={() => setOpen(false)} onSaved={() => { setOpen(false); setSaved(true); }} />
      : <button type="button" onClick={() => { setOpen(true); setSaved(false); }}>{dictionary.inventory.add}</button>}
  </div>;
}
export function AddToCollection({ cardId }: { cardId: string }) {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <div className="inventory-add"><SessionNotice />
    {auth.status === "unauthenticated" && <Link to="/login">{dictionary.auth.signIn} · {dictionary.inventory.add}</Link>}
    {auth.status === "authenticated" && !auth.loggingOut && !auth.validating && <AddCopy key={`${auth.user.id}:${cardId}`} cardId={cardId} />}
  </div>;
}
