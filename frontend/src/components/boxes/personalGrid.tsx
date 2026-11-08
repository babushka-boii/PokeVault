import { useEffect, useRef, type KeyboardEvent } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { InventoryCopy } from "../../services/inventory";
import type { TcgCard } from "../../services/cards";
import type { SpriteMode } from "../../services/menuIcons";
import { MenuIcon } from "./MenuIcon";

export function PersonalIcon({ card, mode }: { card?: TcgCard; mode: SpriteMode }) {
  const { dictionary } = useLocale();
  if (!card) return <span className="pc-missing" aria-label={dictionary.cards.unavailable}>◇</span>;
  if (card.category !== "Pokemon") return <span className={`pc-category pc-category--${card.category.toLowerCase()}`}>
    {dictionary.cards[card.category === "Trainer" ? "categoryTrainer" : "categoryEnergy"]}</span>;
  if (!card.dex_ids.length) return <span className="pc-missing" aria-label={dictionary.personalBoxes.noSpecies}>◇</span>;
  return <span className={`pc-personal-icons${card.dex_ids.length > 1 ? " pc-personal-icons--multiple" : ""}`}>
    {card.dex_ids.map((id) => <MenuIcon key={id} pokemon={{ national_dex_number: id }} mode={mode} />)}
  </span>;
}

export function PersonalGrid({ slots, selected, select, cards, mode, disabled, focusRequest, onFocused }: {
  slots: { position: number; copy: InventoryCopy }[]; selected: number; select: (position: number) => void;
  cards: Record<string, TcgCard>; mode: SpriteMode; disabled: boolean; focusRequest?: boolean; onFocused?: () => void;
}) {
  const { dictionary } = useLocale();
  const text = dictionary.personalBoxes;
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (focusRequest && !disabled) { buttons.current[selected]?.focus(); onFocused?.(); }
  }, [focusRequest, selected, disabled, onFocused]);
  function navigate(event: KeyboardEvent, index: number) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -6, ArrowDown: 6 };
    const next = event.key === "Home" ? 0 : event.key === "End" ? 29 : event.key in offsets ? index + offsets[event.key] : undefined;
    if (next === undefined) return; event.preventDefault();
    if (next < 0 || next >= 30) return;
    select(next); buttons.current[next]?.focus();
  }
  return <div className="pc-grid" role="grid" aria-label={text.slots} aria-rowcount={5} aria-colcount={6}>
    {Array.from({ length: 5 }, (_, row) => <div role="row" className="pc-row" key={row}>
      {Array.from({ length: 6 }, (_, col) => {
        const position = row * 6 + col; const copy = slots.find((s) => s.position === position)?.copy;
        const card = copy && cards[copy.card_id];
        const label = copy ? `${text.position} ${position + 1}: ${card?.name ?? copy.card_id}; ${copy.card_id}; ${copy.id}; ${dictionary.inventory.languages[copy.language]}, ${dictionary.inventory.variants[copy.variant]}, ${dictionary.inventory.conditions[copy.condition]}` : `${dictionary.boxes.emptySlot} ${position + 1}`;
        return <div key={position} role="gridcell" aria-selected={selected === position}>
          <button type="button" className={`pc-slot${copy ? "" : " pc-slot--empty"}`} aria-label={label} disabled={disabled}
            tabIndex={selected === position ? 0 : -1} ref={(node) => { buttons.current[position] = node; }}
            onClick={() => select(position)} onKeyDown={(event) => navigate(event, position)}>
            {copy ? <><PersonalIcon card={card} mode={mode} /><span className="pc-copy-marker">{position + 1}</span></> : "·"}
          </button>
        </div>;
      })}
    </div>)}
  </div>;
}
