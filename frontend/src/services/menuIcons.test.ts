import { expect, test } from "vitest";
import { getMenuIconCandidates } from "./menuIcons";

test("uses Gen V menu APNG then still menu sources without requesting battle sprites", () => {
  expect(getMenuIconCandidates(25, "animated").map((source) => source.url)).toEqual([
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/animated/25.png",
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/25.png",
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/25.png",
  ]);
  expect(getMenuIconCandidates(25, "static").map((source) => source.url)).toEqual([
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/icons/25.png",
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/25.png",
  ]);
});

test("skips unavailable generations and uses verified later menu families", () => {
  expect(getMenuIconCandidates(649, "animated")[0]?.url).toContain("/generation-v/icons/animated/649.png");
  expect(getMenuIconCandidates(650, "animated").map((source) => source.url)).toEqual([
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/650.png",
  ]);
  expect(getMenuIconCandidates(809, "static")[0]?.url).toContain("/generation-vii/icons/809.png");
  expect(getMenuIconCandidates(810, "animated").map((source) => source.url)).toEqual([
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-viii/sword-shield/icons/810.png",
  ]);
  expect(getMenuIconCandidates(898, "static")[0]?.url).toContain("/sword-shield/icons/898.png");
  expect(getMenuIconCandidates(899, "animated")[0]?.url).toContain("/scarlet-violet/icons/899.png");
  expect(getMenuIconCandidates(1025, "static").map((source) => source.url)).toEqual([
    "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-ix/scarlet-violet/icons/1025.png",
  ]);
});

test.each([0, -1, 1026, 10001, 25.5, NaN, Infinity])("rejects unsupported dex ID %s without constructing image URLs", (id) => {
  expect(getMenuIconCandidates(id, "animated")).toEqual([]);
});
