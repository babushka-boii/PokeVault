import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import type { CopyPrice } from "../../services/prices";
import type { TcgCard } from "../../services/cards";
import { useCardMetadata } from "../cards/cardMetadata";
import { CardArtwork } from "../cards/CardArtwork";
import { InteractiveCard } from "../cards/InteractiveCard";
import { PriceOrReason } from "../prices/PriceDisplay";
import { CutPanel } from "../ui/CutPanel";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import type { ValuationResource } from "./ValueHero";
import "./home.css";

function TopItem({ item, card, loading }: { item: CopyPrice; card?: TcgCard; loading: boolean }) {
  const { dictionary } = useLocale();
  const to = `/collection/${encodeURIComponent(item.copy_id)}`;
  const variant = dictionary.inventory.variants[item.variant as keyof typeof dictionary.inventory.variants] ?? item.variant;
  return <li className="pv-home__top-item">
    {card ? <InteractiveCard card={card} touchLabel={dictionary.cards.tiltStart} touchActiveLabel={dictionary.cards.tiltStop}>
      {/* The name link below is the accessible one; the artwork link is a pointer/touch shortcut. */}
      <Link to={to} aria-hidden="true" tabIndex={-1} className="pv-home__top-art"><CardArtwork card={card} /></Link>
    </InteractiveCard> : loading ? <Skeleton shape="card" /> : <div className="pv-home__top-missing" aria-hidden="true">◇</div>}
    <h3 className="pv-home__top-name"><Link to={to}>{card?.name ?? item.card_id}</Link></h3>
    <p className="pv-home__meta">{variant}</p>
    <div className="pv-home__price"><PriceOrReason price={item.price} reason={item.reason} /></div>
  </li>;
}

/** The five most valuable copies, from the existing valuation. 8D turns this into the favorites carousel. */
export function TopCards({ resource }: { resource: ValuationResource }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const { state } = resource;
  const top = state.kind === "loaded" ? state.data.top : [];
  const metadata = useCardMetadata(top.map((item) => item.card_id), locale);
  return <section className="pv-home__section pv-home__wide" aria-labelledby="home-top-title">
    <div className="pv-home__section-head">
      <h2 id="home-top-title">{text.topTitle}</h2>
      <Link to="/collection">{text.viewCollection}</Link>
    </div>
    {state.kind === "loading" && <LoadingStatus label={text.topLoading}>
      <ul className="pv-home__top">{[0, 1, 2, 3, 4].map((index) => <li key={index} className="pv-home__top-item"><Skeleton shape="card" /></li>)}</ul>
    </LoadingStatus>}
    {/* The value hero shows the alert and retry for the shared request; repeating them here would duplicate both. */}
    {state.kind === "error" && <p className="pv-home__meta">{text.topError}</p>}
    {state.kind === "loaded" && (top.length === 0 ? <CutPanel as="div"><p className="pv-home__meta">{text.topEmpty}</p></CutPanel>
      : <ul className="pv-home__top">{top.map((item) => <TopItem key={item.copy_id} item={item} card={metadata.cards[item.card_id]} loading={metadata.loading} />)}</ul>)}
  </section>;
}
