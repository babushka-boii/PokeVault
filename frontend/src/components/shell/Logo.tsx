import { Link } from "react-router-dom";
import { useLocale } from "../../i18n/LocaleProvider";
import { Monogram } from "./icons";

export function LogoLink({ compact = false }: { compact?: boolean }) {
  const { dictionary } = useLocale();
  return <Link className="pv-logo" to="/" aria-label={dictionary.shell.logo}>
    <Monogram size={compact ? 30 : 34} />
    {!compact && <span className="pv-logo__word" aria-hidden="true">PokéVault</span>}
  </Link>;
}
