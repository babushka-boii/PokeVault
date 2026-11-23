import { useState } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { MatchResult, ScanCandidate } from "../../services/scanner";
import { CardArtwork } from "../cards/CardArtwork";

function Candidate({ candidate, leading = false, onSelect }: { candidate: ScanCandidate; leading?: boolean; onSelect: (candidate: ScanCandidate) => void }) {
  const { dictionary } = useLocale(); const text = dictionary.scanner;
  return <li className={`scanner-candidate${leading ? " scanner-candidate--leading" : ""}`}>
    <CardArtwork card={candidate.card} />
    <div>{leading && <p className="scanner-leading-label">{text.leading}</p>}<h3 lang={candidate.card.language}>{candidate.card.name}</h3><p className={`scanner-quality scanner-quality--${candidate.quality}`}>{text.quality[candidate.quality]}</p>
      <dl className="scanner-facts"><div><dt>{dictionary.cards.set}</dt><dd lang={candidate.set.name_language}>{candidate.set.name} · <code>{candidate.set.id}</code></dd></div>
        <div><dt>{dictionary.cards.number}</dt><dd>#{candidate.card.local_id}{candidate.set.official_count !== null && ` / ${candidate.set.official_count}`}</dd></div>
        <div><dt>{dictionary.sets.identity}</dt><dd><code>{candidate.card.id}</code></dd></div></dl>
      <ul className="scanner-evidence">{candidate.evidence.map((code, index) => <li key={`${code}:${index}`}>{text.evidence[code]}</li>)}</ul>
      <div className="scanner-actions"><Link to={`/cards/${encodeURIComponent(candidate.card.id)}?returnTo=%2Fscanner`} target="_blank" rel="noopener noreferrer" aria-describedby="scanner-details-hint">{text.details}</Link>
        <button type="button" onClick={() => onSelect(candidate)}>{text.select}</button></div>
    </div>
  </li>;
}

export function ScannerResults({ result, onSelect }: { result: MatchResult; onSelect: (candidate: ScanCandidate) => void }) {
  const { dictionary } = useLocale(); const text = dictionary.scanner;
  const notices = new Set(result.warnings.map((warning) => Object.hasOwn(text.warnings, warning)
    ? text.warnings[warning as keyof typeof text.warnings] : text.genericWarning));
  if (result.limited) notices.add(text.limited);
  const [leading, ...alternatives] = result.candidates;
  const ambiguous = leading?.quality !== "strong" || alternatives.some((candidate) => candidate.quality === "strong") ||
    result.warnings.some((warning) => ["conflicting_clues", "visual_ambiguous", "visual_conflict"].includes(warning));
  const [showAlternatives, setShowAlternatives] = useState(ambiguous);
  return <section className="scanner-results" aria-labelledby="scanner-candidates">
    <h2 id="scanner-candidates">{text.candidates}</h2>
    {notices.size > 0 && <ul className="scanner-notices" aria-live="polite">{[...notices].map((notice) => <li key={notice}>{notice}</li>)}</ul>}
    {result.status === "matches" ? <><p>{text.candidatesHint}</p><p className="scanner-hint">{text.qualityNote}</p><p id="scanner-details-hint" className="scanner-hint">{text.detailsNewTab}</p>
      <ul className="scanner-candidates" aria-label={text.candidates}><Candidate candidate={leading} leading onSelect={onSelect} /></ul>
      {alternatives.length > 0 && <details className="scanner-alternatives" open={showAlternatives} onToggle={(event) => setShowAlternatives(event.currentTarget.open)}>
        <summary>{text.alternatives.replace("{count}", String(alternatives.length))}</summary>
        {showAlternatives && <ul className="scanner-candidates">{alternatives.map((candidate) => <Candidate key={candidate.card.id} candidate={candidate} onSelect={onSelect} />)}</ul>}
      </details>}</> : <p role="status">{result.status === "no_match" ? text.noMatch : text.insufficient}</p>}
  </section>;
}
