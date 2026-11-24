import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { useCollectionValuation } from "../components/prices/useCollectionValuation";
import { EmptyHome } from "../components/home/EmptyHome";
import { GuestHome } from "../components/home/GuestHome";
import { BinderShelf } from "../components/home/BinderShelf";
import { ScannerCard } from "../components/home/ScannerCard";
import { SetsProgress } from "../components/home/SetsProgress";
import { SystemStatusFooter } from "../components/home/SystemStatusFooter";
import { TopCards } from "../components/home/TopCards";
import { ValueHero } from "../components/home/ValueHero";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { useLocale } from "../i18n/LocaleProvider";
import "../components/home/home.css";

/** Each section owns its request, skeleton and error; only the valuation is shared by the hero and the top cards. */
function SignedInHome() {
  const valuation = useCollectionValuation();
  const empty = valuation.state.kind === "loaded" && valuation.state.data.copy_count === 0;
  return <>
    <div className="pv-home__grid">
      {empty ? <EmptyHome /> : <ValueHero resource={valuation} />}
      <div className="pv-home__side"><ScannerCard /></div>
      {!empty && <>
        <TopCards resource={valuation} />
        <BinderShelf />
        <SetsProgress />
      </>}
    </div>
    <SystemStatusFooter />
  </>;
}

function ResolvingHome() {
  const { dictionary } = useLocale();
  return <LoadingStatus label={dictionary.home.resolving}>
    <div className="pv-home__grid">
      <div className="pv-home__hero"><Skeleton shape="text" /><Skeleton shape="number" /><Skeleton shape="text" lines={2} /></div>
      <div className="pv-home__side"><Skeleton shape="block" /></div>
    </div>
  </LoadingStatus>;
}

/**
 * Private sections only mount for a validated session and are keyed by user id, so a
 * different account never sees the previous account's data. Guests make no private requests.
 */
export function HomePage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  const resolving = auth.status === "loading" || auth.validating;
  return <div className="pv-home">
    <h1 className="pv-sr-only">{dictionary.home.title}</h1>
    {auth.status === "error" && <SessionNotice />}
    {resolving ? <ResolvingHome />
      : auth.status === "authenticated" ? <SignedInHome key={auth.user.id} />
      : <GuestHome />}
  </div>;
}
