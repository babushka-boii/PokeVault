import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { fetchSets, type SetPage, type SetSummary } from "../../services/sets";

export function ExpansionSearch({ onSelect, suspended = false }: { onSelect: (set: SetSummary) => void; suspended?: boolean }) {
  const { dictionary, locale } = useLocale(); const text = dictionary.scanner; const id = useId();
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SetPage | null>(null);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {
    if (suspended && pending.current) {
      pending.current.abort(); pending.current = null; setBusy(false);
    }
  }, [suspended]);
  const invalidate = () => { pending.current?.abort(); pending.current = null; setBusy(false); setResults(null); setFailed(false); };
  return <form className="scanner-expansion-search" role="search" onSubmit={(event) => {
    event.preventDefault(); if (suspended) return; invalidate(); const controller = new AbortController(); pending.current = controller; setBusy(true);
    void fetchSets(locale, { page: 1, q: query.trim(), seriesId: "", sort: "newest" }, controller.signal).then((page) => {
      if (!controller.signal.aborted) setResults(page);
    }, () => { if (!controller.signal.aborted) setFailed(true); }).finally(() => { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } });
  }}>
    <div className="scanner-expansion-controls"><label htmlFor={`${id}-query`}>{text.expansionSearch}</label>
      <input id={`${id}-query`} type="search" maxLength={100} value={query} onChange={(event) => { invalidate(); setQuery(event.target.value); }} />
      <button type="submit">{text.findExpansion}</button></div>
    {busy && <p role="status">{text.expansionLoading}</p>}
    {failed && <p role="alert">{text.expansionError}</p>}
    {results && (results.results.length ? <><ul className="scanner-expansions" aria-label={text.expansionResults}>{results.results.map((set) => <li key={set.id}>
      <button type="button" onClick={() => { onSelect(set); setResults(null); }}><span lang={set.name_language}>{set.name}</span> · {set.id}</button>
    </li>)}</ul>{results.total > results.results.length && <p>{text.expansionMore}</p>}</> : <p role="status">{text.expansionEmpty}</p>)}
  </form>;
}
