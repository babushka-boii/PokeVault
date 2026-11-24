import type { Dictionary } from "../../i18n/dictionaries";
import type { TcgCard } from "../../services/cards";
import type { InventoryCopy } from "../../services/inventory";

/** "Pikachu · Team Up", or the card id when metadata is missing. Never the copy UUID. */
export function cardIdentity(copy: InventoryCopy, card?: TcgCard): string {
  return card ? `${card.name} · ${card.set.name}` : copy.card_id;
}

/** Identity plus the physical facts that tell duplicate copies apart. */
export function copyLabel(copy: InventoryCopy, card: TcgCard | undefined, dictionary: Dictionary): string {
  const inventory = dictionary.inventory;
  return `${cardIdentity(copy, card)}; ${inventory.variants[copy.variant]}, ${inventory.conditions[copy.condition]}`;
}

export function fill(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce((text, [key, value]) => text.split(`{${key}}`).join(String(value)), template);
}

export function plural(entry: { one: string; other: string }, count: number): string {
  return fill(count === 1 ? entry.one : entry.other, { count });
}
