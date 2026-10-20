import { useLocale } from "../i18n/LocaleProvider";


export function PokedexPage() {
  const { dictionary } = useLocale();
  return (
    <section className="panel">
      <h1>{dictionary.pokedex.title}</h1>
      <p>{dictionary.pokedex.description}</p>
    </section>
  );
}
