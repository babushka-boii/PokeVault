import { useLocale } from "../../i18n/LocaleProvider";
import type { TcgCard } from "../../services/cards";

export function CardLanguageNote({ card }: { card: TcgCard }) {
  const { dictionary, locale } = useLocale();
  if (card.language === locale) return null;
  return <p className="tcg-language-note">{card.language === "en" ? dictionary.cards.englishFallback : dictionary.cards.spanishFallback}</p>;
}
