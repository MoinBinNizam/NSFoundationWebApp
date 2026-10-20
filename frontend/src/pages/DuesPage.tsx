import React, { useCallback, useEffect, useState } from 'react';
import {
  Eye,
  X,
  MessageCircle,
  Copy,
  Check,
  FileText,
  CheckCircle2,
  Phone,
  Sparkles,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';

type Detail = {
  month: string;
  shareCount: number;
  principalDue: number;
  penaltyDue: number;
  penaltyWaived: number;
};

type DueRow = {
  _id: string;
  shareCount?: number;
  member: {
    _id: string;
    memberId: string;
    name: string;
    phone: string;
    status?: string;
  };
  principalDue: number;
  penaltyDue: number;
  cashoutDue: number;
  totalDue: number;
  details: Detail[];
};

type Dues = {
  availableYears: number[];
  summary: {
    total: number;
    principal: number;
    penalty: number;
    cashout: number;
    currentPrincipal: number;
    previousPrincipal: number;
  };
  filters: { referencePeriod: string; previousPeriod: string };
  rows: DueRow[];
};

const money = (value: number) =>
  `৳${Number(value || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}`;

// Format phone number to international WhatsApp format (e.g. 88017XXXXXXXX)
function formatWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return '88' + digits;
  if (digits.length === 10) return '880' + digits;
  return digits;
}

// Generate tailored Bengali message for an individual member
function generateMemberNoticeText(row: DueRow, deadlineText: string = 'চলতি মাসের ১৫ তারিখের'): string {
  const memberName = row.member?.name || 'সদস্য';
  const memberId = row.member?.memberId || '';
  const monthNames = row.details?.map((d) => d.month).filter(Boolean);
  const monthsStr = monthNames && monthNames.length > 0 ? monthNames.join(', ') : 'চলতি বকেয়া';

  const pDue = Number(row.principalDue || 0);
  const penDue = Number(row.penaltyDue || 0);
  const cashDue = Number(row.cashoutDue || 0);
  const totDue = Number(row.totalDue || 0);

  let text = `সম্মানিত সদস্য ${memberName} (আইডি: ${memberId}),\n`;
  text += `আসসালামু আলাইকুম। এনএস ফাউন্ডেশনের পক্ষ থেকে জানানো যাচ্ছে যে, আগামী ${deadlineText} মধ্যে আপনার সমিতির বকেয়া পরিশোধ করার জন্য বিনীত অনুরোধ করা হচ্ছে।\n\n`;
  text += `📊 আপনার বকেয়ার বিবরণ:\n`;
  if (monthNames && monthNames.length > 0) {
    text += `• বকেয়া কিস্তির মাস: ${monthsStr}\n`;
  }
  text += `• মূল চাঁদা বকেয়া: ৳ ${pDue.toLocaleString('en-BD', { minimumFractionDigits: 2 })}\n`;
  if (penDue > 0) {
    text += `• বিলম্ব জরিমানা: ৳ ${penDue.toLocaleString('en-BD', { minimumFractionDigits: 2 })}\n`;
  }
  if (cashDue > 0) {
    text += `• বকেয়া ক্যাশআউট চার্জ: ৳ ${cashDue.toLocaleString('en-BD', { minimumFractionDigits: 2 })}\n`;
  }
  text += `───────────────────────\n`;
  text += `💰 সর্বমোট প্রদেয় বকেয়া: ৳ ${totDue.toLocaleString('en-BD', { minimumFractionDigits: 2 })}\n\n`;
  text += `পেমেন্ট সম্পন্ন করে অনুগ্রহ করে ট্রানজেকশন আইডি (TrxID) সহ রসিদ/স্ক্রিনশট পাঠিয়ে জমার বিষয়টি নিশ্চিত করুন।\n\n`;
  text += `ধন্যবাদান্তে,\nএনএস ফাউন্ডেশন`;

  return text;
}

