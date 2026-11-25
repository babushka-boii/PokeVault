import { fetchInventory, type InventoryCopy } from "./inventory";
export const COLLECTION_COPY_LIMIT = 500;
/** A bounded snapshot, newest first; concurrent inserts are deduplicated by copy identity. */
export async function fetchCollectionCopies(signal: AbortSignal) {
  const copies = new Map<string, InventoryCopy>();
  let total = 0;
  for (let offset = 0; offset < COLLECTION_COPY_LIMIT; offset += 24) {
    signal.throwIfAborted();
    const page = await fetchInventory({ offset, card_id: "", condition: "", language: "", variant: "" }, signal);
    total = page.total;
    for (const copy of page.results.slice(0, COLLECTION_COPY_LIMIT - offset)) copies.set(copy.id, copy);
    if (offset + 24 >= total || page.results.length < 24) break;
  }
  signal.throwIfAborted();
  return { results: [...copies.values()], total };
}
