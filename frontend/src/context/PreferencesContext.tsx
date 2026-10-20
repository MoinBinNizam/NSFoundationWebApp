import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Language, translateText } from '../i18n/translations';

export type Theme = 'dark' | 'light';
export type BanglaFont =
  | 'hind-siliguri'
  | 'noto-sans-bengali'
  | 'solaiman-lipi'
  | 'kalpurush'
  | 'tiro-bangla'
  | 'anek-bangla'
  | 'default';

export type EnglishFont =
  | 'plus-jakarta-sans'
  | 'inter'
  | 'outfit'
  | 'roboto'
  | 'poppins'
  | 'lora'
  | 'default';

export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';

export const FONT_FAMILY_MAP: Record<BanglaFont, string> = {
  'hind-siliguri': "'Hind Siliguri', 'Plus Jakarta Sans', system-ui, sans-serif",
  'noto-sans-bengali': "'Noto Sans Bengali', 'Plus Jakarta Sans', system-ui, sans-serif",
  'solaiman-lipi': "'SolaimanLipi', 'Kalpurush', 'Noto Sans Bengali', sans-serif",
  'kalpurush': "'Kalpurush', 'SolaimanLipi', 'Noto Sans Bengali', sans-serif",
  'tiro-bangla': "'Tiro Bangla', 'Noto Serif Bengali', 'Plus Jakarta Sans', serif",
  'anek-bangla': "'Anek Bangla', 'Plus Jakarta Sans', system-ui, sans-serif",
  default: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
};

export const ENGLISH_FONT_FAMILY_MAP: Record<EnglishFont, string> = {
  'plus-jakarta-sans': "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
  inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
  outfit: "'Outfit', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
  roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
  poppins: "'Poppins', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
  lora: "'Lora', Georgia, 'Tiro Bangla', serif",
  default: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Hind Siliguri', sans-serif",
};

const FONT_SIZE_MAP: Record<FontSize, string> = {
  small: '14px',
  medium: '16px',
  large: '18px',
  xlarge: '20px',
};

interface PreferencesContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (language: Language) => void;
  banglaFont: BanglaFont;
  setBanglaFont: (font: BanglaFont) => void;
  englishFont: EnglishFont;
  setEnglishFont: (font: EnglishFont) => void;
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
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
    return 'bn';
  });
  const [banglaFont, setBanglaFont] = useState<BanglaFont>(() => {
    const saved = localStorage.getItem('banglaFont') as BanglaFont | null;
    if (
      saved &&
      ['hind-siliguri', 'noto-sans-bengali', 'solaiman-lipi', 'kalpurush', 'tiro-bangla', 'anek-bangla', 'default'].includes(
        saved
      )
    ) {
      return saved;
    }
    return 'hind-siliguri';
  });
  const [englishFont, setEnglishFont] = useState<EnglishFont>(() => {
    const saved = localStorage.getItem('englishFont') as EnglishFont | null;
    if (
      saved &&
      ['plus-jakarta-sans', 'inter', 'outfit', 'roboto', 'poppins', 'lora', 'default'].includes(saved)
    ) {
      return saved;
    }
    return 'plus-jakarta-sans';
  });
  const [fontSize, setFontSize] = useState<FontSize>(() => {
    const saved = localStorage.getItem('fontSize') as FontSize | null;
    if (saved && ['small', 'medium', 'large', 'xlarge'].includes(saved)) {
      return saved;
    }
    return 'medium';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.lang = language === 'bn' ? 'bn' : 'en';
    localStorage.setItem('theme', theme);
  }, [theme, language]);

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  // Dynamically apply selected font to root and body based on current language
  useEffect(() => {
    document.documentElement.setAttribute('data-language', language);
    document.documentElement.setAttribute('data-bangla-font', banglaFont);
    document.documentElement.setAttribute('data-english-font', englishFont);

    const activeFont =
      language === 'bn'
        ? (FONT_FAMILY_MAP[banglaFont] || FONT_FAMILY_MAP['hind-siliguri'])
        : (ENGLISH_FONT_FAMILY_MAP[englishFont] || ENGLISH_FONT_FAMILY_MAP['plus-jakarta-sans']);

    document.documentElement.style.setProperty('--font-sans', activeFont);
    document.body.style.setProperty('font-family', activeFont, 'important');

    localStorage.setItem('banglaFont', banglaFont);
    localStorage.setItem('englishFont', englishFont);
  }, [language, banglaFont, englishFont]);

  // Dynamically apply selected font size to root html
  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize);
    const chosenSize = FONT_SIZE_MAP[fontSize] || '16px';
    document.documentElement.style.setProperty('font-size', chosenSize, 'important');
    localStorage.setItem('fontSize', fontSize);
  }, [fontSize]);

  const locale = language === 'bn' ? 'bn-BD' : 'en-BD';
  // Financial and reference numbers remain in Latin digits in every language
  // so member IDs, totals, and statements are unambiguous.
  const numericLocale = 'en-BD';
  const value = useMemo(
    () => ({
      theme,
      setTheme,
      language,
      setLanguage,
      banglaFont,
      setBanglaFont,
      englishFont,
      setEnglishFont,
      fontSize,
      setFontSize,
      t: (english: string) => translateText(english, language),
      formatAmount: (amount: number, options: Intl.NumberFormatOptions = {}) =>
        new Intl.NumberFormat(numericLocale, {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
          ...options,
        }).format(Number(amount || 0)),
      formatNumber: (number: number, options: Intl.NumberFormatOptions = {}) =>
        new Intl.NumberFormat(numericLocale, options).format(Number(number || 0)),
      formatDate: (
        date: string | number | Date,
        options: Intl.DateTimeFormatOptions = {}
      ) =>
        new Intl.DateTimeFormat(locale, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          ...options,
        }).format(new Date(date)),
    }),
    [theme, language, banglaFont, englishFont, fontSize, locale, numericLocale]
  );
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider.');
  return context;
};


