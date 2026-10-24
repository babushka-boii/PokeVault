import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { useLocale } from "../i18n/LocaleProvider";
import type { AuthUser } from "../services/auth";
import "../auth/auth.css";

function ProfilePicture({ user }: { user: AuthUser }) {
  const [failed, setFailed] = useState(false);
  const { dictionary } = useLocale();
  const initials = user.display_name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase();
  return user.picture_url && !failed ? <img className="auth-avatar" src={user.picture_url} alt={user.display_name.trim() ? dictionary.auth.picture.replace("{name}", user.display_name) : dictionary.auth.pictureFallback} width="96" height="96" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="auth-avatar auth-avatar--fallback" aria-hidden="true">{initials || "?"}</span>;
}

export function ProfilePage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <section className="panel auth-panel" aria-labelledby="profile-title">
    <p className="eyebrow">PokéVault</p>
    <h1 id="profile-title">{dictionary.profile.title}</h1>
    <SessionNotice />
    {auth.status === "authenticated" && <>
      <div className="auth-profile">
        <ProfilePicture key={`${auth.user.id}:${auth.user.picture_url}`} user={auth.user} />
        <div className="auth-identity">
          <h2>{auth.user.display_name.trim() || dictionary.auth.account}</h2>
          {auth.user.email && <p>{auth.user.email}</p>}
          <p className="auth-status">{dictionary.auth.authenticated}</p>
        </div>
      </div>
      {auth.error && <p className="auth-error" role="alert">{dictionary.auth.errors[auth.error]}</p>}
      <button className="auth-button auth-button--secondary" type="button" onClick={auth.logout} disabled={auth.loggingOut}>
        {auth.loggingOut ? dictionary.auth.loggingOut : dictionary.auth.logout}
      </button>
    </>}
    {auth.status === "unauthenticated" && <>
      <p>{dictionary.profile.description}</p>
      <Link className="auth-button" to="/login">{dictionary.auth.signIn}</Link>
    </>}
    <p className="auth-catalog-note">{dictionary.auth.publicCatalog}</p>
  </section>;
}
