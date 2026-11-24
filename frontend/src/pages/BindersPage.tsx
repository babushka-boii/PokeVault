import { useLocale } from "../i18n/LocaleProvider";

export function BindersPage() {
  const { dictionary } = useLocale();
  return <section className="pv-binders"><h1>{dictionary.binders.title}</h1></section>;
}
