import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import {
  TrendingUp,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Building2,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Eye,
  Sparkles,
  Repeat,
} from 'lucide-react';

interface ProjectMetrics {
  totalPrincipalReturned: number;
  totalProfitRealized: number;
  totalLosses: number;
  totalReturnReceived: number;
  netOutstandingCapital: number;
  netRealizedProfit: number;
  actualROI: number;
  expectedProfitAccrued?: number;
  expectedProfitOutstanding?: number;
  isOverdue?: boolean;
  overdueDays?: number;
  outstandingPrincipal?: number;
}

export interface SegmentItem {
  segmentIndex: number;
  startDate: string;
  endDate: string;
  days: number;
  principal: number;
  annualRoiPercent: number;
  segmentProfit: number;
}

export interface ProjectCalculation {
  asOfDate: string;
  originalPrincipal: number;
  totalPrincipalReturned: number;
  outstandingPrincipal: number;
  expectedAnnualRoiPercent: number;
  plannedStartDate: string;
  plannedEndDate: string | null;
  plannedDurationDays: number;
  isOverdue: boolean;
  overdueDays: number;
  expectedProfitAccrued: number;
  actualProfitReturned: number;
  expectedProfitOutstanding: number;
  totalReturnReceived: number;
  derivedStatus: string;
  segments: SegmentItem[];
}

interface InvestmentProjectItem {
  _id: string;
  projectId: string;
  name: string;
  description?: string;
  category: string;
  startDate: string;
  maturityDate?: string;
  expectedAnnualRoiPercent?: number;
  expectedROI?: number;
  targetPrincipal: number;
  totalFunded: number;
  status:
    | 'PROPOSED'
    | 'ACTIVE'
    | 'MATURED'
    | 'CLOSED'
    | 'DEFAULTED'
    | 'DURATION_COMPLETED'
    | 'PRINCIPAL_PARTIALLY_RETURNED'
    | 'OVERDUE_PRINCIPAL'
    | 'FULLY_SETTLED';
  externalEntity?: string;
  invoiceNo?: string;
  invoiceTo?: string;
  plannedDuration?: string;
  createdAt: string;
  calculation?: ProjectCalculation;
  metrics: ProjectMetrics;
}

interface CustodyAccountOption {
  _id: string;
  name: string;
  channel: string;
  derivedBalance: number;
  accountType: string;
  holderId?: {
    name: string;
    accountantType?: string;
  };
}

interface InvestmentFundingItem {
  _id: string;
  projectId: {
    _id: string;
    projectId: string;
    name: string;
  };
  custodyAccountId: {
    _id: string;
    name: string;
    channel: string;
    holderId?: {
      name: string;
      accountantType?: string;
    };
  };
  amount: number;
  date: string;
  transactionRef?: string;
  notes?: string;
  fundedBy?: {
    name: string;
    email: string;
  };
}

interface InvestmentReturnItem {
  _id: string;
  projectId: {
    _id: string;
    projectId: string;
    name: string;
  };
  maturityDate: string;
  principalReturned: number;
  actualProfit: number;
  actualLoss: number;
  totalReturn: number;
  destinationType: 'ACCOUNTANT_CUSTODY' | 'PROJECT_WALLET' | 'EXTERNAL_WALLET';
  destinationCustodyAccountId?: {
    _id: string;
    name: string;
    channel: string;
  };
  notes?: string;
  transactionRef?: string;
  idempotencyKey?: string;
  recordedBy?: {
    name: string;
    email: string;
  };
}

interface InvestmentStats {
  totalProjectsCount: number;
  activeProjectsCount: number;
  maturedProjectsCount: number;
  proposedProjectsCount: number;
  totalCapitalInvested: number;
  totalTargetPrincipal: number;
  activeDeployedCapital: number;
  totalPrincipalReturned: number;
  totalProfitRealized: number;
  totalLosses: number;
  netRealizedProfit: number;
  overallROI: number;
  totalFundingEventsCount: number;
  totalReturnEventsCount: number;
}

