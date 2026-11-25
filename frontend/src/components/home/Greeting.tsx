import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { Avatar } from "../shell/Avatar";
import { firstName } from "./age";
import "./home.css";

/**
 * "Hola, {nombre}" beside a fixed 64 px slot for the trainer sprite. The Profile iteration
 * will fill the slot with the trainer; until then it shows the account picture.
 */
export function Greeting() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  if (auth.status !== "authenticated") return null;
  const name = firstName(auth.user.display_name);
  return <div className="pv-home__greeting">
    <span className="pv-home__trainer" aria-hidden="true">
      <Avatar key={`${auth.user.id}:${auth.user.picture_url}`} user={auth.user} className="" size={64} decorative cut />
    </span>
    <h2 id="home-greeting">{name ? dictionary.home.greeting.replace("{name}", name) : dictionary.home.greetingAnonymous}</h2>
  </div>;
}
