import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { GuestHome } from "../components/home/GuestHome";
import { ScannerCard } from "../components/home/ScannerCard";
import { SystemStatusFooter } from "../components/home/SystemStatusFooter";
import { LoadingStatus, Skeleton } from "../components/ui/Skeleton";
import { useLocale } from "../i18n/LocaleProvider";
import "../components/home/home.css";

function SignedInHome() {
  return <>
    <div className="pv-home__grid">
      <div className="pv-home__side"><ScannerCard /></div>
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
