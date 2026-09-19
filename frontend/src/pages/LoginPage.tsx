import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Building2, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  const fillCredentials = (role: 'ADMIN' | 'ACCOUNTANT') => {
    if (role === 'ADMIN') {
      setEmail('admin@nsfoundation.org');
      setPassword('Admin@123456');
    } else {
      setEmail('assistant@nsfoundation.org');
      setPassword('Assistant@123456');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-5 bg-[#0B0F19] bg-[radial-gradient(ellipse_at_50%_20%,#1e293b_0%,#0b0f19_80%)]">
      <div className="max-w-md w-full">
        {/* Brand Heading */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 inline-flex items-center justify-center shadow-lg shadow-blue-500/30 mb-4">
            <Building2 size={28} className="text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            NS Foundation
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Cooperative Society Management Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-8">
          <h2 className="text-lg font-bold text-white mb-1.5">
            Sign In to your account
          </h2>
          <p className="text-xs text-gray-400 mb-6">
            Enter your authorized staff credentials to continue.
          </p>

          {error && (
            <div className="flex items-center gap-2.5 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm mb-5">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-group mb-0">
              <label className="form-label">Email Address</label>
              <div className="relative">
                <Mail
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="email"
                  required
                  className="form-input pl-10"
                  placeholder="admin@nsfoundation.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label">Password</label>
              <div className="relative">
                <Lock
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="password"
                  required
                  className="form-input pl-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full py-3 mt-3"
            >
              {submitting ? (
                'Verifying...'
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Quick Credential Helpers */}
          <div className="mt-7 pt-5 border-t border-white/10">
            <p className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase mb-2.5">
              One-Click Dev Seeded Credentials:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm text-xs py-2"
                onClick={() => fillCredentials('ADMIN')}
              >
                <ShieldCheck size={14} className="text-blue-400" />
                <span>Primary Admin</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm text-xs py-2"
                onClick={() => fillCredentials('ACCOUNTANT')}
              >
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Assistant Acc.</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
