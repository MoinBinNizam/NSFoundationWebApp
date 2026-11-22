import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { groupCustodyAccounts } from '../utils/custodyUtils';
import { ModuleGuide } from '../components/ModuleGuide';
import { TableScrollControls } from '../components/TableScrollControls';
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
  Wallet,
  FileSpreadsheet,
  Receipt,
  Coins,
  Clock,
  Table,
  LayoutGrid,
  Check,
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
  walletReinvestedAmount?: number;
  accountantFundedAmount?: number;
  withdrawalRequestedAmount?: number;
  withdrawalRequestedDate?: string;
  withdrawalNotes?: string;
  fundingSourceType?: 'ACCOUNTANT' | 'REINVESTMENT' | 'MIXED';
  totalExpectedReturn?: number;
  remainingDue?: number;
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
  walletReinvestedAmount?: number;
  accountantFundedAmount?: number;
  withdrawalRequestedAmount?: number;
  withdrawalRequestedDate?: string;
  withdrawalNotes?: string;
  status:
    | 'PROPOSED'
    | 'ACTIVE'
    | 'MATURED'
    | 'CLOSED'
    | 'DEFAULTED'
    | 'DURATION_COMPLETED'
    | 'PRINCIPAL_PARTIALLY_RETURNED'
    | 'OVERDUE_PRINCIPAL'
    | 'WITHDRAWAL_REQUESTED'
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
  installmentNumber?: number;
  batchTitle?: string;
  maturityDate: string;
  principalReturned: number;
  actualProfit: number;
  actualLoss: number;
  totalReturn: number;
  senderName?: string;
  paymentMethod?: string;
  receiverId?: {
    _id: string;
    name: string;
    email: string;
    role: string;
    accountantType?: string;
  };
  remainingDueAfter?: number;
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

interface OrganizationItem {
  name: string;
  projectCount: number;
  activeCount: number;
  maturedCount: number;
  withdrawalRequestedCount: number;
  totalInvested: number;
  walletReinvested: number;
  accountantFunded: number;
  totalReturned: number;
  actualProfitReturned: number;
  activeDeployedCapital: number;
  remainingDue: number;
  withdrawalRequestedAmount: number;
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
  const { t, language } = usePreferences();
  const isAccountant =
    user?.role === 'ADMIN' ||
    user?.role === 'SUPER_ADMIN' ||
    user?.role === 'ACCOUNTANT' ||
    user?.role === 'INVESTMENT_MANAGER';

