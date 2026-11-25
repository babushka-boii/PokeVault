import { useId } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { TcgCard } from "../../services/cards";
import { InteractiveCard } from "./InteractiveCard";
import { CardArtwork } from "./CardArtwork";
import { CardLanguageNote } from "./CardLanguageNote";

export type PreviewStar = { starred: boolean; ready: boolean; pending: boolean; onToggle: () => void };

/**
 * `owned` (when known) marks the card with a text label and a gold border, or dims it;
 * `star` adds the quick favourite star, optimistic and outside the card's link.
 */
export function CardPreview({ card, returnTo, owned, star }: { card: TcgCard; returnTo: string; owned?: boolean; star?: PreviewStar }) {
  const { dictionary } = useLocale();
  const headingId = useId();
  return <li className="tcg-preview" data-owned={owned === undefined ? undefined : owned}>
    <InteractiveCard card={card} touchLabel={dictionary.cards.tiltStart} touchActiveLabel={dictionary.cards.tiltStop}>
      <Link className="tcg-preview-link" aria-labelledby={headingId} to={`/cards/${encodeURIComponent(card.id)}?${new URLSearchParams({ returnTo })}`}>
        <CardArtwork card={card} />
      </Link>
    </InteractiveCard>
    {owned && <span className="tcg-preview__owned">{dictionary.pokedex.owned}</span>}
    {star && <button type="button" className="tcg-preview__star" aria-pressed={star.starred} disabled={!star.ready || star.pending}
      aria-label={(star.starred ? dictionary.home.quickUnstar : dictionary.home.quickStar).replace("{card}", card.name)} onClick={star.onToggle}>
      <span aria-hidden="true">{star.starred ? "★" : "☆"}</span></button>}
    <h3 id={headingId} lang={card.language}>{card.name}</h3>
    <p className="tcg-preview-set" lang={card.set.name_language ?? card.language}>{card.set.name}</p>
    <p className="tcg-preview-number">#{card.local_id}{card.rarity ? <span lang={card.language}> · {card.rarity}</span> : ""}</p>
    <CardLanguageNote card={card} />
  </li>;
}
