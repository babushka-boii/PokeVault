import { afterEach, describe, expect, test, vi } from "vitest";
import { rates, valuation } from "../test/priceFixtures";
import { bulbasaurCard, jsonResponse as json, pikachuCard, tcgPage } from "../test/tcgFixtures";
import { safeReturnTo } from "./cards";
import {
  animatedSpriteUrl, artworkUrl, GENERATIONS, generationOf, normalizeName, searchSpecies, spriteUrl, type SpeciesRow,
} from "./pokemon";
import { fetchSpeciesCards, fetchSpeciesCollection, fetchSpeciesCounts, fetchSpeciesIndex } from "./species";

afterEach(() => vi.unstubAllGlobals());
const signal = () => new AbortController().signal;
const calls = (request: ReturnType<typeof vi.fn>) => request.mock.calls as unknown as [string, RequestInit][];

const row = (n: number, extra: Partial<SpeciesRow> = {}): SpeciesRow => ({ national_dex_number: n, name_en: `Species ${n}`, name_es: `Especie ${n}`, types: ["normal"], ...extra });
const index = (change: (rows: SpeciesRow[]) => void = () => undefined) => { const rows = Array.from({ length: 1025 }, (_, n) => row(n + 1)); change(rows); return { results: rows }; };

describe("generations and image addresses", () => {
  test("nine fixed ranges cover 1..1025 once, in order", () => {
    expect(GENERATIONS).toHaveLength(9);
    expect(GENERATIONS.map((generation) => generation.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(GENERATIONS[0]).toMatchObject({ roman: "I", from: 1, to: 151, region: { es: "Kanto", en: "Kanto" } });
    expect(GENERATIONS[4]).toMatchObject({ roman: "V", from: 494, to: 649, region: { es: "Teselia", en: "Unova" } });
    expect(GENERATIONS[8]).toMatchObject({ roman: "IX", from: 906, to: 1025, region: { es: "Paldea", en: "Paldea" } });
    GENERATIONS.forEach((generation, position) => { if (position > 0) expect(generation.from).toBe(GENERATIONS[position - 1].to + 1); });
    expect(GENERATIONS.reduce((total, generation) => total + generation.to - generation.from + 1, 0)).toBe(1025);
  });

  test.each([[1, 1], [151, 1], [152, 2], [251, 2], [252, 3], [649, 5], [650, 6], [905, 8], [906, 9], [1025, 9]])("species %i belongs to generation %i", (number, generation) => {
    expect(generationOf(number).id).toBe(generation);
  });

  test("a number outside the Pokédex has no generation", () => {
    for (const bad of [0, 1026, -1, 1.5, Number.NaN]) expect(() => generationOf(bad)).toThrow();
  });

  test("sprite, animated sprite and artwork addresses come only from a valid number", () => {
    const host = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";
    expect(spriteUrl(25)).toBe(`${host}/25.png`);
    expect(artworkUrl(25)).toBe(`${host}/other/official-artwork/25.png`);
    expect(animatedSpriteUrl(25)).toBe(`${host}/versions/generation-v/black-white/animated/25.gif`);
    expect(animatedSpriteUrl(649)).toBe(`${host}/versions/generation-v/black-white/animated/649.gif`);
    expect(animatedSpriteUrl(650)).toBeNull();               // no animated sprite after generation V
    expect(animatedSpriteUrl(1025)).toBeNull();
    for (const bad of [0, 1026, 1.5, -3, Number.NaN]) {
      expect(() => spriteUrl(bad)).toThrow();
      expect(() => artworkUrl(bad)).toThrow();
      expect(() => animatedSpriteUrl(bad)).toThrow();
    }
  });
});

describe("the species index", () => {
  test("is requested once, validated and kept in number order", async () => {
    const request = vi.fn(async () => json(index()));
    vi.stubGlobal("fetch", request);
    const rows = await fetchSpeciesIndex(signal());
    expect(rows).toHaveLength(1025);
    expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/pokemon/index");
    expect(calls(request)[0][1]).not.toHaveProperty("credentials");        // public data: no cookies
  });

  test.each([
    ["too few species", (rows: SpeciesRow[]) => { rows.pop(); }],
    ["a repeated number", (rows: SpeciesRow[]) => { rows[5] = row(5); }],
    ["numbers out of order", (rows: SpeciesRow[]) => { rows.reverse(); }],
    ["an unknown type", (rows: SpeciesRow[]) => { rows[3] = row(4, { types: ["shadow" as never] }); }],
    ["no types", (rows: SpeciesRow[]) => { rows[3] = row(4, { types: [] }); }],
    ["three types", (rows: SpeciesRow[]) => { rows[3] = row(4, { types: ["fire", "water", "grass"] }); }],
    ["a repeated type", (rows: SpeciesRow[]) => { rows[3] = row(4, { types: ["fire", "fire"] }); }],
    ["an empty name", (rows: SpeciesRow[]) => { rows[3] = row(4, { name_es: " " }); }],
    ["a name that is not text", (rows: SpeciesRow[]) => { rows[3] = row(4, { name_en: 4 as never }); }],
    ["an extra key", (rows: SpeciesRow[]) => { rows[3] = { ...row(4), extra: 1 } as never; }],
  ])("rejects %s", async (_name, change) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(index(change))));
    await expect(fetchSpeciesIndex(signal())).rejects.toBeInstanceOf(Error);
  });

  test("a failed request is an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 500)));
    await expect(fetchSpeciesIndex(signal())).rejects.toBeInstanceOf(Error);
  });
});

