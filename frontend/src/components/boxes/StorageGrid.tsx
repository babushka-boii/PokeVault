import { useEffect, useRef, type KeyboardEvent } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { BOX_SIZE, type Pokemon } from "../../services/pokemon";
import { MenuIcon } from "./MenuIcon";
import type { SpriteMode } from "../../services/menuIcons";
import { dexNumber, pokemonName } from "./pokemonLabels";

export function StorageGrid({ pokemon, selected, select, focusRequest, onFocused, spriteMode = "static" }: {
  pokemon: Pokemon[]; selected: number; select: (index: number) => void;
  spriteMode?: SpriteMode;
  focusRequest?: number; onFocused?: () => void;
}) {
  const { dictionary } = useLocale();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (focusRequest && pokemon[selected] && buttons.current[selected]) {
      buttons.current[selected]?.focus();
      onFocused?.();
    }
  }, [focusRequest, pokemon, selected, onFocused]);
  function navigate(event: KeyboardEvent, index: number) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
    let next = index;
    if (event.key in offsets) next += offsets[event.key];
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = pokemon.length - 1;
    else return;
    event.preventDefault();
    if (next < 0 || next >= pokemon.length) return;
    select(next);
    buttons.current[next]?.focus();
  }
  return <div className="pc-grid" role="grid" aria-label={dictionary.boxes.slots} aria-rowcount={5} aria-colcount={6}>
    {Array.from({ length: 5 }, (_, row) => <div role="row" className="pc-row" key={row}>
      {Array.from({ length: BOX_SIZE / 5 }, (_, column) => {
        const index = row * 6 + column;
        const item = pokemon[index];
        return <div role="gridcell" key={index} aria-selected={!!item && selected === index}>
          {item ? <button type="button" className="pc-slot" tabIndex={selected === index ? 0 : -1}
            aria-label={`${dexNumber(item)} ${pokemonName(item)}`}
            ref={(node) => { buttons.current[index] = node; }}
            onClick={() => select(index)} onKeyDown={(event) => navigate(event, index)}>
            <MenuIcon pokemon={item} mode={spriteMode} />
          </button> : <span className="pc-slot pc-slot--empty" aria-label={`${dictionary.boxes.emptySlot} ${index + 1}`}>·</span>}
        </div>;
      })}
    </div>)}
  </div>;
}
