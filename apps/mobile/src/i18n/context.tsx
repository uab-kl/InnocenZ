import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadLocale, saveLocale, type AppLocale } from './locale-prefs';
import { translations, type AppTranslations } from './translations';

type LocaleContextValue = {
  locale: AppLocale;
  t: AppTranslations;
  setLocale: (locale: AppLocale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(loadLocale);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
    saveLocale(next);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      t: translations[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}
