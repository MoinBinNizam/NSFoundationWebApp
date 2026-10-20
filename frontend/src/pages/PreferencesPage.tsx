import React, { useState } from 'react';
import {
  CheckCircle2,
  Languages,
  Monitor,
  Moon,
  Settings2,
  Sun,
  Type,
  ZoomIn,
  Eye,
} from 'lucide-react';
import { BanglaFont, EnglishFont, FontSize, usePreferences } from '../context/PreferencesContext';

interface FontOption {
  id: BanglaFont;
  nameEn: string;
  nameBn: string;
  badge?: string;
  descriptionEn: string;
  descriptionBn: string;
  sampleBn: string;
  fontFamily: string;
}

const BANGLA_FONTS: FontOption[] = [
  {
    id: 'hind-siliguri',
    nameEn: 'Hind Siliguri',
    nameBn: 'হিন্দ শিলিগুড়ি',
    badge: 'Recommended',
    descriptionEn: 'Modern, crisp, geometric sans-serif tailored for Bengali digital interfaces.',
    descriptionBn: 'আধুনিক, পরিচ্ছন্ন ও স্পষ্ট জ্যামিতিক ফন্ট — সফটওয়্যার ও ওয়েবের জন্য সেরা।',
    sampleBn: 'ন্যাচারাল স্কাই ফাউন্ডেশন সমবায় সমিতি',
    fontFamily: "'Hind Siliguri', sans-serif",
  },
  {
    id: 'noto-sans-bengali',
    nameEn: 'Noto Sans Bengali',
    nameBn: 'নোটো সান্স বাংলা',
    badge: 'Google Standard',
    descriptionEn: 'Authoritative Google font designed for maximum cross-platform clarity.',
    descriptionBn: 'গুগলের মানসম্মত আন্তর্জাতিক বাংলা ফন্ট — সার্বজনীন স্পষ্টতা ও সামঞ্জস্য।',
    sampleBn: 'স্বচ্ছ সঞ্চয়, সঠিক হিসাবায়ন ও বিনিয়োগ',
    fontFamily: "'Noto Sans Bengali', sans-serif",
  },
  {
    id: 'tiro-bangla',
    nameEn: 'Tiro Bangla',
    nameBn: 'তিরো বাংলা',
    badge: 'Formal Serif',
    descriptionEn: 'Formal, literary serif style ideal for official resolutions and circulars.',
    descriptionBn: 'প্রাতিষ্ঠানিক ও মার্জিত সেরিফ ফন্ট — রেজোলিউশন ও স্মারকের জন্য উপযুক্ত।',
    sampleBn: 'বার্ষিক সাধারণ সভা ও সাধারণ রেজোলিউশন',
    fontFamily: "'Tiro Bangla', serif",
  },
  {
    id: 'anek-bangla',
    nameEn: 'Anek Bangla',
    nameBn: 'অনেক বাংলা',
    badge: 'Contemporary',
    descriptionEn: 'Bold, expressive modern typeface featuring contemporary typographic curves.',
    descriptionBn: 'সমসাময়িক স্টাইলিশ টাইপোগ্রাফি — আধুনিক ও গতিশীল ডিজাইনের জন্য।',
    sampleBn: 'শতভাগ আর্থিক স্বচ্ছতা ও জবাবদিহিতা',
    fontFamily: "'Anek Bangla', sans-serif",
  },
  {
    id: 'solaiman-lipi',
    nameEn: 'SolaimanLipi',
    nameBn: 'সোলাইমানলিপি',
    badge: 'Popular Webfont',
    descriptionEn: 'The most popular classic webfont for online Bengali portals and formal documents.',
    descriptionBn: 'অনলাইন বাংলা পোর্টাল ও নথিপত্রের সর্বাধিক জনপ্রিয় ও বহুল ব্যবহৃত ক্লাসিক ফন্ট।',
    sampleBn: 'সদস্য সঞ্চয় ও সমবায় ব্যবস্থাপনা',
    fontFamily: "'SolaimanLipi', 'Kalpurush', sans-serif",
  },
  {
    id: 'kalpurush',
    nameEn: 'Kalpurush',
    nameBn: 'কালপুরুষ',
    badge: 'Classic Document',
    descriptionEn: 'Iconic Bengali document font renowned for balance, proportion, and legibility.',
    descriptionBn: 'সুষম অনুপাত ও পরিচ্ছন্ন পাঠযোগ্যতার জন্য পরিচিত জনপ্রিয় ঐতিহ্যবাহী বাংলা ফন্ট।',
    sampleBn: 'মাসিক সঞ্চয় ও শেয়ার মূলধন হিসাব',
    fontFamily: "'Kalpurush', 'SolaimanLipi', sans-serif",
  },
  {
    id: 'default',
    nameEn: 'System Default',
    nameBn: 'সিস্টেম ডিফল্ট',
    descriptionEn: 'Plus Jakarta Sans with default system Bengali fallback.',
    descriptionBn: 'ডিফল্ট প্লাস জাকার্তা সান্স ও ব্রাউজার সিস্টেম ফন্ট।',
    sampleBn: 'NS Foundation Cooperative Society',
    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  },
];

