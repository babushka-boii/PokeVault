import { useId } from "react";
import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { TcgCard } from "../../services/cards";
import { InteractiveCard } from "./InteractiveCard";
import { CardArtwork } from "./CardArtwork";
import { CardLanguageNote } from "./CardLanguageNote";

export function CardPreview({ card, returnTo }: { card: TcgCard; returnTo: string }) {
  const { dictionary } = useLocale();
  const headingId = useId();
  return <li className="tcg-preview">
    <InteractiveCard card={card} touchLabel={dictionary.cards.tiltStart} touchActiveLabel={dictionary.cards.tiltStop}>
      <Link className="tcg-preview-link" aria-labelledby={headingId} to={`/cards/${encodeURIComponent(card.id)}?${new URLSearchParams({ returnTo })}`}>
        <CardArtwork card={card} />
      </Link>
    </InteractiveCard>
    <h3 id={headingId} lang={card.language}>{card.name}</h3>
    <p className="tcg-preview-set" lang={card.set.name_language ?? card.language}>{card.set.name}</p>
    <p className="tcg-preview-number">#{card.local_id}{card.rarity ? <span lang={card.language}> · {card.rarity}</span> : ""}</p>
    <CardLanguageNote card={card} />
  </li>;
}
