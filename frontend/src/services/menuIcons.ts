import { NATIONAL_DEX_TOTAL } from "./pokemon";

export type SpriteMode = "static" | "animated";

export type MenuIconSource = {
  url: string;
  family: "generation-v" | "generation-vii" | "sword-shield" | "scarlet-violet";
  animated: boolean;
};

const VERSIONS_ROOT = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions";

/** Verified base-species menu coverage, not battle sprites. See research/sprites/VERIFICATION.md. */
export function getMenuIconCandidates(dex: number, mode: SpriteMode): readonly MenuIconSource[] {
  if (!Number.isInteger(dex) || dex < 1 || dex > NATIONAL_DEX_TOTAL) return [];

  const candidates: MenuIconSource[] = [];
  if (dex <= 649) {
    if (mode === "animated") candidates.push({
      url: `${VERSIONS_ROOT}/generation-v/icons/animated/${dex}.png`,
      family: "generation-v", animated: true,
    });
    candidates.push({
      url: `${VERSIONS_ROOT}/generation-v/icons/${dex}.png`,
      family: "generation-v", animated: false,
    });
  }

  if (dex <= 809) candidates.push({
    url: `${VERSIONS_ROOT}/generation-vii/icons/${dex}.png`,
    family: "generation-vii", animated: false,
  });
  else if (dex <= 898) candidates.push({
    url: `${VERSIONS_ROOT}/generation-viii/sword-shield/icons/${dex}.png`,
    family: "sword-shield", animated: false,
  });
  else candidates.push({
    url: `${VERSIONS_ROOT}/generation-ix/scarlet-violet/icons/${dex}.png`,
    family: "scarlet-violet", animated: false,
  });

  return candidates;
}
