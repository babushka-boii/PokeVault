import { useLocale } from "../i18n/LocaleProvider";


export function HomePage() {
  const { dictionary } = useLocale();
  return <Page title={dictionary.home.title} description={dictionary.home.description} />;
}

function Page({ title, description }: { title: string; description: string }) {
  return (
    <section className="panel">
      <p className="eyebrow">PokéVault · Iteration 3</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </section>
  );
}
