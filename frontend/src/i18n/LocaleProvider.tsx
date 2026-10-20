import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { dictionaries, type Dictionary } from "./dictionaries";


export type Locale = "es" | "en";

type LocaleContextValue = {
  locale: Locale;
  dictionary: Dictionary;
  toggleLocale: () => void;
};

const STORAGE_KEY = "pokevault.locale";
const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Locale {
  return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "es";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      dictionary: dictionaries[locale],
      toggleLocale: () => setLocale((current) => (current === "es" ? "en" : "es")),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (context === null) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return context;
}
