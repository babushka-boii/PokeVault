import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { searchPokemon, type SpeciesMatch } from "../../services/pokemon";
import { dexNumber, pokemonName } from "./pokemonLabels";

type SearchState = { kind: "loading" } | { kind: "error" } |
  { kind: "loaded"; matches: SpeciesMatch[] };

export function BoxSearch({ choose, sound }: {
  choose: (match: SpeciesMatch) => void; sound: (kind: "select" | "back") => void;
}) {
  const { dictionary: { boxSearch: text } } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ query: string; state: SearchState }>();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const options = useRef<(HTMLLIElement | null)[]>([]);
  const normalized = query.trim();
  const state: SearchState = result?.query === normalized ? result.state : { kind: "loading" };
  const matches = state.kind === "loaded" ? state.matches : [];

  useEffect(() => {
    if (!open || !normalized || normalized.length > 40) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPokemon(normalized, controller.signal).then(
        (matches) => {
          if (!controller.signal.aborted) setResult({ query: normalized, state: { kind: "loaded", matches } });
        },
        () => {
          if (!controller.signal.aborted) setResult({ query: normalized, state: { kind: "error" } });
        },
      );
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, normalized, attempt]);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { options.current[active]?.scrollIntoView?.({ block: "nearest" }); }, [active]);

  function close() {
    setOpen(false); setQuery(""); setResult(undefined); setActive(-1);
  }
  function select(match: SpeciesMatch) {
    close(); choose(match);
  }
  function change(value: string) {
    setQuery(value); setActive(-1);
    if (value.trim() !== normalized) setResult(undefined);
  }
  return <div className="pc-search" onKeyDown={(event) => {
    if (open && event.key === "Escape") {
      event.preventDefault(); close(); sound("back"); trigger.current?.focus();
    }
  }}>
    <button type="button" ref={trigger} className="pc-search-trigger" aria-label={text.open}
      aria-expanded={open} aria-controls={open ? `${listId}-panel` : undefined}
      onClick={() => { if (open) close(); else { setOpen(true); sound("select"); } }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
        <circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" />
      </svg>
    </button>
    {open && <div className="pc-search-panel" id={`${listId}-panel`}>
      <label htmlFor={`${listId}-input`}>{text.label}</label>
      <div className="pc-search-field">
        <input ref={input} id={`${listId}-input`} role="combobox"
          type="text" autoComplete="off" maxLength={40} value={query} placeholder={text.placeholder}
          aria-autocomplete="list" aria-expanded={!!normalized && state.kind === "loaded" && !!matches.length}
          aria-controls={listId} aria-activedescendant={active >= 0 && matches[active] ? `${listId}-${active}` : undefined}
          onChange={(event) => change(event.target.value)} onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (matches.length) setActive((index) => index < 0 ? (event.key === "ArrowDown" ? 0 : matches.length - 1) : (index + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (matches.length) select(matches[active >= 0 ? active : 0]);
            }
          }} />
        <button type="button" aria-label={text.clear} onClick={() => { change(""); input.current?.focus(); }}>×</button>
      </div>
      {!normalized && <p>{text.hint}</p>}
      {!!normalized && state.kind === "loading" && <p role="status">{text.loading}</p>}
      {!!normalized && state.kind === "error" && <div><p role="alert">{text.error}</p>
        <button type="button" onClick={() => { setResult(undefined); setAttempt((value) => value + 1); }}>{text.retry}</button></div>}
      {!!normalized && state.kind === "loaded" && !matches.length && <p role="status">{text.empty}</p>}
      <ul role="listbox" id={listId} aria-label={text.results}>
        {matches.map((match, index) => <li key={match.national_dex_number} id={`${listId}-${index}`} role="option"
          ref={(node) => { options.current[index] = node; }} aria-selected={active === index} onMouseDown={(event) => event.preventDefault()}
          onClick={() => select(match)}>
          <span>{dexNumber(match)}</span> {pokemonName(match)}
        </li>)}
      </ul>
    </div>}
  </div>;
}
