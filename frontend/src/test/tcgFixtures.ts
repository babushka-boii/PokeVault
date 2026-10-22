import type { CardSet, TcgCard } from "../services/cards";

function expansion(id: string, name: string, release_date: string | null, serie: { id: string; name: string }): CardSet {
  return { id, name, release_date, serie, name_language: "en", logo_url: null, symbol_url: null, logo_sources: [] };
}

export const pikachuCard: TcgCard = {
  id: "sm9-33", name: "Pikachu & Zekrom-GX", dex_ids: [25, 644],
  image_url: "https://assets.tcgdex.net/en/sm/sm9/33/high.webp",
  thumbnail_url: "https://assets.tcgdex.net/en/sm/sm9/33/low.webp",
  image_sources: [{ base_url: "https://assets.tcgdex.net/en/sm/sm9/33", language: "en" }], image_language: "en",
  set: expansion("sm9", "Team Up", "2019-02-01", { id: "sm", name: "Sun & Moon" }), local_id: "33", rarity: "Rare Holo GX",
  category: "Pokemon", language: "en", available_languages: ["es", "en"],
  illustrator: "Mitsuhiro Arita", hp: 240, types: ["Lightning"], stage: "Basic",
  evolve_from: null,
  attacks: [{ name: "Full Blitz", cost: ["Lightning", "Lightning", "Lightning"], damage: 150,
    effect: "Search your deck for up to 3 Lightning Energy cards and attach them to 1 of your Pokémon." }],
  abilities: [], variants: [{ id: null, type: "holo", subtype: null, stamps: [] }],
  weaknesses: [], resistances: [], retreat: null, regulation_mark: null,
};

export const bulbasaurCard: TcgCard = {
  ...pikachuCard, id: "base1-44", name: "Bulbasaur", dex_ids: [1],
  image_url: "https://assets.tcgdex.net/en/base/base1/44/high.webp",
  thumbnail_url: "https://assets.tcgdex.net/en/base/base1/44/low.webp",
  image_sources: [{ base_url: "https://assets.tcgdex.net/en/base/base1/44", language: "en" }],
  set: expansion("base1", "Base Set", "1999-01-09", { id: "base", name: "Base" }), local_id: "44", rarity: "Common",
  hp: 40, types: ["Grass"], illustrator: "Mitsuhiro Arita", available_languages: ["en"],
  attacks: [{ name: "Leech Seed", cost: ["Grass", "Grass"], damage: "20", effect: null }],
  variants: [],
};

export const scraggyCard: TcgCard = {
  ...pikachuCard, id: "bw1-68", name: "Scraggy", dex_ids: [559],
  image_url: null, thumbnail_url: null, image_sources: [], image_language: null,
  set: expansion("bw1", "Black & White", "2011-04-25", { id: "bw", name: "Black & White" }),
  local_id: "68", rarity: "Common", hp: 60, types: ["Darkness"], illustrator: null,
  available_languages: ["en"], attacks: [], variants: [],
};

export function tcgPage(results: unknown[] = [pikachuCard], options: Record<string, unknown> = {}) {
  const sets = [...new Map(results.filter((card): card is TcgCard => typeof card === "object" && card !== null && "set" in card)
    .map((card) => [card.set.id, card.set])).values()];
  return { results, page: 1, page_size: 12, has_more: false, coverage: "english_catalog", sets, sets_complete: true, ...options };
}

export function speciesDetails(number = 25) {
  return {
    national_dex_number: number, name: number === 559 ? "Scraggy" : number === 1 ? "Bulbasaur" : "Pikachu",
    types: number === 559 ? ["dark", "fighting"] : number === 1 ? ["grass", "poison"] : ["electric"],
    sprite_url: `https://example.org/${number}.png`, name_language: "en", height_m: .4,
    weight_kg: 6, abilities: [], description: null, description_language: null,
  };
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status });
}
