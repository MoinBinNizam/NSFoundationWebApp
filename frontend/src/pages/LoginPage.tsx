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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 20%, #1e293b 0%, #0b0f19 80%)',
        padding: '20px',
      }}
    >
      <div style={{ maxWidth: '440px', width: '100%' }}>
        {/* Brand Heading */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-lg)',
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px var(--primary-glow)',
              marginBottom: '16px',
            }}
          >
            <Building2 size={28} color="#ffffff" />
          </div>
          <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            NS Foundation
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Cooperative Society Management Portal
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '6px' }}>
            Sign In to your account
          </h2>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)', marginBottom: '24px' }}>
            Enter your authorized staff credentials to continue.
          </p>

          {error && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#F87171',
                fontSize: '0.85rem',
                marginBottom: '20px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-subtle)',
                  }}
                />
                <input
                  type="email"
                  required
                  className="form-input"
                  style={{ paddingLeft: '40px' }}
                  placeholder="admin@nsfoundation.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-subtle)',
                  }}
                />
                <input
                  type="password"
                  required
                  className="form-input"
                  style={{ paddingLeft: '40px' }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px', padding: '12px' }}
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
          <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-subtle)', marginBottom: '10px' }}>
              ONE-CLICK DEV SEEDED CREDENTIALS:
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fillCredentials('ADMIN')}
                style={{ fontSize: '0.75rem' }}
              >
                <ShieldCheck size={14} color="#60A5FA" />
                <span>Primary Admin</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fillCredentials('ACCOUNTANT')}
                style={{ fontSize: '0.75rem' }}
              >
                <ShieldCheck size={14} color="#34D399" />
                <span>Assistant Acc.</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