describe("searching the index", () => {
  const rows = [row(1, { name_en: "Bulbasaur", name_es: "Bulbasaur" }), row(29, { name_en: "Nidoran♀", name_es: "Nidoran♀" }), row(32, { name_en: "Nidoran♂", name_es: "Nidoran♂" }),
    row(83, { name_en: "Farfetch'd", name_es: "Farfetch'd" }), row(122, { name_en: "Mr. Mime", name_es: "Mr. Mime" }), row(669, { name_en: "Flabébé", name_es: "Flabébé" }), row(25, { name_en: "Pikachu", name_es: "Pikachu" }), row(26, { name_en: "Raichu", name_es: "Raichu" }),
    row(1024, { name_en: "Terapagos", name_es: "Terapagos" }), row(559, { name_en: "Scraggy", name_es: "Scraggy" })];
  const numbers = (query: string, limit?: number) => searchSpecies(rows, query, limit).map((match) => match.national_dex_number);

  test("finds by name (any case or accents), by number and by #number", () => {
    expect(numbers("scraggy")).toEqual([559]);
    expect(numbers("SCRAG")).toEqual([559]);
    expect(numbers("559")).toEqual([559]);
    expect(numbers("#559")).toEqual([559]);
    expect(numbers("  Scraggy ")).toEqual([559]);
    expect(numbers("flabebe")).toEqual([669]);
    expect(numbers("mrmime")).toEqual([122]);
    expect(numbers("mr mime")).toEqual([122]);
    expect(numbers("farfetchd")).toEqual([83]);
    expect(numbers("nidoran")).toEqual([29, 32]);
    expect(numbers("nidoranf")).toEqual([29]);
  });

  test("an exact name comes first, then number order, and the limit applies", () => {
    expect(numbers("pikachu")).toEqual([25]);
    expect(numbers("chu")).toEqual([25, 26]);
    expect(numbers("a", 3)).toHaveLength(3);
  });

  test("a number outside the Pokédex, a blank or a miss finds nothing", () => {
    for (const query of ["0", "1026", "#2000", "   ", "", "zzzz", "-"]) expect(numbers(query)).toEqual([]);
  });

  test("names are compared without accents, case or punctuation", () => {
    expect(normalizeName("Mr. Mime")).toBe("mrmime");
    expect(normalizeName("Nidoran♀")).toBe("nidoranf");
    expect(normalizeName("Flabébé")).toBe("flabebe");
    expect(normalizeName("Ho-Oh")).toBe("hooh");
  });
});

describe("species ownership", () => {
  test("counts are requested with the session and validated", async () => {
    const request = vi.fn(async () => json({ counts: { "1": 3, "25": 2 }, species_owned: 2, pending: 0 }));
    vi.stubGlobal("fetch", request);
    expect(await fetchSpeciesCounts(signal())).toEqual({ counts: { 1: 3, 25: 2 }, species_owned: 2, pending: 0 });
    expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/collection/species");
    expect(calls(request)[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  test.each([
    ["a number out of range", { counts: { "0": 1 }, species_owned: 1, pending: 0 }],
    ["a number that is not whole", { counts: { "2.5": 1 }, species_owned: 1, pending: 0 }],
    ["a count that is zero", { counts: { "1": 0 }, species_owned: 1, pending: 0 }],
    ["a count that is not a number", { counts: { "1": "3" }, species_owned: 1, pending: 0 }],
    ["a total that does not match", { counts: { "1": 1 }, species_owned: 2, pending: 0 }],
    ["a negative pending", { counts: {}, species_owned: 0, pending: -1 }],
    ["an extra key", { counts: {}, species_owned: 0, pending: 0, user_id: "x" }],
  ])("counts with %s are rejected", async (_name, body) => {
    vi.stubGlobal("fetch", vi.fn(async () => json(body)));
    await expect(fetchSpeciesCounts(signal())).rejects.toMatchObject({ status: 0 });
  });

  test("a species collection carries copies, cards, value and the catalog total", async () => {
    const body = { national_dex_number: 25, copies: 3, distinct_cards: 2, owned_card_ids: ["sm9-2", "sm9-4"], value: valuation({ copy_count: 3, priced_count: 3, unpriced_count: 0, unpriced_by_reason: {}, top: [] }), catalog_total: 5, pending: 0 };
    const request = vi.fn(async () => json(body));
    vi.stubGlobal("fetch", request);
    const result = await fetchSpeciesCollection(25, "CLP", signal());
    expect(result).toMatchObject({ copies: 3, distinct_cards: 2, catalog_total: 5, pending: 0 });
    expect(calls(request)[0][0]).toBe("http://localhost:8000/api/v1/collection/species/25?currency=CLP");
    await expect(fetchSpeciesCollection(0, "CLP", signal())).rejects.toMatchObject({ status: 404 });
    await expect(fetchSpeciesCollection(1026, "CLP", signal())).rejects.toMatchObject({ status: 404 });
    for (const broken of [
      { ...body, national_dex_number: 26 },
      { ...body, distinct_cards: 3 },                                     // more distinct cards than copies' worth
      { ...body, owned_card_ids: ["sm9-2"] },                             // ids that do not match the count
      { ...body, owned_card_ids: ["bad id", "sm9-4"] },
      { ...body, catalog_total: -1 },
      { ...body, catalog_total: "5" },
      { ...body, copies: 1 },                                             // fewer copies than distinct cards
      { ...body, value: { ...body.value, currency: "USD" } },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => json(broken)));
      await expect(fetchSpeciesCollection(25, "CLP", signal())).rejects.toMatchObject({ status: 0 });
    }
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...body, catalog_total: null })));
    expect((await fetchSpeciesCollection(25, "CLP", signal())).catalog_total).toBeNull();           // honest: unknown
  });
});