export const InvestmentsPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = usePreferences();
  const isAccountant =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ACCOUNTANT' ||
    user?.role === 'INVESTMENT_MANAGER';

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'portfolio' | 'fundings' | 'returns'>('portfolio');

  // Core Data States
  const [stats, setStats] = useState<InvestmentStats | null>(null);
  const [projects, setProjects] = useState<InvestmentProjectItem[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccountOption[]>([]);

  // Pagination & Search States (Server-Side)
  const [page, setPage] = useState(1);
  const [limit] = useState(12);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Loading and Alert States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showReinvestModal, setShowReinvestModal] = useState(false);
  const [selectedProjectForDetail, setSelectedProjectForDetail] = useState<InvestmentProjectItem | null>(null);
  const [projectDetailData, setProjectDetailData] = useState<{
    fundings: InvestmentFundingItem[];
    returns: InvestmentReturnItem[];
  } | null>(null);

  // Custom Category State
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategory, setCustomCategory] = useState('');

  // Form States: Create Project
  const [createForm, setCreateForm] = useState({
    projectId: '',
    name: '',
    description: '',
    category: 'Agriculture',
    externalEntity: '',
    invoiceNo: '',
    invoiceTo: '',
    plannedDuration: '',
    startDate: new Date().toISOString().split('T')[0],
    maturityDate: '',
    expectedAnnualRoiPercent: '',
    expectedROI: '',
    targetPrincipal: '',
    initialFundings: [] as Array<{ custodyAccountId: string; amount: string; notes?: string }>,
  });

  // Form States: Multi-Accountant Funding
  const [fundForm, setFundForm] = useState<{
    projectId: string;
    date: string;
    fundings: Array<{ custodyAccountId: string; amount: string; notes?: string }>;
  }>({
    projectId: '',
    date: new Date().toISOString().split('T')[0],
    fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
  });

  // Form States: Record Return
  const [returnForm, setReturnForm] = useState({
    projectId: '',
    maturityDate: new Date().toISOString().split('T')[0],
    principalReturned: '',
    actualProfit: '',
    actualLoss: '0',
    destinationType: 'ACCOUNTANT_CUSTODY' as 'ACCOUNTANT_CUSTODY' | 'PROJECT_WALLET' | 'EXTERNAL_WALLET',
    destinationCustodyAccountId: '',
    notes: '',
    transactionRef: '',
  });

  // Form States: Reinvestment
  const [reinvestForm, setReinvestForm] = useState({
    sourceProjectId: '',
    destinationProjectId: '',
    walletAccountId: '',
    reinvestedAmount: '',
    newAccountantFunds: '',
    newAccountantCustodyAccountId: '',
    date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // Fetch Investment Projects (Server-side debounced search & pagination)
  const fetchProjects = useCallback(
    async (p: number, search: string, status: string, cat: string) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (search.trim()) params.append('search', search.trim());
        if (status) params.append('status', status);
        if (cat) params.append('category', cat);
        params.append('page', String(p));
        params.append('limit', String(limit));

        const res = await apiRequest<InvestmentProjectItem[]>(
          `/investments/projects?${params.toString()}`,
          { signal: controller.signal }
        );

        setProjects(res.data || []);
        if (res.pagination) {
          setTotalPages(res.pagination.totalPages || 1);
          setTotalCount(res.pagination.total || 0);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') return;
        console.error('Failed to load investment projects:', err);
        setErrorMessage((err as Error).message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    },
    [limit]
  );

  // Fetch Stats and Custody Accounts once
  const fetchOverviewData = useCallback(async () => {
    try {
      const [statsRes, accRes] = await Promise.all([
        apiRequest<InvestmentStats>('/investments/stats'),
        apiRequest<CustodyAccountOption[]>('/custody/accounts?isActive=true'),
      ]);
      setStats(statsRes.data);
      setCustodyAccounts(accRes.data);
    } catch (err: unknown) {
      console.error('Failed to load investment stats/accounts:', err);
    }
  }, []);

  // Debounced search effect (400ms interval as specified in Section 33)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchProjects(1, searchFilter, statusFilter, categoryFilter);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchFilter, statusFilter, categoryFilter, fetchProjects]);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

  // Page change handler
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchProjects(newPage, searchFilter, statusFilter, categoryFilter);
  };

  // Fetch drill-down details for a project
  const openProjectDrillDown = async (project: InvestmentProjectItem) => {
    setSelectedProjectForDetail(project);
    try {
      const res = await apiRequest<{
        project: InvestmentProjectItem;
        calculation?: ProjectCalculation;
        fundings: InvestmentFundingItem[];
        returns: InvestmentReturnItem[];
      }>(`/investments/projects/${project._id}`);
      setSelectedProjectForDetail(res.data.project);
      setProjectDetailData({
        fundings: res.data.fundings,
        returns: res.data.returns,
      });
    } catch (err) {
      console.error('Failed to load project details:', err);
    }
  };

  // Auto-dismiss alerts
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Handle Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name || !createForm.targetPrincipal || !createForm.startDate) {
      setErrorMessage('Please fill in project name, target principal, and start date');
      return;
    }

    const finalCategory = isCustomCategory ? customCategory.trim() : createForm.category;
    if (!finalCategory) {
      setErrorMessage('Please specify a project category');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);

      // Filter valid initial fundings
      const validInitialFundings = createForm.initialFundings
        .filter((f) => f.custodyAccountId && parseFloat(f.amount) > 0)
        .map((f) => ({
          custodyAccountId: f.custodyAccountId,
          amount: parseFloat(f.amount),
          notes: f.notes,
        }));

      const roiVal = createForm.expectedAnnualRoiPercent
        ? parseFloat(createForm.expectedAnnualRoiPercent)
        : createForm.expectedROI
        ? parseFloat(createForm.expectedROI)
        : undefined;

      await apiRequest('/investments/projects', {
        method: 'POST',
        body: JSON.stringify({
          projectId: createForm.projectId || undefined,
          name: createForm.name,
          description: createForm.description,
          category: finalCategory,
          externalEntity: createForm.externalEntity,
          invoiceNo: createForm.invoiceNo || undefined,
          invoiceTo: createForm.invoiceTo || undefined,
          plannedDuration: createForm.plannedDuration || undefined,
          startDate: createForm.startDate,
          maturityDate: createForm.maturityDate || undefined,
          expectedAnnualRoiPercent: roiVal,
          expectedROI: roiVal,
          targetPrincipal: parseFloat(createForm.targetPrincipal),
          initialFundings: validInitialFundings.length > 0 ? validInitialFundings : undefined,
        }),
      });

      setSuccessMessage(`Investment project '${createForm.name}' created successfully!`);
      setShowCreateModal(false);
      setCreateForm({
        projectId: '',
        name: '',
        description: '',
        category: 'Agriculture',
        externalEntity: '',
        invoiceNo: '',
        invoiceTo: '',
        plannedDuration: '',
        startDate: new Date().toISOString().split('T')[0],
        maturityDate: '',
        expectedAnnualRoiPercent: '',
        expectedROI: '',
        targetPrincipal: '',
        initialFundings: [],
      });
      setIsCustomCategory(false);
      setCustomCategory('');
      fetchProjects(1, searchFilter, statusFilter, categoryFilter);
      fetchOverviewData();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to create project');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Multi-Accountant Project Funding
  const handleFundProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fundForm.projectId) {
      setErrorMessage('Please select a project to fund');
      return;
    }

    const validFundings = fundForm.fundings
      .filter((f) => f.custodyAccountId && parseFloat(f.amount) > 0)
      .map((f) => ({
        custodyAccountId: f.custodyAccountId,
        amount: parseFloat(f.amount),
        notes: f.notes,
      }));

    if (validFundings.length === 0) {
      setErrorMessage('Please add at least one funding contribution with a valid amount');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      await apiRequest(`/investments/projects/${fundForm.projectId}/fund`, {
        method: 'POST',
        body: JSON.stringify({
          fundings: validFundings,
          date: fundForm.date,
        }),
      });

      setSuccessMessage('Investment capital successfully funded from custody accounts!');
      setShowFundModal(false);
      setFundForm({
        projectId: '',
        date: new Date().toISOString().split('T')[0],
        fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
      });

      await fetchOverviewData();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to fund project');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Record Return
  const handleRecordReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnForm.projectId) {
      setErrorMessage('Please select a project');
      return;
    }

    const principal = parseFloat(returnForm.principalReturned) || 0;
    const profit = parseFloat(returnForm.actualProfit) || 0;
    const loss = parseFloat(returnForm.actualLoss) || 0;

    if (principal <= 0 && profit <= 0 && loss <= 0) {
      setErrorMessage('Please enter returned principal, profit, or loss');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      await apiRequest(`/investments/projects/${returnForm.projectId}/returns`, {
        method: 'POST',
        body: JSON.stringify({
          maturityDate: returnForm.maturityDate,
          principalReturned: principal,
          actualProfit: profit,
          actualLoss: loss,
          destinationType: returnForm.destinationType,
          destinationCustodyAccountId: returnForm.destinationCustodyAccountId || undefined,
          notes: returnForm.notes,
          transactionRef: returnForm.transactionRef || undefined,
        }),
      });

      setSuccessMessage('Project return & maturity realized successfully!');
      setShowReturnModal(false);
      setReturnForm({
        projectId: '',
        maturityDate: new Date().toISOString().split('T')[0],
        principalReturned: '',
        actualProfit: '',
        actualLoss: '0',
        destinationType: 'ACCOUNTANT_CUSTODY',
        destinationCustodyAccountId: '',
        notes: '',
        transactionRef: '',
      });

      fetchProjects(page, searchFilter, statusFilter, categoryFilter);
      await fetchOverviewData();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to record return');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Reinvestment
  const handleReinvest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reinvestForm.sourceProjectId || !reinvestForm.destinationProjectId || !reinvestForm.walletAccountId) {
      setErrorMessage('Please select source project, destination project, and wallet account');
      return;
    }

    const reinvestAmount = parseFloat(reinvestForm.reinvestedAmount);
    if (!reinvestAmount || reinvestAmount <= 0) {
      setErrorMessage('Reinvestment amount must be greater than 0');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      await apiRequest('/investments/reinvest', {
        method: 'POST',
        body: JSON.stringify({
          sourceProjectId: reinvestForm.sourceProjectId,
          destinationProjectId: reinvestForm.destinationProjectId,
          walletAccountId: reinvestForm.walletAccountId,
          reinvestedAmount: reinvestAmount,
          newAccountantFunds: reinvestForm.newAccountantFunds ? parseFloat(reinvestForm.newAccountantFunds) : 0,
          newAccountantCustodyAccountId: reinvestForm.newAccountantCustodyAccountId || undefined,
          date: reinvestForm.date,
          notes: reinvestForm.notes,
        }),
      });

      setSuccessMessage('Wallet proceeds successfully reinvested into new project!');
      setShowReinvestModal(false);
      setReinvestForm({
        sourceProjectId: '',
        destinationProjectId: '',
        walletAccountId: '',
        reinvestedAmount: '',
        newAccountantFunds: '',
        newAccountantCustodyAccountId: '',
        date: new Date().toISOString().split('T')[0],
        notes: '',
      });

      await fetchOverviewData();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to execute reinvestment');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Notifications */}
      {successMessage && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
          <span className="font-medium">{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ml-auto text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-3 p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-sm animate-in fade-in slide-in-from-top-2 duration-200">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span className="font-medium">{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="ml-auto text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <TrendingUp className="w-7 h-7 text-emerald-400" />
              {t('Investment Management')}
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {t('Common pooled project investments, multi-accountant co-funding, maturity returns, and wallet reinvestments.')}
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchOverviewData()}
            disabled={loading}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700 flex items-center gap-1.5"
            title={t('Refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </button>

          {isAccountant && (
            <>
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t('New Project')}
              </button>

              <button
                onClick={() => setShowFundModal(true)}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
              >
                <ArrowDownLeft className="w-4 h-4" />
                {t('Fund Project')}
              </button>

              <button
                onClick={() => setShowReturnModal(true)}
                className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <ArrowUpRight className="w-4 h-4" />
                {t('Record Return')}
              </button>

              <button
                onClick={() => setShowReinvestModal(true)}
                className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                title={t('Reinvest')}
              >
                <Repeat className="w-4 h-4 text-emerald-400" />
                {t('Reinvest')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Portfolio Summary Metrics */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Capital Invested */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#12231c] to-[#0d1a15] border border-emerald-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t('Total Capital Invested')}
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                BDT {(stats.totalCapitalInvested || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              {t(`Across ${stats.totalProjectsCount} projects (${stats.activeProjectsCount} Active)`)}
            </div>
          </div>

          {/* Active Capital Currently Deployed */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#171e2e] to-[#0f1422] border border-blue-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t('Active Capital Deployed')}
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-blue-300 tracking-tight">
                BDT {(stats.activeDeployedCapital || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              {t('Unreturned principal in live projects')}
            </div>
          </div>

          {/* Total Principal Returned */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#1e1b2e] to-[#131124] border border-purple-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t('Principal Returned')}
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-purple-300 tracking-tight">
                BDT {(stats.totalPrincipalReturned || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Liquidated & returned to custody
            </div>
          </div>

          {/* Net Realized Profit & ROI */}
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Realized Profit / ROI
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded font-bold ${
                  stats.netRealizedProfit >= 0
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {stats.overallROI}% Net ROI
              </span>
            </div>
            <div className="mt-2">
              <span
                className={`text-2xl font-bold tracking-tight ${
                  stats.netRealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {stats.netRealizedProfit >= 0 ? '+' : ''}BDT {(stats.netRealizedProfit || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400 flex items-center justify-between">
              <span>Profit: +BDT {(stats.totalProfitRealized || 0).toLocaleString()}</span>
              {stats.totalLosses > 0 && <span className="text-rose-400">Loss: -BDT {stats.totalLosses.toLocaleString()}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="border-b border-gray-800">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('portfolio')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'portfolio'
                ? 'border-emerald-500 text-emerald-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Building2 className="w-4 h-4" />
            {t(`Projects Portfolio (${projects.length})`)}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('Search by ID, name, partner...')}
              className="w-full bg-[#1F2937] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-500"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t('All Statuses')}</option>
              <option value="ACTIVE">{t('Active')} (সক্রিয়)</option>
              <option value="OVERDUE_PRINCIPAL">মেয়াদোত্তীর্ণ বকেয়া মূলধন (Overdue Principal)</option>
              <option value="DURATION_COMPLETED">মেয়াদোত্তীর্ণ (Duration Completed)</option>
              <option value="PRINCIPAL_PARTIALLY_RETURNED">আংশিক মূলধন ফেরত (Partially Returned)</option>
              <option value="FULLY_SETTLED">সম্পূর্ণ নিষ্পত্তিকৃত (Fully Settled)</option>
              <option value="PROPOSED">{t('Proposed')} (প্রস্তাবিত)</option>
              <option value="CLOSED">{t('Closed')} (বন্ধ)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">সকল শ্রেনী (All Categories)</option>
              <option value="Agriculture">কৃষি ও খামার (Agriculture)</option>
              <option value="Livestock">গবাদিপশু ও ডেইরি (Livestock)</option>
              <option value="Trading">পণ্য লেনদেন (Commodity Trading)</option>
              <option value="Real Estate">জমি ও প্রপার্টি (Real Estate)</option>
              <option value="Tech / Digital">প্রযুক্তি ও ডিজিটাল (Tech / Digital)</option>
              <option value="Restaurant">রেস্তোরাঁ ও খাদ্য (Restaurant)</option>
              <option value="Fisheries">মৎস্য চাষ (Fisheries / Shrimp)</option>
            </select>
          </div>

          {/* Reset button */}
          {(searchFilter || statusFilter || categoryFilter) && (
            <div className="flex items-center">
              <button
                onClick={() => {
                  setSearchFilter('');
                  setStatusFilter('');
                  setCategoryFilter('');
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1"
              >
                ফিল্টার রিসেট (Reset)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Projects Grid */}
      {loading ? (
        <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          বিনিয়োগ প্রকল্প লোড হচ্ছে... (Loading investment projects...)
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-8 text-center text-gray-400">
          কোনো বিনিয়োগ প্রকল্প পাওয়া যায়নি (No investment projects found).
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((prj) => {
              const fundingPercent = Math.min(
                100,
                Math.round(((prj.totalFunded || 0) / (prj.targetPrincipal || 1)) * 100)
              );
              const m = prj.metrics;
              const calc = prj.calculation;
              const outstandingPrincipal = calc?.outstandingPrincipal ?? m.netOutstandingCapital ?? 0;
              const expectedRoi = prj.expectedAnnualRoiPercent ?? prj.expectedROI ?? 0;
              const isOverdue = calc?.isOverdue || prj.status === 'OVERDUE_PRINCIPAL' || prj.status === 'DURATION_COMPLETED';

              return (
                <div
                  key={prj._id}
                  className={`bg-[#111827] border rounded-xl p-5 transition-all flex flex-col justify-between shadow-sm group ${
                    isOverdue
                      ? 'border-amber-500/40 hover:border-amber-500/70'
                      : prj.status === 'FULLY_SETTLED'
                      ? 'border-emerald-500/30 hover:border-emerald-500/60'
                      : 'border-white/10 hover:border-emerald-500/40'
                  }`}
                >
                  <div>
                    {/* Top Tags & Invoice */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {prj.projectId}
                        </span>
                        {prj.invoiceNo && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                            ইনভয়েস: {prj.invoiceNo}
                          </span>
                        )}
                        {prj.externalEntity && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            {prj.externalEntity}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                          isOverdue
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : prj.status === 'FULLY_SETTLED'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : prj.status === 'PRINCIPAL_PARTIALLY_RETURNED'
                            ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                            : prj.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : prj.status === 'PROPOSED'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-gray-800 text-gray-300 border-gray-700'
                        }`}
                      >
                        {isOverdue
                          ? 'মেয়াদোত্তীর্ণ (লাভ চলমান)'
                          : prj.status === 'FULLY_SETTLED'
                          ? 'সম্পূর্ণ নিষ্পত্তিকৃত'
                          : prj.status === 'PRINCIPAL_PARTIALLY_RETURNED'
                          ? 'আংশিক ফেরত'
                          : prj.status}
                      </span>
                    </div>

                    {/* Overdue Warning Banner */}
                    {isOverdue && (
                      <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        পরিকল্পিত মেয়াদ শেষ ({calc?.overdueDays || 0} দিন) • বাকি মূলধনে লাভ সঞ্চয় চলমান
                      </div>
                    )}

                    {/* Project Name */}
                    <div className="mt-3">
                      <h3 className="text-base font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {prj.name}
                      </h3>
                      <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span className="text-gray-300 font-medium">শ্রেনী: {prj.category}</span>
                        {prj.plannedDuration && (
                          <>
                            <span>•</span>
                            <span>মেয়াদ: {prj.plannedDuration}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>শুরু: {new Date(prj.startDate).toLocaleDateString()}</span>
                      </p>
                    </div>

                    {/* Funding Progress */}
                    <div className="mt-3 pt-3 border-t border-gray-800">
                      <div className="flex justify-between items-baseline text-xs mb-1">
                        <span className="text-gray-400">মূল বিনিয়োগ:</span>
                        <span className="font-bold text-white">
                          BDT {(prj.totalFunded || prj.targetPrincipal).toLocaleString()}
                        </span>
                      </div>

                      <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            fundingPercent >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${fundingPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Core Financial Dimensions Grid (Principal vs Profit Strictly Separated) */}
                    <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-lg bg-gray-900/60 border border-gray-800/80 text-xs">
                      <div>
                        <span className="text-gray-500 block">বাকি মূলধন:</span>
                        <span className={`font-semibold ${outstandingPrincipal > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                          BDT {outstandingPrincipal.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">বাৎসরিক ROI:</span>
                        <span className="font-semibold text-indigo-400">
                          {expectedRoi}% বাৎসরিক
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">অর্জিত সম্ভাব্য লাভ:</span>
                        <span className="font-semibold text-purple-300">
                          BDT {(calc?.expectedProfitAccrued ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block">ফেরত প্রাপ্ত লাভ:</span>
                        <span className="font-semibold text-emerald-400">
                          +BDT {(calc?.actualProfitReturned ?? m.totalProfitRealized ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Profit Outstanding */}
                    {(calc?.expectedProfitOutstanding ?? 0) > 0 && (
                      <div className="mt-2 text-[11px] text-gray-400 flex justify-between bg-purple-500/5 px-2 py-1 rounded border border-purple-500/10">
                        <span>বাকি সম্ভাব্য লাভ:</span>
                        <span className="font-semibold text-purple-300">
                          BDT {(calc?.expectedProfitOutstanding ?? 0).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2">
                    <button
                      onClick={() => openProjectDrillDown(prj)}
                      className="flex-1 px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      বিস্তারিত (Details)
                    </button>

                    {isAccountant && prj.status !== 'CLOSED' && prj.status !== 'FULLY_SETTLED' && (
                      <>
                        <button
                          onClick={() => {
                            setFundForm({
                              projectId: prj._id,
                              date: new Date().toISOString().split('T')[0],
                              fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
                            });
                            setShowFundModal(true);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors flex items-center gap-1"
                          title="Fund Project"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          অর্থায়ন
                        </button>

                        {(prj.totalFunded > 0 || prj.targetPrincipal > 0) && (
                          <button
                            onClick={() => {
                              setReturnForm({
                                projectId: prj._id,
                                maturityDate: new Date().toISOString().split('T')[0],
                                principalReturned: outstandingPrincipal.toString(),
                                actualProfit: '',
                                actualLoss: '0',
                                destinationType: 'ACCOUNTANT_CUSTODY',
                                destinationCustodyAccountId: '',
                                notes: '',
                                transactionRef: '',
                              });
                              setShowReturnModal(true);
                            }}
                            className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium transition-colors"
                            title="Record Maturity Return"
                          >
                            ফেরত (Return)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Server-Side Pagination Bar */}
          {totalPages > 1 && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-800 pt-4">
              <div className="text-xs text-gray-400">
                পৃষ্ঠা <span className="text-white font-semibold">{page}</span> / <span className="text-white font-semibold">{totalPages}</span> (মোট <span className="text-emerald-400 font-semibold">{totalCount}</span> টি প্রকল্প)
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-gray-300 rounded-lg border border-gray-700 font-medium transition-colors"
                >
                  পূর্ববর্তী (Prev)
                </button>
                <span className="text-xs px-2 text-gray-400">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => handlePageChange(page + 1)}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-gray-300 rounded-lg border border-gray-700 font-medium transition-colors"
                >
                  পরবর্তী (Next)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* =========================================================================
          MODAL 1: CREATE INVESTMENT PROJECT (With Optional Multi-Accountant Funding)
          ========================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-[#111827] z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">New Investment Project</h2>
                  <p className="text-xs text-gray-400">Define pooled investment project & partner details</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    প্রকল্পের নাম (Project Name)
                  </label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="e.g. GROWUP Cattle Project #2"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    ইনভয়েস নং (Invoice No)
                  </label>
                  <input
                    type="text"
                    value={createForm.invoiceNo}
                    onChange={(e) => setCreateForm({ ...createForm, invoiceNo: e.target.value })}
                    placeholder="e.g. INV-2024-001"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    এনজিও / পার্টনার (Partner / NGO)
                  </label>
                  <input
                    type="text"
                    value={createForm.externalEntity}
                    onChange={(e) => setCreateForm({ ...createForm, externalEntity: e.target.value })}
                    placeholder="e.g. GROWUP NGO, Zayan"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    শ্রেনী (Category)
                  </label>
                  {!isCustomCategory ? (
                    <select
                      value={createForm.category}
                      onChange={(e) => {
                        if (e.target.value === '__NEW__') {
                          setIsCustomCategory(true);
                          setCustomCategory('');
                        } else {
                          setCreateForm({ ...createForm, category: e.target.value });
                        }
                      }}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Agriculture">কৃষি ও খামার (Agriculture)</option>
                      <option value="Livestock">গবাদিপশু ও ডেইরি (Livestock)</option>
                      <option value="Trading">পণ্য লেনদেন (Commodity Trading)</option>
                      <option value="Real Estate">জমি ও প্রপার্টি (Real Estate)</option>
                      <option value="Tech / Digital">প্রযুক্তি ও ডিজিটাল (Tech / Digital)</option>
                      <option value="Restaurant">রেস্তোরাঁ ও খাদ্য (Restaurant)</option>
                      <option value="Fisheries">মৎস্য চাষ (Fisheries / Shrimp)</option>
                      <option value="General">অন্যান্য / সাধারণ (General)</option>
                      <option value="__NEW__">+ নতুন শ্রেনী যোগ করুন (+ New Category)</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder="নতুন শ্রেনীর নাম লিখুন..."
                        className="w-full bg-[#1F2937] border border-emerald-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setIsCustomCategory(false)}
                        className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg"
                        title="বিদ্যমান তালিকা থেকে বাছুন"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    পরিকল্পিত সময়কাল (Planned Duration)
                  </label>
                  <input
                    type="text"
                    value={createForm.plannedDuration}
                    onChange={(e) => setCreateForm({ ...createForm, plannedDuration: e.target.value })}
                    placeholder="e.g. 6 Months / ৬ মাস"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    মূল বিনিয়োগ লক্ষ্য (Target Principal BDT)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={createForm.targetPrincipal}
                    onChange={(e) => setCreateForm({ ...createForm, targetPrincipal: e.target.value })}
                    placeholder="e.g. 50000"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    শুরুর তারিখ (Start Date)
                  </label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm({ ...createForm, startDate: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    পরিকল্পিত শেষ তারিখ (Planned End Date)
                  </label>
                  <input
                    type="date"
                    value={createForm.maturityDate}
                    onChange={(e) => setCreateForm({ ...createForm, maturityDate: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    বাৎসরিক সম্ভাব্য লাভের হার (%) (Expected ROI yearly)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={createForm.expectedAnnualRoiPercent || createForm.expectedROI}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        expectedAnnualRoiPercent: e.target.value,
                        expectedROI: e.target.value,
                      })
                    }
                    placeholder="e.g. 40"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Project Description / Agreement Terms
                </label>
                <textarea
                  rows={2}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="e.g. 6-month seasonal livestock contract with 40% expected ROI"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder-gray-500"
                />
              </div>

              {/* Multi-Accountant Initial Funding Section */}
              <div className="pt-3 border-t border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Initial Multi-Accountant Funding (Optional)
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setCreateForm({
                        ...createForm,
                        initialFundings: [
                          ...createForm.initialFundings,
                          { custodyAccountId: '', amount: '', notes: '' },
                        ],
                      })
                    }
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Contributor
                  </button>
                </div>

                {createForm.initialFundings.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    No initial funding attached yet. You can fund this project anytime later from one or multiple accountants.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {createForm.initialFundings.map((funding, idx) => (
                      <div
                        key={idx}
                        className="p-3 bg-gray-900/80 rounded-lg border border-gray-800 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-xs"
                      >
                        <div className="sm:col-span-6">
                          <select
                            value={funding.custodyAccountId}
                            onChange={(e) => {
                              const updated = [...createForm.initialFundings];
                              updated[idx].custodyAccountId = e.target.value;
                              setCreateForm({ ...createForm, initialFundings: updated });
                            }}
                            className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="">Select accountant custody account...</option>
                            {custodyAccounts.map((acc) => (
                              <option key={acc._id} value={acc._id}>
                                {acc.name} ({acc.channel}) — Available: BDT {acc.derivedBalance.toLocaleString()}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-5">
                          <input
                            type="number"
                            min="1"
                            placeholder="Amount (BDT)"
                            value={funding.amount}
                            onChange={(e) => {
                              const updated = [...createForm.initialFundings];
                              updated[idx].amount = e.target.value;
                              setCreateForm({ ...createForm, initialFundings: updated });
                            }}
                            className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>

                        <div className="sm:col-span-1 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = createForm.initialFundings.filter((_, i) => i !== idx);
                              setCreateForm({ ...createForm, initialFundings: updated });
                            }}
                            className="text-gray-500 hover:text-rose-400"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: MULTI-ACCOUNTANT FUND PROJECT
          ========================================================================= */}
      {showFundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-[#111827] z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Invest Capital into Project</h2>
                  <p className="text-xs text-gray-400">Supply money from one or multiple accountant custodies</p>
                </div>
              </div>
              <button
                onClick={() => setShowFundModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFundProject} className="p-6 space-y-4">
              {/* Project Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Target Project
                </label>
                <select
                  value={fundForm.projectId}
                  onChange={(e) => setFundForm({ ...fundForm, projectId: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select project to fund...</option>
                  {projects
                    .filter((p) => p.status !== 'CLOSED' && p.status !== 'DEFAULTED')
                    .map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.projectId} — {p.name} (Funded: BDT {p.totalFunded.toLocaleString()} / BDT {p.targetPrincipal.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Investment Date
                </label>
                <input
                  type="date"
                  value={fundForm.date}
                  onChange={(e) => setFundForm({ ...fundForm, date: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              {/* Multi-Accountant Contributor Rows */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Contributing Custody Accounts
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFundForm({
                        ...fundForm,
                        fundings: [...fundForm.fundings, { custodyAccountId: '', amount: '', notes: '' }],
                      })
                    }
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Contributor
                  </button>
                </div>

                <div className="space-y-3">
                  {fundForm.fundings.map((item, idx) => {
                    const selAccount = custodyAccounts.find((a) => a._id === item.custodyAccountId);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400 font-medium">Contributor #{idx + 1}</span>
                          {fundForm.fundings.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const updated = fundForm.fundings.filter((_, i) => i !== idx);
                                setFundForm({ ...fundForm, fundings: updated });
                              }}
                              className="text-gray-500 hover:text-rose-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <select
                              value={item.custodyAccountId}
                              onChange={(e) => {
                                const updated = [...fundForm.fundings];
                                updated[idx].custodyAccountId = e.target.value;
                                setFundForm({ ...fundForm, fundings: updated });
                              }}
                              className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                              required
                            >
                              <option value="">Select custody account...</option>
                              {custodyAccounts.map((acc) => (
                                <option key={acc._id} value={acc._id} disabled={acc.derivedBalance <= 0}>
                                  {acc.name} ({acc.channel}) — Avail: BDT {acc.derivedBalance.toLocaleString()}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <input
                              type="number"
                              min="1"
                              placeholder="Amount to Invest (BDT)"
                              value={item.amount}
                              onChange={(e) => {
                                const updated = [...fundForm.fundings];
                                updated[idx].amount = e.target.value;
                                setFundForm({ ...fundForm, fundings: updated });
                              }}
                              className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                              required
                            />
                          </div>
                        </div>

                        {selAccount && (
                          <div className="flex justify-between text-[11px] text-gray-400">
                            <span>Holder: {selAccount.holderId?.name || 'Reserve'}</span>
                            <span className="text-emerald-400 font-semibold">
                              Max Available: BDT {selAccount.derivedBalance.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Total Summary */}
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-between text-xs">
                <span className="text-indigo-300 font-medium">Total New Capital to Invest:</span>
                <span className="text-base font-bold text-white">
                  BDT{' '}
                  {fundForm.fundings
                    .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0)
                    .toLocaleString()}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowFundModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Investment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: RECORD PROJECT RETURN / MATURITY
          ========================================================================= */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Record Maturity & Return</h2>
                  <p className="text-xs text-gray-400">Realize principal, profit/loss, and deposit destination</p>
                </div>
              </div>
              <button
                onClick={() => setShowReturnModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordReturn} className="p-6 space-y-4">
              {/* Project selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Investment Project
                </label>
                <select
                  value={returnForm.projectId}
                  onChange={(e) => setReturnForm({ ...returnForm, projectId: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Select project...</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.projectId} — {p.name} (Outstanding: BDT {p.metrics.netOutstandingCapital.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Maturity / Return Date
                </label>
                <input
                  type="date"
                  value={returnForm.maturityDate}
                  onChange={(e) => setReturnForm({ ...returnForm, maturityDate: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Financial Returns Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Principal Returned
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={returnForm.principalReturned}
                    onChange={(e) => setReturnForm({ ...returnForm, principalReturned: e.target.value })}
                    placeholder="e.g. 30000"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">
                    Actual Profit (+)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={returnForm.actualProfit}
                    onChange={(e) => setReturnForm({ ...returnForm, actualProfit: e.target.value })}
                    placeholder="e.g. 12000"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-rose-400 uppercase tracking-wider mb-1.5">
                    Actual Loss (-)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={returnForm.actualLoss}
                    onChange={(e) => setReturnForm({ ...returnForm, actualLoss: e.target.value })}
                    placeholder="0"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Net Total Preview */}
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between text-xs">
                <span className="text-purple-300 font-medium">Total Cash/Proceeds Returned:</span>
                <span className="text-base font-bold text-white">
                  BDT{' '}
                  {(
                    (parseFloat(returnForm.principalReturned) || 0) +
                    (parseFloat(returnForm.actualProfit) || 0) -
                    (parseFloat(returnForm.actualLoss) || 0)
                  ).toLocaleString()}
                </span>
              </div>

              {/* Destination Type & Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    জমা গন্তব্য (Return Destination)
                  </label>
                  <select
                    value={returnForm.destinationType}
                    onChange={(e) => setReturnForm({ ...returnForm, destinationType: e.target.value as any })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="ACCOUNTANT_CUSTODY">হিসাবরক্ষক কাস্টডি (Accountant Custody)</option>
                    <option value="PROJECT_WALLET">প্রকল্প ওয়ালেট (Project Wallet)</option>
                    <option value="EXTERNAL_WALLET">বহিঃস্থ ওয়ালেট (External Wallet)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    জমা একাউন্ট {returnForm.destinationType === 'ACCOUNTANT_CUSTODY' && <span className="text-red-400">*</span>}
                  </label>
                  {returnForm.destinationType === 'PROJECT_WALLET' ? (
                    <div className="w-full bg-[#111827] border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-400 italic">
                      প্রকল্প ওয়ালেটে রক্ষিত হবে (আলাদা কাস্টডি একাউন্ট প্রয়োজন নেই)
                    </div>
                  ) : (
                    <select
                      value={returnForm.destinationCustodyAccountId}
                      onChange={(e) => setReturnForm({ ...returnForm, destinationCustodyAccountId: e.target.value })}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required={returnForm.destinationType === 'ACCOUNTANT_CUSTODY'}
                    >
                      <option value="">Select deposit account...</option>
                      {custodyAccounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} ({acc.channel}) — {acc.holderId?.name || 'Org Wallet'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Transaction Ref & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    লেনদেন রেফারেন্স (Tx Ref / ID)
                  </label>
                  <input
                    type="text"
                    value={returnForm.transactionRef}
                    onChange={(e) => setReturnForm({ ...returnForm, transactionRef: e.target.value })}
                    placeholder="e.g. TXN-RET-2026-001"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    মন্তব্য / রেফারেন্স বিবরণ
                  </label>
                  <input
                    type="text"
                    value={returnForm.notes}
                    onChange={(e) => setReturnForm({ ...returnForm, notes: e.target.value })}
                    placeholder="e.g. Returned via Bank transfer by GROWUP NGO"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReturnModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Submit Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: REINVEST WALLET PROCEEDS
          ========================================================================= */}
      {showReinvestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Repeat className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Reinvest Wallet Proceeds</h2>
                  <p className="text-xs text-gray-400">Reinvest from partner wallet + optional new accountant funds</p>
                </div>
              </div>
              <button
                onClick={() => setShowReinvestModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReinvest} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Source (Matured) Project
                  </label>
                  <select
                    value={reinvestForm.sourceProjectId}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, sourceProjectId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Select source project...</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.projectId} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Destination Project
                  </label>
                  <select
                    value={reinvestForm.destinationProjectId}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, destinationProjectId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Select destination project...</option>
                    {projects
                      .filter((p) => p._id !== reinvestForm.sourceProjectId && p.status !== 'CLOSED')
                      .map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.projectId} — {p.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Wallet Selection & Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Organization Wallet Account
                  </label>
                  <select
                    value={reinvestForm.walletAccountId}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, walletAccountId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">Select wallet account...</option>
                    {custodyAccounts.map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} — Avail: BDT {acc.derivedBalance.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Reinvested Amount from Wallet
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={reinvestForm.reinvestedAmount}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, reinvestedAmount: e.target.value })}
                    placeholder="e.g. 42000"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>
              </div>

              {/* Optional New Accountant Funds Top-up */}
              <div className="p-3 bg-gray-900/70 rounded-xl border border-gray-800 space-y-2">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider block">
                  Optional New Accountant Custody Top-Up
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="number"
                      min="0"
                      value={reinvestForm.newAccountantFunds}
                      onChange={(e) => setReinvestForm({ ...reinvestForm, newAccountantFunds: e.target.value })}
                      placeholder="Additional amount (BDT)"
                      className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <select
                      value={reinvestForm.newAccountantCustodyAccountId}
                      onChange={(e) => setReinvestForm({ ...reinvestForm, newAccountantCustodyAccountId: e.target.value })}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                    >
                      <option value="">Select top-up custody account...</option>
                      {custodyAccounts.map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} ({acc.channel}) — BDT {acc.derivedBalance.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReinvestModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Confirm Reinvestment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 5: PROJECT DRILL-DOWN DRAWER
          ========================================================================= */}
      {selectedProjectForDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-[#111827] z-10">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedProjectForDetail.name}
                    <span className="font-mono text-xs text-emerald-400 font-normal">
                      ({selectedProjectForDetail.projectId})
                    </span>
                  </h2>
                  <p className="text-xs text-gray-400">
                    Partner: {selectedProjectForDetail.externalEntity || 'Direct'} • Category: {selectedProjectForDetail.category}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedProjectForDetail(null);
                  setProjectDetailData(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* As-Of Date & Overdue Status Banner */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-900/90 border border-gray-800 flex-wrap gap-2">
                <span className="text-gray-400">
                  হিসাবকাল (Calculation As Of):{' '}
                  <span className="font-mono text-emerald-400 font-semibold">
                    {selectedProjectForDetail.calculation?.asOfDate || new Date().toISOString().split('T')[0]}
                  </span>
                </span>
                {selectedProjectForDetail.calculation?.isOverdue && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    মেয়াদোত্তীর্ণ: {selectedProjectForDetail.calculation?.overdueDays} দিন (লাভ গণনা চলমান)
                  </span>
                )}
              </div>

              {/* 6 Key Financial Dimensions (Principal vs Profit Strictly Separated) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">মূল বিনিয়োগ (Original Principal)</span>
                  <span className="text-base font-bold text-white">
                    BDT {(selectedProjectForDetail.totalFunded || selectedProjectForDetail.targetPrincipal).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">ফেরত মূলধন (Principal Returned)</span>
                  <span className="text-base font-bold text-purple-400">
                    BDT {(selectedProjectForDetail.calculation?.totalPrincipalReturned ?? selectedProjectForDetail.metrics.totalPrincipalReturned).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">বাকি মূলধন (Outstanding Principal)</span>
                  <span className={`text-base font-bold ${(selectedProjectForDetail.calculation?.outstandingPrincipal ?? selectedProjectForDetail.metrics.netOutstandingCapital) > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                    BDT {(selectedProjectForDetail.calculation?.outstandingPrincipal ?? selectedProjectForDetail.metrics.netOutstandingCapital).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">অর্জিত সম্ভাব্য লাভ (Expected Accrued)</span>
                  <span className="text-base font-bold text-purple-300">
                    BDT {(selectedProjectForDetail.calculation?.expectedProfitAccrued ?? 0).toLocaleString()}
                  </span>
                  <span className="text-[10px] text-gray-500 block">
                    ROI: {selectedProjectForDetail.expectedAnnualRoiPercent ?? selectedProjectForDetail.expectedROI ?? 0}% বাৎসরিক
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">প্রকৃত প্রাপ্ত লাভ (Actual Profit Returned)</span>
                  <span className="text-base font-bold text-emerald-400">
                    +BDT {(selectedProjectForDetail.calculation?.actualProfitReturned ?? selectedProjectForDetail.metrics.totalProfitRealized).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">বাকি সম্ভাব্য লাভ (Profit Outstanding)</span>
                  <span className="text-base font-bold text-indigo-300">
                    BDT {(selectedProjectForDetail.calculation?.expectedProfitOutstanding ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Time-Segmented Profit Calculation Table */}
              {selectedProjectForDetail.calculation?.segments && selectedProjectForDetail.calculation.segments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    টাইম-সেগমেন্ট ভিত্তিক লাভ হিসাব (Date-Sensitive Segmented Profit Calculation)
                  </h3>
                  <div className="border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">পর্ব #</th>
                          <th className="py-2.5 px-3">সময়কাল (তারিখ হতে - পর্যন্ত)</th>
                          <th className="py-2.5 px-3">দিন</th>
                          <th className="py-2.5 px-3">কার্যকরী মূলধন</th>
                          <th className="py-2.5 px-3">বাৎসরিক ROI</th>
                          <th className="py-2.5 px-3">অর্জিত লাভ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {selectedProjectForDetail.calculation.segments.map((s) => (
                          <tr key={s.segmentIndex} className="hover:bg-gray-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">#{s.segmentIndex}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-300">
                              {s.startDate} → {s.endDate}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-white">{s.days} দিন</td>
                            <td className="py-2.5 px-3 font-semibold text-amber-300">
                              BDT {s.principal.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-indigo-400">{s.annualRoiPercent}%</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-400">
                              BDT {s.segmentProfit.toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Funding Contributions Breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
                  বহু-হিসাবরক্ষক অর্থায়ন ইতিহাস (Multi-Accountant Investment Contributions)
                </h3>

                {projectDetailData?.fundings && projectDetailData.fundings.length > 0 ? (
                  <div className="border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">তারিখ</th>
                          <th className="py-2.5 px-3">জিম্মা হিসাব (Custody Account)</th>
                          <th className="py-2.5 px-3">পরিমাণ</th>
                          <th className="py-2.5 px-3">অর্থায়নকারী</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {projectDetailData.fundings.map((f) => (
                          <tr key={f._id} className="hover:bg-gray-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">
                              {new Date(f.date).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-white">
                              {f.custodyAccountId?.name} ({f.custodyAccountId?.channel})
                            </td>
                            <td className="py-2.5 px-3 font-bold text-emerald-400">
                              BDT {f.amount.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-gray-400">
                              {f.custodyAccountId?.holderId?.name || f.fundedBy?.name || 'Accountant'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 italic p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                    এখনো কোনো অর্থায়ন রেকর্ড করা হয়নি (No investment fundings recorded yet).
                  </p>
                )}
              </div>

              {/* Returns History Breakdown */}
              <div>
                <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
                  মেয়াদপূর্তি ও ফেরত লেনদেন ইতিহাস (Maturity & Returns History)
                </h3>

                {projectDetailData?.returns && projectDetailData.returns.length > 0 ? (
                  <div className="border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">তারিখ</th>
                          <th className="py-2.5 px-3">ফেরত মূলধন</th>
                          <th className="py-2.5 px-3">প্রাপ্ত লাভ</th>
                          <th className="py-2.5 px-3">মোট ফেরত</th>
                          <th className="py-2.5 px-3">গন্তব্য</th>
                          <th className="py-2.5 px-3">রেফারেন্স</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {projectDetailData.returns.map((r) => (
                          <tr key={r._id} className="hover:bg-gray-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">
                              {new Date(r.maturityDate).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-white">
                              BDT {r.principalReturned.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-emerald-400">
                              +BDT {r.actualProfit.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-purple-400">
                              BDT {r.totalReturn.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-gray-300">
                              {r.destinationType === 'PROJECT_WALLET'
                                ? 'প্রকল্প ওয়ালেট (Project Wallet)'
                                : r.destinationCustodyAccountId?.name || r.destinationType}
                            </td>
                            <td className="py-2.5 px-3 text-gray-400 font-mono">
                              {r.transactionRef || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 italic p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                    এখনো কোনো ফেরত জমা হয়নি (No returns realized yet).
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-900/50 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => {
                  setSelectedProjectForDetail(null);
                  setProjectDetailData(null);
                }}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestmentsPage;
