import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { cardPath } from "../../services/cards";
import type { FavoriteCards } from "../../services/favorites";
import { useCardMetadata } from "../cards/cardMetadata";
import { formatMoney } from "../prices/format";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import type { Resource } from "../../hooks/useTcgResource";

export const FAVORITES_SHOWN = 7;

/** The newest favourites as a row of cards with their star and reference price. */
export function FavoritesRow({ resource }: { resource: Resource<FavoriteCards> }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.profilePage;
  const data = resource.state.kind === "loaded" ? resource.state.data : null;
  const shown = data?.results.slice(0, FAVORITES_SHOWN) ?? [];
  const metadata = useCardMetadata(shown.map((row) => row.card_id), locale);
  return <section className="pv-favs" aria-labelledby="profile-favs">
    <div className="pv-favs__head"><h2 id="profile-favs">{text.favoritesTitle}</h2><Link to="/">{text.seeAll}</Link></div>
    {resource.state.kind === "loading" && <LoadingStatus label={text.loading}><Skeleton shape="text" lines={2} /></LoadingStatus>}
    {resource.state.kind === "error" && <InlineError calm message={text.favoritesError} retryLabel={text.retry} onRetry={resource.retry} />}
    {data && shown.length === 0 && <p className="pv-favs__empty">{text.favoritesEmpty}</p>}
    {shown.length > 0 && <ul className="pv-favs__row">
      {shown.map((row) => { const card = metadata.cards[row.card_id]; const name = card?.name ?? row.card_id;
        const price = row.price === null ? null : row.price.amount !== null ? formatMoney(row.price.amount, row.price.currency, locale) : formatMoney(row.price.original_amount, row.price.original_currency, locale, true);
        return <li key={row.card_id}><Link to={cardPath(row.card_id, "/profile")}>
          <span className="pv-favs__card">
            {card?.thumbnail_url && <img src={card.thumbnail_url} alt="" loading="lazy" referrerPolicy="no-referrer" />}
            <span className="pv-favs__star" role="img" aria-label={text.favoriteMark}>★</span>
          </span>
          <span className="pv-favs__name" lang={card?.language}>{name}</span>
          <span className={`pv-favs__price${price === null ? " pv-favs__price--none" : ""}`}>{price ?? text.noPrice}</span>
        </Link></li>; })}
    </ul>}
  </section>;
}
