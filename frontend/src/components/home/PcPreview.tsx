import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useTcgResource } from "../../hooks/useTcgResource";
import { useLocale } from "../../i18n/LocaleProvider";
import { BoxesError, fetchBox, fetchBoxes, fetchBoxView } from "../../services/boxes";
import { usePersonalMetadata } from "../boxes/personalMetadata";
import { PersonalGrid } from "../boxes/personalGrid";
import { ButtonLink } from "../ui/Button";
import { CutPanel } from "../ui/CutPanel";
import { InlineError } from "../ui/InlineError";
import { LoadingStatus, Skeleton } from "../ui/Skeleton";
import { plural } from "./plural";
import "../boxes/boxes.css";
import "../boxes/personal.css";
import "./home.css";

const PC_LINK = "/boxes?mode=personal";

/** Read-only preview of the first personal box. Moving copies stays in Cajas PC (8C improves it). */
export function PcPreview() {
  const { dictionary, locale } = useLocale();
  const text = dictionary.home;
  const inventory = dictionary.inventory;
  const { retrySession } = useAuth();
  const [chosen, setChosen] = useState<number | null>(null);
  const guard = useCallback((error: unknown, signal: AbortSignal): never => {
    if (!signal.aborted && error instanceof BoxesError && error.status === 401) retrySession();
    throw error;
  }, [retrySession]);
  const listRequest = useCallback((signal: AbortSignal) => fetchBoxes(signal).catch((error: unknown) => guard(error, signal)), [guard]);
  const list = useTcgResource("boxes", listRequest);
  const first = list.state.kind === "loaded" ? [...list.state.data.results].sort((a, b) => a.display_order - b.display_order)[0] : undefined;
  const detailRequest = useCallback((signal: AbortSignal) => fetchBox(first!.id, signal).catch((error: unknown) => guard(error, signal)), [first, guard]);
  const detail = useTcgResource(first?.id, detailRequest);
  const unassignedRequest = useCallback((signal: AbortSignal) => fetchBoxView("unassigned", 0, signal).catch((error: unknown) => guard(error, signal)), [guard]);
  const unassigned = useTcgResource("unassigned", unassignedRequest);
  const box = detail.state.kind === "loaded" ? detail.state.data : undefined;
  const slots = box?.slots ?? [];
  const metadata = usePersonalMetadata(slots.map((slot) => slot.copy.card_id), locale);
  const firstOccupied = slots.length ? Math.min(...slots.map((slot) => slot.position)) : 0;
  const selected = chosen ?? firstOccupied;
  const copy = slots.find((slot) => slot.position === selected)?.copy;
  const card = copy ? metadata.cards[copy.card_id] : undefined;
  const unassignedCount = unassigned.state.kind === "loaded" ? unassigned.state.data.total : 0;
  const noBoxes = list.state.kind === "loaded" && !first;

  return <CutPanel className="pv-home__pc pv-home-pc pc-page" aria-labelledby="home-pc-title">
    <div className="pv-home__section-head">
      <h2 id="home-pc-title">{text.pcTitle}</h2>
      <Link to={PC_LINK}>{text.pcOpen}</Link>
    </div>
    {(list.state.kind === "loading" || (first && detail.state.kind === "loading")) && <LoadingStatus label={text.pcLoading}><Skeleton shape="block" /></LoadingStatus>}
    {list.state.kind === "error" && <InlineError message={text.pcError} retryLabel={text.retry} onRetry={list.retry} />}
    {detail.state.kind === "error" && <InlineError message={text.pcError} retryLabel={text.retry} onRetry={detail.retry} />}
    {noBoxes && <div className="pv-home__pc-empty">
      <h3>{text.firstBox}</h3>
      <p className="pv-home__meta">{text.firstBoxText}</p>
    </div>}
    {box && first && <>
      <p className="pv-home__meta">{text.pcBox.replace("{name}", first.name).replace("{count}", plural(text.pcCards, first.copy_count))}</p>
      <div className="pv-home-pc__layout">
        <div className="pv-home-pc__screen">
          <PersonalGrid slots={slots} selected={selected} select={setChosen} cards={metadata.cards} mode="static" disabled={false} />
        </div>
        <aside className="pv-home-pc__panel" aria-label={text.pcSelected}>
          {copy ? <>
            <h3>{card?.name ?? copy.card_id}</h3>
            {card && <p className="pv-home__meta" lang={card.set.name_language}>{card.set.name} · #{card.local_id}</p>}
            <dl className="pv-home-pc__facts">
              <div><dt>{inventory.variant}</dt><dd>{inventory.variants[copy.variant]}</dd></div>
              <div><dt>{inventory.language}</dt><dd>{inventory.languages[copy.language]}</dd></div>
              <div><dt>{inventory.condition}</dt><dd>{inventory.conditions[copy.condition]}</dd></div>
            </dl>
            <Link to={`/collection/${encodeURIComponent(copy.id)}`}>{text.viewCopy}</Link>
          </> : <>
            <h3>{text.pcEmptySlot.replace("{position}", String(selected + 1))}</h3>
            <p className="pv-home__meta">{text.pcChoose}</p>
          </>}
        </aside>
      </div>
    </>}
    <div className="pv-home__actions">
      {unassignedCount > 0 && <Link className="pv-chip pv-chip--link" to={PC_LINK}>{plural(text.unassigned, unassignedCount)}</Link>}
      <ButtonLink to={PC_LINK} variant="secondary">{text.newBox}</ButtonLink>
    </div>
  </CutPanel>;
}
