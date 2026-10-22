import type { CardSet } from "./cards";
import { isOfficialAssetUrl } from "./cardImages";

/** Logo formats share the verified provider base; logos never use card quality paths. */
export function setLogoCandidates(set: CardSet): string[] {
  const sources = [...set.logo_sources.map((source) => source.url), set.logo_url];
  const candidates = new Set<string>();
  for (const source of sources) {
    if (!isOfficialAssetUrl(source)) continue;
    const extension = /\.(png|webp|jpg)$/.exec(source)?.[1];
    const base = extension ? source.slice(0, -(extension.length + 1)) : source;
    for (const format of new Set([extension ?? "png", "png", "webp", "jpg"])) candidates.add(`${base}.${format}`);
  }
  return [...candidates];
}
