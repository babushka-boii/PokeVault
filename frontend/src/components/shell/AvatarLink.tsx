import { NavLink } from "react-router-dom";
import { useAuth } from "../../auth/context";
import { useLocale } from "../../i18n/LocaleProvider";
import { Avatar } from "./Avatar";
import { UserIcon } from "./icons";

/** Header link to Profile: the account picture when signed in, a neutral glyph otherwise. */
export function AvatarLink() {
  const auth = useAuth();
  const { dictionary } = useLocale();
  return <NavLink className="pv-avatar-link" to="/profile" aria-label={dictionary.nav.profile}>
    {auth.status === "authenticated"
      ? <Avatar key={`${auth.user.id}:${auth.user.picture_url}`} user={auth.user} className="pv-avatar" size={32} decorative />
      : <UserIcon />}
  </NavLink>;
}
