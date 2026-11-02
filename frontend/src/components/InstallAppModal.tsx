import React, { useState } from 'react';
import {
  Download,
  X,
  Monitor,
  Smartphone,
  Apple,
  CheckCircle2,
  Share,
  PlusSquare,
  Sparkles,
  Zap,
  WifiOff,
  ShieldCheck,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

interface InstallAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  hasNativePrompt: boolean;
  onNativeInstall: () => void;
  isInstalled: boolean;
  initialPlatform?: 'desktop' | 'android' | 'ios';
}

export const InstallAppModal: React.FC<InstallAppModalProps> = ({
  isOpen,
  onClose,
  hasNativePrompt,
  onNativeInstall,
  isInstalled,
  initialPlatform = 'desktop',
}) => {
  const { language } = usePreferences();
  const [activeTab, setActiveTab] = useState<'desktop' | 'android' | 'ios'>(initialPlatform);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl text-slate-100 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <Download size={24} />
          </div>
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <span>{language === 'bn' ? 'অ্যাপ ইনস্টল করুন' : 'Install NS Foundation App'}</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                PWA Fast
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === 'bn'
                ? 'ডেস্কটপ ও মোবাইলে দ্রুত ও ইন্টারনেট ছাড়াই ইনস্টল করে ব্যবহার করুন'
                : 'Install as a standalone native app on Desktop, Android, and iOS'}
            </p>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-slate-950/60 border border-white/5 mb-5 text-center">
          <div className="flex flex-col items-center">
            <Zap size={16} className="text-amber-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">
              {language === 'bn' ? 'সুপার ফাস্ট' : 'Instant Speed'}
            </span>
            <span className="text-[10px] text-slate-400">
              {language === 'bn' ? 'ব্রাউজার ছাড়া সরাসরি' : 'No browser bar'}
            </span>
          </div>
          <div className="flex flex-col items-center border-x border-white/5">
            <WifiOff size={16} className="text-blue-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">
              {language === 'bn' ? 'অফলাইন ক্যাশ' : 'Offline Ready'}
            </span>
            <span className="text-[10px] text-slate-400">
              {language === 'bn' ? 'ক্যাশড ডেটা সাপোর্ট' : 'Cached assets'}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <ShieldCheck size={16} className="text-emerald-400 mb-1" />
            <span className="text-[11px] font-bold text-slate-200">
              {language === 'bn' ? '১০০% নিরাপদ' : 'Full Secure'}
            </span>
            <span className="text-[10px] text-slate-400">
              {language === 'bn' ? 'অফিসিয়াল প্ল্যাটফর্ম' : 'Official Portal'}
            </span>
          </div>
        </div>

        {/* If Already Installed */}
        {isInstalled && (
          <div className="p-3.5 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-300">
                {language === 'bn'
                  ? 'আপনার ডিভাইসে অ্যাপটি ইতিমধ্যে ইনস্টল করা আছে!'
                  : 'App is already installed on this device!'}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {language === 'bn'
                  ? 'ডেস্কটপ বা মোবাইলের অ্যাপ্লিকেশন মেনু থেকে সরাসরি ওপেন করতে পারেন।'
                  : 'You can launch it directly from your applications or home screen.'}
              </p>
            </div>
          </div>
        )}

        {/* Direct One-Click Button (if supported) */}
        {hasNativePrompt && !isInstalled && (
          <div className="mb-5">
            <button
              onClick={onNativeInstall}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-sm shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.98]"
            >
              <Sparkles size={18} />
              <span>{language === 'bn' ? 'এক ক্লিকে সরাসরি ইনস্টল করুন' : 'Click Here to Install Directly'}</span>
            </button>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              {language === 'bn'
                ? 'ব্রাউজারে একটি পপ-আপ আসলে "Install" বাটনে চাপ দিন।'
                : 'Click "Install" in the browser confirmation prompt.'}
            </p>
          </div>
        )}

        {/* Platform Selection Tabs */}
        <div className="flex border-b border-white/10 mb-4">
          <button
            onClick={() => setActiveTab('desktop')}
            className={`flex-1 pb-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'desktop'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor size={15} />
            <span>{language === 'bn' ? 'ডেস্কটপ / পিসি' : 'Desktop (PC)'}</span>
          </button>
          <button
            onClick={() => setActiveTab('android')}
            className={`flex-1 pb-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'android'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone size={15} />
            <span>{language === 'bn' ? 'অ্যান্ড্রয়েড ফোন' : 'Android'}</span>
          </button>
          <button
            onClick={() => setActiveTab('ios')}
            className={`flex-1 pb-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border-b-2 ${
              activeTab === 'ios'
                ? 'border-emerald-400 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Apple size={15} />
            <span>{language === 'bn' ? 'আইফোন / আইপ্যাড' : 'iPhone / iPad'}</span>
          </button>
        </div>

        {/* Tab Content: Desktop */}
        {activeTab === 'desktop' && (
          <div className="space-y-3 text-xs text-slate-300">
            <p className="font-semibold text-white">
              {language === 'bn'
                ? 'কম্পিউটারে (Google Chrome / Microsoft Edge / Brave) যেভাবে ইনস্টল করবেন:'
                : 'Installation Steps on Google Chrome / Microsoft Edge / Brave:'}
            </p>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ১
              </span>
              <span>
                {language === 'bn'
                  ? 'ব্রাউজারের অ্যাড্রেস বারের (URL bar) একেবারে ডানপাশে অবস্থিত ইনস্টল আইকন (⊕ বা মনিটর আইকন) এ ক্লিক করুন।'
                  : 'Look at the far right side of your browser address/URL bar and click the Install icon (⊕ or computer screen icon).'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ২
              </span>
              <span>
                {language === 'bn'
                  ? 'অথবা ব্রাউজারের উপরের ডানপাশের ৩-ডট মেনু (⋮) তে ক্লিক করে "Install NS Foundation..." সিলেক্ট করুন।'
                  : 'Or click the browser menu (⋮) at top-right and select "Install NS Foundation..."'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ৩
              </span>
              <span>
                {language === 'bn'
                  ? 'কনফার্মেশন বক্সে "Install" এ চাপ দিলেই ডেস্কটপে শর্টকাট তৈরি হবে এবং সফটওয়্যার আলাদা উইন্ডোতে চালু হবে।'
                  : 'Click "Install" to create a desktop shortcut and run the application in its own native window.'}
              </span>
            </div>
          </div>
        )}

        {/* Tab Content: Android */}
        {activeTab === 'android' && (
          <div className="space-y-3 text-xs text-slate-300">
            <p className="font-semibold text-white">
              {language === 'bn'
                ? 'অ্যান্ড্রয়েড মোবাইলে যেভাবে ইনস্টল করবেন:'
                : 'Installation Steps on Android Mobile (Chrome / Samsung Internet):'}
            </p>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ১
              </span>
              <span>
                {language === 'bn'
                  ? 'ক্রোম ব্রাউজারের উপরে ডানদিকের ৩-ডট মেনু বাটনে (⋮) চাপ দিন।'
                  : 'Tap the 3-dot menu icon (⋮) in the top right corner of Chrome.'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ২
              </span>
              <span>
                {language === 'bn'
                  ? 'মেনু থেকে "Install app" অথবা "Add to Home screen" (হোম স্ক্রিনে যোগ করুন) চাপুন।'
                  : 'Select "Install app" or "Add to Home screen" from the menu options.'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ৩
              </span>
              <span>
                {language === 'bn'
                  ? '"Install" এ চাপলে স্বয়ংক্রিয়ভাবে আপনার ফোনের অ্যাপ ড্রয়ার ও হোম স্ক্রিনে চলে আসবে।'
                  : 'Tap "Install" to place the NS Foundation icon directly on your phone home screen.'}
              </span>
            </div>
          </div>
        )}

        {/* Tab Content: iOS Safari */}
        {activeTab === 'ios' && (
          <div className="space-y-3 text-xs text-slate-300">
            <p className="font-semibold text-white">
              {language === 'bn'
                ? 'আইফোন ও আইপ্যাডে (Apple Safari) যেভাবে ইনস্টল করবেন:'
                : 'Installation Steps on Apple iPhone / iPad (Safari):'}
            </p>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ১
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                {language === 'bn' ? 'সাফারি ব্রাউজারের নিচের' : 'Tap the Safari'}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-blue-400 font-bold">
                  <Share size={12} /> {language === 'bn' ? 'শেয়ার (Share)' : 'Share'}
                </span>
                {language === 'bn' ? 'আইকনে চাপ দিন।' : 'icon at the bottom center.'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ২
              </span>
              <span className="flex items-center gap-1.5 flex-wrap">
                {language === 'bn' ? 'একটু নিচে স্ক্রোল করে' : 'Scroll down and tap'}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 text-emerald-400 font-bold">
                  <PlusSquare size={12} /> {language === 'bn' ? 'Add to Home Screen' : 'Add to Home Screen'}
                </span>
                {language === 'bn' ? 'অপশনটি নির্বাচন করুন।' : 'option.'}
              </span>
            </div>
            <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-950/40 border border-white/5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center shrink-0">
                ৩
              </span>
              <span>
                {language === 'bn'
                  ? 'উপরের ডানপাশের "Add" বাটনে চাপ দিলেই আপনার হোম স্ক্রিনে সুন্দর আইকন হিসেবে বসে যাবে।'
                  : 'Tap "Add" in the top right corner. The app icon will now appear on your iPhone screen.'}
              </span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            {language === 'bn' ? 'এনএস ফাউন্ডেশন কো-অপারেটিভ সোসাইটি' : 'NS Foundation Cooperative'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
          >
            {language === 'bn' ? 'ঠিক আছে / বন্ধ করুন' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
