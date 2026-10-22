import { useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { CardArtwork } from "../components/cards/CardArtwork";
import { CardLanguageNote } from "../components/cards/CardLanguageNote";
import { InteractiveCard } from "../components/cards/InteractiveCard";
import { SetLogo } from "../components/cards/SetLogo";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { fetchTcgCard, isCardId, safeReturnTo } from "../services/cards";
import "../components/cards/cards.css";

export function TcgCardPage() {
  const { id = "" } = useParams();
  const { dictionary, locale } = useLocale();
  const text = dictionary.cards;
  const valid = isCardId(id);
  const request = useCallback((signal: AbortSignal) => fetchTcgCard(id, locale, signal), [id, locale]);
  const { state, retry } = useTcgResource(valid ? `${id}:${locale}` : undefined, request);
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const heading = useRef<HTMLHeadingElement>(null);
  const card = state.kind === "loaded" ? state.data : undefined;
  useEffect(() => { heading.current?.focus(); }, [location.pathname, card?.id]);
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const fromGallery = /^\/pokemon\/\d+\/cards(?:\?|$)/.test(returnTo);
  const nestedReturn = fromGallery ? new URLSearchParams(returnTo.split("?")[1] ?? "").get("returnTo") : null;
  // Validate the nested destination separately; even a valid gallery URL may contain untrusted query values.
  const candidateOrigin = safeReturnTo(nestedReturn);
  const origin = /^\/(?:boxes|pokedex)(?:\?|$)/.test(candidateOrigin) ? candidateOrigin : "/pokedex";
  const category = card?.category === "Trainer" ? text.categoryTrainer : card?.category === "Energy" ? text.categoryEnergy : text.categoryPokemon;

  return <section className="panel tcg-page tcg-card-page" aria-labelledby="tcg-card-title">
    <nav className="tcg-detail-navigation" aria-label={text.cardInformation}>
      <Link className="tcg-back" to={returnTo}><span aria-hidden="true">← </span>{fromGallery ? text.backGallery : text.back}</Link>
      {fromGallery && <Link className="tcg-origin" to={origin}>{origin.startsWith("/boxes") ? text.backBoxes : text.backPokedex}<span aria-hidden="true"> ↗</span></Link>}
    </nav>
    {!card && <h1 id="tcg-card-title" tabIndex={-1} ref={heading}>{text.detailTitle}</h1>}
    {!valid ? <p role="alert">{text.invalidCard}</p> : <>
      {state.kind === "loading" && <><p role="status">{text.detailLoading}</p><div className="tcg-detail-skeleton tcg-artwork tcg-artwork--loading" aria-hidden="true" /></>}
      {state.kind === "error" && <div className="system-status--degraded">
        <p role="alert">{state.notFound ? text.notFound : text.detailError}</p>
        {!state.notFound && <button type="button" onClick={retry}>{text.retry}</button>}
      </div>}
      {card && <>
        <div className="tcg-detail">
          <figure className="tcg-detail-artwork">
            <div className="tcg-artwork-stage"><InteractiveCard card={card} large touchLabel={text.tiltStart} touchActiveLabel={text.tiltStop}><CardArtwork card={card} large /></InteractiveCard></div>
            <figcaption>{text.artworkCaption}</figcaption>
            <p className="tcg-simulation-note">{text.simulationNote}</p>
          </figure>
          <div className="tcg-detail-content">
            <header className="tcg-card-header">
              <p className="tcg-card-category">{category}{card.stage && <><span aria-hidden="true"> · </span><span lang={card.language}>{card.stage}</span></>}</p>
              <h1 id="tcg-card-title" tabIndex={-1} ref={heading} lang={card.language}>{card.name}</h1>
              <p className="tcg-card-id">{card.id}</p>
              <div className="tcg-detail-set"><SetLogo set={card.set} decorative /><div><span className="tcg-filter-label">{text.set}</span>
                <p lang={card.set.name_language ?? card.language}>{card.set.name}</p>
                <small>{[card.set.serie?.name, card.set.release_date?.slice(0, 4)].filter(Boolean).join(" · ")}</small>
              </div></div>
              <dl className="tcg-primary-facts"><div><dt>{text.number}</dt><dd>#{card.local_id}</dd></div>
                <div><dt>{text.rarity}</dt><dd lang={card.language}>{card.rarity ?? text.unavailable}</dd></div>
                <div><dt>{text.category}</dt><dd>{category}</dd></div>
              </dl>
              <CardLanguageNote card={card} />
            </header>
            {card.category === "Pokemon" && <section className="tcg-detail-section tcg-pokemon-traits" aria-label={text.cardInformation}>
              <div className="tcg-hp-types">
                {card.hp !== null && <p className="tcg-hp"><span>{text.hp}</span> <strong>{card.hp}</strong></p>}
                <ul className="tcg-energy-types" aria-label={text.types}>{card.types.map((type) => <li lang={card.language} key={type}>{type}</li>)}</ul>
              </div>
              <dl className="tcg-facts">
                <div><dt>{text.stage}</dt><dd lang={card.language}>{card.stage ?? text.unavailable}</dd></div>
                {card.evolve_from && <div><dt>{text.evolveFrom}</dt><dd lang={card.language}>{card.evolve_from}</dd></div>}
                <div><dt>{text.weaknesses}</dt><dd lang={card.language}>{card.weaknesses.map((trait) => [trait.type, trait.value].filter(Boolean).join(" ")).join(", ") || text.unavailable}</dd></div>
                <div><dt>{text.resistances}</dt><dd lang={card.language}>{card.resistances.map((trait) => [trait.type, trait.value].filter(Boolean).join(" ")).join(", ") || text.unavailable}</dd></div>
                <div><dt>{text.retreat}</dt><dd>{card.retreat ?? text.unavailable}</dd></div>
              </dl>
            </section>}
            <section className="tcg-detail-section" aria-labelledby="tcg-abilities"><h2 id="tcg-abilities">{text.abilities}</h2>
              {card.abilities.length === 0 ? <p className="tcg-empty-metadata">{text.noAbilities}</p> : <ul className="tcg-effects tcg-abilities">{card.abilities.map((ability, index) => <li key={index}>
                {ability.type && <span className="tcg-ability-kind" lang={card.language}>{ability.type}</span>}
                <h3 lang={card.language}>{ability.name || text.unavailable}</h3>
                {ability.effect && <p lang={card.language}>{ability.effect}</p>}
              </li>)}</ul>}
            </section>
            <section className="tcg-detail-section" aria-labelledby="tcg-attacks"><h2 id="tcg-attacks">{text.attacks}</h2>
              {card.attacks.length === 0 ? <p className="tcg-empty-metadata">{text.noAttacks}</p> : <ul className="tcg-effects tcg-attacks">{card.attacks.map((attack, index) => <li key={index}>
                <div className="tcg-attack-heading"><h3 lang={card.language}>{attack.name || text.unavailable}</h3>
                  {attack.damage !== null && <span className="tcg-attack-damage" aria-label={`${text.damage}: ${attack.damage}`}>{attack.damage}</span>}</div>
                <p className="tcg-energy-cost"><span>{text.cost}: </span><span lang={card.language}>{attack.cost.join(" · ") || text.unavailable}</span></p>
                {attack.effect && <p lang={card.language}>{attack.effect}</p>}
              </li>)}</ul>}
            </section>
            <section className="tcg-detail-section" aria-labelledby="tcg-additional"><h2 id="tcg-additional">{text.cardInformation}</h2>
              <dl className="tcg-facts"><div><dt>{text.illustrator}</dt><dd lang={card.language}>{card.illustrator ?? text.unavailable}</dd></div>
                {card.regulation_mark && <div><dt>{text.regulationMark}</dt><dd>{card.regulation_mark}</dd></div>}
                <div><dt>{text.availableLanguages}</dt><dd>{card.available_languages.map((language) => language === "es" ? text.spanish : text.english).join(", ")}</dd></div>
              </dl>
              <p className="tcg-language-note">{text.languageNote}</p>
              <h3 className="tcg-variants-heading">{text.variants}</h3>
              {card.variants.length === 0 ? <p className="tcg-empty-metadata">{text.noVariants}</p> : <ul className="tcg-variants">{card.variants.map((variant, index) =>
                <li lang={card.language} key={index}>{[variant.type, variant.subtype, variant.id, ...variant.stamps].filter(Boolean).join(" · ")}</li>)}</ul>}
            </section>
          </div>
        </div>
        <p className="tcg-source">{text.source}</p>
      </>}
    </>}
  </section>;
}
