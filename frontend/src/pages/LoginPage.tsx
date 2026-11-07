import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { useLocale } from "../i18n/LocaleProvider";
import { AuthClientError, callbackErrorCode, requestGoogleLogin, type AuthErrorCode } from "../services/auth";
import "../auth/auth.css";

export function LoginPage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  const [params, setParams] = useSearchParams();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<AuthErrorCode | null>(null);
  const request = useRef<AbortController | null>(null);
  const callbackError = params.has("error") ? callbackErrorCode(params.get("error")) : null;
  const displayedError = error ?? callbackError;

  useEffect(() => () => { request.current?.abort(); }, []);

  async function login() {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setWorking(true);
    setError(null);
    if (params.has("error")) {
      const next = new URLSearchParams(params);
      next.delete("error");
      setParams(next, { replace: true });
    }
    try {
      const destination = await requestGoogleLogin(controller.signal);
      if (!controller.signal.aborted) globalThis.location.assign(destination);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure instanceof AuthClientError ? failure.code : "unknown");
      request.current = null;
      setWorking(false);
    }
  }

  return <section className="panel auth-panel" aria-labelledby="login-title">
    <p className="eyebrow">PokéVault</p>
    <h1 id="login-title">{dictionary.auth.title}</h1>
    <p>{dictionary.auth.description}</p>
    <SessionNotice />
    {displayedError && <p className="auth-error" role="alert">{dictionary.auth.errors[displayedError]}</p>}
    {auth.status === "authenticated" ? <>
      <p className="auth-status">{dictionary.auth.authenticated}</p>
      <Link className="auth-button" to="/profile">{dictionary.auth.viewProfile}</Link>
    </> : <button className="auth-button auth-google" type="button" onClick={() => { void login(); }} disabled={working || auth.status === "loading"}>
      <span className="auth-google-mark" aria-hidden="true">G</span>
      {working ? dictionary.auth.connecting : dictionary.auth.continueGoogle}
    </button>}
    <p className="auth-catalog-note">{dictionary.auth.publicCatalog}</p>
    <Link to="/pokedex">{dictionary.auth.explore}</Link>
  </section>;
}
