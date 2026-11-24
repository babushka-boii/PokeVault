import { useState } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { AuthUser } from "../../services/auth";

/**
 * Google profile picture with an initials fallback. The picture is requested without a
 * referrer. Remount it (key) when the user or picture URL changes to reset the fallback.
 */
export function Avatar({ user, className = "auth-avatar", size = 96, decorative = false }: {
  user: AuthUser; className?: string; size?: number; decorative?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { dictionary } = useLocale();
  const initials = user.display_name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase();
  const alt = decorative ? "" : user.display_name.trim() ? dictionary.auth.picture.replace("{name}", user.display_name) : dictionary.auth.pictureFallback;
  return user.picture_url && !failed ? <img className={className} src={user.picture_url} alt={alt} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={`${className} ${className}--fallback`} aria-hidden="true">{initials || "?"}</span>;
}
