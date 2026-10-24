import { useEffect, useId, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { CardSet } from "../../services/cards";
import { setLogoCandidates } from "../../services/setImages";
import { SetLogo } from "./SetLogo";

type Props = { sets: CardSet[]; selectedId: string; status: "loading" | "loaded" | "error"; onSelect: (id: string) => void; onRetry: () => void };

export function ExpansionSelector({ sets, selectedId, status, onSelect, onRetry }: Props) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.cards;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [failedLogos, setFailedLogos] = useState<string[]>([]);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const id = useId();
  const selected = sets.find((set) => set.id === selectedId);
  const signature = sets.map((set) => `${set.id}:${setLogoCandidates(set).join("|")}`).join(";");
  const [previousSignature, setPreviousSignature] = useState(signature);
  if (signature !== previousSignature) {
    setPreviousSignature(signature);
    setFailedLogos([]);
  }

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close(restoreFocus = true) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }
  function select(setId: string) { onSelect(setId); close(); }
  const query = search.trim().toLocaleLowerCase(locale);
  const matches = sets.filter((set) => `${set.name} ${set.serie?.name ?? ""} ${set.release_date?.slice(0, 4) ?? ""}`.toLocaleLowerCase(locale).includes(query));
  const hasLogo = (set: CardSet) => setLogoCandidates(set).length > 0 && !failedLogos.includes(set.id);
  const groups = [
    { name: text.expansion, sets: matches.filter(hasLogo) },
    { name: text.otherExpansions, sets: matches.filter((set) => !hasLogo(set)) },
  ];

  return <div className="tcg-expansion-selector" ref={container} onBlur={(event) => {
    if (open && event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close(false);
  }}>
    <span className="tcg-filter-label" id={`${id}-label`}>{text.expansion}</span>
    <button className="tcg-expansion-trigger" type="button" ref={trigger} aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-dialog` : undefined} onClick={() => { setSearch(""); setOpen((value) => !value); }}>
      {selected && <SetLogo set={selected} decorative />}
      <span id={`${id}-value`} lang={selected?.name_language ?? undefined}>{selected?.name ?? (selectedId ? text.set : text.allExpansions)}</span>
      <span className="tcg-expansion-chevron" aria-hidden="true">⌄</span>
    </button>
    {open && <div id={`${id}-dialog`} className="tcg-expansion-popover" role="dialog" aria-label={text.chooseExpansion} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
    }}>
      <div className="tcg-expansion-search"><label className="tcg-sr-only" htmlFor={`${id}-search`}>{text.searchExpansion}</label>
        <input id={`${id}-search`} type="search" ref={searchInput} placeholder={text.searchExpansion} value={search} onChange={(event) => setSearch(event.target.value)} />
        <button type="button" className="tcg-expansion-close" aria-label={text.close} onClick={() => close()}>×</button>
      </div>
      {status === "loading" && <p role="status">{text.expansionsLoading}</p>}
      {status === "error" && <div><p role="alert">{text.expansionsError}</p><button type="button" onClick={onRetry}>{text.retry}</button></div>}
      {status === "loaded" && <div className="tcg-expansion-options">
        <button type="button" className="tcg-expansion-option tcg-expansion-all" aria-pressed={!selectedId} onClick={() => select("")}><span>{text.allExpansions}</span>{!selectedId && <span aria-hidden="true">✓</span>}</button>
        {groups.map((group) => group.sets.length > 0 && <section role="group" aria-label={group.name} key={group.name}>
          <h3>{group.name}</h3>
          {group.sets.map((set) => <button type="button" className="tcg-expansion-option" key={set.id} aria-label={set.name} aria-pressed={selectedId === set.id} onClick={() => select(set.id)}>
            {failedLogos.includes(set.id) ? <span className="tcg-set-logo tcg-set-logo--missing" aria-hidden="true">◇</span> : <SetLogo set={set} onUnavailable={() => setFailedLogos((current) => current.includes(set.id) ? current : [...current, set.id])} />}
            <span className="tcg-expansion-name"><strong lang={set.name_language ?? undefined}>{set.name}</strong>
              <small>{[set.serie?.name, set.release_date?.slice(0, 4)].filter(Boolean).join(" · ")}</small></span>
            {selectedId === set.id && <span aria-hidden="true">✓</span>}
          </button>)}
        </section>)}
        {matches.length === 0 && <p role="status">{text.noExpansions}</p>}
      </div>}
    </div>}
  </div>;
}
