import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiRequest } from '../services/api';
import { BrandLogo } from '../components/BrandLogo';
import { usePreferences } from '../context/PreferencesContext';

export const RegisterPage: React.FC = () => {
  const { t } = usePreferences();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const response = await apiRequest<{ message?: string }>('/auth/public-register', { method: 'POST', body: JSON.stringify(form) });
      setMessage(response.message || 'Registration successful.');
      setTimeout(() => navigate('/login'), 900);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#0B0F19]">
      <form onSubmit={submit} className="glass-card w-full max-w-md p-6 space-y-4">
        <div className="flex flex-col items-center text-center gap-2">
          <BrandLogo size="xl" />
          <h1 className="text-2xl font-bold text-white">{t('Create account')}</h1>
        </div>
        <p className="text-sm text-gray-400">
          {t('Public registration creates a Member account only. Administrators grant staff permissions.')}
        </p>
        {error && <div className="alert alert-error">{t(error)}</div>}
        {message && <div className="alert alert-success">{t(message)}</div>}
        <input
          className="form-input"
          required
          placeholder={t('Full name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className="form-input"
          required
          type="email"
          placeholder={t('Email')}
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          className="form-input"
          placeholder={t('International phone')}
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <input
          className="form-input"
          required
          minLength={10}
          type="password"
          placeholder={t('Password (10+ characters)')}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        <button className="btn btn-primary w-full">{t('Register')}</button>
        <Link className="text-sm text-blue-300 hover:text-blue-200" to="/login">
          {t('Back to sign in')}
        </Link>
      </form>
    </div>
  );
};
