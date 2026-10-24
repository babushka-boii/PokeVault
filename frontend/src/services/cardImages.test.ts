import { expect, test } from "vitest";
import { cardImageCandidates } from "./cardImages";
import { pikachuCard } from "../test/tcgFixtures";

test("tries optimized preferred artwork, formats and qualities before the verified other language", () => {
  const candidates = cardImageCandidates({ ...pikachuCard, image_sources: [
    { base_url: "https://assets.tcgdex.net/es/sm/sm9/33", language: "es" },
    { base_url: "https://assets.tcgdex.net/en/sm/sm9/33", language: "en" },
  ] }, false);
  expect(candidates[0]).toEqual({ url: "https://assets.tcgdex.net/es/sm/sm9/33/low.webp", language: "es" });
  expect(candidates[1].url).toBe("https://assets.tcgdex.net/es/sm/sm9/33/low.png");
  expect(candidates[3].url).toBe("https://assets.tcgdex.net/es/sm/sm9/33/high.webp");
  expect(candidates[6]).toEqual({ url: "https://assets.tcgdex.net/en/sm/sm9/33/low.webp", language: "en" });
  expect(candidates).toHaveLength(12);
});

test("detail starts at high quality without duplicated suffixes or trailing slashes", () => {
  const candidates = cardImageCandidates({ ...pikachuCard, image_sources: [
    { base_url: "https://assets.tcgdex.net/en/sm/sm9/33/high.png/", language: "en" },
  ] }, true);
  expect(candidates[0].url).toBe("https://assets.tcgdex.net/en/sm/sm9/33/high.webp");
  expect(candidates[3].url).toBe("https://assets.tcgdex.net/en/sm/sm9/33/low.webp");
});

test("never guesses an image language/path or another printing when metadata is absent", () => {
  expect(cardImageCandidates({ ...pikachuCard, image_url: null, thumbnail_url: null, image_sources: [], image_language: null })).toEqual([]);
});