describe("a species' cards", () => {
  const page = (cards = [pikachuCard, bulbasaurCard], extra: Record<string, unknown> = {}) => ({ ...tcgPage(cards, { page_size: 12 }), owned_ids: [pikachuCard.id], ...extra });

  test("are requested with their filters and validated, owned ids included", async () => {
    const request = vi.fn(async () => json(page()));
    vi.stubGlobal("fetch", request);
    const result = await fetchSpeciesCards(25, "en", { page: 2, sort: "newest", setId: "sm9", show: "owned" }, signal());
    expect(result.owned_ids).toEqual([pikachuCard.id]);
    const url = new URL(calls(request)[0][0]);
    expect(url.pathname).toBe("/api/v1/collection/species/25/cards");
    expect(Object.fromEntries(url.searchParams)).toEqual({ language: "en", page: "2", page_size: "12", sort: "newest", set_id: "sm9", show: "owned" });
    expect(calls(request)[0][1]).toMatchObject({ credentials: "include", cache: "no-store" });
  });

  test("the public list is used for guests: no cookies and no owned filter", async () => {
    const request = vi.fn(async () => json(tcgPage([pikachuCard], { page_size: 12 })));
    vi.stubGlobal("fetch", request);
    const result = await fetchSpeciesCards(25, "es", { page: 1, sort: "name", show: "all", guest: true }, signal());
    expect(result.owned_ids).toEqual([]);
    expect(new URL(calls(request)[0][0]).pathname).toBe("/api/v1/pokemon/25/cards");
    expect(calls(request)[0][1]).not.toHaveProperty("credentials");
    await expect(fetchSpeciesCards(25, "es", { page: 1, sort: "name", show: "owned", guest: true }, signal())).rejects.toMatchObject({ status: 422 });
  });

  test.each([
    ["an owned id that is not on the page", { owned_ids: ["zz9-9"] }],
    ["a repeated owned id", { owned_ids: [pikachuCard.id, pikachuCard.id] }],
    ["an owned id that is not an identifier", { owned_ids: ["bad id"] }],
    ["owned ids that are not a list", { owned_ids: "all" }],
    ["owned ids missing", { owned_ids: undefined }],
  ])("a page with %s is rejected", async (_name, change) => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ...page(), ...change })));
    await expect(fetchSpeciesCards(25, "en", { page: 1, sort: "name", show: "all" }, signal())).rejects.toBeTruthy();
  });

  test("an out-of-range species never reaches the network", async () => {
    const request = vi.fn(async () => json(page()));
    vi.stubGlobal("fetch", request);
    await expect(fetchSpeciesCards(0, "en", { page: 1, sort: "name", show: "all" }, signal())).rejects.toBeTruthy();
    await expect(fetchSpeciesCards(1026, "en", { page: 1, sort: "name", show: "all" }, signal())).rejects.toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });
});

describe("return targets to a species", () => {
  test.each(["/pokemon/25", "/pokemon/25?show=missing&sort=newest&set_id=sm9", "/pokemon/1025", "/pokemon/25/cards?page=2"])("accepts %s", (target) => {
    expect(safeReturnTo(target)).toBe(target);
  });
  test.each(["/pokemon/0", "/pokemon/1026", "/pokemon/abc", "/pokemon/25/extra", "/pokemon/", "/pokemon/25#x", "//pokemon/25", "/pokemon/25\\x"])("rejects %s", (target) => {
    expect(safeReturnTo(target)).toBe("/pokedex");
  });
  test("the grid with its state is accepted too, with only known keys", () => {
    expect(safeReturnTo("/pokedex?gen=3&type=fire&show=missing&q=char")).toBe("/pokedex?gen=3&type=fire&show=missing&q=char");
    expect(rates).toBeTruthy();
  });
});
