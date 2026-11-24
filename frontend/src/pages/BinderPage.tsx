import { useLocale } from "../i18n/LocaleProvider";

export function BinderPage() {
  const { dictionary } = useLocale();
  return <section className="pv-binder"><h1>{dictionary.binders.title}</h1></section>;
}
