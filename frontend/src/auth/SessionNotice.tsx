import { useLocale } from "../i18n/LocaleProvider";
import { useAuth } from "./context";

export function SessionNotice() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  // A background check never shows a notice; only the first check does (the page keeps what it shows).
  if (auth.status === "loading") return <p role="status">{dictionary.auth.loading}</p>;
  // Signed in, but the last check could not reach the server: not a logout, so say so calmly.
  const unconfirmed = auth.status === "authenticated" && auth.error === "session_unavailable";
  if (unconfirmed) return <div className="auth-notice">
    <p role="status">{dictionary.auth.errors.session_unavailable}</p>
    <button className="auth-button auth-button--secondary" type="button" onClick={auth.retrySession}>{dictionary.auth.retry}</button>
  </div>;
  if (auth.status !== "error") return null;
  return <div className="auth-notice">
    <p role="alert">{dictionary.auth.errors.session_unavailable}</p>
    <button className="auth-button auth-button--secondary" type="button" onClick={auth.retrySession}>{dictionary.auth.retry}</button>
  </div>;
}
