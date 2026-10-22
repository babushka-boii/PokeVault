import { afterEach, expect, test, vi } from "vitest";
import { fetchPokemonCards, fetchTcgCard, isCardId, isSetId, safeReturnTo } from "./cards";
import { jsonResponse, pikachuCard, tcgPage } from "../test/tcgFixtures";

afterEach(() => vi.unstubAllGlobals());

test.each(["sm9-33", "sv03.5-001", "base1-44"])("accepts real stable card identifiers: %s", (id) => {
  expect(isCardId(id)).toBe(true);
});

test.each(["sv..1-1", "sv1-", "sv1.", ".sv1", "sv1/1", "sv1_1", "a".repeat(101)])("rejects identifiers the backend cannot serve: %s", (id) => {
  expect(isCardId(id)).toBe(false);
  expect(isSetId(id)).toBe(false);
});

test("allows the backend's maximum expansion identifier length", () => {
  expect(isSetId("a".repeat(100))).toBe(true);
});

test.each([
  "/boxes?box=19&pokemon=559&wallpaper=ocean",
  "/pokedex",
  "/pokemon/25/cards?page=2&sort=id&set_id=sm9&returnTo=%2Fpokedex",
])("preserves allowed return destinations: %s", (destination) => {
  expect(safeReturnTo(destination)).toBe(destination);
});

test.each([null, "https://evil.example", "//evil.example", "/\\evil.example", "/profile", "/pokemon/0/cards", "/pokemon/1026/cards", "/pokemon/25/cards/extra", "/boxes#oops", "/boxes?x=\n", `/boxes?x=${"a".repeat(2048)}`])("rejects unsafe or unsupported return destination: %s", (destination) => {
  expect(safeReturnTo(destination)).toBe("/pokedex");
});

test.each([
  tcgPage([pikachuCard], { page: 2 }),
  tcgPage([pikachuCard], { page_size: 24 }),
  tcgPage([{ ...pikachuCard, category: "Trainer" }]),
  tcgPage([{ ...pikachuCard, dex_ids: [644] }]),
  tcgPage([pikachuCard, pikachuCard]),
])("rejects a gallery response that disagrees with its request", async (response) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));
  await expect(fetchPokemonCards(25, "es", { page: 1, sort: "name" })).rejects.toThrow();
});

test("rejects cards from a different expansion than requested", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(tcgPage())));
  await expect(fetchPokemonCards(25, "es", { page: 1, sort: "id", setId: "base1" })).rejects.toThrow();
});

test("preserves unnamed attacks with numeric zero damage and verified fallback language", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...pikachuCard,
    attacks: [{ name: null, cost: [], damage: 0, effect: null }],
    abilities: [{ name: null, type: null, effect: null }],
  })));
  const card = await fetchTcgCard("sm9-33", "es");
  expect(card.attacks[0].name).toBeNull();
  expect(card.attacks[0].damage).toBe(0);
  expect(card.language).toBe("en");
});

test("rejects mismatched card identity and unverified content language", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({ ...pikachuCard, id: "sm9-34" }))
    .mockResolvedValueOnce(jsonResponse({ ...pikachuCard, available_languages: ["es"] })));
  await expect(fetchTcgCard("sm9-33", "es")).rejects.toThrow();
  await expect(fetchTcgCard("sm9-33", "es")).rejects.toThrow();
});

test("preserves a provider's numeric zero HP instead of rejecting the entire card", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...pikachuCard, hp: 0 })));
  await expect(fetchTcgCard("sm9-33", "en")).resolves.toMatchObject({ hp: 0 });
});

test("accepts official expansion dates, image languages and defensive card traits", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...pikachuCard,
    image_language: "en", image_sources: [{ base_url: "https://assets.tcgdex.net/en/sm/sm9/33", language: "en" }],
    set: { ...pikachuCard.set, release_date: "2019-02-01", logo_url: "https://assets.tcgdex.net/en/sm/sm9/logo.png",
      logo_sources: [{ url: "https://assets.tcgdex.net/en/sm/sm9/logo.png", language: "en" }],
      symbol_url: null, name_language: "en", serie: { id: "sm", name: "Sun & Moon" } },
    weaknesses: [{ type: "Fighting", value: "×2" }], resistances: [], retreat: 3, regulation_mark: null,
  })));
  const card = await fetchTcgCard("sm9-33", "es");
  expect(card.set.release_date).toBe("2019-02-01");
  expect(card.image_language).toBe("en");
  expect(card.weaknesses).toEqual([{ type: "Fighting", value: "×2" }]);
});

test.each([
  { image_sources: [{ base_url: "https://evil.example/card", language: "en" }] },
  { image_sources: [{ base_url: "https://assets.tcgdex.net:444/card", language: "en" }] },
  { image_language: "fr" },
  { retreat: -1 },
  { weaknesses: [{ type: "Fighting", value: 2 }] },
  { set: { ...pikachuCard.set, release_date: "2026-02-30" } },
])("rejects malformed new artwork, expansion or battle metadata", async (changes) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ...pikachuCard, ...changes })));
  await expect(fetchTcgCard("sm9-33", "es")).rejects.toThrow();
});
