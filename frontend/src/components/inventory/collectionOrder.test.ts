import { expect, test } from "vitest";
import { orderCopies } from "./collectionOrder";
import { pikachuCard } from "../../test/tcgFixtures";
import type { InventoryCopy } from "../../services/inventory";
const copies = [
  { id: "1", card_id: "a-1", created_at: "2026-11-23T12:00:00Z" },
  { id: "2", card_id: "b-1", created_at: "2026-11-24T12:00:00Z" },
  { id: "3", card_id: "c-1", created_at: "2026-11-25T12:00:00Z" },
] as InventoryCopy[];
const names = {
  "a-1": { ...pikachuCard, name: "Árbol", set: { ...pikachuCard.set, name: "Zeta" } },
  "b-1": { ...pikachuCard, name: "Bulbasaur", set: { ...pikachuCard.set, name: "Alfa" } },
};
test("recent order works without metadata and never mutates the input", () => {
  expect(orderCopies(copies, {}, "recent", "es").map((c) => c.id)).toEqual(["3", "2", "1"]);
  expect(copies.map((c) => c.id)).toEqual(["1", "2", "3"]);
});
test("name and expansion order use available localized labels with missing names last", () => {
  expect(orderCopies(copies, names, "name", "es").map((c) => c.id)).toEqual(["1", "2", "3"]);
  expect(orderCopies(copies, names, "set", "es").map((c) => c.id)).toEqual(["2", "1", "3"]);
});
