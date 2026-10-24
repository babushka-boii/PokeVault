import { useLocale } from "../i18n/LocaleProvider";
import { useAuth } from "./context";

export function SessionNotice() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  if (auth.status === "loading") return <p role="status">{dictionary.auth.loading}</p>;
  if (auth.status !== "error") return null;
  return <div className="auth-notice">
    <p role="alert">{dictionary.auth.errors.session_unavailable}</p>
    <button className="auth-button auth-button--secondary" type="button" onClick={auth.retrySession}>{dictionary.auth.retry}</button>
  </div>;
}