  // View Mode: 'table' (Excel-style spreadsheet layout, DEFAULT) or 'cards' (Grid layout)
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    return (localStorage.getItem('ns_investments_view_mode') as 'table' | 'cards') || 'table';
  });

  const handleViewModeChange = (mode: 'table' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem('ns_investments_view_mode', mode);
  };

  // Selected project for functional actions toolbar
  const [selectedProject, setSelectedProject] = useState<InvestmentProjectItem | null>(null);

  // Localization Helpers
  const formatMoney = useCallback(
    (amount: number | undefined | null) => {
      const val = Math.round(Number(amount) || 0);
      return language === 'bn' ? `৳ ${val.toLocaleString('en-US')}` : `BDT ${val.toLocaleString('en-US')}`;
    },
    [language]
  );

  const formatDate = useCallback(
    (dateStr?: string) => {
      if (!dateStr) return '—';
      try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      } catch {
        return dateStr;
      }
    },
    [language]
  );

  const getStatusBadge = useCallback(
    (status: string, isOverdue?: boolean) => {
      if (isOverdue) {
        return {
          label: t('Overdue (Interest Accruing)'),
          style: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
        };
      }
      switch (status) {
        case 'WITHDRAWAL_REQUESTED':
          return { label: t('Withdrawal Requested'), style: 'bg-purple-500/20 text-purple-300 border-purple-500/40' };
        case 'MATURED':
          return { label: t('Matured'), style: 'bg-blue-500/20 text-blue-300 border-blue-500/30' };
        case 'ACTIVE':
          return { label: t('Running / Active'), style: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
        case 'PRINCIPAL_PARTIALLY_RETURNED':
          return { label: t('Partially Returned'), style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };
        case 'OVERDUE_PRINCIPAL':
          return { label: t('Overdue Principal'), style: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
        case 'FULLY_SETTLED':
          return { label: t('Fully Settled'), style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
        case 'PROPOSED':
          return { label: t('Proposed'), style: 'bg-amber-500/10 text-amber-300 border-amber-500/20' };
        case 'CLOSED':
          return { label: t('Closed'), style: 'bg-gray-800 text-gray-400 border-gray-700' };
        default:
          return { label: t(status), style: 'bg-gray-800 text-gray-300 border-gray-700' };
      }
    },
    [t]
  );

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'portfolio' | 'fundings' | 'returns'>('portfolio');

  // Core Data States
  const [stats, setStats] = useState<InvestmentStats | null>(null);
  const [projects, setProjects] = useState<InvestmentProjectItem[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccountOption[]>([]);
  const groupedCustody = useMemo(() => groupCustodyAccounts(custodyAccounts), [custodyAccounts]);

  // Search & Scroll States (Server-Side)
  const [page, setPage] = useState(1);
  const [limit] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const portfolioTableRef = useRef<HTMLDivElement>(null);

  // Loading and Alert States
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Organizations State
  const [organizations, setOrganizations] = useState<OrganizationItem[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFundModal, setShowFundModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
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

  // Form States: Installment Return
  const [installmentForm, setInstallmentForm] = useState({
    projectId: '',
    installmentNumber: '',
    batchTitle: '',
    date: new Date().toISOString().split('T')[0],
    amount: '',
    principalReturned: '',
    actualProfit: '',
    actualLoss: '0',
    paymentMethod: 'BANK_TRANSFER',
    senderName: '',
    receiverId: '',
    destinationCustodyAccountId: '',
    notes: '',
  });

  // Form States: Full / Partial Withdrawal Request (e.g. Zayn Farm ৳256,490)
  const [withdrawalForm, setWithdrawalForm] = useState({
    projectId: '',
    orgName: 'Zayn Farm',
    amount: '256490',
    date: new Date().toISOString().split('T')[0],
    notes: 'Requested full withdrawal from Zayn Farm (principal + profit) for reinvestment into new projects.',
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
    async (p: number, search: string, status: string, cat: string, org: string) => {
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
        if (org) {
          params.append('org', org);
          params.append('externalEntity', org);
        }
        params.append('page', String(p || 1));
        params.append('limit', '0');

        const res = await apiRequest<InvestmentProjectItem[]>(
          `/investments/projects?${params.toString()}`,
          { signal: controller.signal }
        );

        setProjects(res.data || []);
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

  // Fetch Stats, Custody Accounts, and Organizations
  const fetchOverviewData = useCallback(async () => {
    try {
      const [statsRes, accRes, orgRes] = await Promise.all([
        apiRequest<InvestmentStats>('/investments/stats'),
        apiRequest<CustodyAccountOption[]>('/custody/accounts?isActive=true'),
        apiRequest<OrganizationItem[]>('/investments/organizations'),
      ]);
      setStats(statsRes.data);
      setCustodyAccounts(accRes.data);
      setOrganizations(orgRes.data || []);
    } catch (err: unknown) {
      console.error('Failed to load investment stats/accounts:', err);
    }
  }, []);

  // Debounced search effect (400ms interval)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      fetchProjects(1, searchFilter, statusFilter, categoryFilter, orgFilter);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchFilter, statusFilter, categoryFilter, orgFilter, fetchProjects]);

  useEffect(() => {
    fetchOverviewData();
  }, [fetchOverviewData]);

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
      fetchProjects(1, searchFilter, statusFilter, categoryFilter, orgFilter);
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

      fetchProjects(page, searchFilter, statusFilter, categoryFilter, orgFilter);
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
    if (!reinvestForm.destinationProjectId || !reinvestForm.walletAccountId) {
      setErrorMessage(t('Please select destination project and wallet account'));
      return;
    }

    const reinvestAmount = parseFloat(reinvestForm.reinvestedAmount);
    if (!reinvestAmount || reinvestAmount <= 0) {
      setErrorMessage(t('Reinvestment amount must be greater than 0'));
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      await apiRequest('/investments/reinvest', {
        method: 'POST',
        body: JSON.stringify({
          sourceProjectId: reinvestForm.sourceProjectId || undefined,
          destinationProjectId: reinvestForm.destinationProjectId,
          walletAccountId: reinvestForm.walletAccountId,
          reinvestedAmount: reinvestAmount,
          newAccountantFunds: reinvestForm.newAccountantFunds ? parseFloat(reinvestForm.newAccountantFunds) : 0,
          newAccountantCustodyAccountId: reinvestForm.newAccountantCustodyAccountId || undefined,
          date: reinvestForm.date,
          notes: reinvestForm.notes,
        }),
      });

      setSuccessMessage(t('Wallet proceeds successfully reinvested into new project!'));
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

  // Handle One-Click Authoritative Sync from Excel
  const handleSyncAuthoritativeExcel = async () => {
    if (
      !window.confirm(
        'Are you sure you want to synchronize all 20 real investment projects from NS Foundation Investments.xlsx?\n\nThis will synchronize:\n- 20 authoritative projects with exact capital and ROIs\n- 5 Hungry Birds installment return batches (Due: ৳52,700)\n- Full withdrawal request for Zayn Farm (৳256,490)\n- Balanced custody movements & cached balances'
      )
    ) {
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await apiRequest<{ message: string }>('/investments/sync-from-excel', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
      });
      setSuccessMessage(res.data?.message || 'Successfully synchronized authoritative investments from Excel!');
      await fetchOverviewData();
      await fetchProjects(1, searchFilter, statusFilter, categoryFilter, orgFilter);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to sync investments from Excel');
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-split installment between remaining principal and profit
  const handleAutoSplitInstallment = () => {
    const cur = projects.find((p) => p._id === installmentForm.projectId) || selectedProjectForDetail;
    const curOutstanding = cur?.calculation?.outstandingPrincipal ?? cur?.metrics?.netOutstandingCapital ?? 0;
    const amt = parseFloat(installmentForm.amount) || 0;
    if (amt <= 0) return;
    if (amt <= curOutstanding) {
      setInstallmentForm((prev) => ({
        ...prev,
        principalReturned: String(amt),
        actualProfit: '0',
      }));
    } else {
      setInstallmentForm((prev) => ({
        ...prev,
        principalReturned: String(curOutstanding),
        actualProfit: String(Math.round((amt - curOutstanding) * 100) / 100),
      }));
    }
  };

  // Handle Record Installment Return
  const handleRecordInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!installmentForm.projectId) {
      setErrorMessage('Please select a project');
      return;
    }
    const amt = parseFloat(installmentForm.amount);
    if (!amt || amt <= 0) {
      setErrorMessage('Please enter a valid installment amount');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const pReturned = installmentForm.principalReturned !== '' ? parseFloat(installmentForm.principalReturned) : undefined;
      const profit = installmentForm.actualProfit !== '' ? parseFloat(installmentForm.actualProfit) : undefined;

      const res = await apiRequest<{ message: string }>(`/investments/projects/${installmentForm.projectId}/installments`, {
        method: 'POST',
        body: JSON.stringify({
          installmentNumber: installmentForm.installmentNumber ? parseInt(installmentForm.installmentNumber) : undefined,
          batchTitle: installmentForm.batchTitle || undefined,
          date: installmentForm.date,
          amount: amt,
          principalReturned: pReturned,
          actualProfit: profit,
          actualLoss: parseFloat(installmentForm.actualLoss) || 0,
          paymentMethod: installmentForm.paymentMethod,
          senderName: installmentForm.senderName || undefined,
          receiverId: installmentForm.receiverId || undefined,
          destinationCustodyAccountId: installmentForm.destinationCustodyAccountId || undefined,
          notes: installmentForm.notes || undefined,
        }),
      });

      setSuccessMessage(res.data?.message || 'Installment return recorded successfully & custody accounts updated!');
      setShowInstallmentModal(false);
      setInstallmentForm({
        projectId: '',
        installmentNumber: '',
        batchTitle: '',
        date: new Date().toISOString().split('T')[0],
        amount: '',
        principalReturned: '',
        actualProfit: '',
        actualLoss: '0',
        paymentMethod: 'BANK_TRANSFER',
        senderName: '',
        receiverId: '',
        destinationCustodyAccountId: '',
        notes: '',
      });

      await fetchOverviewData();
      await fetchProjects(page, searchFilter, statusFilter, categoryFilter, orgFilter);
      if (selectedProjectForDetail) {
        openProjectDrillDown(selectedProjectForDetail);
      }
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to record installment');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Request Withdrawal
  const handleRequestWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(withdrawalForm.amount);
    if (!amt || amt <= 0) {
      setErrorMessage('Please enter a valid withdrawal amount');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await apiRequest<{ message: string }>('/investments/withdrawal-request', {
        method: 'POST',
        body: JSON.stringify({
          projectId: withdrawalForm.projectId || undefined,
          orgName: withdrawalForm.orgName || undefined,
          amount: amt,
          date: withdrawalForm.date,
          notes: withdrawalForm.notes,
        }),
      });

      setSuccessMessage(res.data?.message || `Withdrawal request of ৳${amt.toLocaleString()} recorded successfully!`);
      setShowWithdrawalModal(false);
      await fetchOverviewData();
      await fetchProjects(page, searchFilter, statusFilter, categoryFilter, orgFilter);
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to submit withdrawal request');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <ModuleGuide moduleKey="INVESTMENTS" defaultOpen={false} />

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
            onClick={() => {
              fetchOverviewData();
              fetchProjects(1, searchFilter, statusFilter, categoryFilter, orgFilter);
            }}
            disabled={loading}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700 flex items-center gap-1.5"
            title={t('Refresh')}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </button>

          {isAccountant && (
            <>
              {/* One-Click Sync from Excel Button */}
              <button
                onClick={handleSyncAuthoritativeExcel}
                disabled={actionLoading}
                className="px-3.5 py-2 bg-emerald-700/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg text-sm font-medium transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                title={t('Synchronize all 20 real projects from NS Foundation Investments.xlsx')}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                {t('Sync Excel (20 Projects)')}
              </button>

              {/* Record Installment Return Button */}
              <button
                onClick={() => {
                  setInstallmentForm({
                    projectId: projects.find((p) => p.status === 'ACTIVE' || p.projectId === 'PRJ-2024-5')?._id || (projects[0]?._id || ''),
                    installmentNumber: '',
                    batchTitle: '',
                    date: new Date().toISOString().split('T')[0],
                    amount: '',
                    principalReturned: '',
                    actualProfit: '',
                    actualLoss: '0',
                    paymentMethod: 'BANK_TRANSFER',
                    senderName: '',
                    receiverId: '',
                    destinationCustodyAccountId: '',
                    notes: '',
                  });
                  setShowInstallmentModal(true);
                }}
                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-sm font-medium transition-all shadow-lg shadow-amber-900/20 flex items-center gap-2"
              >
                <Receipt className="w-4 h-4 text-amber-400" />
                {t('Record Installment')}
              </button>

              {/* Request Withdrawal Button */}
              <button
                onClick={() => {
                  setWithdrawalForm({
                    projectId: '',
                    orgName: 'Zayn Farm',
                    amount: '256490',
                    date: new Date().toISOString().split('T')[0],
                    notes: 'Requested full withdrawal of BDT 256,490 (all past principal + accumulated profits) from Zayn Farm.',
                  });
                  setShowWithdrawalModal(true);
                }}
                className="px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
                title={t('Request project or organization withdrawal (e.g. Zayn Farm ৳256,490)')}
              >
                <Clock className="w-4 h-4 text-purple-400" />
                {t('Request Withdrawal')}
              </button>

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
              {t('Liquidated & returned to custody')}
            </div>
          </div>

          {/* Net Realized Profit & ROI */}
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                {t('Realized Profit / ROI')}
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

      {/* Zayn Farm Full Withdrawal Alert Banner */}
      {organizations.some((o) => (o.withdrawalRequestedAmount || 0) > 0) && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-purple-950/40 via-[#1a1329] to-rose-950/30 border border-purple-500/40 shadow-lg relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shrink-0 text-purple-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-white text-base">
                    {t('Zayn Farm Full Withdrawal Requested')}: {formatMoney(256490)}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                    {t('Status: Withdrawal Requested')}
                  </span>
                </div>
                <p className="text-xs text-gray-300 mt-1">
                  {t('NS Foundation has requested full liquidation of BDT 256,490 (all past invested principal and accumulated profit) from Zayn Farm across projects Land Trading -4, Land Trading -6, and Integrated Agro. Upon receipt, these funds will be deposited into custody accounts and deployed into new organizations and projects.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setWithdrawalForm({
                    projectId: '',
                    orgName: 'Zayn Farm',
                    amount: '256490',
                    date: new Date().toISOString().split('T')[0],
                    notes: 'Full withdrawal request of BDT 256,490 from Zayn Farm.',
                  });
                  setShowWithdrawalModal(true);
                }}
                className="px-3.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/40 text-purple-200 border border-purple-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Receipt className="w-3.5 h-3.5 text-purple-300" />
                {t('Manage Withdrawal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Partner Organizations Overview Shelf */}
      {organizations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              {t('Partner Organizations Overview')}
            </h2>
            <span className="text-xs text-gray-500">
              {organizations.length} {t('Organizations')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {organizations.map((org) => {
              const isSelected = orgFilter.toLowerCase() === org.name.toLowerCase();
              return (
                <div
                  key={org.name}
                  onClick={() => setOrgFilter(isSelected ? '' : org.name)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-950/30 border-emerald-500/60 ring-2 ring-emerald-500/30'
                      : 'bg-[#111827] border-white/10 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm flex items-center gap-1.5">
                      <Building2 className="w-4 h-4 text-emerald-400" />
                      {org.name}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                      {org.projectCount} {t('Projects')}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-gray-800 text-xs">
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-semibold">
                        {t('Capital Invested')}
                      </span>
                      <span className="font-bold text-white font-mono">{formatMoney(org.totalInvested)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-semibold">
                        {t('Returned / Dividends')}
                      </span>
                      <span className="font-bold text-purple-300 font-mono">{formatMoney(org.totalReturned)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-semibold">
                        {t('Wallet Reinvest')}
                      </span>
                      <span className="font-semibold text-emerald-400 font-mono">{formatMoney(org.walletReinvested)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[10px] uppercase font-semibold">
                        {t('Remaining Due')}
                      </span>
                      <span className={`font-bold font-mono ${org.remainingDue > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {formatMoney(org.remainingDue)}
                      </span>
                    </div>
                  </div>

                  {org.withdrawalRequestedAmount > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-purple-500/20 flex items-center justify-between text-[11px] text-purple-300 font-medium">
                      <span>{t('Withdrawal Requested:')}</span>
                      <span className="font-bold font-mono">{formatMoney(org.withdrawalRequestedAmount)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tabs Bar & Layout Switcher */}
      <div className="border-b border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
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
            {t('Projects Portfolio')} ({projects.length})
          </button>
        </div>

        {/* View Mode Toggle & Horizontal Scroll Controls */}
        <div className="flex items-center gap-2.5">
          {viewMode === 'table' && (
            <TableScrollControls containerRef={portfolioTableRef} />
          )}
          <div className="flex items-center gap-1.5 p-1 bg-gray-900 border border-gray-800 rounded-lg">
            <button
              type="button"
              onClick={() => handleViewModeChange('table')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'table'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
              title={t('Spreadsheet Layout')}
            >
              <Table className="w-3.5 h-3.5" />
              {t('Table View')}
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange('cards')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
                viewMode === 'cards'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
              }`}
              title={t('Cards Layout')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              {t('Grid View')}
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder={t('Search project, invoice, org...')}
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
              <option value="ACTIVE">{t('Running / Active')}</option>
              <option value="WITHDRAWAL_REQUESTED">{t('Withdrawal Requested')}</option>
              <option value="MATURED">{t('Matured')}</option>
              <option value="PRINCIPAL_PARTIALLY_RETURNED">{t('Partially Returned')}</option>
              <option value="OVERDUE_PRINCIPAL">{t('Overdue Principal')}</option>
              <option value="FULLY_SETTLED">{t('Fully Settled')}</option>
              <option value="PROPOSED">{t('Proposed')}</option>
              <option value="CLOSED">{t('Closed')}</option>
            </select>
          </div>

          {/* Organization Filter */}
          <div>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t('All Organizations')}</option>
              {organizations.map((org) => (
                <option key={org.name} value={org.name}>
                  {org.name} ({org.projectCount})
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t('All Categories')}</option>
              <option value="Agro">{t('Agriculture / Agro')}</option>
              <option value="Land Trading">{t('Agro / Land Trading')}</option>
              <option value="Livestock">{t('Livestock')}</option>
              <option value="Fisheries">{t('Fisheries')}</option>
              <option value="Trade">{t('Trade / Restaurant')}</option>
            </select>
          </div>

          {/* Reset button */}
          <div className="flex items-center">
            {(searchFilter || statusFilter || categoryFilter || orgFilter) ? (
              <button
                onClick={() => {
                  setSearchFilter('');
                  setStatusFilter('');
                  setCategoryFilter('');
                  setOrgFilter('');
                }}
                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" />
                {t('Reset Filters')}
              </button>
            ) : (
              <span className="text-xs text-gray-500">
                {projects.length} {t('projects shown')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active Project Functional Actions Bar (Appears when any project is clicked) */}
      {selectedProject && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/70 via-gray-900 to-[#12231c] border-2 border-emerald-500/60 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {t('Selected Project')}:
                </span>
                <span className="font-bold text-white text-base">
                  {selectedProject.name}
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  {selectedProject.projectId}
                </span>
                {selectedProject.invoiceNo && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    {t('Invoice')}: {selectedProject.invoiceNo}
                  </span>
                )}
                {selectedProject.externalEntity && (
                  <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {selectedProject.externalEntity}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-300 mt-1 flex items-center gap-3 flex-wrap">
                <span>{t('Total Invested')}: <strong className="text-white font-mono">{formatMoney(selectedProject.totalFunded || selectedProject.targetPrincipal)}</strong></span>
                <span>•</span>
                <span>{t('Remaining Due')}: <strong className={(selectedProject.metrics.remainingDue ?? 0) > 0 ? 'text-amber-400 font-mono' : 'text-emerald-400 font-mono'}>{formatMoney(selectedProject.metrics.remainingDue ?? 0)}</strong></span>
                <span>•</span>
                <span>{t('Status')}: <strong className="text-gray-200">{getStatusBadge(selectedProject.status, selectedProject.calculation?.isOverdue).label}</strong></span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={() => openProjectDrillDown(selectedProject)}
              className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
              title={t('Details')}
            >
              <Eye className="w-4 h-4 text-blue-400" />
              {t('Details')}
            </button>

            {isAccountant && selectedProject.status !== 'CLOSED' && selectedProject.status !== 'FULLY_SETTLED' && (
              <>
                <button
                  onClick={() => {
                    setInstallmentForm({
                      projectId: selectedProject._id,
                      installmentNumber: '',
                      batchTitle: '',
                      date: new Date().toISOString().split('T')[0],
                      amount: '',
                      principalReturned: '',
                      actualProfit: '',
                      actualLoss: '0',
                      paymentMethod: 'BANK_TRANSFER',
                      senderName: selectedProject.projectId === 'PRJ-2024-5' ? 'Abu Bakar Rohan' : '',
                      receiverId: '',
                      destinationCustodyAccountId: '',
                      notes: '',
                    });
                    setShowInstallmentModal(true);
                  }}
                  className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                  title={t('Record Installment')}
                >
                  <Receipt className="w-4 h-4 text-amber-400" />
                  {t('Record Installment')}
                </button>

                <button
                  onClick={() => {
                    setFundForm({
                      projectId: selectedProject._id,
                      date: new Date().toISOString().split('T')[0],
                      fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
                    });
                    setShowFundModal(true);
                  }}
                  className="px-3.5 py-2 bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                  title={t('Fund Project')}
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  {t('Fund Project')}
                </button>

                <button
                  onClick={() => {
                    const outstanding = selectedProject.calculation?.outstandingPrincipal ?? selectedProject.metrics.netOutstandingCapital ?? 0;
                    setReturnForm({
                      projectId: selectedProject._id,
                      maturityDate: new Date().toISOString().split('T')[0],
                      principalReturned: outstanding.toString(),
                      actualProfit: '',
                      actualLoss: '0',
                      destinationType: 'ACCOUNTANT_CUSTODY',
                      destinationCustodyAccountId: '',
                      notes: '',
                      transactionRef: '',
                    });
                    setShowReturnModal(true);
                  }}
                  className="px-3.5 py-2 bg-purple-600/25 hover:bg-purple-600/35 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 shadow-sm"
                  title={t('Record Return')}
                >
                  <ArrowUpRight className="w-4 h-4 text-purple-400" />
                  {t('Record Return')}
                </button>
              </>
            )}

            {(selectedProject.status === 'WITHDRAWAL_REQUESTED' || selectedProject.externalEntity === 'Zayn Farm') && (
              <button
                onClick={() => {
                  setWithdrawalForm({
                    projectId: selectedProject._id,
                    orgName: selectedProject.externalEntity || 'Zayn Farm',
                    amount: String(selectedProject.withdrawalRequestedAmount || 256490),
                    date: new Date().toISOString().split('T')[0],
                    notes: `Full withdrawal request for ${selectedProject.name}`,
                  });
                  setShowWithdrawalModal(true);
                }}
                className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border border-purple-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <Clock className="w-4 h-4 text-purple-300" />
                {t('Manage Withdrawal')}
              </button>
            )}

            <button
              onClick={() => setSelectedProject(null)}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors ml-1"
              title={t('Clear Selection')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Projects Data Container */}
      {loading ? (
        <div className="py-12 text-center text-gray-400 flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
          {t('Loading investment projects...')}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-[#111827] border border-white/10 rounded-xl p-8 text-center text-gray-400">
          {t('No investment projects found.')}
        </div>
      ) : (
        <>
          {/* =========================================================================
              LAYOUT 1: SPREADSHEET TABLE VIEW (DEFAULT - Mirrors NS Foundation Investments.xlsx)
              ========================================================================= */}
          {viewMode === 'table' ? (
            <div ref={portfolioTableRef} className="overflow-x-auto rounded-xl border border-gray-800 bg-[#111827] shadow-xl max-h-[70vh] overflow-y-auto overscroll-contain">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#172033] text-gray-300 font-semibold uppercase tracking-wider text-[11px] border-b border-gray-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3 w-12 text-center">{t('SL')}</th>
                    <th className="py-3 px-4 min-w-[220px]">{t('Project Name')} &amp; {t('Invoice')}</th>
                    <th className="py-3 px-3">{t('Org')}</th>
                    <th className="py-3 px-3.5 text-right">{t('Total Invested')}</th>
                    <th className="py-3 px-3.5">{t('Paid By / Source')}</th>
                    <th className="py-3 px-3">{t('Duration')}</th>
                    <th className="py-3 px-3">{t('Timeline')}</th>
                    <th className="py-3 px-3 text-right">{t('Expected ROI')}</th>
                    <th className="py-3 px-3 text-right">{t('Actual ROI Received')}</th>
                    <th className="py-3 px-3.5 text-right">{t('Remaining Due')}</th>
                    <th className="py-3 px-3 text-center">{t('Status')}</th>
                    <th className="py-3 px-4 text-center sticky right-0 bg-[#172033] shadow-l">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {projects.map((prj, idx) => {
                    const isSelected = selectedProject?._id === prj._id;
                    const calc = prj.calculation;
                    const m = prj.metrics;
                    const outstanding = calc?.outstandingPrincipal ?? m.netOutstandingCapital ?? 0;
                    const remainingDue = m.remainingDue ?? outstanding;
                    const expectedRoi = prj.expectedAnnualRoiPercent ?? prj.expectedROI ?? 0;
                    const isOverdue = calc?.isOverdue || prj.status === 'OVERDUE_PRINCIPAL';
                    const statusBadge = getStatusBadge(prj.status, isOverdue);

                    return (
                      <tr
                        key={prj._id}
                        onClick={() => setSelectedProject(isSelected ? null : prj)}
                        className={`transition-colors cursor-pointer group ${
                          isSelected
                            ? 'bg-emerald-950/45 ring-1 ring-emerald-500/60'
                            : 'hover:bg-gray-800/50 odd:bg-[#111827] even:bg-[#131c2e]/40'
                        }`}
                      >
                        {/* SL No */}
                        <td className="py-3 px-3 text-center font-mono text-gray-400">
                          {idx + 1}
                        </td>

                        {/* Project Name & Invoices */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-white group-hover:text-emerald-400 transition-colors flex items-center gap-1.5 flex-wrap">
                            <span>{prj.name}</span>
                            {prj.projectId === 'PRJ-2024-5' && (
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded font-normal">
                                🍽️ 5 {t('Batches')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-400 font-mono">
                            <span className="text-emerald-400 font-semibold">{prj.projectId}</span>
                            {prj.invoiceNo && (
                              <span>• {t('Invoice')}: <strong className="text-amber-300">{prj.invoiceNo}</strong></span>
                            )}
                            {prj.invoiceTo && (
                              <span>• {t('Invoice To')}: <strong className="text-gray-300">{prj.invoiceTo}</strong></span>
                            )}
                          </div>
                        </td>

                        {/* Org */}
                        <td className="py-3 px-3">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-800 text-gray-200 border border-gray-700">
                            {prj.externalEntity || 'Direct'}
                          </span>
                        </td>

                        {/* Total Invested */}
                        <td className="py-3 px-3.5 text-right font-bold font-mono text-white">
                          {formatMoney(prj.totalFunded || prj.targetPrincipal)}
                        </td>

                        {/* Paid By / Source */}
                        <td className="py-3 px-3.5">
                          <div className="flex flex-col gap-0.5 text-[11px]">
                            {m.fundingSourceType === 'REINVESTMENT' ? (
                              <span className="text-emerald-300 font-medium flex items-center gap-1">
                                <Wallet className="w-3 h-3 text-emerald-400 shrink-0" />
                                {t('Wallet Reinvest')}: {formatMoney(prj.walletReinvestedAmount || prj.totalFunded)}
                              </span>
                            ) : m.fundingSourceType === 'MIXED' ? (
                              <>
                                <span className="text-emerald-300 font-medium">
                                  {t('Wallet')}: {formatMoney(prj.walletReinvestedAmount || 0)}
                                </span>
                                <span className="text-indigo-300 font-medium">
                                  {t('Accountant')}: {formatMoney(prj.accountantFundedAmount || 0)}
                                </span>
                              </>
                            ) : (
                              <span className="text-blue-300 font-medium flex items-center gap-1">
                                <Coins className="w-3 h-3 text-blue-400 shrink-0" />
                                {t('Accountant')}: {formatMoney(prj.accountantFundedAmount || prj.totalFunded)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-3 text-gray-300">
                          {prj.plannedDuration || '—'}
                        </td>

                        {/* Timeline */}
                        <td className="py-3 px-3 text-gray-400 text-[11px] font-mono">
                          <div>{formatDate(prj.startDate)}</div>
                          {prj.maturityDate && <div className="text-gray-500">→ {formatDate(prj.maturityDate)}</div>}
                        </td>

                        {/* Expected ROI */}
                        <td className="py-3 px-3 text-right">
                          <span className="font-semibold text-indigo-300 font-mono">
                            {expectedRoi}% / {t('yearly')}
                          </span>
                          {(calc?.expectedProfitAccrued ?? 0) > 0 && (
                            <div className="text-[10px] text-purple-300 font-mono">
                              {formatMoney(calc?.expectedProfitAccrued ?? 0)}
                            </div>
                          )}
                        </td>

                        {/* Actual ROI Received */}
                        <td className="py-3 px-3 text-right font-bold font-mono text-emerald-400">
                          +{formatMoney(calc?.actualProfitReturned ?? m.totalProfitRealized ?? 0)}
                        </td>

                        {/* Remaining Due */}
                        <td className="py-3 px-3.5 text-right font-bold font-mono">
                          <span className={remainingDue > 0 ? 'text-amber-400' : 'text-emerald-400'}>
                            {formatMoney(remainingDue)}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusBadge.style}`}>
                            {statusBadge.label}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-center sticky right-0 bg-[#111827] group-hover:bg-[#172033] transition-colors shadow-l">
                          <div className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => openProjectDrillDown(prj)}
                              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
                              title={t('Details')}
                            >
                              <Eye className="w-4 h-4 text-blue-400" />
                            </button>

                            {isAccountant && prj.status !== 'CLOSED' && prj.status !== 'FULLY_SETTLED' && (
                              <>
                                <button
                                  onClick={() => {
                                    setInstallmentForm({
                                      projectId: prj._id,
                                      installmentNumber: '',
                                      batchTitle: '',
                                      date: new Date().toISOString().split('T')[0],
                                      amount: '',
                                      principalReturned: '',
                                      actualProfit: '',
                                      actualLoss: '0',
                                      paymentMethod: 'BANK_TRANSFER',
                                      senderName: prj.projectId === 'PRJ-2024-5' ? 'Abu Bakar Rohan' : '',
                                      receiverId: '',
                                      destinationCustodyAccountId: '',
                                      notes: '',
                                    });
                                    setShowInstallmentModal(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md transition-colors"
                                  title={t('Record Installment')}
                                >
                                  <Receipt className="w-4 h-4 text-amber-400" />
                                </button>

                                <button
                                  onClick={() => {
                                    setFundForm({
                                      projectId: prj._id,
                                      date: new Date().toISOString().split('T')[0],
                                      fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
                                    });
                                    setShowFundModal(true);
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors"
                                  title={t('Fund Project')}
                                >
                                  <Plus className="w-4 h-4 text-emerald-400" />
                                </button>

                                {(prj.totalFunded > 0 || prj.targetPrincipal > 0) && (
                                  <button
                                    onClick={() => {
                                      setReturnForm({
                                        projectId: prj._id,
                                        maturityDate: new Date().toISOString().split('T')[0],
                                        principalReturned: outstanding.toString(),
                                        actualProfit: '',
                                        actualLoss: '0',
                                        destinationType: 'ACCOUNTANT_CUSTODY',
                                        destinationCustodyAccountId: '',
                                        notes: '',
                                        transactionRef: '',
                                      });
                                      setShowReturnModal(true);
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-md transition-colors"
                                    title={t('Record Return')}
                                  >
                                    <ArrowUpRight className="w-4 h-4 text-purple-400" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* =========================================================================
                LAYOUT 2: CARDS GRID VIEW
                ========================================================================= */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 max-h-[75vh] overflow-y-auto overscroll-contain pr-1 custom-scrollbar">
              {projects.map((prj) => {
                const isSelected = selectedProject?._id === prj._id;
                const fundingPercent = Math.min(
                  100,
                  Math.round(((prj.totalFunded || 0) / (prj.targetPrincipal || 1)) * 100)
                );
                const m = prj.metrics;
                const calc = prj.calculation;
                const outstandingPrincipal = calc?.outstandingPrincipal ?? m.netOutstandingCapital ?? 0;
                const expectedRoi = prj.expectedAnnualRoiPercent ?? prj.expectedROI ?? 0;
                const isOverdue = calc?.isOverdue || prj.status === 'OVERDUE_PRINCIPAL' || prj.status === 'DURATION_COMPLETED';
                const statusBadge = getStatusBadge(prj.status, isOverdue);

                return (
                  <div
                    key={prj._id}
                    onClick={() => setSelectedProject(isSelected ? null : prj)}
                    className={`bg-[#111827] border rounded-xl p-5 transition-all flex flex-col justify-between shadow-sm group cursor-pointer ${
                      isSelected
                        ? 'border-emerald-500 ring-2 ring-emerald-500/60 bg-emerald-950/20 shadow-xl'
                        : isOverdue
                        ? 'border-amber-500/40 hover:border-amber-500/70'
                        : prj.status === 'FULLY_SETTLED'
                        ? 'border-emerald-500/30 hover:border-emerald-500/60'
                        : 'border-white/10 hover:border-emerald-500/40'
                    }`}
                  >
                    <div>
                      {/* Top Badges Header Bar: Project ID, Invoice, Org, Status, Funding Source side-by-side */}
                      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2.5 border-b border-gray-800/80">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm sm:text-base font-extrabold text-emerald-400 bg-emerald-500/15 px-2.5 py-1 rounded-lg border border-emerald-500/30 shadow-sm">
                            {prj.projectId}
                          </span>
                          {prj.invoiceNo && (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono shadow-sm">
                              {t('Invoice')}: {prj.invoiceNo}
                            </span>
                          )}
                          {prj.externalEntity && (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-blue-500/15 text-blue-300 border border-blue-500/30 shadow-sm">
                              {prj.externalEntity}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg border shadow-sm ${statusBadge.style}`}>
                            {statusBadge.label}
                          </span>

                          {m.fundingSourceType === 'REINVESTMENT' ? (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm">
                              <Wallet className="w-3.5 h-3.5" />
                              <span>{t('Wallet Reinvested')} ({formatMoney(prj.walletReinvestedAmount || prj.totalFunded)})</span>
                            </span>
                          ) : m.fundingSourceType === 'MIXED' ? (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 shadow-sm">
                              <Layers className="w-3.5 h-3.5" />
                              <span>{t('Mixed')}: {formatMoney(prj.walletReinvestedAmount || 0)} (W) + {formatMoney(prj.accountantFundedAmount || 0)} (Acc)</span>
                            </span>
                          ) : (
                            <span className="text-xs sm:text-sm font-bold px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 shadow-sm">
                              <Coins className="w-3.5 h-3.5" />
                              <span>{t('Accountant Funded')} ({formatMoney(prj.accountantFundedAmount || prj.totalFunded)})</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Hungry Birds Special Installments Banner */}
                      {prj.projectId === 'PRJ-2024-5' && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-amber-950/40 to-yellow-950/20 border border-amber-500/40 text-xs shadow-sm">
                          <div className="flex items-center justify-between text-amber-300 font-bold">
                            <span>🍽️ Hungry Birds (Max 18% ROI)</span>
                            <span className="font-mono text-[11px] bg-amber-500/20 px-1.5 py-0.5 rounded">5 {t('Batches Paid')}</span>
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-gray-300 pt-1.5 border-t border-amber-500/20">
                            <span>{t('Returned')}: <strong className="text-emerald-400 font-bold">{formatMoney(18100)}</strong> / {formatMoney(70800)}</span>
                            <span className="font-bold text-amber-400 font-mono text-xs">{t('Due')}: {formatMoney(52700)}</span>
                          </div>
                        </div>
                      )}

                      {/* Zayn Farm / Withdrawal Requested Banner */}
                      {(prj.status === 'WITHDRAWAL_REQUESTED' || (prj.withdrawalRequestedAmount && prj.withdrawalRequestedAmount > 0)) && (
                        <div className="mt-2.5 p-2.5 rounded-xl bg-gradient-to-r from-purple-950/40 to-indigo-950/20 border border-purple-500/40 text-xs shadow-sm">
                          <div className="flex items-center justify-between text-purple-300 font-bold">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {t('Full Withdrawal Requested')}
                            </span>
                            <span className="font-mono font-bold">{formatMoney(prj.withdrawalRequestedAmount || 256490)}</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {t('Capital & profit liquidation requested for reinvestment into new projects.')}
                          </p>
                        </div>
                      )}

                      {/* Overdue Warning Banner */}
                      {isOverdue && (
                        <div className="mt-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center gap-1.5 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          {t('Planned duration completed')} ({calc?.overdueDays || 0} {t('Days')}) • {t('profit accrual continuing on outstanding principal')}
                        </div>
                      )}

                      {/* Project Name */}
                      <div className="mt-3.5">
                        <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {prj.name}
                        </h3>
                        <p className="text-xs sm:text-sm text-gray-400 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span className="text-gray-300 font-semibold">{t('Category')}: {t(prj.category)}</span>
                          {prj.plannedDuration && (
                            <>
                              <span>•</span>
                              <span>{t('Duration')}: {prj.plannedDuration}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{t('Start')}: {formatDate(prj.startDate)}</span>
                        </p>
                      </div>

                      {/* Funding Progress */}
                      <div className="mt-3 pt-3 border-t border-gray-800">
                        <div className="flex justify-between items-baseline text-xs mb-1">
                          <span className="text-gray-400">{t('Original Principal')}:</span>
                          <span className="font-bold text-white font-mono">
                            {formatMoney(prj.totalFunded || prj.targetPrincipal)}
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

                      {/* Core Financial Dimensions Grid */}
                      <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-lg bg-gray-900/60 border border-gray-800/80 text-xs">
                        <div>
                          <span className="text-gray-500 block">{t('Target / Invested')}:</span>
                          <span className="font-semibold text-white font-mono">
                            {formatMoney(prj.totalFunded || prj.targetPrincipal)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">{t('Remaining Due')}:</span>
                          <span className={`font-bold font-mono ${(m.remainingDue ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {formatMoney(m.remainingDue ?? outstandingPrincipal)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">{t('Outstanding Principal')}:</span>
                          <span className={`font-semibold font-mono ${outstandingPrincipal > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                            {formatMoney(outstandingPrincipal)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">{t('Annual ROI')}:</span>
                          <span className="font-semibold text-indigo-400 font-mono">
                            {expectedRoi}% / {t('yearly')}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">{t('Expected Accrued Profit')}:</span>
                          <span className="font-semibold text-purple-300 font-mono">
                            {formatMoney(calc?.expectedProfitAccrued ?? 0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 block">{t('Actual Profit Returned')}:</span>
                          <span className="font-semibold text-emerald-400 font-mono">
                            +{formatMoney(calc?.actualProfitReturned ?? m.totalProfitRealized ?? 0)}
                          </span>
                        </div>
                      </div>

                      {/* Profit Outstanding */}
                      {(calc?.expectedProfitOutstanding ?? 0) > 0 && (
                        <div className="mt-2 text-[11px] text-gray-400 flex justify-between bg-purple-500/5 px-2 py-1 rounded border border-purple-500/10">
                          <span>{t('Outstanding Profit')}:</span>
                          <span className="font-semibold text-purple-300 font-mono">
                            {formatMoney(calc?.expectedProfitOutstanding ?? 0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="mt-4 pt-3 border-t border-gray-800" onClick={(e) => e.stopPropagation()}>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => openProjectDrillDown(prj)}
                          className={`${
                            isAccountant && prj.status !== 'CLOSED' && prj.status !== 'FULLY_SETTLED' ? '' : 'col-span-2'
                          } px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-700 flex items-center justify-center gap-1.5`}
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-400" />
                          <span>{t('Details')}</span>
                        </button>

                        {isAccountant && prj.status !== 'CLOSED' && prj.status !== 'FULLY_SETTLED' && (
                          <>
                            <button
                              onClick={() => {
                                setInstallmentForm({
                                  projectId: prj._id,
                                  installmentNumber: '',
                                  batchTitle: '',
                                  date: new Date().toISOString().split('T')[0],
                                  amount: '',
                                  principalReturned: '',
                                  actualProfit: '',
                                  actualLoss: '0',
                                  paymentMethod: 'BANK_TRANSFER',
                                  senderName: prj.projectId === 'PRJ-2024-5' ? 'Abu Bakar Rohan' : '',
                                  receiverId: '',
                                  destinationCustodyAccountId: '',
                                  notes: '',
                                });
                                setShowInstallmentModal(true);
                              }}
                              className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                              title={t('Record Installment Return')}
                            >
                              <Receipt className="w-3.5 h-3.5 text-amber-400" />
                              <span>{t('Installment')}</span>
                            </button>

                            <button
                              onClick={() => {
                                setFundForm({
                                  projectId: prj._id,
                                  date: new Date().toISOString().split('T')[0],
                                  fundings: [{ custodyAccountId: '', amount: '', notes: '' }],
                                });
                                setShowFundModal(true);
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                              title={t('Fund Project')}
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-400" />
                              <span>{t('Fund')}</span>
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
                                className="px-2.5 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                                title={t('Record Maturity Return')}
                              >
                                <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
                                <span>{t('Return')}</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                  <h2 className="text-lg font-bold text-white">{t('New Investment Project')}</h2>
                  <p className="text-xs text-gray-400">{t('Define pooled investment project & partner details')}</p>
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
                    {t('Project Name')} *
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
                    {t('Invoice No')}
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
                    {t('Partner / Entity')}
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
                    {t('Category')} *
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
                      <option value="Agriculture">{t('Agriculture')}</option>
                      <option value="Livestock">{t('Livestock')}</option>
                      <option value="Trading">{t('Trading')}</option>
                      <option value="Real Estate">{t('Real Estate')}</option>
                      <option value="Tech / Digital">{t('Tech / Digital')}</option>
                      <option value="Restaurant">{t('Restaurant')}</option>
                      <option value="Fisheries">{t('Fisheries')}</option>
                      <option value="General">{t('General')}</option>
                      <option value="__NEW__">+ {t('Add New Category')}</option>
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        placeholder={t('Enter new category name...')}
                        className="w-full bg-[#1F2937] border border-emerald-500 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setIsCustomCategory(false)}
                        className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg"
                        title={t('Select from existing list')}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Planned Duration')}
                  </label>
                  <input
                    type="text"
                    value={createForm.plannedDuration}
                    onChange={(e) => setCreateForm({ ...createForm, plannedDuration: e.target.value })}
                    placeholder={t('e.g. 6 Months')}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Target Principal (BDT)')} *
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
                    {t('Start Date')} *
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
                    {t('Planned End Date')}
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
                    {t('Expected Annual ROI (%)')}
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
                    {t('No initial funding attached yet. You can fund this project anytime later from one or multiple accountants.')}
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
                            <option value="">{t('Select accountant custody account...')}</option>
                            {groupedCustody.moin.length > 0 && (
                              <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                                {groupedCustody.moin.map((acc) => (
                                  <option key={acc._id} value={acc._id}>
                                    {acc.name} ({acc.channel}) — Available: BDT {acc.derivedBalance.toLocaleString()}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {groupedCustody.samrat.length > 0 && (
                              <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                                {groupedCustody.samrat.map((acc) => (
                                  <option key={acc._id} value={acc._id}>
                                    {acc.name} ({acc.channel}) — Available: BDT {acc.derivedBalance.toLocaleString()}
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            {groupedCustody.external.length > 0 && (
                              <optgroup label={`${t("Investment / Partner Wallets")} (${t("Subtotal")}: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                                {groupedCustody.external.map((acc) => (
                                  <option key={acc._id} value={acc._id}>
                                    {acc.name} ({acc.channel}) — Available: BDT {acc.derivedBalance.toLocaleString()}
                                  </option>
                                ))}
                              </optgroup>
                            )}
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
                  <h2 className="text-lg font-bold text-white">{t('Invest Capital into Project')}</h2>
                  <p className="text-xs text-gray-400">{t('Supply money from one or multiple accountant custodies')}</p>
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
                              {groupedCustody.moin.length > 0 && (
                                <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                                  {groupedCustody.moin.map((acc) => (
                                    <option key={acc._id} value={acc._id} disabled={acc.derivedBalance <= 0}>
                                      {acc.name} ({acc.channel}) — Avail: BDT {acc.derivedBalance.toLocaleString()}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {groupedCustody.samrat.length > 0 && (
                                <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                                  {groupedCustody.samrat.map((acc) => (
                                    <option key={acc._id} value={acc._id} disabled={acc.derivedBalance <= 0}>
                                      {acc.name} ({acc.channel}) — Avail: BDT {acc.derivedBalance.toLocaleString()}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {groupedCustody.external.length > 0 && (
                                <optgroup label={`${t("Investment / Partner Wallets")} (${t("Subtotal")}: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                                  {groupedCustody.external.map((acc) => (
                                    <option key={acc._id} value={acc._id} disabled={acc.derivedBalance <= 0}>
                                      {acc.name} ({acc.channel}) — Avail: BDT {acc.derivedBalance.toLocaleString()}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
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
                <span className="text-indigo-300 font-medium">{t('Total New Capital to Invest:')}</span>
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
                  <h2 className="text-lg font-bold text-white">{t('Record Maturity & Return')}</h2>
                  <p className="text-xs text-gray-400">{t('Realize principal, profit/loss, and deposit destination')}</p>
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
                <span className="text-purple-300 font-medium">{t('Total Cash/Proceeds Returned:')}</span>
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
                    {t('Return Destination')}
                  </label>
                  <select
                    value={returnForm.destinationType}
                    onChange={(e) => setReturnForm({ ...returnForm, destinationType: e.target.value as any, destinationCustodyAccountId: '' })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="ACCOUNTANT_CUSTODY">{t('Accountant Custody')}</option>
                    <option value="PROJECT_WALLET">{t('Project Wallet')}</option>
                    <option value="EXTERNAL_WALLET">{t('External Wallet')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Deposit Account')} {returnForm.destinationType === 'ACCOUNTANT_CUSTODY' && <span className="text-red-400">*</span>}
                  </label>
                  <select
                      value={returnForm.destinationCustodyAccountId}
                      onChange={(e) => setReturnForm({ ...returnForm, destinationCustodyAccountId: e.target.value })}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    >
                      <option value="">Select deposit account...</option>
                      {returnForm.destinationType === 'ACCOUNTANT_CUSTODY' && groupedCustody.moin.length > 0 && (
                        <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                          {groupedCustody.moin.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — {acc.holderId?.name || t("Moin's Custody")}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {returnForm.destinationType === 'ACCOUNTANT_CUSTODY' && groupedCustody.samrat.length > 0 && (
                        <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                          {groupedCustody.samrat.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — {acc.holderId?.name || t("Samrat Custody")}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {returnForm.destinationType !== 'ACCOUNTANT_CUSTODY' && groupedCustody.external.length > 0 && (
                        <optgroup label={`${t("Investment / Partner Wallets")} (${t("Subtotal")}: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                          {groupedCustody.external.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — Partner Wallet
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                </div>
              </div>

              {/* Transaction Ref & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Transaction Reference / ID')}
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
                    {t('Notes / Justification')}
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
                  <h2 className="text-lg font-bold text-white">{t('Reinvest Wallet Proceeds')}</h2>
                  <p className="text-xs text-gray-400">{t('Reinvest from partner wallet + optional new accountant funds')}</p>
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
                    {t('Source Project / Wallet Pool (Optional)')}
                  </label>
                  <select
                    value={reinvestForm.sourceProjectId}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, sourceProjectId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">{t('Pooled Wallet / Matured Returns Pool (No specific project)')}</option>
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.projectId} — {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Destination Project')}
                  </label>
                  <select
                    value={reinvestForm.destinationProjectId}
                    onChange={(e) => setReinvestForm({ ...reinvestForm, destinationProjectId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  >
                    <option value="">{t('Select destination project...')}</option>
                    {projects
                      .filter((p) => (!reinvestForm.sourceProjectId || p._id !== reinvestForm.sourceProjectId) && p.status !== 'CLOSED')
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
                    {groupedCustody.external.length > 0 && (
                      <optgroup label={`Investment / Partner Wallets (Subtotal: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                        {groupedCustody.external.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} — Avail: BDT {acc.derivedBalance.toLocaleString()}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {groupedCustody.moin.length > 0 && (
                      <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                        {groupedCustody.moin.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} — Avail: BDT {acc.derivedBalance.toLocaleString()}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {groupedCustody.samrat.length > 0 && (
                      <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                        {groupedCustody.samrat.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} — Avail: BDT {acc.derivedBalance.toLocaleString()}
                          </option>
                        ))}
                      </optgroup>
                    )}
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
                      {groupedCustody.moin.length > 0 && (
                        <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                          {groupedCustody.moin.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — BDT {acc.derivedBalance.toLocaleString()}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {groupedCustody.samrat.length > 0 && (
                        <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                          {groupedCustody.samrat.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — BDT {acc.derivedBalance.toLocaleString()}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {groupedCustody.external.length > 0 && (
                        <optgroup label={`Investment / Partner Wallets (Subtotal: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                          {groupedCustody.external.map((acc) => (
                            <option key={acc._id} value={acc._id}>
                              {acc.name} ({acc.channel}) — BDT {acc.derivedBalance.toLocaleString()}
                            </option>
                          ))}
                        </optgroup>
                      )}
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
                    {t('Partner')}: {selectedProjectForDetail.externalEntity || t('Direct')} • {t('Category')}: {t(selectedProjectForDetail.category)}
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
                  {t('Calculation As Of')}:{' '}
                  <span className="font-mono text-emerald-400 font-semibold">
                    {selectedProjectForDetail.calculation?.asOfDate || new Date().toISOString().split('T')[0]}
                  </span>
                </span>
                {selectedProjectForDetail.calculation?.isOverdue && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 text-amber-400" />
                    {t('Overdue')}: {selectedProjectForDetail.calculation?.overdueDays} {t('Days')} ({t('profit accrual continuing on outstanding principal')})
                  </span>
                )}
              </div>

              {/* 6 Key Financial Dimensions (Principal vs Profit Strictly Separated) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Original Principal')}</span>
                  <span className="text-base font-bold text-white font-mono">
                    {formatMoney(selectedProjectForDetail.totalFunded || selectedProjectForDetail.targetPrincipal)}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Principal Returned')}</span>
                  <span className="text-base font-bold text-purple-400 font-mono">
                    {formatMoney(selectedProjectForDetail.calculation?.totalPrincipalReturned ?? selectedProjectForDetail.metrics.totalPrincipalReturned)}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Outstanding Principal')}</span>
                  <span className={`text-base font-bold font-mono ${(selectedProjectForDetail.calculation?.outstandingPrincipal ?? selectedProjectForDetail.metrics.netOutstandingCapital) > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                    {formatMoney(selectedProjectForDetail.calculation?.outstandingPrincipal ?? selectedProjectForDetail.metrics.netOutstandingCapital)}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Expected Accrued Profit')}</span>
                  <span className="text-base font-bold text-purple-300 font-mono">
                    {formatMoney(selectedProjectForDetail.calculation?.expectedProfitAccrued ?? 0)}
                  </span>
                  <span className="text-[10px] text-gray-500 block font-mono">
                    {t('ROI')}: {selectedProjectForDetail.expectedAnnualRoiPercent ?? selectedProjectForDetail.expectedROI ?? 0}% {t('yearly')}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Actual Profit Returned')}</span>
                  <span className="text-base font-bold text-emerald-400 font-mono">
                    +{formatMoney(selectedProjectForDetail.calculation?.actualProfitReturned ?? selectedProjectForDetail.metrics.totalProfitRealized)}
                  </span>
                </div>
                <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800">
                  <span className="text-gray-400 block">{t('Outstanding Profit')}</span>
                  <span className="text-base font-bold text-indigo-300 font-mono">
                    {formatMoney(selectedProjectForDetail.calculation?.expectedProfitOutstanding ?? 0)}
                  </span>
                </div>
              </div>

              {/* Time-Segmented Profit Calculation Table */}
              {selectedProjectForDetail.calculation?.segments && selectedProjectForDetail.calculation.segments.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    {t('Date-Sensitive Segmented Profit Calculation')}
                  </h3>
                  <div className="border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">{t('Segment #')}</th>
                          <th className="py-2.5 px-3">{t('Date Range')}</th>
                          <th className="py-2.5 px-3">{t('Days')}</th>
                          <th className="py-2.5 px-3">{t('Active Principal')}</th>
                          <th className="py-2.5 px-3">{t('Annual ROI')}</th>
                          <th className="py-2.5 px-3">{t('Accrued Profit')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {selectedProjectForDetail.calculation.segments.map((s) => (
                          <tr key={s.segmentIndex} className="hover:bg-gray-800/30">
                            <td className="py-2.5 px-3 font-mono text-gray-400">#{s.segmentIndex}</td>
                            <td className="py-2.5 px-3 font-mono text-gray-300">
                              {s.startDate} → {s.endDate}
                            </td>
                            <td className="py-2.5 px-3 font-medium text-white">{s.days} {t('Days')}</td>
                            <td className="py-2.5 px-3 font-semibold text-amber-300 font-mono">
                              {formatMoney(s.principal)}
                            </td>
                            <td className="py-2.5 px-3 text-indigo-400 font-mono">{s.annualRoiPercent}%</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-400 font-mono">
                              {formatMoney(s.segmentProfit)}
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
                  {t('Multi-Accountant Investment Contributions')}
                </h3>

                {projectDetailData?.fundings && projectDetailData.fundings.length > 0 ? (
                  <div className="border border-gray-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">{t('Date')}</th>
                          <th className="py-2.5 px-3">{t('Custody Account')}</th>
                          <th className="py-2.5 px-3">{t('Amount')}</th>
                          <th className="py-2.5 px-3">{t('Funded By')}</th>
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
                    {t('No investment fundings recorded yet.')}
                  </p>
                )}
              </div>

              {/* Returns History Breakdown */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
                    {t('Installment Batches & Returns History')}
                  </h3>

                  {isAccountant && (
                    <button
                      onClick={() => {
                        setInstallmentForm({
                          projectId: selectedProjectForDetail._id,
                          installmentNumber: String((projectDetailData?.returns?.length || 0) + 1),
                          batchTitle: `Investment return ${(projectDetailData?.returns?.length || 0) + 1}th batch`,
                          date: new Date().toISOString().split('T')[0],
                          amount: '',
                          principalReturned: '',
                          actualProfit: '',
                          actualLoss: '0',
                          paymentMethod: 'BANK_TRANSFER',
                          senderName: selectedProjectForDetail.projectId === 'PRJ-2024-5' ? 'Abu Bakar Rohan' : '',
                          receiverId: '',
                          destinationCustodyAccountId: '',
                          notes: '',
                        });
                        setShowInstallmentModal(true);
                      }}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {t('Add Installment')}
                    </button>
                  )}
                </div>

                {/* Hungry Birds Official Receipt Banner */}
                {selectedProjectForDetail.projectId === 'PRJ-2024-5' && (
                  <div className="mb-3 p-3.5 rounded-xl bg-gradient-to-r from-amber-950/40 via-yellow-950/30 to-amber-950/20 border border-amber-500/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Receipt className="w-4 h-4 text-amber-400" />
                        NS Foundation Payment Confirmation Receipt
                      </span>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                        Responsible: Moin (Bank)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      <div>
                        <span className="text-gray-400 block">Sender / Client:</span>
                        <span className="font-semibold text-white">Abu Bakar Rohan</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Invested Capital:</span>
                        <span className="font-semibold text-white">Tk 60,000 (18% ROI)</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Total Returned (5 Batches):</span>
                        <span className="font-bold text-emerald-400">Tk 18,100</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block">Remaining Due:</span>
                        <span className="font-bold text-amber-400 font-mono text-xs">Tk 52,700</span>
                      </div>
                    </div>
                  </div>
                )}

                {projectDetailData?.returns && projectDetailData.returns.length > 0 ? (
                  <div className="border border-gray-800 rounded-xl overflow-x-auto">
                    <table className="w-full text-left text-xs min-w-[650px]">
                      <thead className="bg-gray-900/80 text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="py-2.5 px-3">{t('Batch / #')}</th>
                          <th className="py-2.5 px-3">{t('Date')}</th>
                          <th className="py-2.5 px-3">{t('Amount')}</th>
                          <th className="py-2.5 px-3">{t('Principal / Profit')}</th>
                          <th className="py-2.5 px-3">{t('Method & Sender')}</th>
                          <th className="py-2.5 px-3">{t('Receiver & Custody')}</th>
                          <th className="py-2.5 px-3 text-right">{t('Due Remaining')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {projectDetailData.returns.map((r, idx) => (
                          <tr key={r._id} className="hover:bg-gray-800/30">
                            <td className="py-2.5 px-3 font-semibold text-amber-300">
                              {r.batchTitle || (r.installmentNumber ? `Batch #${r.installmentNumber}` : `Return #${idx + 1}`)}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-gray-400">
                              {new Date(r.maturityDate).toLocaleDateString()}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-white font-mono">
                              {formatMoney(r.totalReturn)}
                            </td>
                            <td className="py-2.5 px-3 text-gray-300 font-mono">
                              <span className="text-purple-300">P: {formatMoney(r.principalReturned)}</span>
                              {r.actualProfit > 0 && <span className="text-emerald-400 ml-1.5">+ {formatMoney(r.actualProfit)}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-gray-300">
                              <span className="font-medium text-gray-200">{r.paymentMethod || 'Bank'}</span>
                              {r.senderName && <span className="block text-[10px] text-gray-400">from {r.senderName}</span>}
                            </td>
                            <td className="py-2.5 px-3 text-gray-300">
                              <span className="font-medium text-emerald-400">{r.receiverId?.name || 'Accountant Moin'}</span>
                              <span className="block text-[10px] text-gray-400">
                                {r.destinationType === 'PROJECT_WALLET'
                                  ? t('Project Wallet')
                                  : r.destinationCustodyAccountId?.name || 'Bank Custody'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400">
                              {r.remainingDueAfter !== undefined ? `BDT ${r.remainingDueAfter.toLocaleString()}` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500 italic p-3 bg-gray-900/50 rounded-lg border border-gray-800">
                    {t('No returns realized yet.')}
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
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 6: RECORD INSTALLMENT RETURN (RANDOM INSTALLMENTS & RESPONSIBLE ACCOUNTANT)
          ========================================================================= */}
      {showInstallmentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between sticky top-0 bg-[#111827] z-10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{t('Record Installment Return')}</h2>
                  <p className="text-xs text-gray-400">{t('Return principal/profit in random installments with receiver accountant')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowInstallmentModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordInstallment} className="p-6 space-y-4">
              {/* Project Selection */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('Project')} *
                </label>
                <select
                  value={installmentForm.projectId}
                  onChange={(e) => {
                    const sel = projects.find((p) => p._id === e.target.value);
                    setInstallmentForm({
                      ...installmentForm,
                      projectId: e.target.value,
                      senderName: sel?.projectId === 'PRJ-2024-5' ? 'Abu Bakar Rohan' : installmentForm.senderName,
                    });
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                >
                  <option value="">{t('Select investment project...')}</option>
                  {projects.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.projectId} — {p.name} (Due: BDT {(p.metrics.remainingDue ?? p.targetPrincipal).toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              {/* Installment Batch # & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Batch / Installment #')}
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 5"
                    value={installmentForm.installmentNumber}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, installmentNumber: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Batch Title / Description')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Investment return 5th batch"
                    value={installmentForm.batchTitle}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, batchTitle: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Date & Received Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Received Date')} *
                  </label>
                  <input
                    type="date"
                    value={installmentForm.date}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, date: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Received Amount (BDT)')} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="e.g. 5600"
                    value={installmentForm.amount}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, amount: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                    required
                  />
                </div>
              </div>

              {/* Principal vs Profit Split (with Auto-Split button) */}
              <div className="p-3 bg-gray-900/80 rounded-xl border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    {t('Principal vs Profit Split')}
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoSplitInstallment}
                    className="text-xs text-amber-400 hover:text-amber-300 font-medium px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20"
                  >
                    ⚡ {t('Auto Allocate')}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-1">
                      {t('Principal Returned (BDT)')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Principal portion"
                      value={installmentForm.principalReturned}
                      onChange={(e) => setInstallmentForm({ ...installmentForm, principalReturned: e.target.value })}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-emerald-400 mb-1">
                      {t('Profit Returned (BDT)')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Profit portion"
                      value={installmentForm.actualProfit}
                      onChange={(e) => setInstallmentForm({ ...installmentForm, actualProfit: e.target.value })}
                      className="w-full bg-[#1F2937] border border-gray-700 rounded px-2.5 py-1.5 text-xs text-emerald-300"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Method & Sender Name */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Payment Method')} *
                  </label>
                  <select
                    value={installmentForm.paymentMethod}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, paymentMethod: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                    required
                  >
                    <option value="BANK_TRANSFER">{t('Bank Transfer')}</option>
                    <option value="BKASH">{t('bKash')}</option>
                    <option value="NAGAD">{t('Nagad')}</option>
                    <option value="CASH">{t('Cash')}</option>
                    <option value="ROCKET">{t('Rocket')}</option>
                    <option value="OTHER">{t('Other')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Sender / Payer Name')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Abu Bakar Rohan"
                    value={installmentForm.senderName}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, senderName: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Responsible Accountant & Custody Deposit Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Responsible Accountant')}
                  </label>
                  <select
                    value={installmentForm.receiverId}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, receiverId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">{t('Default: Accountant Moin')}</option>
                    <option value="6abb8e11bec2a63bd3a924dd">Moin Uddin (Primary Accountant)</option>
                    <option value="6abb8e12bec2a63bd3a92568">Nurul Amin Samrat (Assistant Accountant)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Deposit Custody Account')}
                  </label>
                  <select
                    value={installmentForm.destinationCustodyAccountId}
                    onChange={(e) => setInstallmentForm({ ...installmentForm, destinationCustodyAccountId: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">{t('Select custody account...')}</option>
                    {groupedCustody.moin.length > 0 && (
                      <optgroup label={`${t("Accountant Moin's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.moinTotal.toLocaleString()})`}>
                        {groupedCustody.moin.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} ({acc.channel}) — {acc.holderId?.name || t("Moin")}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {groupedCustody.samrat.length > 0 && (
                      <optgroup label={`${t("Accountant Samrat's Custody")} (${t("Subtotal")}: BDT ${groupedCustody.samratTotal.toLocaleString()})`}>
                        {groupedCustody.samrat.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} ({acc.channel}) — {acc.holderId?.name || t("Samrat")}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {groupedCustody.external.length > 0 && (
                      <optgroup label={`${t("Investment / Partner Wallets")} (${t("Subtotal")}: BDT ${groupedCustody.externalTotal.toLocaleString()})`}>
                        {groupedCustody.external.map((acc) => (
                          <option key={acc._id} value={acc._id}>
                            {acc.name} ({acc.channel}) — Partner Wallet
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('Notes / Remarks')}
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received via Bank by Moin, remaining due updated"
                  value={installmentForm.notes}
                  onChange={(e) => setInstallmentForm({ ...installmentForm, notes: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder-gray-500"
                />
              </div>

              {/* Live Preview of Remaining Due */}
              {(() => {
                const cur = projects.find((p) => p._id === installmentForm.projectId) || selectedProjectForDetail;
                if (!cur) return null;
                const totalExpected = cur.metrics.totalExpectedReturn || (cur.totalFunded * (1 + (cur.expectedAnnualRoiPercent || cur.expectedROI || 0) / 100));
                const totalReturned = cur.metrics.totalReturnReceived || (cur.calculation?.totalReturnReceived ?? 0);
                const curDue = cur.metrics.remainingDue ?? Math.max(0, totalExpected - totalReturned);
                const installmentAmt = parseFloat(installmentForm.amount) || 0;
                const newDue = Math.max(0, curDue - installmentAmt);

                return (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-300">
                      <span>{t('Total Expected Return')}:</span>
                      <span className="font-bold text-white">BDT {Math.round(totalExpected).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-gray-300">
                      <span>{t('Current Due to Foundation')}:</span>
                      <span className="font-bold text-amber-400">BDT {Math.round(curDue).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-amber-500/20 text-emerald-400 font-bold">
                      <span>{t('Remaining Due After This Installment')}:</span>
                      <span className="font-mono text-sm">BDT {Math.round(newDue).toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowInstallmentModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('Confirm Installment Return')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 7: REQUEST FULL / PARTIAL WITHDRAWAL (e.g. Zayn Farm ৳256,490)
          ========================================================================= */}
      {showWithdrawalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{t('Request Project / Org Withdrawal')}</h2>
                  <p className="text-xs text-gray-400">{t('Initiate liquidation of capital and accumulated profits')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowWithdrawalModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestWithdrawal} className="p-6 space-y-4">
              {/* Notice Banner */}
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-xl text-xs text-purple-200 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-purple-300">
                  <AlertCircle className="w-4 h-4 text-purple-400" />
                  {t('Withdrawal Liquidation Workflow')}
                </div>
                <p className="text-gray-300 text-[11px]">
                  {t('Once requested, projects are marked as "Withdrawal Requested". When funds are received by the accountant, they will be liquidated into custody accounts and can be deployed into new organizations and projects.')}
                </p>
              </div>

              {/* Organization or Project */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('Partner Organization')} *
                </label>
                <input
                  type="text"
                  value={withdrawalForm.orgName}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, orgName: e.target.value })}
                  placeholder="e.g. Zayn Farm"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Withdrawal Amount (BDT)')} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    value={withdrawalForm.amount}
                    onChange={(e) => setWithdrawalForm({ ...withdrawalForm, amount: e.target.value })}
                    placeholder="256490"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    {t('Request Date')} *
                  </label>
                  <input
                    type="date"
                    value={withdrawalForm.date}
                    onChange={(e) => setWithdrawalForm({ ...withdrawalForm, date: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    required
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  {t('Withdrawal Terms / Notes')}
                </label>
                <textarea
                  rows={2}
                  value={withdrawalForm.notes}
                  onChange={(e) => setWithdrawalForm({ ...withdrawalForm, notes: e.target.value })}
                  placeholder="Requested full withdrawal of principal + profit for reinvestment"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowWithdrawalModal(false)}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white font-medium"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {actionLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {t('Submit Withdrawal Request')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default InvestmentsPage;
