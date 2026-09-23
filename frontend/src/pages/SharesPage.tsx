import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import {
  PieChart,
  Coins,
  Repeat,
  CalendarCheck,
  Plus,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  X,
  History,
  Info,
  Calendar,
  Layers,
  FileCheck,
} from 'lucide-react';

interface MemberShareItem {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  status: string;
  currentShares: number;
  monthlyObligation: number;
  effectiveMonth: string;
  yearAccount2024: {
    finalShares: number;
    annualObligation: number;
    totalPrincipalPaid: number;
    shortfall: number;
    excessAdvance: number;
    isSettled: boolean;
  } | null;
}

interface ShareHistoryEvent {
  _id: string;
  memberId: {
    _id: string;
    memberId: string;
    name: string;
    phone: string;
  };
  effectiveMonth: string;
  shareCount: number;
  previousShareCount: number;
  eventType: 'TEMPORARY_CHANGE' | 'ANNUAL_FINALIZATION' | 'TRANSFER';
  isAdministrativeOverride?: boolean;
  notes?: string;
  transferDetails?: {
    fromMemberId?: { memberId: string; name: string };
    toMemberId?: { memberId: string; name: string };
    transferNote?: string;
  };
  changedBy: {
    name: string;
    role: string;
  };
  createdAt: string;
}

interface YearAccountItem {
  _id: string;
  memberId: {
    _id: string;
    memberId: string;
    name: string;
    phone: string;
  };
  year: number;
  finalShares: number;
  annualObligation: number;
  totalPrincipalPaid: number;
  shortfall: number;
  excessAdvance: number;
  isSettled: boolean;
  settledAt?: string;
  notes?: string;
}

interface ShareStats {
  shareValue: number;
  totalActiveShares: number;
  monthlyObligationPool: number;
  total2024Reconciled: number;
  totalTransfers: number;
}

const taka = (value: number) => `৳${Number(value || 0).toFixed(2)}`;

