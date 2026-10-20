import { useLocale } from "../i18n/LocaleProvider";
import { SystemStatus } from "../components/SystemStatus";


export function HomePage() {
  const { dictionary } = useLocale();
  return (
    <section className="panel">
      <p className="eyebrow">PokéVault · Iteration 3</p>
      <h1>{dictionary.home.title}</h1>
      <p>{dictionary.home.description}</p>
      <SystemStatus />
    </section>
  );
}
