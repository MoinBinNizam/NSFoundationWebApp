import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';
import { BrandLogo } from '../components/BrandLogo';
import {
  KeyRound,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Sparkles,
} from 'lucide-react';

export const PasswordResetPage: React.FC = () => {
  const { t, language } = usePreferences();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const urlToken = params.get('token') || '';
  const [activeStep, setActiveStep] = useState<'request' | 'reset'>(urlToken ? 'reset' : 'request');

  // Step 1: Request states
  const [identifier, setIdentifier] = useState('admin@nsfoundation.org');
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);

  // Step 2: Reset states
  const [token, setToken] = useState(urlToken);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (urlToken) {
      setToken(urlToken);
      setActiveStep('reset');
    }
  }, [urlToken]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRequestSuccess(null);
    setRequestLoading(true);

    try {
      const res = await apiRequest<{ resetToken?: string; developmentResetToken?: string }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: identifier }),
        }
      );

      const issuedToken = res.data?.resetToken || res.data?.developmentResetToken;
      if (issuedToken) {
        setToken(issuedToken);
        setRequestSuccess(
          language === 'bn'
            ? 'পাসওয়ার্ড রিসেটের ভেরিফিকেশন টোকেন সফলভাবে ইস্যু করা হয়েছে। নিচে নতুন পাসওয়ার্ড দিন।'
            : 'Password recovery verification token generated. Proceeding to set new password.'
        );
        // Automatically advance to Step 2 for immediate seamless testing
        setTimeout(() => {
          setActiveStep('reset');
        }, 800);
      } else {
        setRequestSuccess(
          res.message ||
            (language === 'bn'
              ? 'যদি এই একাউন্টটি সংরক্ষিত থাকে, তবে পাসওয়ার্ড রিসেটের লিংক প্রদান করা হয়েছে।'
              : 'Password reset instructions have been issued.')
        );
      }
    } catch (err) {
      setError((err as Error).message || t('Request failed'));
    } finally {
      setRequestLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(
        language === 'bn'
          ? 'নতুন পাসওয়ার্ড ন্যূনতম ৮ অক্ষরের হতে হবে।'
          : 'New password must be at least 8 characters long.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(
        language === 'bn'
          ? 'পাসওয়ার্ড এবং কনফার্ম পাসওয়ার্ড দুটি মিলছে না।'
          : 'New password and confirmation password do not match.'
      );
      return;
    }

    setResetLoading(true);

    try {
      const res = await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token: token.trim(),
          password: newPassword,
        }),
      });

      setResetSuccess(
        res.message ||
          (language === 'bn'
            ? 'পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে! আপনি এখন নতুন পাসওয়ার্ড দিয়ে লগইন করতে পারেন।'
            : 'Password successfully updated! You can now sign in with your new password.')
      );

      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 2500);
    } catch (err) {
      setError((err as Error).message || t('Password reset failed.'));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#0B0F19] relative overflow-hidden">
      {/* Background Decorative Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand Header with Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-block mb-3">
            <BrandLogo size="xl" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            NS Foundation
          </h1>
          <p className="text-slate-400 text-sm mt-1 font-medium">
            {language === 'bn'
              ? 'নিরাপদ পাসওয়ার্ড পুনরুদ্ধার সেবা'
              : 'Secure Password Recovery System'}
          </p>
        </div>

        {/* Password Reset Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          {/* Step Selector Tabs */}
          <div className="flex border-b border-slate-800 mb-6 pb-2 gap-4">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveStep('request');
              }}
              className={`text-xs font-bold pb-2 transition-colors border-b-2 -mb-2.5 flex items-center gap-1.5 ${
                activeStep === 'request'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>১. {language === 'bn' ? 'টোকেন অনুরোধ' : 'Request Token'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setActiveStep('reset');
              }}
              className={`text-xs font-bold pb-2 transition-colors border-b-2 -mb-2.5 flex items-center gap-1.5 ${
                activeStep === 'reset'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>২. {language === 'bn' ? 'নতুন পাসওয়ার্ড সেট' : 'Set Password'}</span>
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium mb-5 animate-fadeIn">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {requestSuccess && (
            <div className="flex items-start gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/25 rounded-xl text-emerald-300 text-xs font-medium mb-5 animate-fadeIn">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>{requestSuccess}</span>
            </div>
          )}

          {resetSuccess && (
            <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-200 text-xs font-medium mb-5 text-center animate-fadeIn space-y-2">
              <CheckCircle2 size={24} className="mx-auto text-emerald-400" />
              <p className="font-bold text-sm text-white">{resetSuccess}</p>
              <p className="text-[11px] text-emerald-300">
                {language === 'bn'
                  ? 'স্বয়ংক্রিয়ভাবে লগইন পেজে নিয়ে যাওয়া হচ্ছে...'
                  : 'Redirecting to sign-in page...'}
              </p>
            </div>
          )}

          {/* STEP 1: REQUEST TOKEN */}
          {activeStep === 'request' && !resetSuccess && (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {language === 'bn' ? 'অ্যাকাউন্টের ইমেইল বা মোবাইল নম্বর' : 'Account Email or Mobile Number'}
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                  <input
                    type="text"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder={language === 'bn' ? '01712345678 বা email@example.com' : '01712345678 or name@example.org'}
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={requestLoading}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {requestLoading ? (
                  <span>{language === 'bn' ? 'টোকেন তৈরি হচ্ছে...' : 'Generating Token...'}</span>
                ) : (
                  <>
                    <span>{language === 'bn' ? 'রিসেট টোকেন পাঠান' : 'Send Reset Instructions'}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep('reset')}
                  className="w-full text-center text-xs text-blue-400 hover:text-blue-300 font-medium py-1"
                >
                  {language === 'bn' ? 'ইতিমধ্যেই টোকেন পেয়েছেন? এখানে পাসওয়ার্ড সেট করুন →' : 'Already have a reset token? Enter it here →'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: SET NEW PASSWORD */}
          {activeStep === 'reset' && !resetSuccess && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>{language === 'bn' ? 'ভেরিফিকেশন রিসেট টোকেন' : 'Verification Reset Token'}</span>
                  {token && (
                    <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <Sparkles size={11} />
                      {language === 'bn' ? 'টোকেন প্রস্তুত' : 'Token Loaded'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <KeyRound
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                  <input
                    type="text"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 font-mono text-xs transition-all"
                    placeholder={language === 'bn' ? '৩২-অক্ষরের রিসেট টোকেন দিন' : 'Enter 32-character reset token'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {language === 'bn' ? 'নতুন পাসওয়ার্ড (ন্যূনতম ৮ অক্ষর)' : 'New Password (min 8 chars)'}
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  {language === 'bn' ? 'নতুন পাসওয়ার্ড নিশ্চিত করুন' : 'Confirm New Password'}
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full mt-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {resetLoading ? (
                  <span>{language === 'bn' ? 'সংরক্ষণ করা হচ্ছে...' : 'Saving Password...'}</span>
                ) : (
                  <>
                    <span>{language === 'bn' ? 'নতুন পাসওয়ার্ড সেট করুন' : 'Save & Set New Password'}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep('request')}
                  className="w-full text-center text-xs text-slate-400 hover:text-slate-300 font-medium py-1"
                >
                  ← {language === 'bn' ? 'আগের ধাপে ফিরে যান' : 'Back to request step'}
                </button>
              </div>
            </form>
          )}

          {/* Navigation Links */}
          <div className="mt-6 pt-4 border-t border-slate-800 text-center">
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              <ArrowLeft size={14} />
              <span>{language === 'bn' ? 'লগইন পেজে ফিরে যান' : 'Back to Sign In'}</span>
            </Link>
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

export default PasswordResetPage;
