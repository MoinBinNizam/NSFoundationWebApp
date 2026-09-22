import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Language, translateText } from '../i18n/translations';

type Theme = 'dark' | 'light';

interface PreferencesContextValue {
  theme: Theme; setTheme: (theme: Theme) => void; language: Language; setLanguage: (language: Language) => void;
  t: (english: string) => string;
  formatAmount: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatDate: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('language') as Language | null;
    if (saved === 'en' || saved === 'bn') return saved;
    return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('bn') ? 'bn' : 'en';
  });
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.lang = language === 'bn' ? 'bn' : 'en'; localStorage.setItem('theme', theme); }, [theme, language]);
  useEffect(() => { localStorage.setItem('language', language); }, [language]);
  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  const value = useMemo(() => ({
    theme, setTheme, language, setLanguage,
    t: (english: string) => translateText(english, language),
    formatAmount: (amount: number, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2, ...options }).format(Number(amount || 0)),
    formatNumber: (number: number, options: Intl.NumberFormatOptions = {}) => new Intl.NumberFormat(locale, options).format(Number(number || 0)),
    formatDate: (date: string | number | Date, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', ...options }).format(new Date(date)),
  }), [theme, language, locale]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider.');
  return context;
};
