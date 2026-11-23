import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchInventory, InventoryError, type InventoryCopy } from "../../services/inventory";
import type { ScanCandidate } from "../../services/scanner";
import { CardArtwork } from "../cards/CardArtwork";
import { CopyForm, type CopyDefaults } from "../inventory/CopyForm";

function OwnedQuantity({ cardId }: { cardId: string }) {
  const { dictionary } = useLocale(); const text = dictionary.scanner; const { retrySession } = useAuth();
  const [quantity, setQuantity] = useState<number | null>(null); const [failed, setFailed] = useState(false); const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetchInventory({ offset: 0, card_id: cardId, condition: "", language: "" }, controller.signal).then((page) => {
      if (!controller.signal.aborted) setQuantity(page.quantities[cardId] ?? 0);
    }, (reason: unknown) => {
      if (!controller.signal.aborted) {
        setFailed(true);
        if (reason instanceof InventoryError && (reason.status === 401 || reason.status === 403)) retrySession();
      }
    });
    return () => controller.abort();
  }, [cardId, revision, retrySession]);
  return quantity !== null ? <p>{dictionary.sets.quantity.replace("{count}", String(quantity))}</p> : failed ? <div><p role="alert">{text.quantityError}</p>
    <button type="button" onClick={() => { setFailed(false); setRevision((value) => value + 1); }}>{text.quantityRetry}</button></div> : <p role="status">{text.quantityLoading}</p>;
}

export function ScannerConfirmation({ candidate, defaults, suspended, onSaved, onCancel }: { candidate: ScanCandidate; defaults?: CopyDefaults; suspended: boolean; onSaved: (copy: InventoryCopy) => void; onCancel: () => void }) {
  const { dictionary } = useLocale(); const text = dictionary.scanner;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className="scanner-confirmation" aria-labelledby="scanner-confirmation-title">
    <h2 id="scanner-confirmation-title" ref={heading} tabIndex={-1}>{text.confirm}</h2><p>{text.confirmHint}</p>
    <div className="scanner-confirmation-grid"><div className="scanner-selected-card"><CardArtwork card={candidate.card} large />
      <h3 lang={candidate.card.language}>{candidate.card.name}</h3><p lang={candidate.set.name_language}>{candidate.set.name} · <code>{candidate.set.id}</code></p>
      <p>#{candidate.card.local_id}{candidate.set.official_count !== null && ` / ${candidate.set.official_count}`} · <code>{candidate.card.id}</code></p>
      <Link to={`/cards/${encodeURIComponent(candidate.card.id)}?returnTo=%2Fscanner`} target="_blank" rel="noopener noreferrer" aria-describedby="scanner-confirmation-details-hint">{text.details}</Link>
      <p id="scanner-confirmation-details-hint" className="scanner-hint">{text.detailsNewTab}</p>
      {!suspended && <OwnedQuantity cardId={candidate.card.id} />}
    </div><CopyForm cardId={candidate.card.id} defaults={defaults} suspended={suspended} onSaved={onSaved} onCancel={onCancel} /></div>
  </section>;
}
