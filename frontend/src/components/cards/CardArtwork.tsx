import { useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { TcgCard } from "../../services/cards";
import { cardImageCandidates, type ArtworkCandidate } from "../../services/cardImages";
import "./artwork.css";

export function CardArtwork({ card, large = false }: { card: TcgCard; large?: boolean }) {
  const [retry, setRetry] = useState(0);
  const candidates = cardImageCandidates(card, large);
  return <ArtworkSession key={`${card.id}:${large}:${JSON.stringify(candidates)}:${retry}`}
    card={card} large={large} candidates={candidates} retry={() => setRetry((value) => value + 1)} />;
}

function ArtworkSession({ card, large, candidates, retry }: {
  card: TcgCard; large: boolean; candidates: ArtworkCandidate[]; retry: () => void;
}) {
  const { dictionary } = useLocale();
  const text = dictionary.cards;
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<string>();
  const [expired, setExpired] = useState(false);
  const [visible, setVisible] = useState(large || typeof IntersectionObserver === "undefined");
  const frame = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);
  const candidate = expired ? undefined : candidates[attempt];
  const ready = candidate !== undefined && candidate.url === loaded;

  useEffect(() => {
    if (visible || !frame.current) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: "256px" });
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [visible]);

  // Cached images may finish before a load listener is attached.
  useEffect(() => {
    if (candidate && image.current?.complete && image.current.naturalWidth > 0) setLoaded(candidate.url);
  }, [candidate]);

  useEffect(() => {
    if (!visible || ready || !candidate) return;
    const timer = window.setTimeout(() => setAttempt((current) => current === attempt ? current + 1 : current), 5000);
    return () => window.clearTimeout(timer);
  }, [visible, ready, candidate, attempt]);

  // This deadline starts near the viewport, never while lazy artwork is offscreen.
  useEffect(() => {
    if (!visible || loaded || !candidates.length) return;
    const timer = window.setTimeout(() => setExpired(true), 20_000);
    return () => window.clearTimeout(timer);
  }, [visible, loaded, candidates.length]);

  return <div className="tcg-artwork-frame" ref={frame}>
    <div className={`tcg-artwork${candidate && !ready ? " tcg-artwork--loading" : ""}`}>
      {candidate ? <>
        <img key={candidate.url} ref={image} src={candidate.url} alt={card.name} width="245" height="337"
          loading={large ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer"
          style={{ opacity: ready ? 1 : 0 }}
          onLoad={() => setLoaded(candidate.url)}
          onError={() => setAttempt((current) => current === attempt ? current + 1 : current)} />
        {!ready && <span className="tcg-artwork-status">{text.imageLoading}</span>}
      </> : <div className="tcg-artwork-missing">
        <span className="tcg-artwork-missing-icon" aria-hidden="true">◇</span>
        <strong>{text.noImage}</strong>
        <span>{candidates.length ? text.imageLoadFailed : text.imageMissing}</span>
        {large && candidates.length > 0 && <button type="button" onClick={retry}>{text.retryArtwork}</button>}
      </div>}
    </div>
    {ready && candidate.language !== card.language && <p className="tcg-language-note tcg-artwork-language">
      {candidate.language === "en" ? text.englishArtwork : text.spanishArtwork}
    </p>}
  </div>;
}
