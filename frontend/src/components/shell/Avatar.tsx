import { useState, type CSSProperties } from "react";
import { useLocale } from "../../i18n/LocaleProvider";
import type { AuthUser } from "../../services/auth";

/**
 * Google profile picture with an initials fallback. The picture is requested without a
 * referrer. Remount it (key) when the user or picture URL changes to reset the fallback.
 *
 * `cut` draws the "Unova Noir" square with a diagonal cut corner (used where the picture is
 * large: Home's greeting and Profile). The image fills the whole square, cropped to cover;
 * the default is the small round picture of the header.
 */
export function Avatar({ user, className = "auth-avatar", size = 96, decorative = false, cut = false }: {
  user: AuthUser; className?: string; size?: number; decorative?: boolean; cut?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const { dictionary } = useLocale();
  const initials = user.display_name.trim().split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toLocaleUpperCase();
  const alt = decorative ? "" : user.display_name.trim() ? dictionary.auth.picture.replace("{name}", user.display_name) : dictionary.auth.pictureFallback;
  const picture = user.picture_url && !failed;
  if (cut) {
    return <span className={`pv-avatar-frame pv-cut${className ? ` ${className}` : ""}`} style={{ "--pv-avatar-size": `${size}px` } as CSSProperties}>
      {picture ? <img className="pv-avatar-frame__fill" src={user.picture_url!} alt={alt} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
        : <span className="pv-avatar-frame__fill pv-avatar-frame__fill--fallback" aria-hidden="true">{initials || "?"}</span>}
    </span>;
  }
  return picture ? <img className={className} src={user.picture_url!} alt={alt} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className={`${className} ${className}--fallback`} aria-hidden="true">{initials || "?"}</span>;
}
