import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('admin@nsfoundation.org');
  const [password, setPassword] = useState('Admin@123456');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/members';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || 'Invalid credentials');
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (role: 'ADMIN' | 'ACCOUNTANT') => {
    setError(null);
    const targetEmail = role === 'ADMIN' ? 'admin@nsfoundation.org' : 'assistant@nsfoundation.org';
    const targetPassword = role === 'ADMIN' ? 'Admin@123456' : 'Assistant@123456';
    setEmail(targetEmail);
    setPassword(targetPassword);
    setSubmitting(true);
    try {
      await login(targetEmail, targetPassword);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      setError((err as Error).message || 'Login failed');
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
            <BrandLogo size="xl" editable />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            NS Foundation
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            Cooperative Society Management Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/50">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Sign In
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Authorized staff and society administration credentials.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium mb-5 animate-fadeIn">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Staff Email
              </label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  type="email"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/60 border border-slate-700/60 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  placeholder="admin@nsfoundation.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
                />
                <input
                  type="password"
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
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In & Enter</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Quick Credential Helpers */}
          <div className="mt-8 pt-5 border-t border-slate-800">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase mb-3 flex items-center gap-1.5">
              <span>⚡ One-Click Instant Sign-In:</span>
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={submitting}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 rounded-xl text-xs font-semibold text-slate-200 transition-all hover:text-white"
                onClick={() => handleQuickLogin('ADMIN')}
              >
                <ShieldCheck size={15} className="text-blue-400 shrink-0" />
                <span className="truncate">Primary Admin</span>
              </button>
              <button
                type="button"
                disabled={submitting}
                className="flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-emerald-500/50 rounded-xl text-xs font-semibold text-slate-200 transition-all hover:text-white"
                onClick={() => handleQuickLogin('ACCOUNTANT')}
              >
                <ShieldCheck size={15} className="text-emerald-400 shrink-0" />
                <span className="truncate">Assistant Acc.</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
