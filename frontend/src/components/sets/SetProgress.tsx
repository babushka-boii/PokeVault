import { useLocale } from "../../i18n/LocaleProvider";
import type { SetProgress as Progress } from "../../services/sets";

export function SetProgress({ progress, compact = false }: { progress: Progress; compact?: boolean }) {
  const { dictionary } = useLocale();
  const text = dictionary.sets;
  if (progress.status !== "verified") return compact ? <p className="set-progress-unavailable">{text.unavailable}</p> : null;
  const label = `${progress.owned} / ${progress.total} · ${progress.percentage}%`;
  return <section className={`set-progress${compact ? " set-progress--compact" : ""}`} aria-label={text.progress}>
    {!compact && <h2>{text.progress}</h2>}
    <p className="set-progress-number">{label}</p>
    <progress aria-label={text.progressLabel} aria-valuetext={label} value={progress.owned!} max={progress.total!} />
    {!compact && <dl className="set-facts">
      <div><dt>{text.distinctOwned}</dt><dd>{progress.owned}</dd></div>
      <div><dt>{text.distinctMissing}</dt><dd>{progress.missing}</dd></div>
      <div><dt>{text.total}</dt><dd>{progress.total}</dd></div>
      <div><dt>{text.physical}</dt><dd>{progress.physical_copies}</dd></div>
    </dl>}
  </section>;
}
