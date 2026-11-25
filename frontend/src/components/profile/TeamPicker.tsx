import { useMemo, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { searchSpecies, spriteUrl, type SpeciesRow } from "../../services/pokemon";
import { TEAM_MAX } from "../../services/profile";
import { ProfileDialog } from "./ProfileDialog";

const pad = (n: number) => `#${String(n).padStart(3, "0")}`;
const RESULTS = 24;

/** Up to five different species chosen from the 9B species index; nothing is saved until "Guardar". */
export function TeamPicker({ rows, team, blocked = false, onSave, onClose }: { rows: readonly SpeciesRow[]; team: number[]; blocked?: boolean; onSave: (team: number[]) => Promise<boolean>; onClose: () => void }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.profilePage;
  const [draft, setDraft] = useState(team);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const nameOf = (row: SpeciesRow) => (locale === "es" ? row.name_es : row.name_en);
  const byNumber = (n: number) => rows[n - 1];
  const matches = useMemo(() => searchSpecies(rows, query, RESULTS).filter((row) => !draft.includes(row.national_dex_number)), [rows, query, draft]);
  const full = draft.length >= TEAM_MAX;
  async function save() {
    setBusy(true); setFailed(false);
    const ok = await onSave(draft);
    setBusy(false);
    if (ok) onClose(); else setFailed(true);
  }
  return <ProfileDialog title={text.teamTitle} onClose={onClose}>
    <p className="pv-pdialog__note">{text.teamHint}</p>
    <h3 className="pv-pdialog__sub">{text.teamNow} ({draft.length}/{TEAM_MAX})</h3>
    {draft.length === 0 ? <p className="pv-pdialog__note">{text.teamNone}</p> : <ul className="pv-teamlist">
      {draft.map((n) => { const row = byNumber(n); const name = row ? nameOf(row) : pad(n);
        return <li key={n}><img src={spriteUrl(n)} alt="" width={40} height={40} referrerPolicy="no-referrer" />
          <span>{pad(n)} {name}</span>
          <button type="button" aria-label={text.teamRemove.replace("{name}", name)} onClick={() => setDraft(draft.filter((m) => m !== n))}>×</button></li>; })}
    </ul>}
    <label className="pv-pdialog__sub" htmlFor="team-search">{text.teamSearch}</label>
    <input id="team-search" type="search" value={query} autoComplete="off" onChange={(event) => setQuery(event.target.value)} />
    {full && <p role="status" className="pv-pdialog__note">{text.teamFull}</p>}
    {matches.length === 0 ? <p role="status" className="pv-pdialog__note">{text.teamEmptySearch}</p> : <ul className="pv-teamresults">
      {matches.map((row) => <li key={row.national_dex_number}>
        <button type="button" disabled={full} aria-label={text.teamAdd.replace("{name}", nameOf(row))} onClick={() => setDraft([...draft, row.national_dex_number])}>
          <img src={spriteUrl(row.national_dex_number)} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" />
          <span>{pad(row.national_dex_number)} {nameOf(row)}</span></button></li>)}
    </ul>}
    {failed && <p role="alert" className="pv-pdialog__note pv-pdialog__note--error">{text.saveError}</p>}
    <div className="pv-pdialog__actions">
      <button type="button" className="pv-pbtn" onClick={onClose}>{text.cancel}</button>
      <button type="button" className="pv-pbtn pv-pbtn--primary" disabled={busy || blocked} onClick={() => void save()}>{busy ? text.saving : text.save}</button>
    </div>
  </ProfileDialog>;
}
