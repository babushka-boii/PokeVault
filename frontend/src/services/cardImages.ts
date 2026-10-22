import type { Locale } from "../i18n/LocaleProvider";
import type { TcgCard } from "./cards";

export type ArtworkCandidate = { url: string; language: Locale };

export function isOfficialAssetUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "assets.tcgdex.net" &&
      url.port === "" && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

/** Paths come only from verified printing resources; never guess another language or ID. */
export function cardImageCandidates(card: TcgCard, large = false): ArtworkCandidate[] {
  const qualities = large ? ["high", "low"] : ["low", "high"];
  const candidates: ArtworkCandidate[] = [];
  const seen = new Set<string>();
  for (const source of card.image_sources) {
    if (!isOfficialAssetUrl(source.base_url)) continue;
    const base = source.base_url.replace(/\/+$/, "").replace(/\/(?:high|low)\.(?:webp|png|jpg)$/, "");
    for (const quality of qualities) for (const extension of ["webp", "png", "jpg"]) {
      const url = `${base}/${quality}.${extension}`;
      if (!seen.has(url)) candidates.push({ url, language: source.language });
      seen.add(url);
    }
  }
  return candidates;
}
