import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Activity,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileText,
  Landmark,
  Layers,
  Loader2,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  WalletCards,
  X,
} from 'lucide-react';

type ReportType = 'collection' | 'custody' | 'investments' | 'expenses' | 'dues';

interface Dashboard {
  roleScope: 'ORGANIZATION' | 'ACCOUNTANT';
  period: { startDate: string | null; endDate: string | null };
  metrics: {
    collection: { total: number; count: number; principal: number; penalty: number };
    expenses: { total: number; count: number };
    custody: number;
    activeMembers: number;
    investments?: {
      totalCapitalInvested: number;
      activeProjectsCount: number;
      netRealizedProfit: number;
    } | null;
  };
  custodyByAccount: Array<{ name: string; channel: string; balance: number }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityName: string;
    reason?: string;
    createdAt: string;
    performedBy: string;
  }>;
}

interface ReportData {
  type: ReportType;
  rows: Array<Record<string, unknown>>;
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

const money = (amount: unknown) =>
  `৳ ${Number(amount || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

const reportLabels: Record<ReportType, string> = {
  collection: 'Collection',
  custody: 'Custody',
  investments: 'Investments',
  expenses: 'Expenses',
  dues: 'Dues',
};

const formatActionName = (action: string) => {
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatTimeAgo = (isoDate: string) => {
  try {
    const diffMs = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(isoDate).toLocaleDateString('en-BD', { month: 'short', day: 'numeric' });
  } catch {
    return new Date(isoDate).toLocaleDateString();
  }
};

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const isPrimary =
    user?.accountantType === 'PRIMARY' || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [view, setView] = useState<'dashboard' | 'reports'>('dashboard');
  const [reportType, setReportType] = useState<ReportType>('collection');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Pagination States
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const query = useCallback(
    () =>
      new URLSearchParams(
        Object.entries({
          startDate,
          endDate,
          search,
          sortBy,
          sortDirection,
          page: String(page),
          limit: '10',
        }).filter(([, value]) => value)
      ).toString(),
    [startDate, endDate, search, sortBy, sortDirection, page]
  );

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<Dashboard>(`/reports/dashboard?${query()}`);
      setDashboard(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, [query]);

  const loadReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiRequest<ReportData>(`/reports/data/${reportType}?${query()}`);
      setReport(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load report.');
    } finally {
      setLoading(false);
    }
  }, [query, reportType]);

  useEffect(() => {
    if (view === 'dashboard') loadDashboard();
    else loadReport();
  }, [view, loadDashboard, loadReport]);

  const changeReport = (type: ReportType) => {
    setReportType(type);
    setPage(1);
    setSearch('');
    setSortBy('date');
  };

  const exportCsv = async () => {
    try {
      const response = await fetch(`/api/reports/data/${reportType}/export?${query()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      });
      if (!response.ok) throw new Error('Could not export this report.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `ns-foundation-${reportType}-report.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to export report.');
    }
  };

  const columns = report?.rows[0] ? Object.keys(report.rows[0]) : [];

  // Calculate total positive custody for distribution percentage
  const totalCustodySum =
    dashboard?.custodyByAccount.reduce((acc, a) => acc + Math.max(0, a.balance), 0) || 0;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-400">
            <BarChart3 size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">Issue #11 · Analytics</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {view === 'dashboard'
              ? `${dashboard?.roleScope === 'ACCOUNTANT' ? 'Accountant' : 'Executive'} Financial Dashboard`
              : 'Society Reports Workspace'}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-400">
            {view === 'dashboard'
              ? 'Real-time financial overview derived directly from immutable ledger projections.'
              : 'Search, sort, filter, and export auditable reports across all financial operations.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={view === 'dashboard' ? loadDashboard : loadReport}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : 'text-gray-400'} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Primary Top Navigation Tabs (Identical to Contributions & Payments) */}
      <div className="flex border-b border-white/10 gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setView('dashboard')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            view === 'dashboard'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <BarChart3 size={16} />
          <span>Dashboard Overview</span>
        </button>

        <button
          onClick={() => setView('reports')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            view === 'reports'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <FileText size={16} />
          <span>Reports & Exports</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Shared Filter Bar (Identical to Contributions & Payments filter pattern) */}
      <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar size={14} className="text-blue-400" />
              <span>Reporting Period:</span>
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                aria-label="Start date"
                className="form-input text-xs py-1.5 px-3 max-w-[150px]"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
              />
              <span className="text-gray-500 text-xs font-semibold">to</span>
              <input
                type="date"
                aria-label="End date"
                className="form-input text-xs py-1.5 px-3 max-w-[150px]"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {(startDate || endDate) && (
            <button
              type="button"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setPage(1);
              }}
              className="text-xs text-rose-400 hover:text-rose-300 font-semibold px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 transition-all flex items-center gap-1"
            >
              <X size={13} />
              <span>Clear Filter</span>
            </button>
          )}
        </div>

        <div className="text-xs text-gray-400">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
          {startDate || endDate ? 'Filtered Date Window' : 'All Historical Records'}
        </div>
      </div>

      {/* VIEW 1: DASHBOARD TAB */}
      {view === 'dashboard' ? (
        loading ? (
          <Loading />
        ) : (
          <div className="space-y-8 sm:space-y-10">
            {/* 1. Primary Metric KPI Cards (Contributions & Payments Cards Design) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              {/* Card 1: Total Collections */}
              <div className="glass-card p-5 border-l-4 border-l-emerald-500 hover:border-emerald-500/50 transition-all">
                <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Total Collections</span>
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <ReceiptText size={18} />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                  {money(dashboard?.metrics.collection.total)}
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                  <span>{dashboard?.metrics.collection.count || 0} total receipts</span>
                  <span className="text-emerald-400 font-semibold">
                    Princ: {money(dashboard?.metrics.collection.principal)}
                  </span>
                </div>
              </div>

              {/* Card 2: Operational Expenses */}
              <div className="glass-card p-5 border-l-4 border-l-rose-500 hover:border-rose-500/50 transition-all">
                <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  <span>Operational Expenses</span>
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
                    <WalletCards size={18} />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                  {money(dashboard?.metrics.expenses.total)}
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                  <span>{dashboard?.metrics.expenses.count || 0} expense records</span>
                  <span className="text-rose-400 font-semibold">Society overheads</span>
                </div>
              </div>

              {/* Card 3: Custody Reserves */}
              <div className="glass-card p-5 border-l-4 border-l-blue-500 hover:border-blue-500/50 transition-all">
                <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  <span>
                    {dashboard?.roleScope === 'ORGANIZATION'
                      ? 'Total Society Custody'
                      : 'My Custody Holdings'}
                  </span>
                  <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Landmark size={18} />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                  {money(dashboard?.metrics.custody)}
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                  <span>{dashboard?.custodyByAccount.length || 0} accounts active</span>
                  <span className="text-blue-400 font-semibold">Verified balance</span>
                </div>
              </div>

              {/* Card 4: Membership / Portfolio */}
              <div className="glass-card p-5 border-l-4 border-l-purple-500 hover:border-purple-500/50 transition-all">
                <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                  <span>
                    {dashboard?.roleScope === 'ORGANIZATION'
                      ? 'Active Members'
                      : 'Investment Scope'}
                  </span>
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                    <Users size={18} />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                  {dashboard?.roleScope === 'ORGANIZATION'
                    ? `${dashboard?.metrics.activeMembers || 0}`
                    : isPrimary
                    ? `${dashboard?.metrics.investments?.activeProjectsCount || 0} Projects`
                    : 'Restricted'}
                </p>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                  <span>
                    {dashboard?.roleScope === 'ORGANIZATION'
                      ? 'In good standing'
                      : isPrimary
                      ? `Cap: ${money(dashboard?.metrics.investments?.totalCapitalInvested)}`
                      : 'Primary accountant only'}
                  </span>
                  <span className="text-purple-400 font-semibold">
                    {dashboard?.roleScope === 'ORGANIZATION' ? 'Enrolled' : 'Authorized'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Middle Section: Recent System Activity & Custody Distribution (with generous space) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8">
              {/* Recent System Activity Card */}
              <div className="glass-card p-5 sm:p-6 space-y-4 lg:col-span-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                      <Activity size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        Recent System Activity
                      </h2>
                      <p className="text-xs text-gray-400">
                        Immutable audit log trail across all society operations
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-gray-400 bg-slate-900/60 border border-white/5 px-2.5 py-1 rounded-full self-start sm:self-auto">
                    {dashboard?.recentActivity.length || 0} Recent Logs
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {dashboard?.recentActivity.length ? (
                    dashboard.recentActivity.map((item) => (
                      <div
                        key={item.id}
                        className="p-3.5 sm:p-4 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/10 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start sm:items-center gap-3 min-w-0">
                          <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mt-0.5 sm:mt-0">
                            <Activity size={16} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs sm:text-sm font-bold text-white">
                                {formatActionName(item.action)}
                              </span>
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {item.entityName}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 truncate">
                              {item.reason ? `${item.reason} · ` : ''}
                              <span className="text-gray-300 font-medium">By {item.performedBy}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t border-white/5 sm:border-t-0">
                          <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                            <Clock size={12} className="text-gray-500" />
                            {formatTimeAgo(item.createdAt)}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <Empty text="No recent activity logged for this scope." />
                  )}
                </div>
              </div>

              {/* Custody Distribution Card */}
              <div className="glass-card p-5 sm:p-6 space-y-4 lg:col-span-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                      <Landmark size={16} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                        Custody Distribution
                      </h2>
                      <p className="text-xs text-gray-400">Liquid reserves by payment gateway</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto">
                    {money(totalCustodySum)}
                  </span>
                </div>

                <div className="space-y-3 pt-1">
                  {dashboard?.custodyByAccount.length ? (
                    dashboard.custodyByAccount.map((account) => {
                      const percent =
                        totalCustodySum > 0
                          ? (Math.max(0, account.balance) / totalCustodySum) * 100
                          : 0;

                      return (
                        <div
                          key={account.name}
                          className="p-3.5 sm:p-4 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/10 transition-all space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                                <Wallet size={15} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs sm:text-sm font-bold text-white truncate">
                                  {account.name}
                                </p>
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/90">
                                  {account.channel}
                                </span>
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs sm:text-sm font-extrabold text-white">
                                {money(account.balance)}
                              </p>
                              <span className="text-[10px] font-bold text-blue-400">
                                {percent.toFixed(1)}% of total
                              </span>
                            </div>
                          </div>

                          {/* Responsive Custom Gradient Progress Bar */}
                          <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-400 transition-all duration-500"
                              style={{ width: `${Math.min(100, Math.max(percent, 2))}%` }}
                            />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <Empty text="No active custody accounts in this view." />
                  )}
                </div>
              </div>
            </div>

            {/* 3. Bottom Section: Investment Snapshot (Admin & Primary Accountant) */}
            {isPrimary && dashboard?.metrics.investments && (
              <div className="glass-card p-5 sm:p-6 space-y-5 border-l-4 border-l-indigo-500 hover:border-indigo-500/50 transition-all">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <TrendingUp size={18} />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                        <span>Investment Portfolio Snapshot</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                          Live Portfolio
                        </span>
                      </h2>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Capital deployment, active development projects and realized returns
                      </p>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full border border-indigo-400/25 bg-indigo-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                    <ShieldCheck size={13} />
                    Admin & Primary Accountant
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all">
                    <div>
                      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                        <span>Capital Invested</span>
                        <DollarSign size={16} className="text-indigo-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-extrabold text-white mt-2">
                        {money(dashboard.metrics.investments.totalCapitalInvested)}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-2 block">
                      Total principal funded into projects
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all">
                    <div>
                      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                        <span>Active Projects</span>
                        <Layers size={16} className="text-cyan-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-extrabold text-cyan-400 mt-2">
                        {dashboard.metrics.investments.activeProjectsCount} Projects
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-2 block">
                      Current underway ventures
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all">
                    <div>
                      <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                        <span>Realized Net Profit</span>
                        <Sparkles size={16} className="text-emerald-400" />
                      </div>
                      <p className="text-xl sm:text-2xl font-extrabold text-emerald-400 mt-2">
                        {money(dashboard.metrics.investments.netRealizedProfit)}
                      </p>
                    </div>
                    <span className="text-[11px] text-gray-400 mt-2 block">
                      Cumulative profit returned to society
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* VIEW 2: REPORTS WORKSPACE TAB */
        <div className="space-y-6">
          {/* Report Sub-Tabs */}
          <div className="flex border-b border-white/10 gap-2 overflow-x-auto no-scrollbar pb-3">
            {(
              [
                'collection',
                'custody',
                ...(isPrimary ? ['investments'] : []),
                'expenses',
                'dues',
              ] as ReportType[]
            ).map((type) => (
              <button
                key={type}
                onClick={() => changeReport(type)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  reportType === type
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                    : 'text-gray-400 hover:text-white bg-slate-900/60 border border-white/5'
                }`}
              >
                <span>{reportLabels[type]}</span>
              </button>
            ))}
          </div>

          {/* Search & Export Action Bar */}
          <div className="glass-card p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="form-input text-xs sm:text-sm pl-9 pr-3 py-2 w-full"
                placeholder={`Search ${reportLabels[reportType]} records…`}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </div>
            <button
              onClick={exportCsv}
              className="btn btn-primary btn-sm flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-wider w-full sm:w-auto"
            >
              <Download size={15} />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Table Container */}
          {loading ? (
            <Loading />
          ) : (
            <div className="glass-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      {columns.map((column) => (
                        <th key={column} className="whitespace-nowrap">
                          <button
                            onClick={() => {
                              setSortBy(column);
                              setSortDirection(
                                sortBy === column && sortDirection === 'desc' ? 'asc' : 'desc'
                              );
                              setPage(1);
                            }}
                            className="inline-flex items-center gap-1.5 capitalize hover:text-white font-bold"
                          >
                            <span>{column.replace(/([A-Z])/g, ' $1')}</span>
                            {sortBy === column && (
                              <span className="text-blue-400 font-extrabold">
                                {sortDirection === 'asc' ? '↑' : '↓'}
                              </span>
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report?.rows.length ? (
                      report.rows.map((row, index) => (
                        <tr key={index} className="hover:bg-white/[0.02] transition-colors">
                          {columns.map((column) => {
                            const val = row[column];
                            const isMoneyField =
                              typeof val === 'number' &&
                              /(total|amount|principal|penalty|profit|outstanding|balance|paid|advance|due|funded)/i.test(
                                column
                              );

                            return (
                              <td
                                key={column}
                                className="max-w-[240px] truncate text-xs sm:text-sm text-gray-300"
                                title={String(val ?? '')}
                              >
                                {isMoneyField ? (
                                  <span className="font-semibold text-white">{money(val)}</span>
                                ) : (
                                  String(val ?? '—')
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={Math.max(columns.length, 1)}>
                          <Empty text="No records match the current filters." />
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Responsive Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-white/10 text-xs text-gray-400">
                <span>
                  Showing {report?.rows.length || 0} of {report?.pagination.total || 0} total records
                  (10 per page)
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((value) => Math.max(1, value - 1))}
                    disabled={(report?.pagination.page || 1) <= 1}
                    className="p-1.5 rounded-lg border border-white/10 bg-slate-900/80 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <span className="px-2 font-semibold text-white">
                    Page {report?.pagination.page || 1} of {report?.pagination.totalPages || 1}
                  </span>

                  <button
                    onClick={() => setPage((value) => Math.min(report?.pagination.totalPages || 1, value + 1))}
                    disabled={(report?.pagination.page || 1) >= (report?.pagination.totalPages || 1)}
                    className="p-1.5 rounded-lg border border-white/10 bg-slate-900/80 text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Loading = () => (
  <div className="glass-card flex min-h-60 flex-col items-center justify-center text-sm text-gray-400 gap-3 p-8">
    <Loader2 size={24} className="animate-spin text-blue-400" />
    <span className="font-medium tracking-wide">Loading real-time financial ledger data…</span>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <div className="p-8 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
    <Activity size={20} className="text-gray-600" />
    <span>{text}</span>
  </div>
);
