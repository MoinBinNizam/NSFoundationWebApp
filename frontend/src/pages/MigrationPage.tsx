import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  EyeOff,
  FileText,
  FileUp,
  History,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';
import { useAuth } from '../context/AuthContext';
import { BrandLogo } from '../components/BrandLogo';

type Status = 'VERIFIED' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
interface Batch {
  _id: string;
  name: string;
  sourceYear: number;
  sourceMonth?: string;
  sourceSheet?: string;
  sourceReference: string;
  totalRows: number;
  verifiedRows: number;
  reviewRows: number;
  unresolvedRows: number;
  createdAt: string;
}
interface RecordRow {
  _id: string;
  rowNumber: number;
  recordType: string;
  status: Status;
  sourceReference: string;
  validationErrors: string[];
  reviewReason?: string;
  normalizedData: Record<string, unknown>;
}
interface Reconciliation {
  recordType: string;
  stagedCount: number;
  liveCount: number;
  countDifference: number;
  stagedAmount: number;
  liveAmount: number;
  amountDifference: number;
}
interface HistoricalOverview {
  membersCount: number;
  members: {
    status: 'SYNCED' | 'PARTIAL' | 'PENDING';
    count: number;
    expectedCount: number;
  };
  year2024: {
    status: 'SYNCED' | 'PARTIAL' | 'PENDING';
    paymentsCount: number;
    totalAmount: number;
    ledgersCount: number;
    expectedPayments: number;
    expectedAmount: number;
  };
  year2025: {
    status: 'SYNCED' | 'PARTIAL' | 'PENDING';
    months: string[];
    paymentsCount: number;
    totalAmount: number;
    ledgersCount: number;
    expectedPayments: number;
    expectedAmount: number;
  };
  expenses: {
    status: 'SYNCED' | 'PARTIAL' | 'PENDING';
    count: number;
    totalAmount: number;
    expectedCount: number;
    expectedAmount: number;
  };
  investments: {
    status: 'SYNCED' | 'PARTIAL' | 'PENDING';
    projectsCount: number;
    totalFunded: number;
    totalRealizedProfit: number;
    expectedProjects: number;
    expectedFunded: number;
  };
  custody: Array<{
    id: string;
    name: string;
    channel: string;
    accountType: string;
    cachedBalance: number;
  }>;
  isModuleEnabled?: boolean;
}

interface MigrationAuditItem {
  id: string;
  action: string;
  performedBy: string;
  reason: string;
  createdAt: string;
  details: Record<string, unknown>;
}

const types = ['MEMBER', 'PAYMENT', 'EXPENSE', 'INVESTMENT_RETURN', 'CUSTODY_MOVEMENT'];

