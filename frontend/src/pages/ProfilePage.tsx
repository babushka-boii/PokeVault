import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/context";
import { SessionNotice } from "../auth/SessionNotice";
import { Breakdowns } from "../components/profile/Breakdowns";
import { FavoritesRow } from "../components/profile/FavoritesRow";
import { StatGrid } from "../components/profile/StatGrid";
import { TrainerBand } from "../components/profile/TrainerBand";
import { ValueCard } from "../components/profile/ValueCard";
import { useCurrency } from "../components/prices/currency";
import { CurrencySwitch, RatesAttribution, ReferenceNote } from "../components/prices/PriceDisplay";
import { useCollectionValuation } from "../components/prices/useCollectionValuation";
import { Avatar } from "../components/shell/Avatar";
import { useProfile } from "../hooks/useProfile";
import { useTcgResource } from "../hooks/useTcgResource";
import { useLocale } from "../i18n/LocaleProvider";
import { fetchFavoriteCards } from "../services/favorites";
import { fetchBinderValues, fetchSetValues } from "../services/prices";
import { fetchSpeciesIndex } from "../services/species";
import "../auth/auth.css";
import "../components/profile/profile.css";

/** The signed-in profile: trainer band, value, counts, favourites and breakdowns (Iteration 10). */
function SignedProfile() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  const { currency, ready } = useCurrency();
  const user = auth.status === "authenticated" ? auth.user : null;
  const userId = user?.id ?? "";
  const valuation = useCollectionValuation();
  const profile = useProfile(userId);
  const index = useTcgResource("species-index", fetchSpeciesIndex);
  const favorites = useTcgResource(ready ? `profile-favorites:${userId}:${currency}` : undefined, useCallback((signal: AbortSignal) => fetchFavoriteCards(currency, signal), [currency]));
  const setValues = useTcgResource(ready ? `profile-sets:${userId}:${currency}` : undefined, useCallback((signal: AbortSignal) => fetchSetValues(currency, signal), [currency]));
  const binderValues = useTcgResource(ready ? `profile-binders:${userId}:${currency}` : undefined, useCallback((signal: AbortSignal) => fetchBinderValues(currency, signal), [currency]));
  const value = valuation.state.kind === "loaded" ? valuation.state.data : null;
  const name = user?.display_name.trim() || dictionary.auth.account;
  return <div className="pv-profile">
    <TrainerBand name={name} profile={profile.profile} failed={profile.failed} retry={profile.retry} rows={index.state.kind === "loaded" ? index.state.data : null} save={profile.save} />
    <section className="pv-profile__summary" aria-label={dictionary.profilePage.statsLabel}>
      <ValueCard valuation={valuation} />
      <StatGrid stats={{
        copies: value?.copy_count ?? null,
        sets: setValues.state.kind === "loaded" ? setValues.state.data.results.length : null,
        favorites: favorites.state.kind === "loaded" ? favorites.state.data.total : null,
        withoutVariant: value ? value.unpriced_by_reason.variant_unknown ?? 0 : null,
      }} />
    </section>
    <FavoritesRow resource={favorites} />
    <Breakdowns binderValues={binderValues} setValues={setValues} />
    <footer className="pv-profile__foot">
      <ReferenceNote />
      {value && value.total !== null && value.priced_count > 0 && <RatesAttribution rates={value.rates} />}
      <CurrencySwitch />
      <SessionNotice />
      {auth.error && <p className="auth-error" role="alert">{dictionary.auth.errors[auth.error]}</p>}
      <button className="auth-button auth-button--secondary" type="button" onClick={auth.logout} disabled={auth.loggingOut}>{dictionary.auth.logout}</button>
      <p className="auth-catalog-note">{dictionary.auth.publicCatalog}</p>
    </footer>
  </div>;
}

export function ProfilePage() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  if (auth.status === "authenticated" && !auth.validating && !auth.loggingOut) return <SignedProfile key={auth.user.id} />;
  return <section className="panel auth-panel" aria-labelledby="profile-title">
    <p className="eyebrow">PokéVault</p>
    <h1 id="profile-title">{dictionary.profile.title}</h1>
    <SessionNotice />
    {auth.status === "authenticated" && <>
      {!auth.validating && <div className="auth-profile">
        <Avatar key={`${auth.user.id}:${auth.user.picture_url}`} user={auth.user} className="" size={96} cut />
        <div className="auth-identity">
          <h2>{auth.user.display_name.trim() || dictionary.auth.account}</h2>
          {auth.user.email && <p>{auth.user.email}</p>}
          <p className="auth-status">{dictionary.auth.authenticated}</p>
        </div>
      </div>}
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
