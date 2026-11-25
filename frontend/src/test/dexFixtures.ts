import { vi } from "vitest";
import type { SpeciesRow } from "../services/pokemon";
import { jsonResponse as json } from "./tcgFixtures";

const NAMES: Record<number, [string, string, SpeciesRow["types"]]> = {
  1: ["Bulbasaur", "Bulbasaur", ["grass", "poison"]], 4: ["Charmander", "Charmander", ["fire"]], 6: ["Charizard", "Charizard", ["fire", "flying"]],
  25: ["Pikachu", "Pikachu", ["electric"]], 152: ["Chikorita", "Chikorita", ["grass"]], 559: ["Scraggy", "Scraggy", ["dark", "fighting"]],
  650: ["Chespin", "Chespin", ["grass"]], 1025: ["Pecharunt", "Pecharunt", ["poison", "ghost"]],
};
export const speciesRows = (): SpeciesRow[] => Array.from({ length: 1025 }, (_, n) => {
  const number = n + 1; const known = NAMES[number];
  return { national_dex_number: number, name_en: known?.[0] ?? `Species ${number}`, name_es: known?.[1] ?? `Especie ${number}`, types: known?.[2] ?? ["normal"] };
});

export type DexData = {
  guest?: boolean; counts?: Record<number, number>; pending?: number; indexFails?: boolean; countsFail?: boolean;
  override?: (url: URL) => Response | Promise<Response> | undefined;
};
const user = { id: "ash", display_name: "Ash Ketchum", email: null, email_verified: true, picture_url: null };

/** The Pokédex API: the index, ownership counts and the session. Unplanned paths fail loudly. */
export function stubDex(data: DexData = {}) {
  const request = vi.fn((input: string) => {
    const url = new URL(input); const path = url.pathname;
    const custom = data.override?.(url); if (custom) return Promise.resolve(custom);
    if (path === "/api/v1/auth/me") return Promise.resolve(data.guest ? json({}, 401) : json({ user, csrf_token: "csrf" }));
    if (path === "/api/v1/me/settings") return Promise.resolve(json({ preferred_currency: "CLP" }));
    if (path === "/api/v1/pokemon/index") return Promise.resolve(data.indexFails ? json({}, 500) : json({ results: speciesRows() }));
    if (path === "/api/v1/collection/species") {
      if (data.countsFail) return Promise.resolve(json({}, 500));
      const counts = data.counts ?? {};
      return Promise.resolve(json({ counts, species_owned: Object.keys(counts).length, pending: data.pending ?? 0 }));
    }
    return Promise.reject(new Error(`Unexpected request ${path}`));
  });
  vi.stubGlobal("fetch", request);
  return request;
}
export const callsTo = (request: ReturnType<typeof stubDex>, path: string) => request.mock.calls.filter(([input]) => new URL(input as string).pathname === path);
