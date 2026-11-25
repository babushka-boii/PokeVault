import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { REDUCED_MOTION_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import { useLocale } from "../../i18n/LocaleProvider";
import type { Quote } from "../../services/prices";
import type { TcgCard } from "../../services/cards";
import { CardArtwork } from "../cards/CardArtwork";
import { InteractiveCard } from "../cards/InteractiveCard";
import { formatMoney } from "../prices/format";
import { Skeleton } from "../ui/Skeleton";
import { advance, needsLoop, TOUCH_RESUME_MS } from "./drift";
import "./home.css";

export type ReelItem = { key: string; cardId: string; to: string; price: Quote | null };

function ReelCard({ item, card, loading }: { item: ReelItem; card?: TcgCard; loading: boolean }) {
  const { dictionary, locale } = useLocale();
  const { price } = item;
  const gold = price === null ? null
    : price.amount !== null ? formatMoney(price.amount, price.currency, locale)
    : formatMoney(price.original_amount, price.original_currency, locale, true);
  return <li className="pv-reel__item">
    {card ? <InteractiveCard card={card} touchLabel={dictionary.cards.tiltStart} touchActiveLabel={dictionary.cards.tiltStop}>
      {/* The name link below is the accessible one; the artwork link is a pointer and touch shortcut. */}
      <Link to={item.to} aria-hidden="true" tabIndex={-1} className="pv-home__top-art"><CardArtwork card={card} /></Link>
    </InteractiveCard> : loading ? <Skeleton shape="card" /> : <div className="pv-home__top-missing" aria-hidden="true">◇</div>}
    <h3 className="pv-reel__name"><Link to={item.to}>{card?.name ?? item.cardId}</Link></h3>
    {gold ? <p className="pv-reel__price price-amount">{gold}</p> : <p className="pv-reel__price pv-reel__price--none">{dictionary.home.noPrice}</p>}
  </li>;
}

/**
 * A row of cards that drifts slowly and continuously (about 28 px/s) in a seamless loop.
 * The drift pauses on hover, while focus is inside, during touch, while the tab is hidden
 * and while the row is off screen, and the Pause button keeps the user's choice. It never
 * starts with reduced motion (the row then just scrolls by hand), and only when the cards
 * are wider than their viewport. A single requestAnimationFrame loop moves one scroll
 * offset from elapsed time; no React state changes per frame.
 */
export function Reel({ items, cards, loading, label }: { items: ReelItem[]; cards: Record<string, TcgCard>; loading: boolean; label: string }) {
  const { dictionary } = useLocale();
  const text = dictionary.home;
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);
  const viewport = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const loop = useRef<HTMLUListElement>(null);
  const position = useRef(0);
  const written = useRef(0);          // the last offset the drift itself set
  const loopWidth = useRef(0);
  const [looping, setLooping] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const [hidden, setHidden] = useState(() => document.visibilityState === "hidden");
  const [offscreen, setOffscreen] = useState(false);
  const resume = useRef<number | null>(null);
  const identity = items.map((item) => item.key).join("|");

  // Measure: does the list overflow its viewport (so a loop is needed), and how wide is one copy?
  const measure = useCallback(() => {
    const frame = viewport.current; const first = list.current;
    if (!frame || !first) return;
    setLooping(!reduced && needsLoop(first.offsetWidth, frame.clientWidth));
    loopWidth.current = loop.current ? loop.current.offsetLeft - first.offsetLeft : first.offsetWidth;
  }, [reduced]);
  useLayoutEffect(() => { measure(); }, [measure, identity, looping]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    if (viewport.current) observer?.observe(viewport.current);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [measure]);

  // A new list starts from the beginning.
  useEffect(() => {
    position.current = 0; written.current = 0;
    if (viewport.current) viewport.current.scrollLeft = 0;
  }, [identity]);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    const frame = viewport.current;
    if (!frame || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => setOffscreen(!entries.some((entry) => entry.isIntersecting)));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => { if (resume.current !== null) window.clearTimeout(resume.current); }, []);

  const running = looping && !reduced && !userPaused && !hovering && !focused && !touching && !hidden && !offscreen;
  useEffect(() => {
    if (!running) return;
    let last: number | null = null;
    let frameId = window.requestAnimationFrame(function tick(now) {
      const frame = viewport.current;
      if (frame) {
        position.current = advance(position.current, last === null ? 0 : now - last, loopWidth.current);
        written.current = Math.round(position.current);
        frame.scrollLeft = written.current;
      }
      last = now;
      frameId = window.requestAnimationFrame(tick);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [running]);

  // The user scrolled by hand (swipe, wheel, keyboard): follow, and keep the loop seamless.
  function onScroll() {
    const frame = viewport.current;
    if (!frame || Math.abs(frame.scrollLeft - written.current) <= 2) return;
    let next = frame.scrollLeft;
    if (looping && loopWidth.current > 0 && next >= loopWidth.current) { next -= loopWidth.current; frame.scrollLeft = next; }
    position.current = next; written.current = next;
  }

  function step(direction: 1 | -1) {
    const frame = viewport.current; const card = list.current?.firstElementChild as HTMLElement | null;
    if (!frame) return;
    const distance = (card?.offsetWidth || 160) + 16;
    let next = position.current + direction * distance;
    if (looping && loopWidth.current > 0) next = ((next % loopWidth.current) + loopWidth.current) % loopWidth.current;
    else next = Math.max(0, next);
    position.current = next; written.current = Math.round(next);
    frame.scrollTo?.({ left: written.current, behavior: reduced ? "auto" : "smooth" });
    if (!frame.scrollTo) frame.scrollLeft = written.current;
  }

  function touch(down: boolean) {
    if (resume.current !== null) window.clearTimeout(resume.current);
    if (down) { setTouching(true); return; }
    resume.current = window.setTimeout(() => setTouching(false), TOUCH_RESUME_MS);
  }

  const cardsFor = (copy: "original" | "duplicate") => items.map((item) => <ReelCard key={`${copy}:${item.key}`} item={item} card={cards[item.cardId]} loading={loading} />);
  return <div className="pv-reel">
    <div className="pv-reel__controls">
      {looping && <button type="button" className="pv-button pv-button--secondary pv-reel__pause" aria-pressed={userPaused} onClick={() => setUserPaused(!userPaused)}>
        {userPaused ? text.carouselResume : text.carouselPause}</button>}
      <button type="button" className="pv-button pv-button--secondary pv-reel__arrow" aria-label={text.carouselPrevious} onClick={() => step(-1)}><span aria-hidden="true">‹</span></button>
      <button type="button" className="pv-button pv-button--secondary pv-reel__arrow" aria-label={text.carouselNext} onClick={() => step(1)}><span aria-hidden="true">›</span></button>
    </div>
    <div ref={viewport} className="pv-reel__viewport" data-looping={looping || undefined} aria-label={label} role="group" tabIndex={-1}
      onScroll={onScroll}
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false); }}
      onPointerDown={(event) => { if (event.pointerType !== "mouse") touch(true); }}
      onPointerUp={(event) => { if (event.pointerType !== "mouse") touch(false); }}
      onPointerCancel={(event) => { if (event.pointerType !== "mouse") touch(false); }}>
      <div className="pv-reel__track">
        <ul ref={list} className="pv-reel__list">{cardsFor("original")}</ul>
        {looping && <ul ref={loop} className="pv-reel__list pv-reel__loop" aria-hidden="true" inert>{cardsFor("duplicate")}</ul>}
      </div>
    </div>
  </div>;
}
