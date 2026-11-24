import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { CollectionValue } from "../components/prices/CollectionValue";
import { CurrencySwitch } from "../components/prices/PriceDisplay";
import { Avatar } from "../components/shell/Avatar";
import { useLocale } from "../i18n/LocaleProvider";
import "../auth/auth.css";

export function ProfilePage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <section className="panel auth-panel" aria-labelledby="profile-title">
    <p className="eyebrow">PokéVault</p>
    <h1 id="profile-title">{dictionary.profile.title}</h1>
    <SessionNotice />
    {auth.status === "authenticated" && <>
      {!auth.validating && <div className="auth-profile">
        <Avatar key={`${auth.user.id}:${auth.user.picture_url}`} user={auth.user} />
        <div className="auth-identity">
          <h2>{auth.user.display_name.trim() || dictionary.auth.account}</h2>
          {auth.user.email && <p>{auth.user.email}</p>}
          <p className="auth-status">{dictionary.auth.authenticated}</p>
        </div>
      </div>}
      {!auth.validating && !auth.loggingOut && <CollectionValue key={auth.user.id} />}
      {auth.error && <p className="auth-error" role="alert">{dictionary.auth.errors[auth.error]}</p>}
      <button className="auth-button auth-button--secondary" type="button" onClick={auth.logout} disabled={auth.loggingOut}>
        {auth.loggingOut ? dictionary.auth.loggingOut : dictionary.auth.logout}
      </button>
    </>}
    {auth.status === "unauthenticated" && <>
      <p>{dictionary.profile.description}</p>
      <section aria-label={dictionary.profile.preferences}><CurrencySwitch /></section>
      <Link className="auth-button" to="/login">{dictionary.auth.signIn}</Link>
    </>}
    <p className="auth-catalog-note">{dictionary.auth.publicCatalog}</p>
  </section>;
}
