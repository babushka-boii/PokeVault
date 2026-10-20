import { useLocale } from "../i18n/LocaleProvider";


export function ProfilePage() {
  const { dictionary } = useLocale();
  return (
    <section className="panel">
      <h1>{dictionary.profile.title}</h1>
      <p>{dictionary.profile.description}</p>
    </section>
  );
}
