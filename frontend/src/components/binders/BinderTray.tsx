import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useCardMetadata } from "../cards/cardMetadata";
import { CardArtwork } from "../cards/CardArtwork";
import { Button } from "../ui/Button";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { cardIdentity, fill } from "./labels";
import { useGuard } from "./useGuard";
import { captureOrigin, type FlightOrigin } from "./flight";
import { fetchCopyView, type CopyViewPage } from "../../services/binders";
import type { InventoryCopy } from "../../services/inventory";
import type { Mode } from "../../pages/BinderPage";
export function BinderTray({ mode, binderId, busy, onStore, version, onCancel, consumed }: {
  mode: Mode; binderId: string; busy: boolean; version: number; consumed: ReadonlySet<string>;
  onStore: (copy: InventoryCopy, origin: FlightOrigin | null) => void; onCancel: () => void;
}) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.binders;
  const guard = useGuard();
  const [offset, setOffset] = useState(0);
  const request = useCallback((signal: AbortSignal) => fetchCopyView("unassigned", offset, signal).catch((e: unknown) => guard(e, signal)), [offset, guard]);
  const tray = useTcgResource<CopyViewPage>(`${binderId}:${offset}:${version}`, request);
  const loaded = tray.state.kind === "loaded" ? tray.state.data : undefined;
  // Copies whose flight just landed are already in a pocket: never show them twice while the tray reloads.
  const page = loaded && { ...loaded, results: loaded.results.filter((copy) => !consumed.has(copy.id)) };
  const metadata = useCardMetadata(page?.results.map((copy) => copy.card_id) ?? [], locale);
  const fillTarget = mode.kind === "fill" ? mode.target : null;
  // Folded to a thin bar by default when empty; choosing for a pocket, or an error, opens it.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = fillTarget !== null || tray.state.kind === "error" || (choice ?? (loaded ? loaded.total > 0 : false));
  const fillKey = fillTarget ? `${fillTarget.page}:${fillTarget.pocket}` : null;
  const list = useRef<HTMLUListElement>(null);
  const focused = useRef<string | null>(null);
  // Choosing from the tray for a pocket moves focus to its first card (the heading when it is empty).
  useEffect(() => {
    if (!fillKey) { focused.current = null; return; }
    if (focused.current === fillKey || !loaded) return;
    focused.current = fillKey;
    (list.current?.querySelector<HTMLElement>("button:not(:disabled)") ?? document.getElementById("pv-tray-title"))?.focus();
  }, [fillKey, loaded]);
  const listId = "pv-tray-body";
  return <section className="pv-tray" aria-labelledby="pv-tray-title" data-filling={fillKey ? "true" : undefined} data-open={open ? "true" : "false"}>
    <div className="pv-tray__head" data-tray-target={open && page && page.results.length > 0 ? undefined : "bar"}>
      <h2 id="pv-tray-title" tabIndex={-1}>{text.tray}</h2>
      {page && <span className="pv-tray__count">{fill(text.trayCount, { count: page.total })}</span>}
      <button type="button" className="pv-tray__fold" aria-expanded={open} aria-controls={listId} disabled={fillTarget !== null}
        aria-label={open ? text.trayFold : text.trayUnfold} onClick={() => setChoice(!open)}>{open ? "▾" : "▴"}</button>
    </div>
    {open && <div id={listId} className="pv-tray__body">
    <p className="pv-binder__hint">{fillTarget ? fill(text.trayTargetHint, fillTarget) : text.trayHint}</p>
    {fillTarget && <Button onClick={onCancel}>{text.trayCancel}</Button>}
    {tray.state.kind === "loading" && <LoadingStatus label={text.trayLoading}><Skeleton shape="text" lines={3} /></LoadingStatus>}
    {tray.state.kind === "error" && <InlineError message={text.trayError} retryLabel={text.retry} onRetry={tray.retry} />}
    {page && page.results.length === 0 && <p className="pv-binder__hint">{text.trayEmpty}</p>}
    {page && page.results.length > 0 && <ul className="pv-tray__list" ref={list} data-tray-target="slot">
      {page.results.map((copy) => {
        const card = metadata.cards[copy.card_id];
        const identity = cardIdentity(copy, card);
        const label = fillTarget ? fill(text.storeHere, { card: identity, ...fillTarget }) : fill(text.storeNext, { card: identity });
        return <li key={copy.id}>
          <button type="button" className="pv-tray__item" disabled={busy} aria-label={label}
            onClick={(event) => onStore(copy, captureOrigin(event.currentTarget.querySelector(".pv-tray__thumb")))}>
            <span className="pv-tray__thumb" aria-hidden="true">{card ? <CardArtwork card={card} /> : <span className="pv-pocket__fallback">{copy.card_id}</span>}</span>
            <span className="pv-tray__facts">
              <strong>{identity}</strong>
              <span>{dictionary.inventory.variants[copy.variant]} · {dictionary.inventory.languages[copy.language]} · {dictionary.inventory.conditions[copy.condition]}</span>
            </span>
          </button>
        </li>;
      })}
    </ul>}
    {page && page.total > 30 && <div className="pv-tray__pages">
      <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}>{text.trayPrevious}</Button>
      <Button disabled={offset + 30 >= page.total} onClick={() => setOffset(offset + 30)}>{text.trayNext}</Button>
    </div>}
    </div>}
  </section>;
}

