import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'dark' | 'light';
type Language = 'en' | 'bn';

const bn: Record<string, string> = {
  'Dashboard & Reports': 'ড্যাশবোর্ড ও রিপোর্ট', 'Member Management': 'সদস্য ব্যবস্থাপনা',
  'Shares & Annual Account': 'শেয়ার ও বার্ষিক হিসাব', 'Contributions & Payments': 'জমা ও পেমেন্ট',
  'Accountant Custody': 'হিসাবরক্ষকের তহবিল', Investments: 'বিনিয়োগ', 'Project Wallets': 'প্রকল্প ওয়ালেট',
  Expenses: 'খরচ', 'Final Distribution': 'চূড়ান্ত বণ্টন', 'Organization Settings': 'সংগঠনের সেটিংস',
  'System Operational': 'সিস্টেম চালু', 'Core Modules': 'মূল মডিউল', 'Sign Out': 'সাইন আউট',
};

interface PreferencesContextValue {
  theme: Theme; setTheme: (theme: Theme) => void; language: Language; setLanguage: (language: Language) => void;
  t: (english: string) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'dark');
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('language') as Language) || 'en');
  useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.lang = language === 'bn' ? 'bn' : 'en'; localStorage.setItem('theme', theme); }, [theme, language]);
  useEffect(() => { localStorage.setItem('language', language); }, [language]);
  const value = useMemo(() => ({ theme, setTheme, language, setLanguage, t: (english: string) => language === 'bn' ? (bn[english] || english) : english }), [theme, language]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export const usePreferences = () => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used within PreferencesProvider.');
  return context;
};
