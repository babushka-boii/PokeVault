import { useLocale } from "../i18n/LocaleProvider";


export function BoxesPage() {
  const { dictionary } = useLocale();
  return (
    <section className="panel">
      <h1>{dictionary.boxes.title}</h1>
      <p>{dictionary.boxes.description}</p>
    </section>
  );
}
