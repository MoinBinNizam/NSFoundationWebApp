import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Clock, Sparkles } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { getInterruptedWork, clearInterruptedWork } from '../services/api';

export const LoginPage: React.FC = () => {
  const { t, language } = usePreferences();
  const [searchParams] = useSearchParams();
  const isTimeout = searchParams.get('reason') === 'idle_timeout';

  const [email, setEmail] = useState('admin@nsfoundation.org');
  const [password, setPassword] = useState('Admin@123456');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const resolveTargetRoute = (userProfile: { mustChangePassword?: boolean; role?: string }) => {
    if (userProfile?.mustChangePassword) return '/change-password';
    const interrupted = getInterruptedWork();
    if (interrupted) {
      clearInterruptedWork();
      return interrupted;
    }
    return userProfile?.role === 'MEMBER' ? '/member-portal' : '/dashboard';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      const stored = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      navigate(resolveTargetRoute(stored), { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || t('Invalid credentials'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (role: 'ADMIN' | 'ACCOUNTANT' | 'MEMBER') => {
    setError(null);
    let targetEmail = 'admin@nsfoundation.org';
    let targetPassword = 'Admin@123456';

    if (role === 'ACCOUNTANT') {
      targetEmail = 'assistant@nsfoundation.org';
      targetPassword = 'Assistant@123456';
    } else if (role === 'MEMBER') {
      targetEmail = 'member@nsfoundation.org';
      targetPassword = 'Member@123456';
    }

    setEmail(targetEmail);
    setPassword(targetPassword);
    setSubmitting(true);
    try {
      await login(targetEmail, targetPassword);
      const stored = JSON.parse(sessionStorage.getItem('user') || localStorage.getItem('user') || '{}');
      navigate(resolveTargetRoute(stored), { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || t('Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#0B0F19] relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand Heading */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3">
            <BrandLogo size="xl" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            NS Foundation
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            {t('Cooperative Society Management Portal')}
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white tracking-tight">
              {t('Sign In')}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t('Approved members and authorized staff credentials.')}
            </p>
          </div>

          {isTimeout && (
            <div className="flex items-start gap-3 p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-xl text-amber-300 text-xs font-medium mb-5 animate-fadeIn">
              <Clock size={18} className="shrink-0 mt-0.5 text-amber-400" />
              <span>
                {language === 'bn'
                  ? 'নিরাপত্তার স্বার্থে ৫ মিনিট নিষ্ক্রিয় থাকায় সেশন সমাপ্ত হয়েছে। লগইন করলে আপনার পূর্বের কাজের পেজে স্বয়ংক্রিয়ভাবে ফিরিয়ে নেওয়া হবে।'
                  : 'For security, your session ended after 5 minutes of inactivity. Logging in will automatically resume your previous work page.'}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium mb-5 animate-fadeIn">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('Mobile number or email')}
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  type="text"
                  autoComplete="username"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder={t('01712345678 or name@example.org')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {t('Password')}
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:pointer-events-none"
            >
              {submitting ? (
                <span>{t('Authenticating...')}</span>
              ) : (
                <>
                  <span>{t('Sign In & Enter')}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 flex justify-between text-xs">
            <Link className="text-blue-300 hover:text-blue-200" to="/forgot-password">
              {t('Forgot password?')}
            </Link>
            <span className="text-slate-500">{t('Member access is issued by Admin')}</span>
          </div>

          {/* Quick 1-Click Instant Testing Access (Admin, Accountant, Member) */}
          <div className="mt-7 pt-5 border-t border-slate-800">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles size={14} className="text-amber-400" />
                <span>{language === 'bn' ? '১-ক্লিকে ইনস্ট্যান্ট টেস্ট এক্সেস:' : '1-Click Instant Test Access:'}</span>
              </span>
              <span className="text-[10px] text-slate-500">
                {language === 'bn' ? 'টেস্টের জন্য উন্মুক্ত' : 'Instant Sign-In'}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={submitting}
                className="flex flex-col items-center justify-center p-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 rounded-xl text-xs font-medium text-slate-200 transition-all hover:text-white"
                onClick={() => handleQuickLogin('ADMIN')}
                title="Log in as Primary Admin (Moin)"
              >
                <ShieldCheck size={16} className="text-blue-400 mb-1" />
                <span className="text-[11px] font-bold text-white truncate w-full text-center">{language === 'bn' ? 'অ্যাডমিন' : 'Admin'}</span>
                <span className="text-[9px] text-slate-400 truncate w-full text-center">Primary</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                className="flex flex-col items-center justify-center p-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 rounded-xl text-xs font-medium text-slate-200 transition-all hover:text-white"
                onClick={() => handleQuickLogin('ACCOUNTANT')}
                title="Log in as Assistant Accountant (Samrat)"
              >
                <ShieldCheck size={16} className="text-emerald-400 mb-1" />
                <span className="text-[11px] font-bold text-white truncate w-full text-center">{language === 'bn' ? 'হিসাবরক্ষক' : 'Accountant'}</span>
                <span className="text-[9px] text-slate-400 truncate w-full text-center">Samrat</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                className="flex flex-col items-center justify-center p-2.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-violet-500/50 rounded-xl text-xs font-medium text-slate-200 transition-all hover:text-white"
                onClick={() => handleQuickLogin('MEMBER')}
                title="Log in as General Member"
              >
                <ShieldCheck size={16} className="text-violet-400 mb-1" />
                <span className="text-[11px] font-bold text-white truncate w-full text-center">{language === 'bn' ? 'সদস্য' : 'Member'}</span>
                <span className="text-[9px] text-slate-400 truncate w-full text-center">Portal Demo</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6 font-medium">
          {t('Designed & Developed by')} <span className="text-slate-300">{t('Moin Uddin')}</span> © {t('All Rights Reserved.')}
        </p>
      </div>
    </div>
  );
};