// Generate general announcement for WhatsApp / Facebook Messenger groups
function generateGroupNoticeText(deadlineText: string = 'চলতি মাসের ১৫ তারিখের', extraNote: string = ''): string {
  let text = `📢 জরুরি নোটিশ: মাসিক চাঁদা ও বকেয়া পরিশোধ সংক্রান্ত\n\n`;
  text += `সম্মানিত সদস্যবৃন্দ,\n`;
  text += `আসসালামু আলাইকুম। এনএস ফাউন্ডেশনের সকল সদস্যের সদয় অবগতির জন্য জানানো যাচ্ছে যে, চলতি মাসের নির্ধারিত মাসিক চাঁদা এবং পূর্বের যেকোনো বকেয়া আগামী ${deadlineText} মধ্যে পরিশোধ করার জন্য বিনীত অনুরোধ করা হচ্ছে।\n\n`;
  text += `💳 পেমেন্ট ও জমা নিশ্চিতকরণ:\n`;
  text += `• বিকাশ, নগদ বা ব্যাংক অ্যাকাউন্টের মাধ্যমে টাকা জমা দিন।\n`;
  text += `• টাকা পাঠানোর পর ট্রানজেকশন আইডি (TrxID) সহ পেমেন্ট রিসিটের স্ক্রিনশট বা ছবি মেসেঞ্জারে বা হোয়াটসঅ্যাপে পাঠিয়ে জমার বিষয়টি নিশ্চিত করুন।\n`;
  text += `• নির্ধারিত সময়ের পর জমা দিলে নীতিমালা অনুযায়ী বিলম্ব জরিমানা প্রযোজ্য হতে পারে।\n\n`;
  if (extraNote.trim()) {
    text += `📌 বিশেষ নির্দেশনা: ${extraNote.trim()}\n\n`;
  }
  text += `সমিতির সার্বিক শৃঙ্খলা ও অগ্রযাত্রায় আপনার সক্রিয় সহযোগিতা একান্ত কাম্য।\n\n`;
  text += `ধন্যবাদান্তে,\nহিসাব বিভাগ, এনএস ফাউন্ডেশন`;
  return text;
}

// Generate full dues list summary for copy/reporting
function generateAllDuesSummaryText(rows: DueRow[], totalSum: number): string {
  const today = new Date().toLocaleDateString('bn-BD', { year: 'numeric', month: 'long', day: 'numeric' });
  let text = `📋 এনএস ফাউন্ডেশন — সদস্য বকেয়া তালিকা\nতারিখ: ${today}\n───────────────────────\n`;
  rows.forEach((row, i) => {
    const p = Number(row.principalDue || 0);
    const pen = Number(row.penaltyDue || 0);
    const tot = Number(row.totalDue || 0);
    text += `${i + 1}. ${row.member.name} (${row.member.memberId}): ৳${tot.toLocaleString('en-BD')} (মূল: ৳${p.toLocaleString('en-BD')}${pen > 0 ? `, জরিমানা: ৳${pen.toLocaleString('en-BD')}` : ''})\n`;
  });
  text += `───────────────────────\n`;
  text += `💰 মোট বকেয়া সদস্য: ${rows.length} জন\n`;
  text += `সর্বমোট অনাদায়ী বকেয়া: ৳ ${Number(totalSum || 0).toLocaleString('en-BD', { minimumFractionDigits: 2 })}\n`;
  return text;
}

