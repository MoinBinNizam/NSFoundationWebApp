import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpenCheck,
  CalendarCheck2,
  UserRoundX,
  FileText,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  AlignLeft,
  ArrowRight,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { ModuleGuide } from '../components/ModuleGuide';

type Closing = {
  _id: string;
  year: number;
  status: string;
  summary: Record<string, number>;
};

export const GovernancePage: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = usePreferences();
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [closings, setClosings] = useState<Closing[]>([]);

  // Policy Document State
  const [policyDocContent, setPolicyDocContent] = useState<string>('');
  const [savingPolicyDoc, setSavingPolicyDoc] = useState<boolean>(false);
  const [policyDocNotice, setPolicyDocNotice] = useState<string | null>(null);

  // General Notification
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));

  const load = useCallback(async () => {
    try {
      const [c, doc] = await Promise.all([
        apiRequest<Closing[]>('/governance/annual'),
        apiRequest<{ content: string }>('/governance/policies/document').catch(() => ({ data: { content: '' } })),
      ]);
      setClosings(c.data || []);
      setPolicyDocContent(doc.data?.content || '');
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const formatPoliciesText = (rawText: string): string => {
    if (!rawText) return '';
    // Normalize accidental splits of percentages or decimals
    let formatted = rawText
      .replace(/\r\n/g, '\n')
      .replace(/([০-৯\d]+)[।.]\s*([০-৯\d]+%)/g, '$1.$2')
      .replace(/থেকে\s*\n+\s*([০-৯\d.]+)/g, 'থেকে $1');

    formatted = formatted.replace(
      /(^|[^\d০-৯.])([০-৯\d]{1,3})(?:।|\.(?![০-৯\d])|\))\s*/g,
      (_match, prefix, num, offset, fullStr) => {
        // If preceded by a digit or dot, it's a decimal like 9.99
        if (offset > 0 && /[\d০-৯.]/.test(fullStr[offset - 1])) {
          return _match;
        }
        // If followed by digits (decimal part), don't split
        const rest = fullStr.slice(offset + _match.length);
        if (/^[০-৯\d]/.test(rest)) {
          return _match;
        }
        const isStart = offset === 0 || prefix === '' || prefix === '\n';
        const cleanPrefix = prefix.replace(/\n+$/, '');
        return (isStart ? '' : cleanPrefix + '\n\n') + (num + '। ');
      }
    );
    // Sub-clauses like ক), খ), a), b)
    formatted = formatted.replace(/(^|[^\n])\s*([ক-হa-zA-Z])[)\]]\s*/g, '$1\n   $2) ');
    return formatted.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleSavePolicyDoc = async () => {
    setSavingPolicyDoc(true);
    setPolicyDocNotice(null);
    setError('');
    try {
      const formatted = formatPoliciesText(policyDocContent);
      setPolicyDocContent(formatted);
      await apiRequest('/governance/policies/document', {
        method: 'POST',
        body: JSON.stringify({ content: formatted }),
      });
      setPolicyDocNotice(t('Policy document saved successfully.'));
      setTimeout(() => setPolicyDocNotice(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPolicyDoc(false);
    }
  };

  const createClosing = async () => {
    try {
      await apiRequest('/governance/annual', { method: 'POST', body: JSON.stringify({ year: Number(year) }) });
      setNotice('Annual closing draft created.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const action = async (id: string, name: 'review' | 'approve' | 'lock' | 'unlock') => {
    try {
      await apiRequest(`/governance/annual/${id}/${name}`, { method: 'POST' });
      setNotice(
        name === 'unlock'
          ? t('Annual closing unlocked.')
          : name === 'lock'
          ? t('Annual closing locked.')
          : `Annual closing ${name}ed.`
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };



  return (
    <div className="space-y-6 max-w-7xl pb-12">
      <ModuleGuide moduleKey="GOVERNANCE" defaultOpen={false} />

      <header>
        <div className="text-blue-400 text-xs font-bold uppercase tracking-wide">{t('Governance controls')}</div>
        <h1 className="text-2xl font-extrabold text-white mt-1">{t('Annual Closing, Policy & Member Exit')}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {t('Transferred-share accumulated entitlement remains pending organizational decision and is never calculated here.')}
        </p>
      </header>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{t(error)}</span>
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{t(notice)}</span>
        </div>
      )}

      {/* 1. ANNUAL CLOSING SECTION */}
      <section className="glass-card p-5">
        <div className="flex gap-2 items-center">
          <CalendarCheck2 className="text-blue-300" />
          <h2 className="font-bold text-white text-lg">{t('Annual closing')}</h2>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <input
            className="form-input max-w-40"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          {canManage && (
            <button className="btn btn-primary" onClick={createClosing}>
              {t('Create draft')}
            </button>
          )}
        </div>
        <div className="table-container mt-4">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>{t('Year')}</th>
                <th>{t('Status')}</th>
                <th>{t('Collections')}</th>
                <th>{t('Expenses')}</th>
                <th>{t('Due')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {closings.map((c) => (
                <tr key={c._id}>
                  <td className="font-bold text-white">{c.year}</td>
                  <td>
                    <span
                      className={`badge text-xs font-semibold ${
                        c.status === 'LOCKED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : c.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {t(c.status)}
                    </span>
                  </td>
                  <td>৳ {Number(c.summary?.collections || 0).toFixed(2)}</td>
                  <td>৳ {Number(c.summary?.expenses || 0).toFixed(2)}</td>
                  <td>৳ {Number(c.summary?.outstandingDues || 0).toFixed(2)}</td>
                  <td className="flex gap-2">
                    {c.status === 'DRAFT' && canManage && (
                      <button className="btn btn-secondary btn-sm" onClick={() => action(c._id, 'review')}>
                        {t('Review')}
                      </button>
                    )}
                    {canManage && c.status === 'REVIEWED' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => action(c._id, 'approve')}>
                        {t('Approve')}
                      </button>
                    )}
                    {canManage && c.status === 'APPROVED' && (
                      <button className="btn btn-danger btn-sm flex items-center gap-1" onClick={() => action(c._id, 'lock')}>
                        <Lock size={13} />
                        <span>{t('Lock')}</span>
                      </button>
                    )}
                    {canManage && c.status === 'LOCKED' && (
                      <button
                        className="btn btn-warning btn-sm flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-md shadow-amber-600/30"
                        onClick={() => action(c._id, 'unlock')}
                        title={t('Unlock to allow payment updates and historical corrections')}
                      >
                        <Unlock size={13} />
                        <span>{t('Unlock')}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. NS FOUNDATION POLICIES SECTION (LOCALIZED) */}
      <section className="glass-card p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 items-center">
            <BookOpenCheck className="text-violet-300" size={22} />
            <h2 className="font-bold text-white text-lg">
              {t('NS Foundation Policies')}
            </h2>
          </div>
          <span className="text-xs text-gray-400">
            {language === 'bn' ? 'অফিশিয়াল গঠনতন্ত্র ও নীতিমালা সংরক্ষণাগার' : 'Official Foundation Constitution & Policies Archive'}
          </span>
        </div>

        {/* Big Textarea for Complete Policy Document */}
        <div className="p-4 rounded-xl border border-white/10 bg-slate-900/60 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={15} className="text-blue-400" />
              <span>{t('Complete Policy Document')}</span>
            </label>
            <div className="flex items-center gap-2">
              {policyDocNotice && (
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={14} />
                  {policyDocNotice}
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    const formatted = formatPoliciesText(policyDocContent);
                    setPolicyDocContent(formatted);
                    setPolicyDocNotice(t('Policy document formatted.'));
                    setTimeout(() => setPolicyDocNotice(null), 3000);
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs text-blue-300 border-blue-500/30 hover:bg-blue-500/10"
                  title={t('Format / Organize')}
                >
                  <AlignLeft size={14} />
                  <span>{t('Format / Organize')}</span>
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={16}
            value={policyDocContent}
            onChange={(e) => setPolicyDocContent(e.target.value)}
            disabled={!canManage}
            placeholder={
              language === 'bn'
                ? 'এখানে এন এস ফাউন্ডেশনের পূর্ণাঙ্গ নীতিমালা, উপবিধি ও নিয়মাবলি পেস্ট বা লিখুন...'
                : 'Paste or write the complete NS Foundation policies, bylaws, and guidelines here...'
            }
            className="form-input text-xs font-mono leading-relaxed p-3.5 bg-slate-950/80 border-gray-700 rounded-xl text-gray-200 w-full focus:ring-2 focus:ring-blue-500/40"
          />

          {canManage && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={savingPolicyDoc}
                onClick={handleSavePolicyDoc}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {savingPolicyDoc ? (
                  <span>{t('Saving...')}</span>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>{t('Save Policy Document')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        </section>

      {/* 3. MEMBER EXIT SETTLEMENTS CONSOLIDATION BANNER */}
      <section className="glass-card p-6 border border-rose-500/20 bg-gradient-to-br from-slate-900/90 via-slate-900/60 to-rose-950/20 shadow-xl rounded-2xl">
        <div className="flex items-center justify-between flex-wrap gap-5">
          <div className="flex items-start gap-4">
            <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-inner shrink-0 mt-0.5">
              <UserRoundX size={26} />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-white text-base">
                  {language === 'bn' ? 'সদস্য পদত্যাগ ও রিফান্ড সেটেলমেন্ট (একীভূত)' : 'Member Exit & Refund Settlements (Consolidated)'}
                </h2>
                <span className="badge text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold px-2 py-0.5">
                  {language === 'bn' ? 'সদস্য ব্যবস্থাপনা মডিউল' : 'In Members Module'}
                </span>
              </div>
              <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
                {language === 'bn'
                  ? 'বাদ পড়া সদস্যদের মোট জমাকৃত মূলধন, সমিতি প্রশাসনিক কর্তন, কাস্টডি হিসাব থেকে রিফান্ড প্রদান, অফিসিয়াল সেটেলমেন্ট ভাউচার প্রিন্ট এবং পেমেন্ট রিসিট ডকুমেন্ট এখন মেম্বার ম্যানেজমেন্ট পেজে সুন্দর ও পরিচ্ছন্নভাবে একীভূত করা হয়েছে।'
                  : 'Dropped member capital refunds, foundation retentions, custody disbursal vouchers, and attached payment receipt proof have been streamlined and consolidated into Member Management.'}
              </p>
            </div>
          </div>
          <Link
            to="/members?tab=EXITS"
            className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-semibold shadow-lg shadow-rose-600/25 px-4 py-2"
          >
            <span>{language === 'bn' ? 'সদস্য তালিকা ও রিফান্ডে যান' : 'Go to Exits & Refunds'}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default GovernancePage;
