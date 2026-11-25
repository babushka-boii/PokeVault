import { type KeyboardEvent, type RefCallback } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { BinderPocket } from "../../services/binders";
import type { TcgCard } from "../../services/cards";
import type { CopyPrice } from "../../services/prices";
import { CardArtwork } from "../cards/CardArtwork";
import { formatMoney } from "../prices/format";
import { copyLabel, fill } from "./labels";

export type PocketRef = { page: number; pocket: number };
const same = (a: PocketRef | null, b: PocketRef) => !!a && a.page === b.page && a.pocket === b.pocket;

export function PocketPrice({ price }: { price?: CopyPrice }) {
  const { locale } = useLocale();
  const quote = price?.price;
  if (!quote) return null;
  const text = quote.amount !== null ? formatMoney(quote.amount, quote.currency, locale) : formatMoney(quote.original_amount, quote.original_currency, locale, true);
  return <span className="pv-pocket__price price-amount">{text}</span>;
}

/**
 * One 3×3 page. Pockets are buttons in a roving-tabindex grid: arrows move focus and the
 * selection within the page (onSelect); a click, Enter or Space activates (onActivate); Page Up / Page Down ask the binder view to turn the page. Names carry card,
 * expansion, page and pocket, never a UUID. Card images are decorative. A pocket shows only
 * the card name on one line; price, page and pocket and the rest live in its contextual menu.
 */
export function PageGrid({ page, pockets, cards, selected, arrived, incoming, targetable, onSelect, onActivate, onTurn, register }: {
  page: number; pockets: BinderPocket[]; cards: Record<string, TcgCard>;
  selected: PocketRef | null; arrived: PocketRef | null; incoming: PocketRef | null; targetable: boolean;
  onSelect: (target: PocketRef) => void; onActivate: (target: PocketRef) => void; onTurn: (direction: 1 | -1) => void;
  register: (target: PocketRef) => RefCallback<HTMLButtonElement>;
}) {
  const { dictionary } = useLocale();
  const text = dictionary.binders;
  const byPocket = new Map(pockets.filter((p) => p.page === page).map((p) => [p.pocket, p]));
  const focusPocket = selected && selected.page === page ? selected.pocket : 1;

  function keyDown(event: KeyboardEvent, pocket: number) {
    if (event.key === "PageDown" || event.key === "PageUp") { event.preventDefault(); onTurn(event.key === "PageDown" ? 1 : -1); return; }
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
    const next = event.key === "Home" ? 1 : event.key === "End" ? 9 : event.key in offsets ? pocket + offsets[event.key] : undefined;
    if (next === undefined) return;
    event.preventDefault();
    if (next < 1 || next > 9) return;
    onSelect({ page, pocket: next });  // arrows only move focus: never a placement
  }

  return <section className="pv-page" aria-label={fill(text.page, { page })}>
    <div className="pv-page__grid" role="grid" aria-label={fill(text.page, { page })} aria-rowcount={3} aria-colcount={3}>
      {[0, 1, 2].map((row) => <div role="row" className="pv-page__row" key={row}>
        {[1, 2, 3].map((column) => {
          const pocket = row * 3 + column;
          const held = byPocket.get(pocket);
          const card = held ? cards[held.copy.card_id] : undefined;
          const target = { page, pocket };
          const label = held ? fill(text.pocketName, { page, pocket, card: copyLabel(held.copy, card, dictionary) }) : fill(text.pocketEmpty, { page, pocket });
          return <div role="gridcell" key={pocket} aria-selected={same(selected, target)}>
            <button type="button" ref={register(target)} className={`pv-pocket${held ? "" : " pv-pocket--empty"}${targetable && !held ? " pv-pocket--target" : ""}`}
              aria-label={label} tabIndex={focusPocket === pocket ? 0 : -1}
              data-arrived={same(arrived, target) ? "true" : undefined}
              data-incoming={same(incoming, target) ? "true" : undefined}
              onClick={() => onActivate(target)} onKeyDown={(event) => keyDown(event, pocket)}>
              {/* A real sleeve: the card sits behind a front plastic (with its top edge) that shines. */}
              <span className="pv-pocket__sleeve" aria-hidden="true">
                {held ? <span className="pv-pocket__card">
                  {card ? <CardArtwork card={card} /> : <span className="pv-pocket__fallback">{held.copy.card_id}</span>}
                </span> : <span className="pv-pocket__number">{pocket}</span>}
                <span className="pv-pocket__front"><span className="pv-pocket__shine" /></span>
              </span>
              {held && <span className="pv-pocket__caption" aria-hidden="true">
                <span className="pv-pocket__name">{card?.name ?? held.copy.card_id}</span>
              </span>}
            </button>
          </div>;
        })}
      </div>)}
    </div>
  </section>;
}
