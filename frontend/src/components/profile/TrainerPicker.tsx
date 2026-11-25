import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { ProfileDialog } from "./ProfileDialog";
import { TrainerSprite } from "./TrainerSprite";
import { TRAINERS, type TrainerId } from "./trainers";

/** Four original trainers. Choosing one saves it; the dialog stays open with a message if that fails. */
export function TrainerPicker({ current, blocked = false, onSave, onClose }: { current: TrainerId; blocked?: boolean; onSave: (id: TrainerId) => Promise<boolean>; onClose: () => void }) {
  const text = useLocale().dictionary.profilePage;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function choose(id: TrainerId) {
    if (busy) return;
    if (id === current) { onClose(); return; }
    setBusy(true); setFailed(false);
    const ok = await onSave(id);
    setBusy(false);
    if (ok) onClose(); else setFailed(true);
  }
  return <ProfileDialog title={text.trainerTitle} onClose={onClose}>
    <div className="pv-trainers" role="radiogroup" aria-label={text.trainerTitle}>
      {TRAINERS.map((trainer) => <button key={trainer.id} type="button" role="radio" aria-checked={trainer.id === current} disabled={busy || blocked} onClick={() => void choose(trainer.id)}>
        <TrainerSprite id={trainer.id} width={64} height={88} />
        <span>{trainer.name}</span>
      </button>)}
    </div>
    {busy && <p role="status" className="pv-pdialog__note">{text.saving}</p>}
    {failed && <p role="alert" className="pv-pdialog__note pv-pdialog__note--error">{text.saveError}</p>}
  </ProfileDialog>;
}