export const SharesPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = usePreferences();
  const [activeTab, setActiveTab] = useState<'positions' | 'history' | 'annual'>('positions');

  // Stats
  const [stats, setStats] = useState<ShareStats>({
    shareValue: 500,
    totalActiveShares: 0,
    monthlyObligationPool: 0,
    total2024Reconciled: 0,
    totalTransfers: 0,
  });

  // Tab 1: Member Shares
  const [membersShares, setMembersShares] = useState<MemberShareItem[]>([]);
  const [loadingPositions, setLoadingPositions] = useState<boolean>(true);

  // Tab 2: Share History
  const [history, setHistory] = useState<ShareHistoryEvent[]>([]);
  const [historyFilterType, setHistoryFilterType] = useState<string>('ALL');
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('ALL');
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Tab 3: Annual Accounts
  const [yearAccounts, setYearAccounts] = useState<YearAccountItem[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [loadingAnnual, setLoadingAnnual] = useState<boolean>(false);

  // Modals state
  const [showAdjustModal, setShowAdjustModal] = useState<boolean>(false);
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);
  const [showReconcileModal, setShowReconcileModal] = useState<boolean>(false);

  // Forms
  const [adjustData, setAdjustData] = useState({
    memberId: '',
    effectiveMonth: '2024-12',
    shareCount: 1,
    eventType: 'TEMPORARY_CHANGE',
    isAdministrativeOverride: false,
    notes: '',
  });

  const [transferData, setTransferData] = useState({
    fromMemberId: '',
    toMemberId: '',
    shareCount: 1,
    effectiveMonth: '2025-01',
    notes: '',
  });

  const [reconcileData, setReconcileData] = useState({
    memberId: '',
    year: 2024,
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch Stats & Member Positions
  const fetchPositions = useCallback(async () => {
    setLoadingPositions(true);
    try {
      const [posRes, statsRes] = await Promise.all([
        apiRequest<{ shareValue: number; members: MemberShareItem[] }>('/shares/members-shares'),
        apiRequest<ShareStats>('/shares/stats'),
      ]);
      setMembersShares(posRes.data.members || []);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Error fetching member shares:', err);
    } finally {
      setLoadingPositions(false);
    }
  }, []);

  // Fetch History
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams({
        eventType: historyFilterType,
        effectiveMonth: historyMonthFilter,
        limit: '50',
      });
      const res = await apiRequest<ShareHistoryEvent[]>(`/shares/history?${params.toString()}`);
      setHistory(res.data || []);
    } catch (err) {
      console.error('Error fetching share history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilterType, historyMonthFilter]);

  // Fetch Annual Accounts
  const fetchAnnual = useCallback(async () => {
    setLoadingAnnual(true);
    try {
      const res = await apiRequest<YearAccountItem[]>(`/shares/annual-accounts?year=${selectedYear}`);
      setYearAccounts(res.data || []);
    } catch (err) {
      console.error('Error fetching annual accounts:', err);
    } finally {
      setLoadingAnnual(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  useEffect(() => {
    if (activeTab === 'history') fetchHistory();
    if (activeTab === 'annual') fetchAnnual();
  }, [activeTab, fetchHistory, fetchAnnual]);

  // Handlers for Modals
  const handleOpenAdjust = (m?: MemberShareItem) => {
    setFormError(null);
    setAdjustData({
      memberId: m ? m._id : membersShares[0]?._id || '',
      effectiveMonth: '2024-12',
      shareCount: m ? m.currentShares : 1,
      eventType: 'TEMPORARY_CHANGE',
      isAdministrativeOverride: false,
      notes: '',
    });
    setShowAdjustModal(true);
  };

  const handleOpenTransfer = (seller?: MemberShareItem) => {
    setFormError(null);
    const sellerId = seller ? seller._id : membersShares[0]?._id || '';
    const availableBuyers = membersShares.filter((m) => m._id !== sellerId);
    setTransferData({
      fromMemberId: sellerId,
      toMemberId: availableBuyers[0]?._id || '',
      shareCount: 1,
      effectiveMonth: '2025-01',
      notes: '',
    });
    setShowTransferModal(true);
  };

  const handleOpenReconcile = (m?: MemberShareItem) => {
    setFormError(null);
    setReconcileData({
      memberId: m ? m._id : membersShares[0]?._id || '',
      year: 2024,
    });
    setShowReconcileModal(true);
  };

  // Submit Share Change
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await apiRequest('/shares/change', {
        method: 'POST',
        body: JSON.stringify(adjustData),
      });
      setShowAdjustModal(false);
      fetchPositions();
      if (activeTab === 'history') fetchHistory();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Share Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await apiRequest('/shares/transfer', {
        method: 'POST',
        body: JSON.stringify(transferData),
      });
      setShowTransferModal(false);
      fetchPositions();
      if (activeTab === 'history') fetchHistory();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Annual Reconciliation
  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await apiRequest('/shares/reconcile-year', {
        method: 'POST',
        body: JSON.stringify(reconcileData),
      });
      setShowReconcileModal(false);
      fetchPositions();
      if (activeTab === 'annual') fetchAnnual();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const isPost2024Adjust = adjustData.effectiveMonth >= '2025-01';
  const canModify = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT' || user?.role === 'SUPER_ADMIN';

  return (
    <div className="space-y-6">
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('Shares & Annual Account Management')}
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            {t('Authoritative share positions, post-2024 share locks, peer transfers, and annual reconciliations.')}
          </p>
        </div>

        {canModify && (
          <div className="flex gap-2.5 shrink-0 self-start sm:self-auto">
            <button onClick={() => handleOpenAdjust()} className="btn btn-secondary text-xs">
              <Plus size={16} />
              <span>{t('Adjust Shares')}</span>
            </button>
            <button onClick={() => handleOpenTransfer()} className="btn btn-primary text-xs">
              <ArrowRightLeft size={16} />
              <span>{t('Transfer Shares')}</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t('Total Society Shares')}
            </span>
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400">
              <PieChart size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white mt-3">{stats.totalActiveShares}</p>
          <span className="text-xs text-gray-500 mt-1 block">
            {t('Active share distribution pool')}
          </span>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t('Monthly Obligation Pool')}
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Coins size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-emerald-400 mt-3">
            {taka(stats.monthlyObligationPool)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {t('Monthly share amount:')} {taka(stats.shareValue)} {t('per share')}
          </span>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {t('2024 Reconciled Settled')}
            </span>
            <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400">
              <CalendarCheck size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-indigo-300 mt-3">
            {stats.total2024Reconciled}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {t('Finalized against Dec 2024 shares')}
          </span>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Peer Share Transfers
            </span>
            <div className="p-2 rounded-lg bg-amber-500/15 text-amber-400">
              <Repeat size={20} />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-amber-400 mt-3">{stats.totalTransfers}</p>
          <span className="text-xs text-gray-500 mt-1 block">
            Post-2024 secondary movements
          </span>
        </div>
      </div>

      {/* Tabs Header */}
      <div className="flex gap-3 border-b border-white/10 pb-px">
        <button
          type="button"
          onClick={() => setActiveTab('positions')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'positions'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Layers size={18} />
          <span>Member Shares & Positions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'history'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <History size={18} />
          <span>Share Event Timeline</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('annual')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold transition-all border-b-2 ${
            activeTab === 'annual'
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <FileCheck size={18} />
          <span>Annual Reconciliation Ledger</span>
        </button>
      </div>

      {/* TAB 1: MEMBER SHARES & POSITIONS */}
      {activeTab === 'positions' && (
        <div className="table-container glass-card overflow-x-auto overflow-y-hidden overscroll-x-contain">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <th>Member</th>
                <th>Current Shares</th>
                <th>Monthly Obligation</th>
                <th>Effective Month</th>
                <th>2024 Reconciliation Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingPositions ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                    <span>Loading share positions...</span>
                  </td>
                </tr>
              ) : membersShares.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    No members registered yet.
                  </td>
                </tr>
              ) : (
                membersShares.map((m) => {
                  const ya = m.yearAccount2024;
                  return (
                    <tr key={m._id} className="hover:bg-white/[0.02] transition-colors">
                      <td>
                        <div className="flex items-center gap-2.5">
                          <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                            {m.memberId}
                          </span>
                          <div>
                            <p className="font-semibold text-white text-sm">{m.name}</p>
                            <p className="text-xs text-gray-400">{m.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={`font-extrabold text-sm ${
                            m.currentShares > 0 ? 'text-emerald-400' : 'text-gray-500'
                          }`}
                        >
                          {m.currentShares} {m.currentShares === 1 ? 'Share' : 'Shares'}
                        </span>
                      </td>
                      <td>
                        <span className="font-bold text-white text-sm">
                          BDT  {m.monthlyObligation.toLocaleString()}
                        </span>
                        <span className="text-xs text-gray-500"> /month</span>
                      </td>
                      <td>
                        <span className="font-mono text-xs text-gray-300">
                          {m.effectiveMonth}
                        </span>
                      </td>
                      <td>
                        {ya ? (
                          ya.isSettled ? (
                            <span className="badge badge-active text-[10px]">
                              <CheckCircle2 size={12} /> Settled
                            </span>
                          ) : (
                            <span className="badge badge-inactive text-[10px]">
                              <AlertTriangle size={12} /> Shortfall BDT {ya.shortfall.toLocaleString()}
                            </span>
                          )
                        ) : (
                          <span className="badge badge-dropped text-[10px] opacity-60">
                            Not Reconciled
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="inline-flex gap-1.5">
                          {canModify && (
                            <>
                              <button
                                onClick={() => handleOpenAdjust(m)}
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5"
                                title="Adjust Shares"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => handleOpenTransfer(m)}
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5"
                                title="Transfer Shares"
                              >
                                Transfer
                              </button>
                              <button
                                onClick={() => handleOpenReconcile(m)}
                                className="btn btn-secondary btn-sm text-xs py-1 px-2.5"
                                title="Reconcile Year Account"
                              >
                                Reconcile
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 2: SHARE EVENT TIMELINE */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Filters */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex gap-1.5 items-center flex-wrap">
              <span className="text-xs font-semibold text-gray-400 mr-2 uppercase tracking-wider">
                Event:
              </span>
              {['ALL', 'TEMPORARY_CHANGE', 'TRANSFER', 'ANNUAL_FINALIZATION'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setHistoryFilterType(type)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                    historyFilterType === type
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Month:
              </span>
              <input
                type="month"
                className="form-input text-xs w-40 py-1.5 px-3"
                value={historyMonthFilter === 'ALL' ? '' : historyMonthFilter}
                onChange={(e) => setHistoryMonthFilter(e.target.value || 'ALL')}
              />
              {historyMonthFilter !== 'ALL' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm text-xs py-1"
                  onClick={() => setHistoryMonthFilter('ALL')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="table-container glass-card overflow-x-auto overflow-y-hidden overscroll-x-contain">
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Effective Month</th>
                  <th>Member</th>
                  <th>Event Type</th>
                  <th>Previous</th>
                  <th>New Shares</th>
                  <th>Transfer Details / Notes</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {loadingHistory ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                      <span>Loading share history...</span>
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No share history events found.
                    </td>
                  </tr>
                ) : (
                  history.map((ev) => {
                    const isIncrease = ev.shareCount > ev.previousShareCount;
                    const diff = ev.shareCount - ev.previousShareCount;

                    return (
                      <tr key={ev._id} className="hover:bg-white/[0.02] transition-colors">
                        <td>
                          <span className="font-mono font-bold text-xs text-blue-400">
                            {ev.effectiveMonth}
                          </span>
                        </td>
                        <td>
                          <p className="font-semibold text-white text-sm">{ev.memberId?.name}</p>
                          <span className="font-mono text-xs text-gray-400">
                            {ev.memberId?.memberId}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge text-[10px]"
                            style={{
                              background:
                                ev.eventType === 'TRANSFER'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : ev.eventType === 'ANNUAL_FINALIZATION'
                                  ? 'rgba(99, 102, 241, 0.15)'
                                  : 'rgba(59, 130, 246, 0.15)',
                              color:
                                ev.eventType === 'TRANSFER'
                                  ? '#FBBF24'
                                  : ev.eventType === 'ANNUAL_FINALIZATION'
                                  ? '#A5B4FC'
                                  : '#60A5FA',
                            }}
                          >
                            {ev.eventType}
                          </span>
                          {ev.isAdministrativeOverride && (
                            <span className="badge text-[10px] bg-rose-500/15 text-rose-400 ml-1">
                              Admin Override
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="text-gray-400 text-sm">{ev.previousShareCount}</span>
                        </td>
                        <td>
                          <span className="font-bold text-white text-sm">{ev.shareCount}</span>
                          <span
                            className={`text-xs font-bold ml-1.5 ${
                              isIncrease ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            ({diff > 0 ? `+${diff}` : diff})
                          </span>
                        </td>
                        <td>
                          <p className="text-xs text-gray-300">
                            {ev.transferDetails?.transferNote || ev.notes || '—'}
                          </p>
                        </td>
                        <td>
                          <p className="text-xs text-gray-200 font-medium">{ev.changedBy?.name}</p>
                          <span className="text-[11px] text-gray-500">
                            {new Date(ev.createdAt).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: ANNUAL RECONCILIATION LEDGER */}
      {activeTab === 'annual' && (
        <div className="space-y-4">
          {/* Year selector */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Calendar size={18} className="text-blue-400" />
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Accounting Year:
              </span>
              {[2024, 2025].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    selectedYear === yr
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Year {yr}
                </button>
              ))}
            </div>

            {canModify && (
              <button onClick={() => handleOpenReconcile()} className="btn btn-secondary btn-sm text-xs">
                <CalendarCheck size={16} />
                <span>Reconcile Member</span>
              </button>
            )}
          </div>

          <div className="table-container glass-card overflow-x-auto overflow-y-hidden overscroll-x-contain">
            <table className="data-table min-w-[1020px]">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Final Shares ({selectedYear})</th>
                  <th>Annual Obligation</th>
                  <th>Principal Paid</th>
                  <th>Shortfall Due</th>
                  <th>Advance Credit (Next Year)</th>
                  <th>Settlement Status</th>
                </tr>
              </thead>
              <tbody>
                {loadingAnnual ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                      <span>Loading annual accounts...</span>
                    </td>
                  </tr>
                ) : yearAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      No reconciliation records generated for year {selectedYear} yet.
                    </td>
                  </tr>
                ) : (
                  yearAccounts.map((ya) => (
                    <tr key={ya._id} className="hover:bg-white/[0.02] transition-colors">
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-blue-400">
                            {ya.memberId?.memberId}
                          </span>
                          <span className="font-semibold text-white text-sm">{ya.memberId?.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="font-bold text-emerald-400 text-sm">{ya.finalShares} Shares</span>
                      </td>
                      <td>
                        <span className="font-bold text-white text-sm">
                          BDT  {ya.annualObligation.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className="text-blue-400 text-sm">BDT  {ya.totalPrincipalPaid.toLocaleString()}</span>
                      </td>
                      <td>
                        <span className={`text-sm font-bold ${ya.shortfall > 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                          BDT  {ya.shortfall.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span className={`text-sm font-bold ${ya.excessAdvance > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
                          BDT  {ya.excessAdvance.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        {ya.isSettled ? (
                          <span className="badge badge-active text-[10px]">Settled</span>
                        ) : (
                          <span className="badge badge-inactive text-[10px]">Unsettled Shortfall</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADJUST SHARE COUNT */}
      {showAdjustModal && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Adjust Share Count</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Record interim adjustments (2024) or finalizations.
                </p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            {isPost2024Adjust && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs mb-4 flex gap-2">
                <AlertTriangle size={18} className="shrink-0 text-amber-400" />
                <span>
                  <strong>Post-2024 Share Lock Warning:</strong> Normal share adjustments are locked from 1 January 2025 onward. Changes require an administrative override or must be executed via Peer Transfer.
                </span>
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Member *</label>
                <select
                  className="form-select"
                  value={adjustData.memberId}
                  onChange={(e) => setAdjustData({ ...adjustData, memberId: e.target.value })}
                >
                  {membersShares.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name} (Current: {m.currentShares} shares)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Effective Month (YYYY-MM) *</label>
                  <input
                    type="month"
                    required
                    className="form-input text-xs"
                    value={adjustData.effectiveMonth}
                    onChange={(e) => setAdjustData({ ...adjustData, effectiveMonth: e.target.value })}
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">New Total Share Count *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    className="form-input text-xs"
                    value={adjustData.shareCount}
                    onChange={(e) => setAdjustData({ ...adjustData, shareCount: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Event Type</label>
                <select
                  className="form-select text-xs"
                  value={adjustData.eventType}
                  onChange={(e) => setAdjustData({ ...adjustData, eventType: e.target.value })}
                >
                  <option value="TEMPORARY_CHANGE">TEMPORARY_CHANGE (Interim 2024 change)</option>
                  <option value="ANNUAL_FINALIZATION">ANNUAL_FINALIZATION (December baseline)</option>
                </select>
              </div>

              {isPost2024Adjust && (
                <div className="flex items-center gap-2 my-3">
                  <input
                    type="checkbox"
                    id="adminOverrideCheck"
                    className="rounded border-white/20 bg-gray-900 text-blue-500 focus:ring-blue-500"
                    checked={adjustData.isAdministrativeOverride}
                    onChange={(e) => setAdjustData({ ...adjustData, isAdministrativeOverride: e.target.checked })}
                  />
                  <label htmlFor="adminOverrideCheck" className="text-xs text-rose-400 font-semibold cursor-pointer">
                    Confirm Administrative Override for post-2024 share change
                  </label>
                </div>
              )}

              <div className="form-group mb-0">
                <label className="form-label">Reason / Notes</label>
                <textarea
                  className="form-textarea text-xs"
                  rows={2}
                  placeholder="Mandatory if administrative override..."
                  value={adjustData.notes}
                  onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button type="button" className="btn btn-secondary text-xs" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-xs">
                  {submitting ? 'Recording...' : 'Record Share Change'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: TRANSFER SHARES */}
      {showTransferModal && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Peer Share Transfer</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Secondary transfer between existing members (Post-2024 supported).
                </p>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg text-blue-400 text-xs mb-4 flex gap-2">
              <Info size={18} className="shrink-0 text-blue-400" />
              <span>
                <strong>Authoritative Note:</strong> Share transfers are formally supported after December 2024. Buyer's future distribution entitlement on transferred shares remains pending policy finalization.
              </span>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Transfer FROM (Seller Member) *</label>
                <select
                  className="form-select text-xs"
                  value={transferData.fromMemberId}
                  onChange={(e) => setTransferData({ ...transferData, fromMemberId: e.target.value })}
                >
                  {membersShares.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name} (Has: {m.currentShares} shares)
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Transfer TO (Buyer Member) *</label>
                <select
                  className="form-select text-xs"
                  value={transferData.toMemberId}
                  onChange={(e) => setTransferData({ ...transferData, toMemberId: e.target.value })}
                >
                  {membersShares
                    .filter((m) => m._id !== transferData.fromMemberId)
                    .map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.memberId} — {m.name} (Current: {m.currentShares} shares)
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">Shares to Transfer *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    className="form-input text-xs"
                    value={transferData.shareCount}
                    onChange={(e) => setTransferData({ ...transferData, shareCount: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>

                <div className="form-group mb-0">
                  <label className="form-label">Effective Month *</label>
                  <input
                    type="month"
                    required
                    className="form-input text-xs"
                    value={transferData.effectiveMonth}
                    onChange={(e) => setTransferData({ ...transferData, effectiveMonth: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Transfer Note / Agreement Reference</label>
                <input
                  type="text"
                  className="form-input text-xs"
                  placeholder="e.g. Mutual consent transfer agreement ref #..."
                  value={transferData.notes}
                  onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button type="button" className="btn btn-secondary text-xs" onClick={() => setShowTransferModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-xs">
                  {submitting ? 'Processing Transfer...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: RECONCILE ANNUAL ACCOUNT */}
      {showReconcileModal && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">Reconcile Annual Account</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Normalize annual principal obligation against December closing shares.
                </p>
              </div>
              <button
                onClick={() => setShowReconcileModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-emerald-400 text-xs mb-4">
              <strong>Formula (SRS Section 1.1A):</strong> Annual Obligation = Closing December Shares × BDT 500 × 12.
              Shortfalls must be settled within the year; excesses carry over as advance credits for the following year.
            </div>

            <form onSubmit={handleReconcileSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">Member *</label>
                <select
                  className="form-select text-xs"
                  value={reconcileData.memberId}
                  onChange={(e) => setReconcileData({ ...reconcileData, memberId: e.target.value })}
                >
                  {membersShares.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name} (Shares: {m.currentShares})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0">
                <label className="form-label">Reconciliation Year *</label>
                <select
                  className="form-select text-xs"
                  value={reconcileData.year}
                  onChange={(e) => setReconcileData({ ...reconcileData, year: parseInt(e.target.value, 10) })}
                >
                  <option value={2024}>2024 (Adjustment & Finalization Baseline)</option>
                  <option value={2025}>2025</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button type="button" className="btn btn-secondary text-xs" onClick={() => setShowReconcileModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-xs">
                  {submitting ? 'Reconciling...' : 'Run Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
