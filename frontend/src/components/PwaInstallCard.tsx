import React from 'react';
import {
  Download,
  Monitor,
  Smartphone,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Zap,
  ShieldCheck,
  Layers,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { usePwaInstall } from '../hooks/usePwaInstall';
import { InstallAppModal } from './InstallAppModal';

interface PwaInstallCardProps {
  variant?: 'banner' | 'card' | 'compact';
  className?: string;
}

export const PwaInstallCard: React.FC<PwaInstallCardProps> = ({
  variant: _variant = 'banner',
  className = '',
}) => {
  const { language } = usePreferences();
  const {
    isInstalled,
    hasNativePrompt,
    platform,
    showModal,
    setShowModal,
    triggerInstall,
  } = usePwaInstall();

  return (
    <>
      <div
        className={`relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-blue-950/40 p-5 sm:p-6 shadow-xl shadow-emerald-950/15 ${className}`}
      >
        {/* Subtle background glow */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Left: Icon & Text */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative shrink-0">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30">
                <Download size={26} />
              </div>
              <div className="absolute -bottom-1 -right-1 flex gap-0.5 bg-slate-900 border border-white/10 px-1 py-0.5 rounded-md text-[9px] font-bold text-emerald-400">
                <Monitor size={10} />
                <Smartphone size={10} />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight">
                  {language === 'bn'
                    ? 'এনএস ফাউন্ডেশন ডেস্কটপ ও মোবাইল অ্যাপ'
                    : 'NS Foundation Desktop & Mobile App'}
                </h3>
                {isInstalled ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 size={11} />
                    {language === 'bn' ? 'ইনস্টল করা আছে' : 'App Installed'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    <Sparkles size={11} />
                    {language === 'bn' ? 'সরাসরি অ্যাক্সেস' : 'One-Click PWA'}
                  </span>
                )}
              </div>

              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
                {language === 'bn'
                  ? 'কম্পিউটার ও স্মার্টফোনে ব্রাউজারের ঝামেলা ছাড়াই একক ট্যাপে দ্রুত ওপেন করুন। হিসাব ও রসিদ ব্যবস্থাপনা এখন যেকোনো ডিভাইস থেকে আরও সহজ।'
                  : 'Install on your PC or smartphone for lightning-fast, distraction-free access to society accounts and digital receipts.'}
              </p>

              {/* 3 Value Badges */}
              <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] text-slate-300">
                <span className="flex items-center gap-1">
                  <Zap size={12} className="text-amber-400" />
                  <span>{language === 'bn' ? 'সুপার-ফাস্ট গতি' : 'Ultra Fast'}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <Layers size={12} className="text-emerald-400" />
                  <span>{language === 'bn' ? 'ফুলস্ক্রিন উইন্ডো ভিউ' : 'Standalone Window'}</span>
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <ShieldCheck size={12} className="text-blue-400" />
                  <span>{language === 'bn' ? 'নিরাপদ অ্যাকাউন্ট ট্র্যাকিং' : 'Bank-Grade Security'}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
            {isInstalled ? (
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 text-xs font-bold transition-all flex items-center gap-2"
              >
                <CheckCircle2 size={16} />
                <span>{language === 'bn' ? 'অ্যাপ স্ট্যাটাস ও সাহায্য' : 'App Status & Help'}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={triggerInstall}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-extrabold text-xs shadow-lg shadow-emerald-500/25 transition-all transform active:scale-95 flex items-center gap-2"
                >
                  <Download size={16} />
                  <span>{language === 'bn' ? 'অ্যাপ ইনস্টল করুন' : 'Install App'}</span>
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="p-2.5 rounded-xl bg-slate-800/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
                  title={language === 'bn' ? 'কীভাবে ইনস্টল করবেন?' : 'How to install?'}
                  aria-label={language === 'bn' ? 'কীভাবে ইনস্টল করবেন?' : 'How to install?'}
                >
                  <HelpCircle size={16} />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Guide Modal */}
      <InstallAppModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        hasNativePrompt={hasNativePrompt}
        onNativeInstall={triggerInstall}
        isInstalled={isInstalled}
        initialPlatform={platform}
      />
    </>
  );
};