export const MigrationPage: React.FC = () => {
  const { t } = usePreferences();
  const { refreshPermissions } = useAuth();
  const [activeTab, setActiveTab] = useState<'SYNC' | 'HISTORY' | 'CSV'>('SYNC');
  const [overview, setOverview] = useState<HistoricalOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);

  // Sync action states
  const [dryRunMembers, setDryRunMembers] = useState(false);
  const [dryRun2024, setDryRun2024] = useState(false);
  const [dryRun2025, setDryRun2025] = useState(false);
  const [dryRunExpenses, setDryRunExpenses] = useState(false);
  const [dryRunInvestments, setDryRunInvestments] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    scope: string;
    message: string;
    data?: any;
    isError?: boolean;
    isWarning?: boolean;
  } | null>(null);

  // History state
  const [historyLogs, setHistoryLogs] = useState<MigrationAuditItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Legacy CSV state
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([]);
  const [csvText, setCsvText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    sourceYear: String(new Date().getFullYear()),
    sourceMonth: '',
    sourceSheet: '',
    sourceReference: '',
    recordType: 'PAYMENT',
  });

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true);
    try {
      const res = await apiRequest<HistoricalOverview>('/migrations/overview');
      if (res.data) setOverview(res.data);
    } catch (e) {
      console.error('Failed to load overview:', e);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiRequest<MigrationAuditItem[]>('/migrations/history');
      if (res.data) setHistoryLogs(res.data);
    } catch (e) {
      console.error('Failed to load migration history:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadBatches = useCallback(async () => {
    try {
      setBatches((await apiRequest<Batch[]>('/migrations/batches')).data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const openBatch = useCallback(async (batch: Batch) => {
    setSelected(batch);
    try {
      const [rows, report] = await Promise.all([
        apiRequest<RecordRow[]>(`/migrations/batches/${batch._id}/records`),
        apiRequest<Reconciliation[]>(`/migrations/batches/${batch._id}/reconciliation`),
      ]);
      setRecords(rows.data || []);
      setReconciliation(report.data || []);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    loadBatches();
    loadHistory();
  }, [loadOverview, loadBatches, loadHistory]);

  const handleSync = async (endpoint: string, dryRun: boolean, scopeName: string, force = false) => {
    // If not dryRun and not force, check if already SYNCED in overview
    if (!dryRun && !force) {
      let isAlreadySynced = false;
      let existingCount = 0;
      if (endpoint === 'members' && overview?.members?.status === 'SYNCED') {
        isAlreadySynced = true;
        existingCount = overview.members.count;
      } else if (endpoint === '2024' && overview?.year2024.status === 'SYNCED') {
        isAlreadySynced = true;
        existingCount = overview.year2024.paymentsCount;
      } else if (endpoint === '2025' && overview?.year2025.status === 'SYNCED') {
        isAlreadySynced = true;
        existingCount = overview.year2025.paymentsCount;
      } else if (endpoint === 'expenses' && overview?.expenses.status === 'SYNCED') {
        isAlreadySynced = true;
        existingCount = overview.expenses.count;
      } else if (endpoint === 'investments' && overview?.investments.status === 'SYNCED') {
        isAlreadySynced = true;
        existingCount = overview.investments.projectsCount;
      }

      if (isAlreadySynced) {
        const confirmPurgeAndResync = window.confirm(
          `⚠️ ${t('Duplicate Warning')}: ${t(scopeName)} ${t('is already completely imported in the database')} (${existingCount} ${t('records')}).\n\n${t('To prevent duplicate records, direct re-import is blocked. Do you want to safely DELETE (Purge) the previous data and re-sync from scratch?')}`
        );
        if (!confirmPurgeAndResync) return;
        force = true;
      } else {
        const confirmed = window.confirm(
          `${t('Are you sure you want to run LIVE PRODUCTION synchronization for')} ${t(scopeName)}? ${t('This will write and update records in the live database.')}`
        );
        if (!confirmed) return;
      }
    }

    setActionLoading(scopeName);
    setSyncResult(null);
    try {
      const res = await apiRequest<any>(`/migrations/sync/${endpoint}`, {
        method: 'POST',
        body: JSON.stringify({ dryRun, force }),
      });
      if (res.data?.alreadySynced) {
        setSyncResult({
          scope: scopeName,
          message: res.data.message || t('This data is already synchronized in the database.'),
          data: res.data,
          isWarning: true,
        });
      } else {
        setSyncResult({
          scope: scopeName,
          message: res.data?.message || res.message || t('Synchronization completed successfully.'),
          data: res.data,
        });
      }
      await loadOverview();
      await loadHistory();
    } catch (e) {
      setSyncResult({
        scope: scopeName,
        message: (e as Error).message || t('Synchronization failed.'),
        isError: true,
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurge = async (endpoint: string, scopeName: string) => {
    const confirmed = window.confirm(
      `⚠️ ${t('Warning')}: ${t('Are you sure you want to DELETE and purge all imported records for')} ${t(scopeName)}? ${t('This will safely remove records for this scope and rebalance custody accounts. This action is audit logged.')}`
    );
    if (!confirmed) return;

    setActionLoading(scopeName);
    setSyncResult(null);
    try {
      const res = await apiRequest<any>(`/migrations/purge/${endpoint}`, {
        method: 'POST',
      });
      setNotice(res.message || `${t(scopeName)} ${t('purged successfully.')}`);
      await loadOverview();
      await loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleModuleVisibility = async () => {
    const isCurrentlyEnabled = overview?.isModuleEnabled ?? true;
    const confirmed = window.confirm(
      isCurrentlyEnabled
        ? `${t('Are you sure all historical data has been imported? Deactivating this module will remove it from the sidebar navigation to keep regular operations clean and user-friendly. You can re-enable it anytime from System Settings.')}`
        : `${t('Do you want to re-enable the Historical Migration module in sidebar navigation?')}`
    );
    if (!confirmed) return;

    setActionLoading('module-toggle');
    try {
      const res = await apiRequest<any>('/migrations/module-visibility', {
        method: 'PUT',
        body: JSON.stringify({ enabled: !isCurrentlyEnabled }),
      });
      setNotice(res.data?.message || t('Module visibility updated successfully.'));
      await loadOverview();
      await refreshPermissions();
      if (isCurrentlyEnabled) {
        window.alert(t('Historical Migration module is now hidden from navigation sidebar. You can turn it back ON anytime from Settings.'));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const uploadCsv = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await apiRequest<Batch>('/migrations/stage', {
        method: 'POST',
        body: JSON.stringify({ ...form, sourceYear: Number(form.sourceYear), csvText }),
      });
      setNotice(response.message || t('Source rows staged safely.'));
      setCsvText('');
      await loadBatches();
      await openBatch(response.data);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const reviewRow = async (row: RecordRow, status: Status) => {
    const reason = window.prompt(t('Review reason (required):'), row.reviewReason || '');
    if (!reason) return;
    try {
      await apiRequest(`/migrations/records/${row._id}/review`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
      if (selected) await openBatch(selected);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 900_000) {
      setError(t('CSV must be smaller than 900 KB.'));
      return;
    }
    setCsvText(await file.text());
  };

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      {/* Top Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 glass-card p-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <BrandLogo size="lg" className="rounded-2xl shadow-xl ring-2 ring-emerald-500/20 shrink-0" />
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={16} />
              <span>{t('Production Historical Data Migration & Synchronization Engine')}</span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">
              {t('Historical Migration & Database Sync')}
            </h1>
            <p className="text-sm text-gray-300 mt-1 max-w-3xl">
              {t(
                'Authoritative one-click historical data import and reconciliation engine. Directly sync 2024, 2025, Expenses, and Investments into the production database with dry-run verification.'
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 self-start lg:self-center">
          <button
            className={`btn flex items-center gap-2 ${
              (overview?.isModuleEnabled ?? true)
                ? 'bg-amber-600/80 hover:bg-amber-500 text-white border-amber-400/30'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/30'
            }`}
            onClick={toggleModuleVisibility}
            disabled={actionLoading === 'module-toggle'}
            title={t('Toggle visibility of this migration module in navigation')}
          >
            {(overview?.isModuleEnabled ?? true) ? <EyeOff size={16} /> : <Eye size={16} />}
            <span>
              {(overview?.isModuleEnabled ?? true)
                ? t('Mark Migration Done & Hide Module')
                : t('Re-enable Module in Sidebar')}
            </span>
          </button>
          <button
            className="btn btn-secondary flex items-center gap-2 shrink-0"
            onClick={() => {
              loadOverview();
              loadBatches();
              loadHistory();
            }}
            disabled={overviewLoading || historyLoading}
          >
            <RefreshCw size={16} className={overviewLoading ? 'animate-spin' : ''} />
            <span>{t('Refresh Database Status')}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-white/10 pb-2">
        <button
          onClick={() => setActiveTab('SYNC')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'SYNC'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 ring-1 ring-emerald-400/30'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Database size={16} />
          <span>{t('Production Data Sync (One-Click)')}</span>
        </button>
        <button
          onClick={() => setActiveTab('HISTORY')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'HISTORY'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/40 ring-1 ring-amber-400/30'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <History size={16} />
          <span>{t('Execution & Purge Audit History')}</span>
        </button>
        <button
          onClick={() => setActiveTab('CSV')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'CSV'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40 ring-1 ring-blue-400/30'
              : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileUp size={16} />
          <span>{t('Ad-hoc CSV Staging & Reconciliation')}</span>
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* Sync Result Banner */}
      {syncResult && (
        <div
          className={`glass-card p-5 border rounded-2xl ${
            syncResult.isError
              ? 'border-rose-500/40 bg-rose-950/30 text-rose-200'
              : syncResult.isWarning
              ? 'border-amber-500/40 bg-amber-950/30 text-amber-200'
              : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {syncResult.isError ? (
                <AlertTriangle size={24} className="text-rose-400 shrink-0" />
              ) : syncResult.isWarning ? (
                <ShieldAlert size={24} className="text-amber-400 shrink-0" />
              ) : (
                <CheckCircle2 size={24} className="text-emerald-400 shrink-0" />
              )}
              <div>
                <h4 className="font-bold text-base text-white">
                  {t(syncResult.scope)} —{' '}
                  {syncResult.isError
                    ? t('Execution Failed')
                    : syncResult.isWarning
                    ? t('Already Synchronized (Notice)')
                    : t('Execution Completed')}
                </h4>
                <p className="text-sm mt-0.5">{t(syncResult.message)}</p>
                {syncResult.data && (
                  <div className="mt-2 text-xs font-mono bg-slate-900/60 p-2.5 rounded-lg border border-white/5 space-y-1">
                    {Object.entries(syncResult.data)
                      .filter(([k]) => k !== 'message')
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-gray-400 capitalize">{t(k)}:</span>
                          <span className="text-white font-bold">{String(v)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setSyncResult(null)}
              className="text-xs text-gray-400 hover:text-white p-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* TAB 1: ONE-CLICK HISTORICAL SYNC */}
      {activeTab === 'SYNC' && (
        <div className="space-y-6">
          {/* Step-by-Step Guideline Banner */}
          <div className="glass-card p-5 border border-indigo-500/30 bg-gradient-to-r from-slate-900/90 via-indigo-950/40 to-slate-900/90 rounded-2xl">
            <div className="flex items-center gap-2.5 mb-3 text-indigo-300 font-bold text-sm uppercase tracking-wide">
              <ShieldCheck size={18} className="text-indigo-400" />
              <span>{t('Production Historical Data Migration Sequence & Best Practice Guideline')}</span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed mb-4">
              {t(
                'To maintain database referential integrity, accurate share balances, and audit custody reconciliation, follow this strict sequential import order. Each step validates pre-requisites and prevents duplicate records.'
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">1</span>
                  <span className="font-bold text-xs text-white">{t('Step 1: Members')}</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {t('35 members profiles & 2024 baseline shares. Prerequisite for all financial links.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500 text-slate-950 font-black text-xs flex items-center justify-center">2</span>
                  <span className="font-bold text-xs text-white">{t('Step 2: 2024 Payments')}</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {t('304 payments, 12 monthly ledgers, and departed member settlements (Bayzid, Tanvir).')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500 text-slate-950 font-black text-xs flex items-center justify-center">3</span>
                  <span className="font-bold text-xs text-white">{t('Step 3: 2025 Payments')}</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {t('60 approved payments for Jan-Apr 2025 with accountant custody movements.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center">4</span>
                  <span className="font-bold text-xs text-white">{t('Step 4: Expenses')}</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {t('5 operational vouchers (EXP-2024-001 to 005) & personal bKash adjustments.')}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-800/80 border border-white/10 space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-500 text-slate-950 font-black text-xs flex items-center justify-center">5</span>
                  <span className="font-bold text-xs text-white">{t('Step 5: Investments')}</span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {t('20 projects, partner wallets, 5 Hungry Birds dues, and Zayn withdrawal.')}
                </p>
              </div>
            </div>
          </div>

          {/* 5 Overview Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Step 1: Members */}
            <div className="glass-card p-4 border border-emerald-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">
                  {t('1. Members & Shares')}
                </span>
                <span
                  className={`badge ${
                    overview?.members?.status === 'SYNCED'
                      ? 'badge-active'
                      : overview?.members?.status === 'PARTIAL'
                      ? 'badge-warning'
                      : 'badge-inactive'
                  }`}
                >
                  {t(overview?.members?.status || 'PENDING')}
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-white">
                  {overview?.members?.count || 0} / {overview?.members?.expectedCount || 35}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {t('Members Profiles Synced')}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-1.5">
                {t('35 Initial Shares Baseline')}
              </div>
            </div>

            {/* Step 2: 2024 */}
            <div className="glass-card p-4 border border-blue-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wide">
                  {t('2. 2024 Payments')}
                </span>
                <span
                  className={`badge ${
                    overview?.year2024.status === 'SYNCED'
                      ? 'badge-active'
                      : overview?.year2024.status === 'PARTIAL'
                      ? 'badge-warning'
                      : 'badge-inactive'
                  }`}
                >
                  {t(overview?.year2024.status || 'PENDING')}
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-white">
                  ৳ {Number(overview?.year2024.totalAmount || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {overview?.year2024.paymentsCount || 0} / {overview?.year2024.expectedPayments || 304}{' '}
                  {t('Payments')}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-1.5">
                {overview?.year2024.ledgersCount || 0} {t('Ledgers')} • {t('Jan-Dec 2024')}
              </div>
            </div>

            {/* Step 3: 2025 */}
            <div className="glass-card p-4 border border-cyan-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wide">
                  {t('3. 2025 Payments')}
                </span>
                <span
                  className={`badge ${
                    overview?.year2025.status === 'SYNCED'
                      ? 'badge-active'
                      : overview?.year2025.status === 'PARTIAL'
                      ? 'badge-warning'
                      : 'badge-inactive'
                  }`}
                >
                  {t(overview?.year2025.status || 'PENDING')}
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-white">
                  ৳ {Number(overview?.year2025.totalAmount || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {overview?.year2025.paymentsCount || 0} / {overview?.year2025.expectedPayments || 60}{' '}
                  {t('Payments')}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-1.5">
                {t('Jan, Feb, Mar, Apr 2025')}
              </div>
            </div>

            {/* Step 4: Expenses */}
            <div className="glass-card p-4 border border-amber-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wide">
                  {t('4. Historical Expenses')}
                </span>
                <span
                  className={`badge ${
                    overview?.expenses.status === 'SYNCED'
                      ? 'badge-active'
                      : overview?.expenses.status === 'PARTIAL'
                      ? 'badge-warning'
                      : 'badge-inactive'
                  }`}
                >
                  {t(overview?.expenses.status || 'PENDING')}
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-white">
                  ৳ {Number(overview?.expenses.totalAmount || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {overview?.expenses.count || 0} / {overview?.expenses.expectedCount || 5}{' '}
                  {t('Vouchers')}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-1.5">
                {t('EXP-2024-001 to 005')}
              </div>
            </div>

            {/* Step 5: Investments */}
            <div className="glass-card p-4 border border-purple-500/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wide">
                  {t('5. Investments')}
                </span>
                <span
                  className={`badge ${
                    overview?.investments.status === 'SYNCED'
                      ? 'badge-active'
                      : overview?.investments.status === 'PARTIAL'
                      ? 'badge-warning'
                      : 'badge-inactive'
                  }`}
                >
                  {t(overview?.investments.status || 'PENDING')}
                </span>
              </div>
              <div>
                <div className="text-xl font-black text-white">
                  ৳ {Number(overview?.investments.totalFunded || 0).toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-gray-400 mt-0.5">
                  {overview?.investments.projectsCount || 0} / {overview?.investments.expectedProjects || 20}{' '}
                  {t('Projects')}
                </div>
              </div>
              <div className="text-[10px] text-gray-500 border-t border-white/5 pt-1.5">
                {t('Wallets, Dues & Profit')}
              </div>
            </div>
          </div>

          {/* 5 Actionable Sync & Purge Cards (Strict Serial Sequence) */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Action 1: Members */}
            <div className="glass-card p-5 border border-emerald-500/25 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Users size={20} />
                    </div>
                    <div>
                      <span className="badge badge-primary text-[10px]">{t('Step 1 of 5')}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {t('1. Member Profiles & Baseline Shares')}
                      </h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pt-1">
                  {t(
                    'Synchronizes all 35 official members, initializes member numbers (MEM-001 to MEM-035), assigns phone numbers, sets 2024 baseline share allocations, and provisions accountant permissions for Moin Uddin & Salah Uddin.'
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="form-checkbox text-emerald-500 rounded"
                    checked={dryRunMembers}
                    onChange={(e) => setDryRunMembers(e.target.checked)}
                  />
                  <span>{t('Dry Run only (Preview count)')}</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync('members', dryRunMembers, 'Member Profiles & Baseline Shares')}
                    disabled={Boolean(actionLoading)}
                    className={`btn flex-1 flex items-center justify-center gap-1.5 text-xs ${
                      dryRunMembers ? 'btn-secondary' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    <Play size={14} />
                    <span>
                      {actionLoading === 'Member Profiles & Baseline Shares'
                        ? t('Processing...')
                        : dryRunMembers
                        ? t('Preview (Dry Run)')
                        : t('Sync Members')}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePurge('members', 'Member Profiles')}
                    disabled={Boolean(actionLoading) || overview?.members?.status === 'PENDING'}
                    title={t('Purge and delete imported members')}
                    className="btn bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-3 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Action 2: 2024 Data */}
            <div className="glass-card p-5 border border-blue-500/25 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <Calendar size={20} />
                    </div>
                    <div>
                      <span className="badge badge-primary text-[10px]">{t('Step 2 of 5')}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {t('2. 2024 Payments & Exit Refunds')}
                      </h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pt-1">
                  {t(
                    'Imports 304 contribution payments across 12 monthly sheets (Jan-Dec 2024), 12 monthly ledgers, custody receipts, and records exit refunds for Bayzid Hasan (৳24,000) and Tanvir Hossain (৳12,000).'
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="form-checkbox text-blue-500 rounded"
                    checked={dryRun2024}
                    onChange={(e) => setDryRun2024(e.target.checked)}
                  />
                  <span>{t('Dry Run only (Preview count)')}</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync('2024', dryRun2024, '2024 Historical Data')}
                    disabled={Boolean(actionLoading)}
                    className={`btn flex-1 flex items-center justify-center gap-1.5 text-xs ${
                      dryRun2024 ? 'btn-secondary' : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    <Play size={14} />
                    <span>
                      {actionLoading === '2024 Historical Data'
                        ? t('Processing...')
                        : dryRun2024
                        ? t('Preview (Dry Run)')
                        : t('Sync 2024 Data')}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePurge('2024', '2024 Historical Data')}
                    disabled={Boolean(actionLoading) || overview?.year2024.status === 'PENDING'}
                    title={t('Purge and delete imported 2024 data')}
                    className="btn bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-3 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Action 3: 2025 Staged Months */}
            <div className="glass-card p-5 border border-cyan-500/25 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                      <Clock size={20} />
                    </div>
                    <div>
                      <span className="badge badge-primary text-[10px]">{t('Step 3 of 5')}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {t('3. 2025 Staged Months Contributions')}
                      </h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pt-1">
                  {t(
                    'Imports verified historical contribution manifests for Jan, Feb, Mar, and Apr 2025 (60 payments) into live Payments, PaymentAllocations, MonthlyLedgers, and CustodyMovements with accountant custody routing.'
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="form-checkbox text-cyan-500 rounded"
                    checked={dryRun2025}
                    onChange={(e) => setDryRun2025(e.target.checked)}
                  />
                  <span>{t('Dry Run only (Preview count)')}</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync('2025', dryRun2025, '2025 Staged Months')}
                    disabled={Boolean(actionLoading)}
                    className={`btn flex-1 flex items-center justify-center gap-1.5 text-xs ${
                      dryRun2025 ? 'btn-secondary' : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    }`}
                  >
                    <Play size={14} />
                    <span>
                      {actionLoading === '2025 Staged Months'
                        ? t('Processing...')
                        : dryRun2025
                        ? t('Preview (Dry Run)')
                        : t('Sync 2025 Data')}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePurge('2025', '2025 Staged Months')}
                    disabled={Boolean(actionLoading) || overview?.year2025.status === 'PENDING'}
                    title={t('Purge and delete imported 2025 data')}
                    className="btn bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-3 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Action 4: Expenses */}
            <div className="glass-card p-5 border border-amber-500/25 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <FileText size={20} />
                    </div>
                    <div>
                      <span className="badge badge-primary text-[10px]">{t('Step 4 of 5')}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {t('4. Historical Operational Expenses')}
                      </h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pt-1">
                  {t(
                    'Synchronizes approved operational expense vouchers (EXP-2024-001 through EXP-2024-005: food, software, phone bills) and adjusts Moin Uddin Personal bKash reserves.'
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="form-checkbox text-amber-500 rounded"
                    checked={dryRunExpenses}
                    onChange={(e) => setDryRunExpenses(e.target.checked)}
                  />
                  <span>{t('Dry Run only (Preview count)')}</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync('expenses', dryRunExpenses, 'Historical Expenses')}
                    disabled={Boolean(actionLoading)}
                    className={`btn flex-1 flex items-center justify-center gap-1.5 text-xs ${
                      dryRunExpenses ? 'btn-secondary' : 'bg-amber-600 hover:bg-amber-500 text-white'
                    }`}
                  >
                    <Play size={14} />
                    <span>
                      {actionLoading === 'Historical Expenses'
                        ? t('Processing...')
                        : dryRunExpenses
                        ? t('Preview (Dry Run)')
                        : t('Sync Expenses')}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePurge('expenses', 'Historical Expenses')}
                    disabled={Boolean(actionLoading) || overview?.expenses.status === 'PENDING'}
                    title={t('Purge and delete imported expenses')}
                    className="btn bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-3 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* Action 5: Investments */}
            <div className="glass-card p-5 border border-purple-500/25 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <span className="badge badge-primary text-[10px]">{t('Step 5 of 5')}</span>
                      <h3 className="text-base font-bold text-white mt-0.5">
                        {t('5. Historical Investments & Returns')}
                      </h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed pt-1">
                  {t(
                    'Synchronizes 20 real investment projects (৳1,312,363), partner wallets (GrowUp, Zayn Farm, Hungry Birds), 5 Hungry Birds installments (Due: ৳52,700), and Zayn Farm withdrawal request (৳256,490).'
                  )}
                </p>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-white/10">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-300">
                  <input
                    type="checkbox"
                    className="form-checkbox text-purple-500 rounded"
                    checked={dryRunInvestments}
                    onChange={(e) => setDryRunInvestments(e.target.checked)}
                  />
                  <span>{t('Dry Run only (Preview count)')}</span>
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSync('investments', dryRunInvestments, 'Historical Investments')}
                    disabled={Boolean(actionLoading)}
                    className={`btn flex-1 flex items-center justify-center gap-1.5 text-xs ${
                      dryRunInvestments ? 'btn-secondary' : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    <Play size={14} />
                    <span>
                      {actionLoading === 'Historical Investments'
                        ? t('Processing...')
                        : dryRunInvestments
                        ? t('Preview (Dry Run)')
                        : t('Sync Investments')}
                    </span>
                  </button>
                  <button
                    onClick={() => handlePurge('investments', 'Historical Investments')}
                    disabled={Boolean(actionLoading) || overview?.investments.status === 'PENDING'}
                    title={t('Purge and delete imported investments')}
                    className="btn bg-rose-950/60 hover:bg-rose-900 border border-rose-500/40 text-rose-300 px-3 disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Custody Accounts Summary Table */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-white text-base">
                <Layers size={18} className="text-emerald-400" />
                <span>{t('Custody Accounts Live Balances')}</span>
              </div>
              <span className="text-xs text-gray-400">
                {t('Automatically balanced upon synchronization')}
              </span>
            </div>
            <div className="table-container">
              <table className="data-table min-w-[700px]">
                <thead>
                  <tr>
                    <th>{t('Account Name')}</th>
                    <th>{t('Channel')}</th>
                    <th>{t('Type')}</th>
                    <th className="text-right">{t('Cached Balance (BDT)')}</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.custody || []).map((acc) => (
                    <tr key={acc.id}>
                      <td className="font-bold text-white">{t(acc.name)}</td>
                      <td>
                        <span className="badge badge-outline">{t(acc.channel)}</span>
                      </td>
                      <td className="text-xs text-gray-400">{t(acc.accountType)}</td>
                      <td
                        className={`text-right font-mono font-bold ${
                          acc.cachedBalance < 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        ৳ {acc.cachedBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: EXECUTION & PURGE AUDIT HISTORY */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-6">
          <div className="glass-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-white text-base flex items-center gap-2">
                  <History size={18} className="text-amber-400" />
                  <span>{t('Historical Migration Audit Trail & Execution History')}</span>
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {t(
                    'Immutable audit records tracking all historical data synchronizations, scoped purges, idempotency checks, and module visibility changes.'
                  )}
                </p>
              </div>
              <button
                className="btn btn-secondary btn-sm flex items-center gap-1.5 self-start sm:self-center"
                onClick={loadHistory}
                disabled={historyLoading}
              >
                <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
                <span>{t('Refresh Logs')}</span>
              </button>
            </div>

            <div className="table-container mt-4">
              <table className="data-table min-w-[850px]">
                <thead>
                  <tr>
                    <th>{t('Date & Time')}</th>
                    <th>{t('Action Type')}</th>
                    <th>{t('Scope / Category')}</th>
                    <th>{t('Performed By')}</th>
                    <th>{t('Summary & Details')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyLogs.length ? (
                    historyLogs.map((log) => {
                      const isPurge = log.action.includes('PURGE') || log.action.includes('DELETE');
                      const isSync = log.action.includes('SYNC') || log.action.includes('MIGRAT');
                      const scope = (log.details?.scope as string) || (log.details?.year as string) || '-';

                      return (
                        <tr key={log.id}>
                          <td className="text-xs font-mono text-gray-400 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('en-GB', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                isPurge
                                  ? 'badge-danger'
                                  : isSync
                                  ? 'badge-active'
                                  : 'badge-outline'
                              }`}
                            >
                              {t(log.action)}
                            </span>
                          </td>
                          <td className="font-bold text-white text-xs">{t(scope)}</td>
                          <td className="text-xs text-gray-300">{log.performedBy || t('System Admin')}</td>
                          <td className="text-xs text-gray-300">
                            <div>{t(log.reason)}</div>
                            {log.details && (
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                                {Object.entries(log.details)
                                  .filter(([k]) => k !== 'scope' && k !== 'year')
                                  .map(([k, v]) => `${t(k)}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
                                  .join(' • ')}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-500">
                        {t('No historical migration actions logged yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: AD-HOC CSV STAGING & AUDIT */}
      {activeTab === 'CSV' && (
        <div className="space-y-6">
          <form onSubmit={uploadCsv} className="glass-card p-5 space-y-4 border border-blue-500/20">
            <div className="flex items-center gap-2 font-bold text-white text-base">
              <FileUp size={18} className="text-blue-400" />
              <span>{t('Stage a Custom Source CSV')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                className="form-input"
                required
                placeholder={t('Batch name')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="form-input"
                required
                type="number"
                min="2000"
                max="2100"
                placeholder={t('Source year')}
                value={form.sourceYear}
                onChange={(e) => setForm({ ...form, sourceYear: e.target.value })}
              />
              <select
                className="form-select"
                value={form.recordType}
                onChange={(e) => setForm({ ...form, recordType: e.target.value })}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {t(type)}
                  </option>
                ))}
              </select>
              <input
                className="form-input"
                placeholder={t('Source month (YYYY-MM)')}
                value={form.sourceMonth}
                onChange={(e) => setForm({ ...form, sourceMonth: e.target.value })}
              />
              <input
                className="form-input"
                placeholder={t('Source sheet')}
                value={form.sourceSheet}
                onChange={(e) => setForm({ ...form, sourceSheet: e.target.value })}
              />
              <input
                className="form-input"
                required
                placeholder={t('Source reference, e.g. 2024-Jan-Sheet-A')}
                value={form.sourceReference}
                onChange={(e) => setForm({ ...form, sourceReference: e.target.value })}
              />
            </div>
            <input
              className="form-input"
              required
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => readFile(e.target.files?.[0])}
            />
            <p className="text-xs text-gray-400">
              {t(
                'CSV headers: Members need memberId, name, phone. Financial rows need date, amount; payments also need memberId and optional receiptNumber.'
              )}
            </p>
            <button className="btn btn-primary" disabled={Boolean(actionLoading) || !csvText}>
              <FileUp size={16} />
              <span>{t('Stage source safely')}</span>
            </button>
          </form>

          {/* Batches Table */}
          <section className="glass-card p-5">
            <div className="flex justify-between items-center gap-3">
              <h2 className="font-bold text-white text-base">{t('Historical Staged Batches')}</h2>
              <button className="btn btn-secondary btn-sm" onClick={loadBatches}>
                <RefreshCw size={15} />
                <span>{t('Refresh')}</span>
              </button>
            </div>
            <div className="table-container mt-4">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>{t('Source')}</th>
                    <th>{t('Rows')}</th>
                    <th>{t('Verified')}</th>
                    <th>{t('Needs review')}</th>
                    <th>{t('Unresolved')}</th>
                    <th>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.length ? (
                    batches.map((batch) => (
                      <tr key={batch._id}>
                        <td>
                          <strong>{batch.name}</strong>
                          <span className="block text-xs text-gray-500">
                            {batch.sourceReference} • {batch.sourceYear}
                          </span>
                        </td>
                        <td>{batch.totalRows}</td>
                        <td className="text-emerald-400 font-bold">{batch.verifiedRows}</td>
                        <td className="text-amber-400 font-bold">{batch.reviewRows}</td>
                        <td className="text-red-400 font-bold">{batch.unresolvedRows}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openBatch(batch)}
                          >
                            {t('Review')}
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500">
                        {t('No historical source CSV batches have been staged.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Selected Batch Details */}
          {selected && (
            <section className="space-y-5">
              <div className="glass-card p-5">
                <h2 className="font-bold text-white">
                  {t('Reconciliation:')} {selected.name}
                </h2>
                <div className="table-container mt-4">
                  <table className="data-table min-w-[700px]">
                    <thead>
                      <tr>
                        <th>{t('Type')}</th>
                        <th>{t('Staged rows')}</th>
                        <th>{t('Live rows')}</th>
                        <th>{t('Staged amount')}</th>
                        <th>{t('Live amount')}</th>
                        <th>{t('Difference')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliation.map((item) => (
                        <tr key={item.recordType}>
                          <td>{t(item.recordType)}</td>
                          <td>{item.stagedCount}</td>
                          <td>{item.liveCount}</td>
                          <td>৳ {item.stagedAmount.toFixed(2)}</td>
                          <td>৳ {item.liveAmount.toFixed(2)}</td>
                          <td
                            className={
                              item.countDifference || item.amountDifference
                                ? 'text-amber-400 font-bold'
                                : 'text-emerald-400 font-bold'
                            }
                          >
                            {item.countDifference} {t('rows')} • ৳ {item.amountDifference.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="font-bold text-white">{t('Source-row review')}</h2>
                <div className="table-container mt-4">
                  <table className="data-table min-w-[900px]">
                    <thead>
                      <tr>
                        <th>{t('Row')}</th>
                        <th>{t('Type')}</th>
                        <th>{t('Source reference')}</th>
                        <th>{t('Status')}</th>
                        <th>{t('Validation / reason')}</th>
                        <th>{t('Action')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((row) => (
                        <tr key={row._id}>
                          <td>{row.rowNumber}</td>
                          <td>{t(row.recordType)}</td>
                          <td className="font-mono text-xs">{row.sourceReference}</td>
                          <td>
                            <span
                              className={
                                row.status === 'VERIFIED'
                                  ? 'badge badge-active'
                                  : 'badge badge-warning'
                              }
                            >
                              {t(row.status)}
                            </span>
                          </td>
                          <td className="text-xs text-gray-400">
                            {row.validationErrors.join(' ') ||
                              row.reviewReason ||
                              t('Ready for review.')}
                          </td>
                          <td className="flex gap-2">
                            <button
                              title={t('Verify')}
                              className="btn btn-secondary btn-sm"
                              onClick={() => reviewRow(row, 'VERIFIED')}
                            >
                              <CheckCircle2 size={15} />
                            </button>
                            <button
                              title={t('Mark unresolved')}
                              className="btn btn-danger btn-sm"
                              onClick={() => reviewRow(row, 'UNRESOLVED')}
                            >
                              <AlertTriangle size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
export default MigrationPage;
