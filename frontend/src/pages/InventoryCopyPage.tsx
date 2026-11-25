import { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { CopyLocation } from "../components/binders/CopyLocation";
import { cardIdentity } from "../components/binders/labels";
import { useCardMetadata } from "../components/cards/cardMetadata";
import { OwnedCopy } from "../components/inventory/OwnedCopy";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { safeBinderReturn } from "../services/binders";
import { fetchInventoryCopy, InventoryError } from "../services/inventory";
import "../components/inventory/inventory.css";

function PersonalCopy({ id }: { id: string }) {
  const { dictionary, locale } = useLocale();
  const text = dictionary.inventory;
  const { retrySession } = useAuth();
  const [params] = useSearchParams();
  const backToBinder = safeBinderReturn(params.get("returnTo"));
  const [message, setMessage] = useState<"updated" | "removed" | null>(null);
  const request = useCallback(async (signal: AbortSignal) => {
    try { return await fetchInventoryCopy(id, signal); }
    catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof InventoryError && error.status === 401) retrySession();
      if (error instanceof InventoryError && error.status === 404) return null;
      throw error;
    }
  }, [id, retrySession]);
  const { state, retry } = useTcgResource(id, request);
  // The printing's name and expansion identify the copy; its id is only an internal key.
  const cardId = state.kind === "loaded" && state.data ? state.data.card_id : undefined;
  const printing = useCardMetadata(cardId ? [cardId] : [], locale).cards[cardId ?? ""];
  if (message === "removed") return <p role="status">{text.removed}</p>;
  return <>
    {message && <p role="status">{text[message]}</p>}
    {state.kind === "loading" && <p role="status">{text.loading}</p>}
    {state.kind === "error" && <><p role="alert">{text.loadError}</p>
      <button type="button" onClick={retry}>{text.retry}</button></>}
    {state.kind === "loaded" && (state.data ? <>
      {backToBinder && <p><Link to={backToBinder}>{dictionary.binders.backToBinder}</Link></p>}
      <h2><Link to={`/cards/${encodeURIComponent(state.data.card_id)}`}>{cardIdentity(state.data, printing)}</Link></h2>
      <p>{text.physicalNote}</p>
      <CopyLocation copyId={state.data.id} />
      <ul className="inventory-copies"><OwnedCopy key={state.data.updated_at} copy={state.data} locked={false}
        onActiveChange={() => {}} onChanged={(next) => { setMessage(next); if (next === "updated") retry(); }} /></ul>
    </> : <p role="alert">{text.missing}</p>)}
  </>;
}

export function InventoryCopyPage() {
  const auth = useAuth();
  const { copyId = "" } = useParams();
  const { dictionary } = useLocale();
  return <section className="panel inventory-page" aria-labelledby="copy-title">
    <h1 id="copy-title">{dictionary.inventory.title}</h1>
    <SessionNotice />
    {auth.status === "unauthenticated" && <Link to="/login">{dictionary.auth.signIn}</Link>}
    {auth.status === "authenticated" && !auth.loggingOut && !auth.validating && <PersonalCopy key={`${auth.user.id}:${copyId}`} id={copyId} />}
    <p><Link to="/collection">{dictionary.inventory.title}</Link> · <Link to="/binders">{dictionary.binders.title}</Link></p>
  </section>;
}
