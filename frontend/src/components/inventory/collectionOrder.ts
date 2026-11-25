import type { TcgCard } from "../../services/cards";
import type { InventoryCopy } from "../../services/inventory";
import type { Locale } from "../../i18n/LocaleProvider";
export type CollectionOrder = "recent" | "name" | "set";
export function orderCopies(copies: InventoryCopy[], cards: Record<string, TcgCard>, order: CollectionOrder, locale: Locale) {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  return [...copies].sort((a, b) => {
    if (order !== "recent") {
      const first = order === "name" ? cards[a.card_id]?.name : cards[a.card_id]?.set.name;
      const second = order === "name" ? cards[b.card_id]?.name : cards[b.card_id]?.set.name;
      if (!!first !== !!second) return first ? -1 : 1;
      if (first && second) { const compared = collator.compare(first, second); if (compared) return compared; }
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