interface EnglishFontOption {
  id: EnglishFont;
  nameEn: string;
  nameBn: string;
  badge?: string;
  descriptionEn: string;
  descriptionBn: string;
  sampleEn: string;
  fontFamily: string;
}

const ENGLISH_FONTS: EnglishFontOption[] = [
  {
    id: 'plus-jakarta-sans',
    nameEn: 'Plus Jakarta Sans',
    nameBn: 'প্লাস জাকার্তা সান্স',
    badge: 'Default / Original',
    descriptionEn: 'The original clean, modern geometric typeface engineered for sleek enterprise dashboards.',
    descriptionBn: 'সিস্টেমের মূল আধুনিক ও পরিচ্ছন্ন জ্যামিতিক ফন্ট — ড্যাশবোর্ড ও প্রতিবেদনের জন্য সেরা।',
    sampleEn: 'Natural Sky Foundation Cooperative Society',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  {
    id: 'inter',
    nameEn: 'Inter',
    nameBn: 'ইন্টার',
    badge: 'UI Standard',
    descriptionEn: 'World standard computer interface font famous for numerical clarity and data density.',
    descriptionBn: 'আন্তর্জাতিক মানসম্মত ইউজার ইন্টারফেস ফন্ট — সংখ্যা ও ডাটা টেবিলে সর্বোচ্চ স্পষ্টতা।',
    sampleEn: 'Audit Transparency & Member Share Capital',
    fontFamily: "'Inter', sans-serif",
  },
  {
    id: 'outfit',
    nameEn: 'Outfit',
    nameBn: 'আউটফিট',
    badge: 'Modern & Sleek',
    descriptionEn: 'Contemporary sans with friendly curves, creating an elegant visual brand identity.',
    descriptionBn: 'স্টাইলিশ ও আকর্ষণীয় আধুনিক ফন্ট — আকর্ষণীয় হেডিং ও কার্ড ডিসপ্লের জন্য।',
    sampleEn: 'Verified Invoices, Bank Receipts & Reserves',
    fontFamily: "'Outfit', sans-serif",
  },
  {
    id: 'roboto',
    nameEn: 'Roboto',
    nameBn: 'রোবোটো',
    badge: 'Google Classic',
    descriptionEn: "Google's flagship neo-grotesque sans-serif with natural reading rhythm and spacing.",
    descriptionBn: 'গুগলের বিশ্বখ্যাত ক্লাসিক ফন্ট — দীর্ঘ সময় পড়ার জন্য চোখের অনুকূল ও চমৎকার স্পেসিং।',
    sampleEn: 'Statutory Compliance & Monthly Contributions',
    fontFamily: "'Roboto', sans-serif",
  },
  {
    id: 'poppins',
    nameEn: 'Poppins',
    nameBn: 'পপিন্স',
    badge: 'Geometric Bold',
    descriptionEn: 'Vibrant geometric sans-serif based on pure circles and balanced strokes.',
    descriptionBn: 'বিশুদ্ধ বৃত্তাকার গড়নযুক্ত জ্যামিতিক ফন্ট — অত্যন্ত আধুনিক ও দৃষ্টিনন্দন।',
    sampleEn: 'Capital Dividend Distribution & Analytics',
    fontFamily: "'Poppins', sans-serif",
  },
  {
    id: 'lora',
    nameEn: 'Lora',
    nameBn: 'লোরা',
    badge: 'Formal Serif',
    descriptionEn: 'Well-proportioned contemporary serif typeface ideal for formal resolutions and circulars.',
    descriptionBn: 'প্রাতিষ্ঠানিক ও মার্জিত সেরিফ ফন্ট — রেজোলিউশন ও অফিশিয়াল নথির জন্য চমৎকার।',
    sampleEn: 'Annual General Meeting & Board Resolutions',
    fontFamily: "'Lora', Georgia, serif",
  },
];

interface FontSizeOption {
  id: FontSize;
  nameEn: string;
  nameBn: string;
  sizeLabel: string;
  descEn: string;
  descBn: string;
}

const FONT_SIZES: FontSizeOption[] = [
  {
    id: 'small',
    nameEn: 'Small',
    nameBn: 'ছোট',
    sizeLabel: '14px (90%)',
    descEn: 'Compact layout optimized for dense ledger tables and numerical reports.',
    descBn: 'কম্প্যাক্ট ভিউ — আর্থিক ডাটা টেবিল ও লেজারের জন্য নিখুঁত।',
  },
  {
    id: 'medium',
    nameEn: 'Medium',
    nameBn: 'স্বাভাবিক',
    sizeLabel: '16px (100%)',
    descEn: 'Standard baseline scale recommended for most desktop and tablet displays.',
    descBn: 'আদর্শ স্ট্যান্ডার্ড সাইজ — অধিকাংশ ডিভাইসের জন্য উপযুক্ত।',
  },
  {
    id: 'large',
    nameEn: 'Large',
    nameBn: 'বড়',
    sizeLabel: '17.5px (110%)',
    descEn: 'Spacious and comfortable reading experience with enhanced contrast.',
    descBn: 'আরামদায়ক পাঠযোগ্যতা — সহজে ও স্পষ্টভাবে পড়ার জন্য সেরা।',
  },
  {
    id: 'xlarge',
    nameEn: 'Extra Large',
    nameBn: 'অতিরিক্ত বড়',
    sizeLabel: '19px (120%)',
    descEn: 'Maximum magnification for big screens or high-visibility readability.',
    descBn: 'বৃহৎ ডিসপ্লে — বড় মনিটর অথবা চোখের স্বাচ্ছন্দ্যে পড়ার জন্য।',
  },
];

export const PreferencesPage: React.FC = () => {
  const {
    language,
    setLanguage,
    theme,
    setTheme,
    banglaFont,
    setBanglaFont,
    englishFont,
    setEnglishFont,
    fontSize,
    setFontSize,
    t,
  } = usePreferences();
  const deviceLanguage = typeof navigator === 'undefined' ? 'en' : navigator.language;

  const [previewTab, setPreviewTab] = useState<'auto' | 'bn' | 'en'>('auto');

  const currentFont = BANGLA_FONTS.find((f) => f.id === banglaFont) || BANGLA_FONTS[0];
  const currentEnglishFont = ENGLISH_FONTS.find((f) => f.id === englishFont || (englishFont === 'default' && f.id === 'plus-jakarta-sans')) || ENGLISH_FONTS[0];
  const currentSize = FONT_SIZES.find((s) => s.id === fontSize) || FONT_SIZES[1];

  const effectivePreviewLang = previewTab === 'auto' ? language : previewTab;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-4xl mx-auto pb-16">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-blue-400">
          <Settings2 size={18} />
          <span className="text-xs font-bold uppercase tracking-wider">
            {t('Personal Settings')}
          </span>
        </div>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">
          {t('Language & Appearance')}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          {t(
            'Personalize language, popular Bengali fonts, font scale, and color themes for this device.'
          )}
        </p>
      </header>

      {/* 1. Language Selection */}
      <section className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 text-blue-300">
            <Languages size={20} />
          </div>
          <div>
            <h2 className="font-bold text-white text-base sm:text-lg">{t('Language')}</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              {t(
                'Your choice is saved for this browser. The first visit follows your device language when available.'
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setLanguage('bn')}
            className={`rounded-xl border p-4 text-left transition-all ${
              language === 'bn'
                ? 'border-blue-400 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-white/25'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-base">বাংলা</span>
              {language === 'bn' && <CheckCircle2 size={18} className="text-blue-400" />}
            </div>
            <p className="text-xs text-gray-400 mt-1">বাংলা (বাংলাদেশ) — ডিফল্ট ও অফিসিয়াল ভাষা</p>
          </button>

          <button
            onClick={() => setLanguage('en')}
            className={`rounded-xl border p-4 text-left transition-all ${
              language === 'en'
                ? 'border-blue-400 bg-blue-500/10 shadow-lg shadow-blue-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-white/25'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-white text-base">English</span>
              {language === 'en' && <CheckCircle2 size={18} className="text-blue-400" />}
            </div>
            <p className="text-xs text-gray-400 mt-1">English (Bangladesh) — International notation</p>
          </button>
        </div>

        <p className="flex items-center gap-2 text-xs text-gray-500 pt-1">
          <Monitor size={14} />
          <span>
            {t('Device language')}: {deviceLanguage}
          </span>
        </p>
      </section>

      {/* 2. Popular Bangla Font Settings */}
      <section className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 p-2.5 text-cyan-300">
              <Type size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-white text-base sm:text-lg">
                  {t('Bangla Font Style')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {currentFont.nameBn}
                </span>
                {language === 'bn' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {t('Currently Active')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-gray-400 border border-white/10">
                    {t('Applies when language is Bangla')}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                {t(
                  'Select from popular curated Bengali fonts for optimal readability across statements, ledgers, and resolutions.'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {BANGLA_FONTS.map((font) => {
            const isSelected = banglaFont === font.id;
            return (
              <button
                key={font.id}
                onClick={() => setBanglaFont(font.id)}
                className={`rounded-xl border p-4 text-left transition-all flex flex-col justify-between gap-3 relative group ${
                  isSelected
                    ? 'border-cyan-400 bg-cyan-500/10 shadow-lg shadow-cyan-500/10 ring-1 ring-cyan-400/50'
                    : 'border-white/10 bg-slate-900/60 hover:border-white/25 hover:bg-slate-900/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm">{font.nameBn}</span>
                    {isSelected ? (
                      <CheckCircle2 size={16} className="text-cyan-400 shrink-0" />
                    ) : font.badge ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                        {font.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-gray-400 block font-mono mt-0.5">
                    {font.nameEn}
                  </span>

                  <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                    {language === 'bn' ? font.descriptionBn : font.descriptionEn}
                  </p>
                </div>

                <div
                  className="rounded-lg bg-black/30 border border-white/5 p-2.5 text-center mt-1"
                  style={{ fontFamily: font.fontFamily }}
                >
                  <p className="text-xs sm:text-sm text-white font-medium truncate">
                    {font.sampleBn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 3. English Font Settings */}
      <section className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/20 p-2.5 text-indigo-300">
              <Type size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-white text-base sm:text-lg">
                  {t('English Font Style')}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                  {currentEnglishFont.nameEn}
                </span>
                {language === 'en' ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {t('Currently Active')}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-white/5 text-gray-400 border border-white/10">
                    {t('Applies when language is English')}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                {t(
                  'Select from curated premium English typefaces for international statements, ledger tables, and executive reports.'
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {ENGLISH_FONTS.map((font) => {
            const isSelected = englishFont === font.id || (englishFont === 'default' && font.id === 'plus-jakarta-sans');
            return (
              <button
                key={font.id}
                onClick={() => setEnglishFont(font.id)}
                className={`rounded-xl border p-4 text-left transition-all flex flex-col justify-between gap-3 relative group ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-400/50'
                    : 'border-white/10 bg-slate-900/60 hover:border-white/25 hover:bg-slate-900/80'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white text-sm">{font.nameEn}</span>
                    {isSelected ? (
                      <CheckCircle2 size={16} className="text-indigo-400 shrink-0" />
                    ) : font.badge ? (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/5 text-gray-400 border border-white/10">
                        {font.badge}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-gray-400 block font-mono mt-0.5">
                    {font.nameBn}
                  </span>

                  <p className="text-xs text-gray-400 mt-2 line-clamp-2 leading-relaxed">
                    {language === 'bn' ? font.descriptionBn : font.descriptionEn}
                  </p>
                </div>

                <div
                  className="rounded-lg bg-black/30 border border-white/5 p-2.5 text-center mt-1"
                  style={{ fontFamily: font.fontFamily }}
                >
                  <p className="text-xs sm:text-sm text-white font-medium truncate">
                    {font.sampleEn}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 4. Font Size & Display Scale */}
      <section className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-emerald-300">
            <ZoomIn size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-white text-base sm:text-lg">{t('Font Size')}</h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                {currentSize.sizeLabel}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              {t(
                'Scale application text size dynamically. Compact sizes fit more financial columns, while larger sizes maximize clarity.'
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {FONT_SIZES.map((size) => {
            const isSelected = fontSize === size.id;
            return (
              <button
                key={size.id}
                onClick={() => setFontSize(size.id)}
                className={`rounded-xl border p-4 text-left transition-all flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-emerald-400 bg-emerald-500/10 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/50'
                    : 'border-white/10 bg-slate-900/60 hover:border-white/25 hover:bg-slate-900/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-sm">
                    {language === 'bn' ? size.nameBn : size.nameEn}
                  </span>
                  {isSelected && <CheckCircle2 size={16} className="text-emerald-400" />}
                </div>
                <span className="text-xs font-mono text-emerald-400 font-semibold">
                  {size.sizeLabel}
                </span>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  {language === 'bn' ? size.descBn : size.descEn}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* 5. Live Interactive Preview Card */}
      <section className="glass-card p-5 sm:p-6 space-y-4 border-l-4 border-l-cyan-500 bg-gradient-to-r from-cyan-950/20 via-slate-900/40 to-transparent">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Eye size={18} className="text-cyan-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {t('Live Font Preview')}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="inline-flex rounded-lg bg-black/40 p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setPreviewTab('auto')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  previewTab === 'auto'
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {language === 'bn' ? 'বর্তমান ভাষা' : 'Current Language'}
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('bn')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  previewTab === 'bn'
                    ? 'bg-cyan-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                বাংলা
              </button>
              <button
                type="button"
                onClick={() => setPreviewTab('en')}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                  previewTab === 'en'
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
            <span className="text-gray-400">
              {effectivePreviewLang === 'bn' ? (
                <>
                  {t('Active Bangla Font')}: <strong className="text-cyan-300">{currentFont.nameBn}</strong>
                </>
              ) : (
                <>
                  {t('Active English Font')}: <strong className="text-indigo-300">{currentEnglishFont.nameEn}</strong>
                </>
              )}
            </span>
            <span>·</span>
            <span className="text-gray-400">
              {t('Scale')}: <strong className="text-emerald-400">{currentSize.sizeLabel}</strong>
            </span>
          </div>
        </div>

        {effectivePreviewLang === 'bn' ? (
          <div
            className="rounded-xl border border-white/10 bg-slate-950/70 p-4 sm:p-5 space-y-3 transition-all"
            style={{ fontFamily: currentFont.fontFamily }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2 flex-wrap">
              <div>
                <h4 className="text-base sm:text-lg font-extrabold text-white">
                  ন্যাচারাল স্কাই ফাউন্ডেশন সমবায় সমিতি
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  সদস্য সঞ্চয়, প্রকল্প বিনিয়োগ ও লভ্যাংশ বণ্টন ব্যবস্থাপনা প্ল্যাটফর্ম
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                ১০০% আর্থিক স্বচ্ছতা
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  শেয়ার বুক ভ্যালু
                </span>
                <span className="text-white font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৳৫০০.০০
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  সক্রিয় সদস্য
                </span>
                <span className="text-white font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৪৭ জন
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  মোট তরল তহবিল
                </span>
                <span className="text-cyan-400 font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৳১২,৪৫,০০০
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  মাসিক আদায় হার
                </span>
                <span className="text-emerald-400 font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৯৮.৫%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="rounded-xl border border-white/10 bg-slate-950/70 p-4 sm:p-5 space-y-3 transition-all"
            style={{ fontFamily: currentEnglishFont.fontFamily }}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3 gap-2 flex-wrap">
              <div>
                <h4 className="text-base sm:text-lg font-extrabold text-white">
                  Natural Sky Foundation Cooperative Society
                </h4>
                <p className="text-xs text-gray-400 mt-0.5">
                  Member Capital Reserves, Investment Projects & Audited Financial Ledger
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                100% Financial Transparency
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Share Book Value
                </span>
                <span className="text-white font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৳ 500.00
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Active Members
                </span>
                <span className="text-white font-extrabold text-sm sm:text-base mt-0.5 block">
                  47 Members
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Liquid Capital
                </span>
                <span className="text-indigo-400 font-extrabold text-sm sm:text-base mt-0.5 block">
                  ৳ 1,245,000
                </span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5">
                <span className="text-gray-400 block text-[10px] uppercase font-bold">
                  Collection Rate
                </span>
                <span className="text-emerald-400 font-extrabold text-sm sm:text-base mt-0.5 block">
                  98.5%
                </span>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. Theme / Appearance */}
      <section className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 p-2.5 text-violet-300">
            {theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </div>
          <div>
            <h2 className="font-bold text-white text-base sm:text-lg">{t('Appearance')}</h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
              {t('Choose the colour theme that is most comfortable for your eyes.')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => setTheme('dark')}
            className={`rounded-xl border p-4 text-left transition-all ${
              theme === 'dark'
                ? 'border-violet-400 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-white/25'
            }`}
          >
            <Moon size={18} className="text-violet-300 mb-2" />
            <span className="font-semibold text-white block">{t('Dark theme')}</span>
            <span className="text-xs text-gray-400 mt-1 block">
              Default high-contrast dark palette for night & office use
            </span>
          </button>

          <button
            onClick={() => setTheme('light')}
            className={`rounded-xl border p-4 text-left transition-all ${
              theme === 'light'
                ? 'border-violet-400 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                : 'border-white/10 bg-slate-900/60 hover:border-white/25'
            }`}
          >
            <Sun size={18} className="text-amber-300 mb-2" />
            <span className="font-semibold text-white block">{t('Light theme')}</span>
            <span className="text-xs text-gray-400 mt-1 block">
              Clean daylight appearance with calibrated contrast
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};