export const DuesPage: React.FC = () => {
  const { t } = usePreferences();
  const [data, setData] = useState<Dues | null>(null);
  const [year, setYear] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DueRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Group Notice Modal State
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [deadlineText, setDeadlineText] = useState('চলতি মাসের ১৫ তারিখের');
  const [extraNote, setExtraNote] = useState('');

  // Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedRowId, setCopiedRowId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3000);
  };

  const copyText = async (text: string, successMsg: string, rowId?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (rowId) {
        setCopiedRowId(rowId);
        setTimeout(() => setCopiedRowId((c) => (c === rowId ? null : c)), 2000);
      }
      showToast(successMsg);
    } catch {
      showToast('কপি করতে ব্যর্থ হয়েছে। অনুগ্রহ করে টেক্সট সিলেক্ট করে কপি করুন।');
    }
  };

  const handleOpenWhatsApp = (row: DueRow) => {
    const text = generateMemberNoticeText(row, deadlineText);
    const cleanPhone = formatWhatsAppPhone(row.member?.phone || '');
    const encoded = encodeURIComponent(text);

    if (cleanPhone) {
      window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`, '_blank');
      showToast(`${row.member.name}-এর জন্য হোয়াটসঅ্যাপ নোটিশ ওপেন হয়েছে`);
    } else {
      // If phone is missing, copy message and alert user
      void copyText(text, 'সদস্যের ফোন নম্বর নেই, মেসেজটি ক্লিপবোর্ডে কপি করা হয়েছে যাতে আপনি মেসেঞ্জারে পাঠাতে পারেন।');
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year !== 'ALL') params.set('year', year);
      if (month !== 'ALL') params.set('month', month);
      if (search.trim()) params.set('search', search.trim());
      const response = await apiRequest<Dues>(`/payments/dues?${params}`);
      setData(response.data);
    } finally {
      setLoading(false);
    }
  }, [year, month, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-slate-900 border border-emerald-500/50 shadow-2xl shadow-emerald-500/20 text-white px-5 py-3.5 rounded-xl text-sm font-medium animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-gray-400 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header Section with Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-amber-300">
            {t('Payment overview')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            {t('Outstanding Dues')}
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {t(
              'Review each member’s unpaid monthly share, penalty, and any cash-out charge recorded by the accountant.'
            )}
          </p>
        </div>

        {/* Global Notice Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setGroupModalOpen(true)}
            className="btn btn-secondary flex items-center gap-2 bg-gradient-to-r from-blue-600/20 to-indigo-600/20 hover:from-blue-600/30 hover:to-indigo-600/30 border border-blue-500/30 text-blue-200 text-sm font-semibold shadow-md"
          >
            <MessageCircle size={16} className="text-blue-400" />
            <span>{t('Group Notice')} (WhatsApp / Messenger)</span>
          </button>

          <button
            type="button"
            disabled={!data?.rows.length}
            onClick={() => {
              if (!data?.rows.length) return;
              const text = generateAllDuesSummaryText(data.rows, data.summary.total);
              void copyText(text, 'সকল বকেয়া সদস্যের সংক্ষিপ্ত তালিকা ক্লিপবোর্ডে কপি হয়েছে!');
            }}
            className="btn btn-secondary flex items-center gap-2 border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-gray-200 text-sm font-semibold"
          >
            <FileText size={16} className="text-amber-400" />
            <span>{t('Copy All Dues Summary')}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-card p-4 flex flex-col lg:flex-row gap-3">
        <input
          className="form-input flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search member ID, name, or phone...')}
        />
        <select
          className="form-select lg:w-36"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        >
          <option value="ALL">{t('All years')}</option>
          {(data?.availableYears || []).map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <select
          className="form-select lg:w-40"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        >
          <option value="ALL">{t('All months')}</option>
          {Array.from({ length: 12 }, (_, index) => (
            <option key={index + 1} value={index + 1}>
              {t(new Date(2024, index, 1).toLocaleString('en', { month: 'long' }))}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          [t('Total Due'), data?.summary.total, 'text-rose-300'],
          [t('Principal due'), data?.summary.principal, 'text-blue-300'],
          [t('Penalty due'), data?.summary.penalty, 'text-amber-300'],
          [t('Cash-out due'), data?.summary.cashout, 'text-fuchsia-300'],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="glass-card p-4">
            <p className="text-xs font-bold text-gray-400 uppercase">{label}</p>
            <p className={`mt-2 text-2xl font-extrabold ${color}`}>{money(Number(value))}</p>
          </div>
        ))}
      </div>

      {/* Dues Table */}
      <div className="table-container glass-card overflow-x-auto">
        <table className="data-table min-w-[940px]">
          <thead>
            <tr>
              <th>{t('Member')}</th>
              <th className="text-center">{t('Share')}</th>
              <th>{t('Months due')}</th>
              <th>{t('Principal due')}</th>
              <th>{t('Penalty due')}</th>
              <th>{t('Cash-out due')}</th>
              <th>{t('Total Due')}</th>
              <th className="text-center min-w-[200px]">{t('Notice & Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  {t('Loading outstanding dues...')}
                </td>
              </tr>
            ) : !data?.rows.length ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-400">
                  {t('No outstanding dues match the selected filters.')}
                </td>
              </tr>
            ) : (
              data.rows.map((row) => {
                const isCopied = copiedRowId === row._id;
                return (
                  <tr key={row._id} className="hover:bg-white/[0.02] transition-colors">
                    <td>
                      <div className="flex flex-col">
                        <strong className="text-white font-semibold">{row.member.name}</strong>
                        <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                          <span className="font-mono text-blue-300">{row.member.memberId}</span>
                          {row.member.phone && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <Phone size={10} />
                              {row.member.phone}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-center font-bold text-amber-300">
                      {row.shareCount ?? 0}
                    </td>
                    <td>
                      {row.details.length ? (
                        <span className="badge badge-inactive">
                          {row.details.length} {t('Months')}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{money(row.principalDue)}</td>
                    <td>{money(row.penaltyDue)}</td>
                    <td>{money(row.cashoutDue)}</td>
                    <td className="font-bold text-rose-200 text-base">{money(row.totalDue)}</td>
                    <td>
                      <div className="flex items-center justify-center gap-1.5 flex-nowrap">
                        {/* 1-Click WhatsApp Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenWhatsApp(row)}
                          title={`${row.member.name}-কে হোয়াটসঅ্যাপে মেসেজ পাঠান`}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-800/40 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm shadow-emerald-900/30"
                        >
                          <MessageCircle size={14} className="text-emerald-400" />
                          <span>WhatsApp</span>
                        </button>

                        {/* 1-Click Messenger / Clipboard Copy Button */}
                        <button
                          type="button"
                          onClick={() => {
                            const text = generateMemberNoticeText(row, deadlineText);
                            void copyText(
                              text,
                              `${row.member.name}-এর জন্য মেসেঞ্জার নোটিশ কপি হয়েছে! মেসেঞ্জারে পেস্ট করুন।`,
                              row._id
                            );
                          }}
                          title="ফেসবুক মেসেঞ্জারে পাঠানোর জন্য নোটিশ কপি করুন"
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm ${
                            isCopied
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                              : 'border-blue-500/40 bg-blue-950/40 hover:bg-blue-800/40 text-blue-300 shadow-blue-900/30'
                          }`}
                        >
                          {isCopied ? (
                            <Check size={14} className="text-emerald-400" />
                          ) : (
                            <Copy size={14} className="text-blue-400" />
                          )}
                          <span>{isCopied ? 'কপি হয়েছে' : 'Messenger'}</span>
                        </button>

                        {/* View Details Modal Button */}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm p-1.5 text-gray-400 hover:text-white"
                          title={t('View')}
                          onClick={() => setSelected(row)}
                        >
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* GROUP NOTICE GENERATOR MODAL */}
      {groupModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl bg-slate-900 border border-slate-700 shadow-2xl">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <MessageCircle size={20} className="text-blue-400" />
                  {t('Monthly Payment Notice Generator')}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  হোয়াটসঅ্যাপ ও ফেসবুক মেসেঞ্জার গ্রুপে পাঠানোর সাধারণ মাসিক নোটিশ
                </p>
              </div>
              <button onClick={() => setGroupModalOpen(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    {t('Payment Deadline')}
                  </label>
                  <input
                    type="text"
                    value={deadlineText}
                    onChange={(e) => setDeadlineText(e.target.value)}
                    className="form-input text-sm"
                    placeholder="যেমন: চলতি মাসের ১৫ তারিখের"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    অতিরিক্ত বিশেষ দ্রষ্টব্য (ঐচ্ছিক)
                  </label>
                  <input
                    type="text"
                    value={extraNote}
                    onChange={(e) => setExtraNote(e.target.value)}
                    className="form-input text-sm"
                    placeholder="যেমন: বিকাশ ০১৭১২-XXXXXX নম্বরে সেন্ড মানি করুন"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-300 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-amber-400" />
                    {t('Notice Preview')} (গ্রুপে যেভাবে যাবে)
                  </span>
                  <span className="text-[11px] text-gray-500">বাংলা ইউনিকোড সমর্থিত</span>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-sans text-gray-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                  {generateGroupNoticeText(deadlineText, extraNote)}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const text = generateGroupNoticeText(deadlineText, extraNote);
                    const encoded = encodeURIComponent(text);
                    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
                  }}
                  className="btn btn-secondary flex items-center gap-2 border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 text-xs font-semibold"
                >
                  <MessageCircle size={15} className="text-emerald-400" />
                  <span>WhatsApp গ্রুপে পাঠান</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const text = generateGroupNoticeText(deadlineText, extraNote);
                      void copyText(text, 'গ্রুপ নোটিশ ক্লিপবোর্ডে কপি হয়েছে! ফেসবুক মেসেঞ্জার বা হোয়াটসঅ্যাপ গ্রুপে পেস্ট করুন।');
                    }}
                    className="btn btn-primary flex items-center gap-2 text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500"
                  >
                    <Copy size={15} />
                    <span>{t('Copy Notice')} (ক্লিপবোর্ডে কপি)</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs"
                    onClick={() => setGroupModalOpen(false)}
                  >
                    {t('Close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MEMBER DETAILS & ACTIONS MODAL */}
      {selected && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl bg-slate-900 border border-slate-700 shadow-2xl">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <div>
                <h2 className="font-bold text-white text-lg flex items-center gap-2">
                  <span>{selected.member.name}</span>
                  <span className="text-xs font-mono font-normal text-blue-400 bg-blue-950/60 border border-blue-500/30 px-2 py-0.5 rounded">
                    {selected.member.memberId}
                  </span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  মোট শেয়ার: {selected.shareCount ?? 1} টি · মোবাইল: {selected.member.phone || 'যুক্ত নেই'}
                </p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Quick Notice Send Bar */}
              <div className="bg-gradient-to-r from-slate-950 to-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-gray-300">সদস্যকে সরাসরি বকেয়া নোটিশ পাঠান:</p>
                  <p className="text-[11px] text-gray-400">
                    খাতভিত্তিক মূল চাঁদা, বিলম্ব জরিমানা ও ক্যাশআউট চার্জ স্বয়ংক্রিয়ভাবে থাকবে।
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenWhatsApp(selected)}
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-950/50 hover:bg-emerald-900/50 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <MessageCircle size={14} className="text-emerald-400" />
                    <span>WhatsApp</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const text = generateMemberNoticeText(selected, deadlineText);
                      void copyText(
                        text,
                        `${selected.member.name}-এর জন্য নোটিশ কপি হয়েছে! মেসেঞ্জারে পেস্ট করুন।`
                      );
                    }}
                    className="px-3 py-1.5 rounded-lg border border-blue-500/40 bg-blue-950/50 hover:bg-blue-900/50 text-blue-300 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <Copy size={14} className="text-blue-400" />
                    <span>Messenger Copy</span>
                  </button>
                </div>
              </div>

              {/* Message Preview Box */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                    <Sparkles size={13} className="text-amber-400" />
                    প্রস্তুতকৃত নোটিশ টেক্সট:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const text = generateMemberNoticeText(selected, deadlineText);
                      void copyText(text, 'নোটিশ টেক্সট কপি হয়েছে!');
                    }}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <Copy size={12} />
                    <span>কপি</span>
                  </button>
                </div>
                <div className="text-xs font-sans text-gray-300 whitespace-pre-wrap leading-relaxed max-h-36 overflow-y-auto">
                  {generateMemberNoticeText(selected, deadlineText)}
                </div>
              </div>

              <div className="border-t border-slate-800 pt-3">
                <p className="text-xs font-semibold text-gray-300 mb-2">
                  {t('The following months remain unpaid. Any approved penalty waiver is shown separately.')}
                </p>
                <div className="table-container max-h-48 overflow-y-auto">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>{t('Month')}</th>
                        <th>{t('Principal due')}</th>
                        <th>{t('Penalty due')}</th>
                        <th>{t('Penalty waiver')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.details.map((item) => (
                        <tr key={item.month}>
                          <td>{item.month}</td>
                          <td>{money(item.principalDue)}</td>
                          <td>{money(item.penaltyDue)}</td>
                          <td>{money(item.penaltyWaived)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {selected.cashoutDue > 0 && (
                <p className="rounded-lg border border-fuchsia-400/20 bg-fuchsia-400/5 p-3 text-xs text-fuchsia-100 flex items-center justify-between">
                  <span>{t('Separately recorded cash-out charge due:')}</span>
                  <strong className="text-fuchsia-300">{money(selected.cashoutDue)}</strong>
                </p>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setSelected(null)}
                >
                  {t('Close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
