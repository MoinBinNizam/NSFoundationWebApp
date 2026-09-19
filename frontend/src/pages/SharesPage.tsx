import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
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

export const SharesPage: React.FC = () => {
  const { user } = useAuth();
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
    <div>
      {/* Header Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
            Shares & Annual Account Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '4px' }}>
            Authoritative share positions, post-2024 share locks, peer transfers, and annual reconciliations.
          </p>
        </div>

        {canModify && (
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => handleOpenAdjust()} className="btn btn-secondary">
              <Plus size={16} />
              <span>Adjust Shares</span>
            </button>
            <button onClick={() => handleOpenTransfer()} className="btn btn-primary">
              <ArrowRightLeft size={16} />
              <span>Transfer Shares</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              TOTAL SOCIETY SHARES
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.15)', color: '#60A5FA' }}>
              <PieChart size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '12px' }}>
            {stats.totalActiveShares}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            Active share distribution pool
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              MONTHLY OBLIGATION POOL
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#34D399' }}>
              <Coins size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#34D399', marginTop: '12px' }}>
            ৳ {stats.monthlyObligationPool.toLocaleString()}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            @ ৳{stats.shareValue}/share monthly
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              2024 RECONCILED SETTLED
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#A5B4FC' }}>
              <CalendarCheck size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#A5B4FC', marginTop: '12px' }}>
            {stats.total2024Reconciled}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            Finalized against Dec 2024 shares
          </span>
        </div>

        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
              PEER SHARE TRANSFERS
            </span>
            <div style={{ padding: '8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#FBBF24' }}>
              <Repeat size={20} />
            </div>
          </div>
          <p style={{ fontSize: '2rem', fontWeight: 800, color: '#FBBF24', marginTop: '12px' }}>
            {stats.totalTransfers}
          </p>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
            Post-2024 secondary movements
          </span>
        </div>
      </div>

      {/* Tabs Header */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('positions')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'positions' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'positions' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <Layers size={18} />
          <span>Member Shares & Positions</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'history' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'history' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <History size={18} />
          <span>Share Event Timeline</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('annual')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 18px',
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'annual' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'annual' ? '#ffffff' : 'var(--text-muted)',
            fontWeight: 600,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          <FileCheck size={18} />
          <span>Annual Reconciliation Ledger</span>
        </button>
      </div>

      {/* TAB 1: MEMBER SHARES & POSITIONS */}
      {activeTab === 'positions' && (
        <div className="table-container glass-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Current Shares</th>
                <th>Monthly Obligation</th>
                <th>Effective Month</th>
                <th>2024 Reconciliation Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loadingPositions ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    Loading share positions...
                  </td>
                </tr>
              ) : membersShares.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    No members registered yet.
                  </td>
                </tr>
              ) : (
                membersShares.map((m) => {
                  const ya = m.yearAccount2024;
                  return (
                    <tr key={m._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 700,
                              fontSize: '0.8rem',
                              color: '#60A5FA',
                              background: 'rgba(59, 130, 246, 0.1)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}
                          >
                            {m.memberId}
                          </span>
                          <div>
                            <p style={{ fontWeight: 600, color: '#fff' }}>{m.name}</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}>{m.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            fontSize: '1rem',
                            fontWeight: 800,
                            color: m.currentShares > 0 ? '#34D399' : 'var(--text-subtle)',
                          }}
                        >
                          {m.currentShares} {m.currentShares === 1 ? 'Share' : 'Shares'}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#ffffff' }}>
                          ৳ {m.monthlyObligation.toLocaleString()}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)' }}> /month</span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                          {m.effectiveMonth}
                        </span>
                      </td>
                      <td>
                        {ya ? (
                          ya.isSettled ? (
                            <span className="badge badge-active">
                              <CheckCircle2 size={12} /> Settled
                            </span>
                          ) : (
                            <span className="badge badge-inactive">
                              <AlertTriangle size={12} /> Shortfall ৳{ya.shortfall.toLocaleString()}
                            </span>
                          )
                        ) : (
                          <span className="badge badge-dropped" style={{ opacity: 0.6 }}>
                            Not Reconciled
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {canModify && (
                            <>
                              <button
                                onClick={() => handleOpenAdjust(m)}
                                className="btn btn-secondary btn-sm"
                                title="Adjust Shares"
                              >
                                Adjust
                              </button>
                              <button
                                onClick={() => handleOpenTransfer(m)}
                                className="btn btn-secondary btn-sm"
                                title="Transfer Shares"
                              >
                                Transfer
                              </button>
                              <button
                                onClick={() => handleOpenReconcile(m)}
                                className="btn btn-secondary btn-sm"
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
        <div>
          {/* History Filters */}
          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                EVENT FILTER:
              </span>
              {['ALL', 'TEMPORARY_CHANGE', 'TRANSFER', 'ANNUAL_FINALIZATION'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setHistoryFilterType(type)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.725rem',
                    fontWeight: 700,
                    background: historyFilterType === type ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                    color: historyFilterType === type ? '#ffffff' : 'var(--text-muted)',
                  }}
                >
                  {type}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                MONTH:
              </span>
              <input
                type="month"
                className="form-input"
                style={{ width: '160px', padding: '4px 8px', fontSize: '0.8rem' }}
                value={historyMonthFilter === 'ALL' ? '' : historyMonthFilter}
                onChange={(e) => setHistoryMonthFilter(e.target.value || 'ALL')}
              />
              {historyMonthFilter !== 'ALL' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setHistoryMonthFilter('ALL')}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="table-container glass-card">
            <table className="data-table">
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Loading share history...
                    </td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No share history events found.
                    </td>
                  </tr>
                ) : (
                  history.map((ev) => {
                    const isIncrease = ev.shareCount > ev.previousShareCount;
                    const diff = ev.shareCount - ev.previousShareCount;

                    return (
                      <tr key={ev._id}>
                        <td>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60A5FA' }}>
                            {ev.effectiveMonth}
                          </span>
                        </td>
                        <td>
                          <p style={{ fontWeight: 600, color: '#fff' }}>{ev.memberId?.name}</p>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-subtle)' }}>
                            {ev.memberId?.memberId}
                          </span>
                        </td>
                        <td>
                          <span
                            className="badge"
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
                            <span
                              className="badge"
                              style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#F87171', marginLeft: '4px' }}
                            >
                              Admin Override
                            </span>
                          )}
                        </td>
                        <td>
                          <span style={{ color: 'var(--text-subtle)' }}>{ev.previousShareCount}</span>
                        </td>
                        <td>
                          <span style={{ fontWeight: 800, color: '#fff' }}>{ev.shareCount}</span>
                          <span
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              marginLeft: '6px',
                              color: isIncrease ? '#34D399' : '#F87171',
                            }}
                          >
                            ({diff > 0 ? `+${diff}` : diff})
                          </span>
                        </td>
                        <td>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {ev.transferDetails?.transferNote || ev.notes || '—'}
                          </p>
                        </td>
                        <td>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ev.changedBy?.name}</p>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-subtle)' }}>
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
        <div>
          {/* Year selector */}
          <div
            className="glass-card"
            style={{
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Calendar size={18} color="#60A5FA" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                SELECT ACCOUNTING YEAR:
              </span>
              {[2024, 2025].map((yr) => (
                <button
                  key={yr}
                  type="button"
                  onClick={() => setSelectedYear(yr)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: selectedYear === yr ? 'var(--primary)' : 'rgba(255, 255, 255, 0.06)',
                    color: selectedYear === yr ? '#ffffff' : 'var(--text-muted)',
                  }}
                >
                  Year {yr}
                </button>
              ))}
            </div>

            {canModify && (
              <button onClick={() => handleOpenReconcile()} className="btn btn-secondary btn-sm">
                <CalendarCheck size={16} />
                <span>Reconcile Member</span>
              </button>
            )}
          </div>

          <div className="table-container glass-card">
            <table className="data-table">
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
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      Loading annual accounts...
                    </td>
                  </tr>
                ) : yearAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      No reconciliation records generated for year {selectedYear} yet.
                    </td>
                  </tr>
                ) : (
                  yearAccounts.map((ya) => (
                    <tr key={ya._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#60A5FA' }}>
                            {ya.memberId?.memberId}
                          </span>
                          <span style={{ fontWeight: 600, color: '#fff' }}>{ya.memberId?.name}</span>
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#34D399' }}>{ya.finalShares} Shares</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#ffffff' }}>
                          ৳ {ya.annualObligation.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: '#60A5FA' }}>৳ {ya.totalPrincipalPaid.toLocaleString()}</span>
                      </td>
                      <td>
                        <span style={{ color: ya.shortfall > 0 ? '#F87171' : 'var(--text-subtle)', fontWeight: 700 }}>
                          ৳ {ya.shortfall.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <span style={{ color: ya.excessAdvance > 0 ? '#34D399' : 'var(--text-subtle)', fontWeight: 700 }}>
                          ৳ {ya.excessAdvance.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        {ya.isSettled ? (
                          <span className="badge badge-active">Settled</span>
                        ) : (
                          <span className="badge badge-inactive">Unsettled Shortfall</span>
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Adjust Share Count</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  Record interim adjustments (2024) or finalizations.
                </p>
              </div>
              <button
                onClick={() => setShowAdjustModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            {isPost2024Adjust && (
              <div
                style={{
                  padding: '12px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#FBBF24',
                  fontSize: '0.8rem',
                  marginBottom: '16px',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Post-2024 Share Lock Warning:</strong> Normal share adjustments are locked from 1 January 2025 onward. Changes require an administrative override or must be executed via Peer Transfer.
                </span>
              </div>
            )}

            <form onSubmit={handleAdjustSubmit}>
              <div className="form-group">
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Effective Month (YYYY-MM) *</label>
                  <input
                    type="month"
                    required
                    className="form-input"
                    value={adjustData.effectiveMonth}
                    onChange={(e) => setAdjustData({ ...adjustData, effectiveMonth: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">New Total Share Count *</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    required
                    className="form-input"
                    value={adjustData.shareCount}
                    onChange={(e) => setAdjustData({ ...adjustData, shareCount: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Event Type</label>
                <select
                  className="form-select"
                  value={adjustData.eventType}
                  onChange={(e) => setAdjustData({ ...adjustData, eventType: e.target.value })}
                >
                  <option value="TEMPORARY_CHANGE">TEMPORARY_CHANGE (Interim 2024 change)</option>
                  <option value="ANNUAL_FINALIZATION">ANNUAL_FINALIZATION (December baseline)</option>
                </select>
              </div>

              {isPost2024Adjust && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0' }}>
                  <input
                    type="checkbox"
                    id="adminOverrideCheck"
                    checked={adjustData.isAdministrativeOverride}
                    onChange={(e) => setAdjustData({ ...adjustData, isAdministrativeOverride: e.target.checked })}
                  />
                  <label htmlFor="adminOverrideCheck" style={{ fontSize: '0.85rem', color: '#F87171', fontWeight: 600 }}>
                    Confirm Administrative Override for post-2024 share change
                  </label>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Reason / Notes</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  placeholder="Mandatory if administrative override..."
                  value={adjustData.notes}
                  onChange={(e) => setAdjustData({ ...adjustData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAdjustModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Peer Share Transfer</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  Secondary transfer between existing members (Post-2024 supported).
                </p>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <div
              style={{
                padding: '12px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 'var(--radius-md)',
                color: '#60A5FA',
                fontSize: '0.8rem',
                marginBottom: '16px',
                display: 'flex',
                gap: '8px',
              }}
            >
              <Info size={18} style={{ flexShrink: 0 }} />
              <span>
                <strong>Authoritative Note:</strong> Share transfers are formally supported after December 2024. Buyer's future distribution entitlement on transferred shares remains pending policy finalization.
              </span>
            </div>

            <form onSubmit={handleTransferSubmit}>
              <div className="form-group">
                <label className="form-label">Transfer FROM (Seller Member) *</label>
                <select
                  className="form-select"
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

              <div className="form-group">
                <label className="form-label">Transfer TO (Buyer Member) *</label>
                <select
                  className="form-select"
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div className="form-group">
                  <label className="form-label">Shares to Transfer *</label>
                  <input
                    type="number"
                    min={1}
                    required
                    className="form-input"
                    value={transferData.shareCount}
                    onChange={(e) => setTransferData({ ...transferData, shareCount: parseInt(e.target.value, 10) || 1 })}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Effective Month *</label>
                  <input
                    type="month"
                    required
                    className="form-input"
                    value={transferData.effectiveMonth}
                    onChange={(e) => setTransferData({ ...transferData, effectiveMonth: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Transfer Note / Agreement Reference</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Mutual consent transfer agreement ref #..."
                  value={transferData.notes}
                  onChange={(e) => setTransferData({ ...transferData, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowTransferModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
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
          <div className="modal-content" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>Reconcile Annual Account</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-subtle)' }}>
                  Normalize annual principal obligation against December closing shares.
                </p>
              </div>
              <button
                onClick={() => setShowReconcileModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md)',
                  color: '#F87171',
                  fontSize: '0.85rem',
                  marginBottom: '16px',
                }}
              >
                {formError}
              </div>
            )}

            <div
              style={{
                padding: '12px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 'var(--radius-md)',
                color: '#34D399',
                fontSize: '0.8rem',
                marginBottom: '16px',
              }}
            >
              <strong>Formula (SRS Section 1.1A):</strong> Annual Obligation = Closing December Shares × ৳500 × 12.
              Shortfalls must be settled within the year; excesses carry over as advance credits for the following year.
            </div>

            <form onSubmit={handleReconcileSubmit}>
              <div className="form-group">
                <label className="form-label">Member *</label>
                <select
                  className="form-select"
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

              <div className="form-group">
                <label className="form-label">Reconciliation Year *</label>
                <select
                  className="form-select"
                  value={reconcileData.year}
                  onChange={(e) => setReconcileData({ ...reconcileData, year: parseInt(e.target.value, 10) })}
                >
                  <option value={2024}>2024 (Adjustment & Finalization Baseline)</option>
                  <option value={2025}>2025</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowReconcileModal(false)}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
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
