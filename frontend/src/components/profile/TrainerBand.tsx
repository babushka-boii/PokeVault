import { useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { spriteUrl, type SpeciesRow } from "../../services/pokemon";
import { TEAM_MAX, type Profile, type ProfileUpdate } from "../../services/profile";
import { InlineError } from "../ui/InlineError";
import { TeamPicker } from "./TeamPicker";
import { TrainerPicker } from "./TrainerPicker";
import { TrainerSprite } from "./TrainerSprite";

/** Name, "trainer since", the team standing by the trainer, and the two buttons that change them. */
export function TrainerBand({ name, profile, failed, retry, rows, save }: {
  name: string; profile: Profile | null; failed: boolean; retry: () => void; rows: readonly SpeciesRow[] | null; save: (update: ProfileUpdate) => Promise<boolean>;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.profilePage;
  const [dialog, setDialog] = useState<"trainer" | "team" | null>(null);
  const trainerButton = useRef<HTMLButtonElement>(null);
  const team = profile?.team ?? [];
  const since = profile ? new Intl.DateTimeFormat(locale === "es" ? "es-CL" : "en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${profile.member_since}T00:00:00Z`)).replace(".", "") : "";
  const slots = Array.from({ length: TEAM_MAX }, (_, index) => team[index]);
  const nameOf = (number: number) => { const row = rows?.[number - 1]; return row ? (locale === "es" ? row.name_es : row.name_en) : `#${number}`; };
  return <section className="pv-band" aria-labelledby="profile-title">
    <div className="pv-band__who">
      <h1 id="profile-title">{name}</h1>
      {profile && <p>{text.since.replace("{date}", since)}</p>}
      {failed && <InlineError calm message={text.profileError} retryLabel={text.retry} onRetry={retry} />}
    </div>
    <div className="pv-band__stage">
      <ul className="pv-band__team" aria-label={text.team}>
        {[...slots].reverse().map((number, reversed) => <li key={TEAM_MAX - 1 - reversed}>
          <span className={`pv-slot${number === undefined ? " pv-slot--empty" : reversed % 2 ? " pv-bob" : " pv-bob2"}`}>
            {number === undefined ? <span role="img" aria-label={text.freeSlot}>+</span>
              : <img src={spriteUrl(number)} alt={nameOf(number)} width={64} height={64} referrerPolicy="no-referrer" draggable={false} />}
          </span>
          <span className="pv-shadow pv-shadow--small" aria-hidden="true" />
        </li>)}
      </ul>
      <div className="pv-band__trainer">
        <span className="pv-bob"><TrainerSprite id={profile?.trainer_id ?? "mateo"} width={96} height={132} label={text.yourTrainer} /></span>
        <span className="pv-shadow pv-shadow--large" aria-hidden="true" />
      </div>
    </div>
    <div className="pv-band__actions">
      <button ref={trainerButton} type="button" className="pv-pbtn" disabled={!profile} onClick={() => setDialog("trainer")}>{text.changeTrainer}</button>
      <button type="button" className="pv-pbtn pv-pbtn--primary" disabled={!profile || !rows} onClick={() => setDialog("team")}>{text.editTeam.replace("{count}", String(team.length))}</button>
    </div>
    {dialog === "trainer" && profile && <TrainerPicker current={profile.trainer_id} onClose={() => setDialog(null)} onSave={(id) => save({ trainer_id: id, team: profile.team })} />}
    {dialog === "team" && profile && rows && <TeamPicker rows={rows} team={profile.team} onClose={() => setDialog(null)} onSave={(next) => save({ trainer_id: profile.trainer_id, team: next })} />}
    <span className="pv-band__rule" aria-hidden="true" />
  </section>;
}
