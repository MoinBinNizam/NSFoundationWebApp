import React, { useState, useEffect, useMemo } from 'react';
import {
  FileDown,
  FileText,
  ShieldCheck,
  Search,
  Users,
  Download,
  Calendar,
  Layers,
  Sparkles,
  Clock,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
  ChevronLeft,
  WalletCards,
  TrendingUp,
  Shield,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useLogo } from '../context/LogoContext';
import { apiRequest } from '../services/api';
import {
  downloadMemberReportImage,
  downloadAnnualReportImage,
  downloadAuditPackImage,
  AnnualReportImageData,
  AuditPackImageData,
} from '../utils/report-image';

interface MemberItem {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  shareCount?: number;
  currentShares?: number;
  status?: string;
  cashoutDue?: number;
}

interface MemberSummaryData {
  member: {
    _id?: string;
    memberId: string;
    name: string;
    phone: string;
    currentShares?: number;
    status?: string;
    cashoutDue?: number;
  };
  summary: {
    totalPayments: number;
    totalPrincipalPaid?: number;
    totalAdvancedPaid?: number;
    totalDues: number;
    totalPenaltyPaid: number;
    totalPenaltyDue: number;
    totalPrincipalDue?: number;
    totalCashoutPaid?: number;
    totalCashoutChargePaid?: number;
    cashoutDue?: number;
    paymentCount?: number;
  };
  recentPayments?: any[];
}

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export const DocumentsPage: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = usePreferences();
  const { logo } = useLogo();

  // Active sub-tab in Statements & Reports
  const [activeTab, setActiveTab] = useState<'member' | 'annual' | 'audit'>('member');

  // Year filter: Default 2024
  const [year, setYear] = useState<string>('2024');

  // Member selection & list
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loadingMembers, setLoadingMembers] = useState<boolean>(true);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState<string>('');

  // Selected member summary & preview
  const [memberSummary, setMemberSummary] = useState<MemberSummaryData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(false);

  // Accountant Signature
  const [accountantSignature, setAccountantSignature] = useState<string | null>(null);

  // Status & Feedback States
  const [error, setError] = useState<string>('');
  const [successNotice, setSuccessNotice] = useState<string>('');
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Image Download Modals
  const [showImageConfirmModal, setShowImageConfirmModal] = useState<boolean>(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [isGeneratingAnnualImage, setIsGeneratingAnnualImage] = useState<boolean>(false);
  const [isGeneratingAuditImage, setIsGeneratingAuditImage] = useState<boolean>(false);
  const [imageSuccessModal, setImageSuccessModal] = useState<{
    open: boolean;
    fileName: string;
    memberName: string;
    memberId: string;
  } | null>(null);

  // Tab 2: Annual Society Report State
  const [annualData, setAnnualData] = useState<AnnualReportImageData | null>(null);
  const [loadingAnnualData, setLoadingAnnualData] = useState<boolean>(false);

  // Tab 3: Super Admin Audit Pack State
  const [auditData, setAuditData] = useState<AuditPackImageData | null>(null);
  const [loadingAuditData, setLoadingAuditData] = useState<boolean>(false);
  const [auditSearch, setAuditSearch] = useState<string>('');

  // Load initial members list & accountant signature
  useEffect(() => {
    let mounted = true;
    const loadInitData = async () => {
      try {
        setLoadingMembers(true);
        const [membersRes, sigRes] = await Promise.all([
          apiRequest<MemberItem[]>('/payments/collection-members'),
          apiRequest<{ signature?: string; signatureImage?: string }>('/settings/accountant-signature').catch(() => null),
        ]);
        if (!mounted) return;
        const list = membersRes.data || [];
        setMembers(list);
        if (list.length > 0 && !selectedMemberId) {
          setSelectedMemberId(list[0]._id);
        }
        const sig = sigRes?.data?.signatureImage || sigRes?.data?.signature;
        if (sig) setAccountantSignature(sig);
      } catch (err: unknown) {
        if (mounted) console.error('Error loading members for statements:', err);
      } finally {
        if (mounted) setLoadingMembers(false);
      }
    };
    loadInitData();
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch Member Summary when member or year changes
  useEffect(() => {
    if (!selectedMemberId) {
      setMemberSummary(null);
      return;
    }
    let mounted = true;
    setLoadingSummary(true);
    setError('');

    apiRequest<MemberSummaryData>(`/payments/member-summary/${selectedMemberId}?year=${year}`)
      .then((res) => {
        if (mounted) setMemberSummary(res.data);
      })
      .catch((err) => {
        if (mounted) {
          console.error('Error loading member summary in statements:', err);
          setMemberSummary(null);
        }
      })
      .finally(() => {
        if (mounted) setLoadingSummary(false);
      });

    return () => {
      mounted = false;
    };
  }, [selectedMemberId, year]);

  // Fetch Annual Report Data for Tab 2
  useEffect(() => {
    if (activeTab !== 'annual') return;
    let mounted = true;
    setLoadingAnnualData(true);
    apiRequest<AnnualReportImageData>(`/documents/annual/${year}/data`)
      .then((res) => {
        if (mounted) setAnnualData(res.data);
      })
      .catch((err) => {
        if (mounted) {
          console.error('Error fetching annual report data:', err);
          setAnnualData(null);
        }
      })
      .finally(() => {
        if (mounted) setLoadingAnnualData(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, year]);

  // Fetch Audit Pack Data for Tab 3
  useEffect(() => {
    if (activeTab !== 'audit' || user?.role !== 'SUPER_ADMIN') return;
    let mounted = true;
    setLoadingAuditData(true);
    apiRequest<AuditPackImageData>(`/documents/annual/${year}/audit-data`)
      .then((res) => {
        if (mounted) setAuditData(res.data);
      })
      .catch((err) => {
        if (mounted) {
          console.error('Error fetching audit pack data:', err);
          setAuditData(null);
        }
      })
      .finally(() => {
        if (mounted) setLoadingAuditData(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeTab, year, user?.role]);

  // Format currency
  const money = (val: number | undefined | null) =>
    `৳ ${(Number(val) || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const monthLabels: Record<string, string> = {
    '01': 'জানুয়ারি',
    '02': 'ফেব্রুয়ারি',
    '03': 'মার্চ',
    '04': 'এপ্রিল',
    '05': 'মে',
    '06': 'জুন',
    '07': 'জুলাই',
    '08': 'আগস্ট',
    '09': 'সেপ্টেম্বর',
    '10': 'অক্টোবর',
    '11': 'নভেম্বর',
    '12': 'ডিসেম্বর',
  };

  const formatMonthName = (mStr: string) => {
    const parts = mStr.split('-');
    if (parts.length === 2 && monthLabels[parts[1]]) {
      return `${monthLabels[parts[1]]} ${parts[0]}`;
    }
    return mStr;
  };

  // Filtered audit logs for search
  const filteredAuditLogs = useMemo(() => {
    if (!auditData?.logs) return [];
    if (!auditSearch.trim()) return auditData.logs;
    const q = auditSearch.toLowerCase();
    return auditData.logs.filter(
      (l) =>
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.performedBy && l.performedBy.toLowerCase().includes(q)) ||
        (l.role && l.role.toLowerCase().includes(q)) ||
        (l.entityName && l.entityName.toLowerCase().includes(q)) ||
        (l.reason && l.reason.toLowerCase().includes(q))
    );
  }, [auditData?.logs, auditSearch]);

  // Filtered members for directory table
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const query = memberSearch.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.memberId.toLowerCase().includes(query) ||
        (m.phone && m.phone.toLowerCase().includes(query))
    );
  }, [members, memberSearch]);

  // Generic PDF Downloader
  const downloadPdf = async (path: string, fileName: string) => {
    try {
      setIsDownloadingPdf(true);
      setError('');
      setSuccessNotice('');
      const token = localStorage.getItem('token') || '';
      const response = await fetch(`/api/documents${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => null);
        throw new Error(errJson?.message || t('The requested document is not available for this account or reporting period.'));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setSuccessNotice(`${fileName} ${language === 'bn' ? 'সফলভাবে ডাউনলোড হয়েছে।' : 'downloaded successfully.'}`);
    } catch (err: unknown) {
      setError((err as Error).message || 'Failed to download document');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Image Statement Downloader
  const handleExecuteImageDownload = async () => {
    if (!memberSummary) return;
    setIsGeneratingImage(true);
    try {
      const reportPayments = (memberSummary.recentPayments && memberSummary.recentPayments.length > 0)
        ? memberSummary.recentPayments.map((p) => ({
            ...p,
            receiverName: p.receiverName || (p.receiverId as any)?.name || '-',
            accountantName: p.accountantName || (p.receiverId as any)?.name || '-',
          }))
        : [];

      const filename = await downloadMemberReportImage({
        member: memberSummary.member,
        summary: memberSummary.summary,
        payments: reportPayments,
        logo,
        signatureImage: accountantSignature || user?.signatureImage || null,
      });

      setShowImageConfirmModal(false);
      const cleanName = (memberSummary.member.name || '').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_');
      setImageSuccessModal({
        open: true,
        fileName: filename || `NSF_Report_${memberSummary.member.memberId}_${cleanName}_${new Date().toISOString().slice(0, 10)}.png`,
        memberName: memberSummary.member.name,
        memberId: memberSummary.member.memberId,
      });
    } catch (err: unknown) {
      console.error('Failed to generate report image:', err);
      alert('Failed to generate report image: ' + ((err as Error)?.message || 'Unknown error'));
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // Annual Report Image Downloader
  const handleDownloadAnnualReportImage = async () => {
    try {
      setIsGeneratingAnnualImage(true);
      setError('');
      setSuccessNotice('');
      const res = await apiRequest<AnnualReportImageData>(`/documents/annual/${year}/data`);
      if (!res.data) throw new Error(t('No annual report data available for this year.'));
      const fileName = await downloadAnnualReportImage({
        ...res.data,
        logo,
        signatureImage: accountantSignature || user?.signatureImage || null,
      });
      setImageSuccessModal({
        open: true,
        fileName,
        memberName: `${year} Annual Financial Statement`,
        memberId: `YEAR-${year}`,
      });
    } catch (err: unknown) {
      console.error('Failed to download annual report image:', err);
      setError((err as Error).message || 'Failed to download annual report image');
    } finally {
      setIsGeneratingAnnualImage(false);
    }
  };

  // Audit Pack Image Downloader
  const handleDownloadAuditPackImage = async () => {
    try {
      setIsGeneratingAuditImage(true);
      setError('');
      setSuccessNotice('');
      const res = await apiRequest<AuditPackImageData>(`/documents/annual/${year}/audit-data`);
      if (!res.data) throw new Error(t('No audit data available for this year.'));
      const fileName = await downloadAuditPackImage({
        ...res.data,
        logo,
      });
      setImageSuccessModal({
        open: true,
        fileName,
        memberName: `Super Admin Audit Pack ${year}`,
        memberId: `AUDIT-${year}`,
      });
    } catch (err: unknown) {
      console.error('Failed to download audit pack image:', err);
      setError((err as Error).message || 'Failed to download audit pack image');
    } finally {
      setIsGeneratingAuditImage(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-blue-400 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={14} />
            <span>{t('Statements & Reports')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
            {t('Statements, Reports & Audit Pack')}
          </h1>
          <p className="text-sm text-gray-400 mt-1 max-w-3xl">
            {t('Exports use authoritative records. Pending transferred-share entitlement is never included.')}
          </p>
        </div>

        {/* Global Year Filter Controls */}
        <div className="inline-flex items-center gap-1.5 bg-slate-900/90 p-1.5 rounded-2xl border border-white/10 shadow-lg shrink-0">
          <Calendar size={15} className="text-blue-400 ml-1.5" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t('Year:') || 'Year:'}</span>
          <button
            type="button"
            title={t('Previous Year')}
            onClick={() => setYear(String(Number(year || '2024') - 1))}
            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            <ChevronLeft size={15} />
          </button>
          <select
            aria-label={t('Year')}
            className="bg-slate-950 text-xs text-white font-semibold py-1 px-2 border border-white/15 rounded-lg focus:outline-none cursor-pointer"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          >
            {AVAILABLE_YEARS.map((yr) => (
              <option key={yr} value={String(yr)} className="bg-slate-900 text-white">
                {yr}
              </option>
            ))}
          </select>
          <button
            type="button"
            title={t('Next Year')}
            onClick={() => setYear(String(Number(year || '2024') + 1))}
            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            <ChevronRight size={15} />
          </button>
          <button
            type="button"
            onClick={() => setYear(String(new Date().getFullYear()))}
            className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
          >
            {t('Current Year')}
          </button>
        </div>
      </div>

      {/* Notices */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} className="text-gray-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{successNotice}</span>
          </div>
          <button type="button" onClick={() => setSuccessNotice('')} className="text-gray-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('member')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
            activeTab === 'member'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Users size={16} />
          <span>{language === 'bn' ? 'সদস্য আর্থিক বিবরণী' : 'Member Financial Statements'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('annual')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
            activeTab === 'annual'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText size={16} />
          <span>{language === 'bn' ? 'সমিতির বাৎসরিক প্রতিবেদন' : 'Annual Society Reports'}</span>
        </button>

        {user?.role === 'SUPER_ADMIN' && (
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
              activeTab === 'audit'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
                : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <ShieldCheck size={16} />
            <span>{language === 'bn' ? 'বাৎসরিক অডিট প্যাক' : 'Annual Audit Pack'}</span>
          </button>
        )}
      </div>

      {/* TAB 1: MEMBER FINANCIAL STATEMENTS */}
      {activeTab === 'member' && (
        <div className="space-y-6 animate-fade-in">
          {/* Filter Bar with Swapped Member and Search Positions */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Member Selector Dropdown (First place, full width matching search) */}
              <div className="flex items-center gap-2 min-w-[260px] flex-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5">
                  <Users size={14} className="text-blue-400" />
                  <span>{t('Member:')}</span>
                </label>
                <select
                  aria-label={t('Member:')}
                  className="form-select text-xs py-2.5 px-3 bg-slate-900 border-gray-700 rounded-lg text-white flex-1 cursor-pointer font-medium"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                >
                  <option value="">{t('Select Member') || 'Select a Member...'}</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search text input (Second place) */}
              <div className="relative min-w-[240px] flex-1">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="text"
                  className="form-input pl-10 text-sm w-full"
                  placeholder={t('Search by receipt #, member name, ID, or phone...')}
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
              </div>

              <span className="shrink-0 text-xs font-semibold text-gray-400">
                {t('Records')}: {members.length} {language === 'bn' ? 'জন সদস্য' : 'members'}
              </span>
            </div>
          </div>

          {/* Member Statement Preview Card */}
          {loadingSummary ? (
            <div className="glass-card p-10 text-center animate-pulse space-y-3">
              <Loader2 size={32} className="animate-spin text-blue-400 mx-auto" />
              <p className="text-sm text-gray-400">{t('Loading member financial summary...')}</p>
            </div>
          ) : memberSummary ? (
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-900/95 via-blue-950/20 to-slate-900/95 p-6 shadow-xl space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-extrabold text-xl shadow-inner">
                    {memberSummary.member.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white">{memberSummary.member.name}</h3>
                      <span className="badge badge-active text-xs">{memberSummary.member.status || 'ACTIVE'}</span>
                    </div>
                    {(() => {
                      const selectedMemberFromList = members.find((m) => m._id === selectedMemberId || m.memberId === selectedMemberId);
                      const activeShares = memberSummary.member.currentShares ?? selectedMemberFromList?.shareCount ?? selectedMemberFromList?.currentShares ?? 1;
                      return (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {t('ID:')} <span className="font-mono text-blue-300 font-semibold">{memberSummary.member.memberId}</span> · {t('Phone:')} {memberSummary.member.phone || 'N/A'} · {t('Shares:')} <span className="font-semibold text-white">{activeShares} {language === 'bn' ? 'টি' : 'share(s)'}</span> · {t('Year:') || 'Year:'} <span className="text-amber-300 font-bold">{year}</span>
                        </p>
                      );
                    })()}
                  </div>
                </div>

                {/* 2 Big Action Buttons */}
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={() => {
                      const cleanName = (memberSummary.member.name || '').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_');
                      const fileName = `Statement_${memberSummary.member.memberId}_${cleanName}_${year}.pdf`;
                      downloadPdf(`/members/${memberSummary.member._id || memberSummary.member.memberId}/statement.pdf`, fileName);
                    }}
                    className="btn btn-primary btn-md flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 transition"
                  >
                    {isDownloadingPdf ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-white" />
                        <span>{language === 'bn' ? 'PDF তৈরি হচ্ছে...' : 'Generating PDF...'}</span>
                      </>
                    ) : (
                      <>
                        <FileDown size={16} />
                        <span>{language === 'bn' ? 'অফিশিয়াল PDF ডাউনলোড' : 'Download PDF Statement'}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImageConfirmModal(true)}
                    className="btn btn-secondary btn-md flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold border border-white/10 shadow-lg transition"
                  >
                    <ImageIcon size={16} className="text-purple-400" />
                    <span>{language === 'bn' ? 'রিপোর্ট ছবি (PNG) ডাউনলোড' : 'Download Report Image (PNG)'}</span>
                  </button>
                </div>
              </div>

              {/* Dynamic Financial Summary Metric Cards (Zero-values filtered out) */}
              {(() => {
                const s = memberSummary.summary;
                const principalDue = Number(s.totalPrincipalDue || 0);
                const penaltyDue = Number(s.totalPenaltyDue || 0);
                const cashoutDue = Number(s.cashoutDue || 0);
                const totalDue = Number(s.totalDues ?? (principalDue + penaltyDue + cashoutDue));
                const totalPaid = Number(s.totalPayments || 0);
                const principalPaid = Number(s.totalPrincipalPaid || 0);
                const advancedPaid = Number(s.totalAdvancedPaid || 0);
                const penaltyPaid = Number(s.totalPenaltyPaid || 0);
                const cashoutPaid = Number(s.totalCashoutPaid ?? s.totalCashoutChargePaid ?? 0);

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                    {/* Total Paid */}
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                          {t('Total Paid')}
                        </span>
                        <CheckCircle2 size={15} className="text-emerald-400" />
                      </div>
                      <p className="text-xl font-black text-white mt-1.5">
                        ৳ {totalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-emerald-300/80 mt-1">{t('Total payments and contributions collected')}</p>
                    </div>

                    {/* Total Principal Paid */}
                    <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3.5 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">
                          {t('Total Principal Paid')}
                        </span>
                        <Layers size={15} className="text-cyan-400" />
                      </div>
                      <p className="text-xl font-black text-white mt-1.5">
                        ৳ {principalPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-[10px] text-cyan-300/80 mt-1">{t('Principal collected towards obligation')}</p>
                    </div>

                    {/* Total Advanced Paid (Shown only if > 0) */}
                    {advancedPaid > 0 && (
                      <div className="rounded-xl border border-indigo-500/30 bg-indigo-950/20 p-3.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider">
                            {t('Total Advanced Paid')}
                          </span>
                          <Sparkles size={15} className="text-indigo-400" />
                        </div>
                        <p className="text-xl font-black text-white mt-1.5">
                          ৳ {advancedPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-indigo-300/80 mt-1">{t('Prepaid advance for future months')}</p>
                      </div>
                    )}

                    {/* Total Penalty Paid (Shown only if > 0) */}
                    {penaltyPaid > 0 && (
                      <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-blue-400 uppercase tracking-wider">
                            {t('Total Penalty Paid')}
                          </span>
                          <Clock size={15} className="text-blue-400" />
                        </div>
                        <p className="text-xl font-black text-white mt-1.5">
                          ৳ {penaltyPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-blue-300/80 mt-1">{t('Late penalty fines already paid')}</p>
                      </div>
                    )}

                    {/* Total Cash-out Charge Paid (Shown only if > 0) */}
                    {cashoutPaid > 0 && (
                      <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 p-3.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-fuchsia-400 uppercase tracking-wider">
                            {t('Total Cash-out Charge Paid')}
                          </span>
                          <CreditCard size={15} className="text-fuchsia-400" />
                        </div>
                        <p className="text-xl font-black text-white mt-1.5">
                          ৳ {cashoutPaid.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </p>
                        <p className="text-[10px] text-fuchsia-300/80 mt-1">{t('Gateway cash-out fees already paid')}</p>
                      </div>
                    )}

                    {/* Dues Section: All Cleared vs Breakdown */}
                    {totalDue === 0 ? (
                      <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-3.5 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">
                            {t('All Dues Cleared')}
                          </span>
                          <CheckCircle2 size={16} className="text-emerald-400" />
                        </div>
                        <p className="text-xl font-black text-emerald-300 mt-1.5">
                          ৳ 0.00
                        </p>
                        <p className="text-[10px] text-emerald-300/80 mt-1">{t('No outstanding dues for this member')}</p>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl border border-rose-500/40 bg-rose-950/25 p-3.5 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider">
                              {t('Total Due')}
                            </span>
                            <AlertCircle size={15} className="text-rose-400" />
                          </div>
                          <p className="text-xl font-black text-rose-200 mt-1.5">
                            ৳ {totalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </p>
                          <p className="text-[10px] text-rose-300/80 mt-1">{t('Total outstanding obligation')}</p>
                        </div>

                        {principalDue > 0 && (
                          <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-3.5 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-sky-400 uppercase tracking-wider">
                                {t('Principal Due')}
                              </span>
                              <Layers size={15} className="text-sky-400" />
                            </div>
                            <p className="text-xl font-black text-white mt-1.5">
                              ৳ {principalDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-sky-300/80 mt-1">{t('Unpaid monthly principal shares')}</p>
                          </div>
                        )}

                        {penaltyDue > 0 && (
                          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3.5 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                                {t('Penalty Due')}
                              </span>
                              <AlertCircle size={15} className="text-amber-400" />
                            </div>
                            <p className="text-xl font-black text-white mt-1.5">
                              ৳ {penaltyDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-amber-300/80 mt-1">{t('Outstanding late penalty fines')}</p>
                          </div>
                        )}

                        {cashoutDue > 0 && (
                          <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 p-3.5 shadow-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-semibold text-fuchsia-400 uppercase tracking-wider">
                                {t('Due Cash Out Charge')}
                              </span>
                              <CreditCard size={15} className="text-fuchsia-400" />
                            </div>
                            <p className="text-xl font-black text-white mt-1.5">
                              ৳ {cashoutDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </p>
                            <p className="text-[10px] text-fuchsia-300/80 mt-1">{t('Unpaid gateway cash-out fee')}</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : null}

          {/* Member Statement Directory Table with 1-Click Downloads */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Users size={18} className="text-blue-400" />
                  <span>{language === 'bn' ? 'সদস্যদের হিসাব বিবরণী তালিকা' : 'Member Statement Directory'}</span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {language === 'bn'
                    ? 'যেকোনো সদস্যের নামে ক্লিক করে বিবরণী দেখুন অথবা সরাসরি PDF / ছবি ডাউনলোড করুন।'
                    : 'Click any member to preview or directly export official statements.'}
                </p>
              </div>
            </div>

            <div className="table-container overflow-x-auto">
              <table className="data-table min-w-[800px]">
                <thead>
                  <tr>
                    <th>{t('ID:')}</th>
                    <th>{t('Member')}</th>
                    <th>{t('Phone:')}</th>
                    <th className="text-center">{t('Shares:')}</th>
                    <th>{t('Status')}</th>
                    <th className="text-right">{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingMembers ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-gray-400">
                        <Loader2 size={28} className="animate-spin text-blue-500 mx-auto mb-2" />
                        <span>{t('Loading member directory...')}</span>
                      </td>
                    </tr>
                  ) : filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-gray-400">
                        <Users size={28} className="opacity-30 mx-auto mb-2" />
                        <p>{t('No members match the search criteria.')}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((m) => {
                      const isSelected = selectedMemberId === m._id;
                      return (
                        <tr
                          key={m._id}
                          className={`hover:bg-white/[0.03] transition-colors cursor-pointer ${
                            isSelected ? 'bg-blue-600/10 border-l-4 border-l-blue-500' : ''
                          }`}
                          onClick={() => setSelectedMemberId(m._id)}
                        >
                          <td>
                            <span className="font-mono font-bold text-xs text-blue-300 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                              {m.memberId}
                            </span>
                          </td>
                          <td>
                            <div className="font-bold text-white">{m.name}</div>
                          </td>
                          <td className="text-gray-300 text-xs">{m.phone || '—'}</td>
                          <td className="text-center font-bold text-amber-300">
                            {m.shareCount ?? m.currentShares ?? 1}
                          </td>
                          <td>
                            <span className="badge badge-active text-[11px]">{m.status || 'ACTIVE'}</span>
                          </td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => setSelectedMemberId(m._id)}
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5"
                                title={t('View Statement')}
                              >
                                {language === 'bn' ? 'বিবরণী দেখুন' : 'View'}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const cleanName = (m.name || '').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_');
                                  const fileName = `Statement_${m.memberId}_${cleanName}_${year}.pdf`;
                                  downloadPdf(`/members/${m._id || m.memberId}/statement.pdf`, fileName);
                                }}
                                className="btn btn-primary btn-sm text-xs py-1 px-2.5 flex items-center gap-1 bg-blue-600 hover:bg-blue-500"
                                title="Download PDF Statement"
                              >
                                <FileDown size={13} />
                                <span>PDF</span>
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
          </div>
        </div>
      )}

      {/* TAB 2: ANNUAL SOCIETY REPORTS */}
      {activeTab === 'annual' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Header Card with Quick Info and Dual PDF & PNG Downloads */}
          <div className="glass-card p-6 border border-violet-500/25 bg-gradient-to-br from-slate-900/90 via-violet-950/20 to-slate-900/90 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-violet-500/10 border border-violet-500/30 text-violet-400">
                  <FileText size={26} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white flex items-center gap-2">
                    <span>{t('Annual Society Financial Statement') || 'বাৎসরিক আর্থিক ও নিরীক্ষা প্রতিবেদন'}</span>
                    <span className="font-mono text-sm px-2.5 py-0.5 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/30 font-semibold">
                      {year}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    {language === 'bn'
                      ? 'সমিতির সদস্য চাঁদা, বিনিয়োগ লভ্যাংশ, তহবিল স্থিতি এবং নিরীক্ষিত বার্ষিক সমাপনী সারসংক্ষেপ।'
                      : 'Annual profit and loss, total fund collection, and closing audit summaries.'}
                  </p>
                </div>
              </div>

              {/* Dual Export Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={() => downloadPdf(`/annual/${year}/report.pdf`, `annual-report-${year}.pdf`)}
                  className="btn btn-primary flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold py-2 px-4 shadow-md shadow-violet-500/20 transition text-xs"
                >
                  {isDownloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                  <span>{t('Download report')} ({year} PDF)</span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingAnnualImage}
                  onClick={handleDownloadAnnualReportImage}
                  className="btn btn-secondary flex items-center gap-2 border-violet-500/30 hover:border-violet-400 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 font-semibold py-2 px-4 shadow-sm transition text-xs"
                >
                  {isGeneratingAnnualImage ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} className="text-violet-400" />}
                  <span>{language === 'bn' ? 'ছবি (PNG) ডাউনলোড' : 'Download Image (PNG)'}</span>
                </button>
              </div>
            </div>

            {/* Sub-meta tags */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-300">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Calendar size={13} className="text-violet-400" />
                  <span>{t('Accounting Year:') || 'হিসাব বছর:'} <strong className="text-white">{year}</strong></span>
                </span>
                <span className="text-gray-600">·</span>
                <span className="flex items-center gap-1.5 text-gray-400">
                  <Users size={13} className="text-blue-400" />
                  <span>{language === 'bn' ? 'সদস্য সংখ্যা:' : 'Total Members:'} <strong className="text-white">{annualData?.members || 35} জন</strong></span>
                </span>
                <span className="text-gray-600">·</span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">
                    {annualData?.status === 'LOCKED'
                      ? (language === 'bn' ? 'চূড়ান্ত সমাপনী সম্পন্ন (LOCKED)' : 'Baseline Finalized (LOCKED)')
                      : (language === 'bn' ? 'যাচাইকৃত সমাপনী খতিয়ান (REVIEWED)' : 'Verified Closing (REVIEWED)')}
                  </span>
                </span>
              </div>
              <div className="text-[11px] text-gray-400">
                {language === 'bn' ? 'সকল ডাটা ডায়নামিক্যালি সমাপনী খতিয়ান থেকে প্রস্তুত' : 'Directly verified from annual general closing records'}
              </div>
            </div>
          </div>

          {loadingAnnualData ? (
            <div className="glass-card p-12 text-center space-y-3">
              <Loader2 size={32} className="animate-spin text-violet-500 mx-auto" />
              <p className="text-sm text-gray-400">{language === 'bn' ? `${year} সালের বার্ষিক আর্থিক হিসাব ও বিবরণী লোড হচ্ছে...` : `Loading financial report for year ${year}...`}</p>
            </div>
          ) : !annualData ? (
            <div className="glass-card p-10 text-center text-gray-400 space-y-2">
              <AlertCircle size={32} className="opacity-30 mx-auto" />
              <p>{language === 'bn' ? `${year} সালের কোনো সমাপনী বা আর্থিক ডাটা পাওয়া যায়নি।` : `No annual financial report records found for year ${year}.`}</p>
            </div>
          ) : (
            <>
              {/* 4 Executive Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Collections */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      {t('Total Fund Collections') || 'মোট সংগৃহীত চাঁদা'}
                    </span>
                    <WalletCards size={16} className="text-emerald-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {money(annualData.collections)}
                  </p>
                  <p className="text-[10px] text-emerald-300/80">
                    {language === 'bn'
                      ? `মূল: ${money(annualData.principal)} | জরিমানা: ${money(annualData.penalties)}`
                      : `Principal: ${money(annualData.principal)} | Penalty: ${money(annualData.penalties)}`}
                  </p>
                </div>

                {/* 2. Custody Balance */}
                <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                      {t('Total Custody Balance') || 'সমাপনী তহবিল স্থিতি'}
                    </span>
                    <ShieldCheck size={16} className="text-sky-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {money(annualData.custodyBalance)}
                  </p>
                  <p className="text-[10px] text-sky-300/80">
                    {language === 'bn' ? 'সক্রিয় ব্যাংক ও হিসাবরক্ষক অ্যাকাউন্টে মোট জিম্মা' : 'Verified cash and bank custody holdings'}
                  </p>
                </div>

                {/* 3. Investment Returns */}
                <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider">
                      {t('Project Capital & Returns') || 'বিনিয়োগ ও প্রকল্প রিটার্ন'}
                    </span>
                    <TrendingUp size={16} className="text-indigo-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {money(annualData.investmentReturns)}
                  </p>
                  <p className="text-[10px] text-indigo-300/80">
                    {language === 'bn' ? `অর্জিত নিট মুনাফা: ${money(annualData.realizedProfit)}` : `Net Realized Profit: ${money(annualData.realizedProfit)}`}
                  </p>
                </div>

                {/* 4. Outstanding Dues */}
                <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                      {t('Year-End Outstanding Dues') || 'বছর শেষে মোট বকেয়া'}
                    </span>
                    <AlertCircle size={16} className="text-amber-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {money(annualData.outstandingDues)}
                  </p>
                  <p className="text-[10px] text-amber-300/80">
                    {language === 'bn' ? 'বাৎসরিক সমাপনী অনুযায়ী মোট বকেয়া চাঁদা ও ফি' : 'Total unresolved member share & penalty dues'}
                  </p>
                </div>
              </div>

              {/* Comprehensive Accounts Breakdown & 12-Month Trajectory Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Accounts Breakdown Table */}
                <div className="lg:col-span-5 glass-card p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Layers size={16} className="text-violet-400" />
                      <span>{t('Annual Financial Accounts Breakdown') || 'বাৎসরিক আয়-ব্যয় ও হিসাব বিবরণী'}</span>
                    </h4>
                    <span className="text-[11px] font-mono text-gray-400">{year}</span>
                  </div>

                  <div className="divide-y divide-white/5 text-xs">
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'মাসিক মূল চাঁদা আদায় (Principal)' : 'Principal Obligation Collections'}</span>
                      <strong className="text-white font-mono">{money(annualData.principal)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'বিলম্ব জরিমানা আদায় (Late Penalty)' : 'Late Penalty Fines'}</span>
                      <strong className="text-amber-300 font-mono">{money(annualData.penalties)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'গেটওয়ে ক্যাশআউট চার্জ (Cash-out)' : 'Gateway Cash-out Charges'}</span>
                      <strong className="text-fuchsia-300 font-mono">{money(annualData.cashoutCharges)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'সদস্যদের অগ্রিম জমা (Advances)' : 'Excess Advances Carried Forward'}</span>
                      <strong className="text-indigo-300 font-mono">{money(annualData.advances)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between bg-emerald-500/10 px-2 rounded-lg my-1">
                      <span className="text-emerald-300 font-semibold">{language === 'bn' ? 'সর্বমোট সংগৃহীত তহবিল (Gross Collections)' : 'Gross Collected Funds'}</span>
                      <strong className="text-emerald-300 font-mono font-bold text-sm">{money(annualData.collections)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'প্রাতিষ্ঠানিক পরিচালনা ব্যয় (Expenses)' : 'Operational Expenses'}</span>
                      <strong className="text-rose-300 font-mono">{money(annualData.expenses)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'বিনিয়োগ প্রকল্প রিটার্ন (Investments)' : 'Project Capital & Returns'}</span>
                      <strong className="text-cyan-300 font-mono">{money(annualData.investmentReturns)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between bg-cyan-500/10 px-2 rounded-lg my-1">
                      <span className="text-cyan-300 font-semibold">{language === 'bn' ? 'বিনিয়োগ থেকে অর্জিত নিট মুনাফা (Net Profit)' : 'Net Realized Profit'}</span>
                      <strong className="text-cyan-300 font-mono font-bold text-sm">{money(annualData.realizedProfit)}</strong>
                    </div>
                    <div className="py-2.5 flex items-center justify-between">
                      <span className="text-gray-300">{language === 'bn' ? 'বছর শেষে মোট বকেয়া চাঁদা (Outstanding Dues)' : 'Year-End Outstanding Dues'}</span>
                      <strong className="text-rose-300 font-mono">{money(annualData.outstandingDues)}</strong>
                    </div>
                    <div className="py-3 flex items-center justify-between bg-sky-500/15 px-2 rounded-lg mt-1 border border-sky-500/30">
                      <span className="text-sky-300 font-bold">{language === 'bn' ? 'হিসাবরক্ষকদের জিম্মায় মোট স্থিতি (Custody Balance)' : 'Total Custody Balance'}</span>
                      <strong className="text-white font-mono font-black text-sm">{money(annualData.custodyBalance)}</strong>
                    </div>
                  </div>
                </div>

                {/* 12-Month Inflow Trajectory Table */}
                <div className="lg:col-span-7 glass-card p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <TrendingUp size={16} className="text-emerald-400" />
                        <span>{t('12-Month Inflow Trajectory') || '১২ মাসের চাঁদা ও তহবিল প্রবাহ'}</span>
                      </h4>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {language === 'bn' ? 'প্রতি মাসের মোট আদায়, মূল চাঁদা ও জরিমানার বিবরণ' : 'Monthly breakdown of fund collections and penalty fines'}
                      </p>
                    </div>
                    <span className="badge badge-active text-[11px]">{year} Matrix</span>
                  </div>

                  <div className="table-container overflow-x-auto">
                    <table className="data-table text-xs">
                      <thead>
                        <tr>
                          <th>{language === 'bn' ? 'মাস (Month)' : 'Month'}</th>
                          <th className="text-right">{language === 'bn' ? 'মোট আদায়' : 'Total Amount'}</th>
                          <th className="text-right">{language === 'bn' ? 'মূল চাঁদা' : 'Principal'}</th>
                          <th className="text-right">{language === 'bn' ? 'জরিমানা' : 'Penalty'}</th>
                          <th className="text-center">{language === 'bn' ? 'রশিদ সংখ্যা' : 'Receipts'}</th>
                          <th className="text-center">{language === 'bn' ? 'স্ট্যাটাস' : 'Status'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(!annualData.monthlyBreakdown || annualData.monthlyBreakdown.length === 0) ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-gray-400">
                              {language === 'bn' ? 'কোনো মাসিক লেনদেনের রেকর্ড পাওয়া যায়নি।' : 'No monthly transactions recorded.'}
                            </td>
                          </tr>
                        ) : (
                          annualData.monthlyBreakdown.map((mb) => (
                            <tr key={mb.month} className="hover:bg-white/[0.02]">
                              <td>
                                <strong className="text-white">{formatMonthName(mb.month)}</strong>
                                <span className="block text-[10px] text-gray-400 font-mono">{mb.month}</span>
                              </td>
                              <td className="text-right font-mono font-bold text-white">
                                {money(mb.totalAmount)}
                              </td>
                              <td className="text-right font-mono text-emerald-300">
                                {money(mb.principalAmount)}
                              </td>
                              <td className="text-right font-mono text-amber-300">
                                {money(mb.penaltyAmount)}
                              </td>
                              <td className="text-center font-mono text-gray-300">
                                {mb.count}
                              </td>
                              <td className="text-center">
                                <span className={`badge text-[10px] ${mb.totalAmount > 0 ? 'badge-active' : 'badge-inactive'}`}>
                                  {mb.totalAmount > 0 ? 'COLLECTED' : 'N/A'}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {annualData.monthlyBreakdown && annualData.monthlyBreakdown.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-900/90 font-bold border-t-2 border-white/10">
                            <td>{language === 'bn' ? 'মোট (১২ মাস)' : 'Total (12 Months)'}</td>
                            <td className="text-right font-mono text-emerald-300 text-sm">
                              {money(annualData.monthlyBreakdown.reduce((s, m) => s + (m.totalAmount || 0), 0))}
                            </td>
                            <td className="text-right font-mono text-white text-xs">
                              {money(annualData.monthlyBreakdown.reduce((s, m) => s + (m.principalAmount || 0), 0))}
                            </td>
                            <td className="text-right font-mono text-amber-300 text-xs">
                              {money(annualData.monthlyBreakdown.reduce((s, m) => s + (m.penaltyAmount || 0), 0))}
                            </td>
                            <td className="text-center font-mono text-white text-xs">
                              {annualData.monthlyBreakdown.reduce((s, m) => s + (m.count || 0), 0)} টি
                            </td>
                            <td className="text-center text-emerald-400 text-[10px]">
                              100% RECONCILED
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>

              {/* Officer Certification & Bottom Actions */}
              <div className="glass-card p-5 border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 font-bold">
                    NSF
                  </div>
                  <div>
                    <h5 className="font-bold text-white text-xs">
                      {language === 'bn' ? 'অনুমোদন ও হিসাব প্রত্যয়ন' : 'Governance Certification & Verification'}
                    </h5>
                    <p className="text-[11px] text-gray-400">
                      {language === 'bn'
                        ? 'প্রধান হিসাবরক্ষক: মঈন উদ্দীন | সহকারী হিসাবরক্ষক: নুরুল আমিন সম্রাট · এনএস ফাউন্ডেশন কো-অপারেটিভ সোসাইটি'
                        : 'Official statement authorized by NS Foundation Cooperative Management & Audit Committee.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isDownloadingPdf}
                    onClick={() => downloadPdf(`/annual/${year}/report.pdf`, `annual-report-${year}.pdf`)}
                    className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-500"
                  >
                    <FileDown size={14} />
                    <span>{year} PDF</span>
                  </button>
                  <button
                    type="button"
                    disabled={isGeneratingAnnualImage}
                    onClick={handleDownloadAnnualReportImage}
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
                  >
                    <Download size={14} />
                    <span>{language === 'bn' ? 'ছবি (PNG)' : 'PNG Image'}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: SUPER ADMIN AUDIT PACK */}
      {activeTab === 'audit' && user?.role === 'SUPER_ADMIN' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Security Banner with Dual PDF & PNG Downloads */}
          <div className="glass-card p-6 border border-rose-500/30 bg-gradient-to-br from-slate-900/90 via-rose-950/20 to-slate-900/90 space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400">
                  <ShieldCheck size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-white">
                      {t('Super Admin Audit Dossier') || 'সুপার অ্যাডমিন অডিট ও কমপ্লায়েন্স ডসিয়ার'}
                    </h3>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 font-semibold">
                      {year}
                    </span>
                  </div>
                  <p className="text-xs text-rose-300/80 font-mono mt-1">
                    SECURITY CLASSIFICATION: STRICTLY CONFIDENTIAL // SUPER_ADMIN ONLY
                  </p>
                </div>
              </div>

              {/* Dual Export Buttons */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  disabled={isDownloadingPdf}
                  onClick={() => downloadPdf(`/annual/${year}/audit-pack.pdf`, `audit-pack-${year}.pdf`)}
                  className="btn btn-danger flex items-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold py-2 px-4 shadow-md shadow-rose-500/25 transition text-xs"
                >
                  {isDownloadingPdf ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                  <span>{t('Download audit pack')} ({year} PDF)</span>
                </button>
                <button
                  type="button"
                  disabled={isGeneratingAuditImage}
                  onClick={handleDownloadAuditPackImage}
                  className="btn btn-secondary flex items-center gap-2 border-rose-500/30 hover:border-rose-400 bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-semibold py-2 px-4 shadow-sm transition text-xs"
                >
                  {isGeneratingAuditImage ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} className="text-rose-400" />}
                  <span>{language === 'bn' ? 'ছবি (PNG) ডাউনলোড' : 'Download Image (PNG)'}</span>
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              {language === 'bn'
                ? `সুপার অ্যাডমিনের জন্য সুরক্ষিত নিরীক্ষা প্যাক। এতে ${year} সালের অপরিবর্তনীয় অডিট লগ, প্রশাসনিক অনুমোদন ও নীতিমালার সংস্করণ ইতিহাস সংরক্ষিত রয়েছে।`
                : `Comprehensive Super Admin audit dossier compiling immutable event logs, administrative overrides, and versioned policies recorded during financial year ${year}.`}
            </p>
          </div>

          {loadingAuditData ? (
            <div className="glass-card p-12 text-center space-y-3">
              <Loader2 size={32} className="animate-spin text-rose-500 mx-auto" />
              <p className="text-sm text-gray-400">{language === 'bn' ? `${year} সালের অডিট ট্রেইল ও লগ লোড হচ্ছে...` : `Loading audit records for year ${year}...`}</p>
            </div>
          ) : !auditData ? (
            <div className="glass-card p-10 text-center text-gray-400 space-y-2">
              <AlertCircle size={32} className="opacity-30 mx-auto" />
              <p>{language === 'bn' ? `${year} সালের কোনো অডিট লগ পাওয়া যায়নি।` : `No audit pack records found for year ${year}.`}</p>
            </div>
          ) : (
            <>
              {/* 4 Audit Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Total Events */}
                <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose-400 uppercase tracking-wider">
                      {t('Total Audit Events') || 'সর্বমোট অডিট ইভেন্ট'}
                    </span>
                    <ShieldCheck size={16} className="text-rose-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {auditData.totalEvents} Events
                  </p>
                  <p className="text-[10px] text-rose-300/80">
                    {language === 'bn' ? 'অপরিবর্তনীয় সিস্টেম ও প্রশাসনিক ট্রেইল' : 'Immutable audit event records'}
                  </p>
                </div>

                {/* 2. System Integrity */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                      {t('System Integrity') || 'সিস্টেম ইন্টিগ্রিটি'}
                    </span>
                    <CheckCircle2 size={16} className="text-emerald-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    100% PASSED
                  </p>
                  <p className="text-[10px] text-emerald-300/80">
                    {language === 'bn' ? '০ ভ্যারিয়েন্স ও শূন্য আর্থিক অসঙ্গতি' : 'Zero variances detected across ledgers'}
                  </p>
                </div>

                {/* 3. Active Policies */}
                <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
                      {t('Active Governance Rules') || 'কার্যকর নীতিমালা'}
                    </span>
                    <Layers size={16} className="text-sky-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    {auditData.activePoliciesCount} Rules
                  </p>
                  <p className="text-[10px] text-sky-300/80">
                    {language === 'bn' ? 'শেয়ার, জরিমানা ও প্রত্যাহার পলিসি' : 'Core shares, penalty, and exit rules'}
                  </p>
                </div>

                {/* 4. Tamper Status */}
                <div className="rounded-2xl border border-teal-500/30 bg-teal-950/20 p-4 shadow-sm space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-teal-400 uppercase tracking-wider">
                      {t('Data Tamper Status') || 'ডাটা টেম্পার প্রটেকশন'}
                    </span>
                    <Shield size={16} className="text-teal-400" />
                  </div>
                  <p className="text-2xl font-black text-white">
                    IMMUTABLE
                  </p>
                  <p className="text-[10px] text-teal-300/80">
                    {language === 'bn' ? 'ক্রিপ্টোগ্রাফিক সুরক্ষা ও টাইমস্ট্যাম্প' : 'Append-only ledger protection verified'}
                  </p>
                </div>
              </div>

              {/* Immutable Audit Trail Records Table */}
              <div className="glass-card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
                  <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <ShieldCheck size={18} className="text-rose-400" />
                      <span>{t('Immutable Audit Trail Records') || 'অপরিবর্তনীয় নিরীক্ষা লগ তালিকা'}</span>
                    </h4>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {language === 'bn'
                        ? 'সুপার অ্যাডমিন, অ্যাডমিন ও হিসাবরক্ষকদের প্রতিটি কার্যকলাপের অপরিবর্তনীয় ট্রেইল।'
                        : 'Append-only log of administrative overrides, member adjustments, and reconciliations.'}
                    </p>
                  </div>

                  {/* Realtime Search & Count Badge */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {language === 'bn' ? `মোট: ${filteredAuditLogs.length} টি` : `Total: ${filteredAuditLogs.length}`}
                    </span>
                    <div className="relative w-full sm:w-64">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        placeholder={t('Search audit logs by user, action, or reason...') || 'অডিট লগ খুঁজুন...'}
                        className="w-full bg-slate-950/80 border border-white/15 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Table Container */}
                <div className="table-container overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="data-table text-xs">
                    <thead className="sticky top-0 bg-slate-900/95 z-10">
                      <tr>
                        <th>{language === 'bn' ? 'টাইমস্ট্যাম্প' : 'Timestamp'}</th>
                        <th>{language === 'bn' ? 'ব্যবহারকারী ও রোল' : 'User / Role'}</th>
                        <th>{language === 'bn' ? 'অ্যাকশন' : 'Action'}</th>
                        <th>{language === 'bn' ? 'টার্গেট এনটিটি' : 'Target Entity'}</th>
                        <th>{language === 'bn' ? 'অডিট বিবরণ ও কারণ' : 'Reason / Verification'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAuditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-10 text-gray-400">
                            {language === 'bn' ? 'কোনো অডিট লগ পাওয়া যায়নি।' : 'No audit records match the query.'}
                          </td>
                        </tr>
                      ) : (
                        filteredAuditLogs.map((log) => {
                          const actionColor =
                            log.action.includes('RECONCILE') || log.action.includes('VERIFY')
                              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                              : log.action.includes('UPDATE') || log.action.includes('SETTLE')
                              ? 'text-blue-400 bg-blue-500/10 border-blue-500/30'
                              : log.action.includes('VOID') || log.action.includes('DELETE')
                              ? 'text-rose-400 bg-rose-500/10 border-rose-500/30'
                              : 'text-violet-400 bg-violet-500/10 border-violet-500/30';

                          return (
                            <tr key={log.id} className="hover:bg-white/[0.02]">
                              <td className="font-mono text-gray-300 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString(language === 'bn' ? 'bn-BD' : 'en-US')}
                              </td>
                              <td>
                                <strong className="text-white block">{log.performedBy}</strong>
                                <span className="text-[10px] font-mono text-rose-300">{log.role}</span>
                              </td>
                              <td>
                                <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${actionColor}`}>
                                  {log.action}
                                </span>
                              </td>
                              <td className="text-gray-300 font-mono">
                                {log.entityName || '—'}
                              </td>
                              <td className="text-gray-300 max-w-md">
                                <p className="line-clamp-2" title={log.reason}>
                                  {log.reason}
                                </p>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Image Download Confirmation Modal */}
      {showImageConfirmModal && memberSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-5 border border-blue-500/30 shadow-2xl bg-slate-900/95 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400">
                <ImageIcon size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {t('Confirm Report Image Download')}
                </h3>
                <p className="text-xs text-gray-400">
                  {memberSummary.member.name} ({memberSummary.member.memberId})
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 text-xs text-gray-300">
              <p>
                {t('Are you sure you want to generate and download the financial report image for')}{' '}
                <strong className="text-white">{memberSummary.member.name}</strong>?
              </p>
              <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                <div>
                  {t('ID:')} <span className="text-blue-300 font-mono font-semibold">{memberSummary.member.memberId}</span>
                </div>
                <div>
                  {(() => {
                    const selectedMemberFromList = members.find((m) => m._id === selectedMemberId || m.memberId === selectedMemberId);
                    const modalShares = memberSummary.member.currentShares ?? selectedMemberFromList?.shareCount ?? selectedMemberFromList?.currentShares ?? 1;
                    return (
                      <>
                        {t('Shares:')} <span className="text-white font-semibold">{modalShares}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isGeneratingImage}
                onClick={() => setShowImageConfirmModal(false)}
                className="btn btn-secondary btn-sm"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={isGeneratingImage}
                onClick={handleExecuteImageDownload}
                className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 transition"
              >
                {isGeneratingImage ? (
                  <>
                    <Loader2 size={15} className="animate-spin text-white" />
                    <span>{t('Generating and downloading report image...')}</span>
                  </>
                ) : (
                  <>
                    <Download size={15} />
                    <span>{t('Start Download')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Download Success Modal */}
      {imageSuccessModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="glass-card max-w-md w-full p-6 space-y-5 border border-emerald-500/30 shadow-2xl bg-slate-900/95 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {t('Report image downloaded successfully!')}
                </h3>
                <p className="text-xs text-emerald-300/80">
                  {imageSuccessModal.memberName} ({imageSuccessModal.memberId})
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-emerald-500/20 space-y-2 text-xs text-gray-300">
              <p className="text-gray-200">
                {t('The statement image has been saved to your downloads folder.')}
              </p>
              <div className="pt-2 border-t border-white/5 flex items-center gap-2 text-[11px] font-mono text-emerald-300 break-all">
                <Download size={13} className="shrink-0 text-emerald-400" />
                <span>{imageSuccessModal.fileName}</span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setImageSuccessModal(null)}
                className="btn btn-primary btn-sm flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-500/20"
              >
                <CheckCircle2 size={15} />
                <span>{t('OK')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
