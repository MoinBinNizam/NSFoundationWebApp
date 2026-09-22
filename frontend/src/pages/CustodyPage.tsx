import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Wallet,
  ArrowRightLeft,
  Search,
  Layers,
  Sparkles,
  Shield,
  Plus,
  RefreshCw,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Building2,
  PhoneCall,
  Banknote,
  Smartphone,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';

interface CustodyAccountItem {
  _id: string;
  name: string;
  accountType: string;
  channel: 'CASH' | 'BANK' | 'BKASH' | 'NAGAD' | 'WALLET' | 'OTHER';
  accountNumber?: string;
  cachedBalance: number;
  derivedBalance: number;
  totalInflow: number;
  totalOutflow: number;
  isActive: boolean;
  notes?: string;
  holderId?: {
    _id: string;
    name: string;
    email: string;
    accountantType?: string;
    phone?: string;
  };
}

interface CustodySummary {
  totalLiquidFunds: number;
  totalMoinCustody: number;
  totalSamratCustody: number;
  totalExternalWallets: number;
  channelTotals: {
    CASH: number;
    BANK: number;
    BKASH: number;
    NAGAD: number;
    WALLET: number;
    OTHER: number;
  };
  totalAccountsCount: number;
}

interface CustodyMovementItem {
  _id: string;
  custodyAccountId: {
    _id: string;
    name: string;
    channel: string;
    accountNumber?: string;
    holderId?: {
      _id: string;
      name: string;
      email: string;
      accountantType?: string;
    };
  };
  movementType: 'IN' | 'OUT';
  amount: number;
  sourceType: 'MEMBER_PAYMENT' | 'INTERNAL_TRANSFER' | 'INVESTMENT_FUNDING' | 'INVESTMENT_RETURN' | 'EXPENSE' | 'ADJUSTMENT';
  date: string;
  description: string;
  performedBy?: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

interface FundTransferItem {
  _id: string;
  transferNumber: string;
  sourceAccountId: {
    _id: string;
    name: string;
    channel: string;
    accountNumber?: string;
    holderId?: {
      name: string;
      email: string;
      accountantType?: string;
    };
  };
  destinationAccountId: {
    _id: string;
    name: string;
    channel: string;
    accountNumber?: string;
    holderId?: {
      name: string;
      email: string;
      accountantType?: string;
    };
  };
  amount: number;
  date: string;
  purpose: string;
  transferredBy: {
    _id: string;
    name: string;
    email: string;
  };
  createdAt: string;
}

export const CustodyPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isAccountant = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT';

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'accounts' | 'movements' | 'transfers'>('accounts');

  // Data states
  const [summary, setSummary] = useState<CustodySummary | null>(null);
  const [accounts, setAccounts] = useState<CustodyAccountItem[]>([]);
  const [movements, setMovements] = useState<CustodyMovementItem[]>([]);
  const [transfers, setTransfers] = useState<FundTransferItem[]>([]);

  // Loading states
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter states - Movements
  const [movementAccountFilter, setMovementAccountFilter] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState('');
  const [movementSourceFilter, setMovementSourceFilter] = useState('');
  const [movementStartDate, setMovementStartDate] = useState('');
  const [movementEndDate, setMovementEndDate] = useState('');
  const [movementPage, setMovementPage] = useState(1);
  const [movementTotalPages, setMovementTotalPages] = useState(1);
  const [movementTotalCount, setMovementTotalCount] = useState(0);

  // Filter states - Transfers
  const [transferSearch, setTransferSearch] = useState('');
  const [transferPage, setTransferPage] = useState(1);
  const [transferTotalPages, setTransferTotalPages] = useState(1);
  const [transferTotalCount, setTransferTotalCount] = useState(0);

  // Modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [selectedTransferVoucher, setSelectedTransferVoucher] = useState<FundTransferItem | null>(null);

  // Transfer Form State
  const [transferForm, setTransferForm] = useState({
    sourceAccountId: '',
    destinationAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    purpose: '',
  });

  // Reconcile Form State
  const [reconcileForm, setReconcileForm] = useState({
    accountId: '',
    verifiedAmount: '',
    reason: '',
  });

  // New Account Form State
  const [newAccountForm, setNewAccountForm] = useState({
    name: '',
    accountType: 'ACCOUNTANT_CUSTODY',
    channel: 'CASH',
    holderId: '',
    accountNumber: '',
    notes: '',
  });

  // Fetch Accounts & Summary
  const fetchCustodyOverview = useCallback(async () => {
    try {
      setLoading(true);
      const [sumRes, accRes] = await Promise.all([
        apiRequest<CustodySummary>('/custody/summary'),
        apiRequest<CustodyAccountItem[]>('/custody/accounts'),
      ]);
      setSummary(sumRes.data);
      setAccounts(accRes.data);
    } catch (err: unknown) {
      console.error('Failed to fetch custody summary:', err);
      setErrorMessage((err as Error).message || 'Failed to load custody data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Movements Ledger
  const fetchMovements = useCallback(async () => {
    try {
      setTableLoading(true);
      const params = new URLSearchParams({
        page: movementPage.toString(),
        limit: '15',
      });
      if (movementAccountFilter) params.append('accountId', movementAccountFilter);
      if (movementTypeFilter) params.append('movementType', movementTypeFilter);
      if (movementSourceFilter) params.append('sourceType', movementSourceFilter);
      if (movementStartDate) params.append('startDate', movementStartDate);
      if (movementEndDate) params.append('endDate', movementEndDate);

      const res = await apiRequest<CustodyMovementItem[]>(`/custody/movements?${params.toString()}`);
      setMovements(res.data);
      if (res.pagination) {
        setMovementTotalPages(res.pagination.totalPages);
        setMovementTotalCount(res.pagination.total);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch movements:', err);
    } finally {
      setTableLoading(false);
    }
  }, [movementPage, movementAccountFilter, movementTypeFilter, movementSourceFilter, movementStartDate, movementEndDate]);

  // Fetch Transfers
  const fetchTransfers = useCallback(async () => {
    try {
      setTableLoading(true);
      const params = new URLSearchParams({
        page: transferPage.toString(),
        limit: '12',
      });
      if (transferSearch.trim()) params.append('search', transferSearch.trim());

      const res = await apiRequest<FundTransferItem[]>(`/custody/transfers?${params.toString()}`);
      setTransfers(res.data);
      if (res.pagination) {
        setTransferTotalPages(res.pagination.totalPages);
        setTransferTotalCount(res.pagination.total);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch transfers:', err);
    } finally {
      setTableLoading(false);
    }
  }, [transferPage, transferSearch]);

  useEffect(() => {
    fetchCustodyOverview();
  }, [fetchCustodyOverview]);

  useEffect(() => {
    if (activeTab === 'movements') {
      fetchMovements();
    } else if (activeTab === 'transfers') {
      fetchTransfers();
    }
  }, [activeTab, fetchMovements, fetchTransfers]);

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

  // Execute Transfer
  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferForm.sourceAccountId || !transferForm.destinationAccountId || !transferForm.amount) {
      setErrorMessage('Please fill in source account, destination account, and transfer amount');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await apiRequest<{ transferNumber: string; message?: string }>('/custody/transfer', {
        method: 'POST',
        body: JSON.stringify({
          sourceAccountId: transferForm.sourceAccountId,
          destinationAccountId: transferForm.destinationAccountId,
          amount: parseFloat(transferForm.amount),
          date: transferForm.date,
          purpose: transferForm.purpose,
        }),
      });

      setSuccessMessage(`Transfer ${res.data.transferNumber} executed successfully!`);
      setShowTransferModal(false);
      setTransferForm({
        sourceAccountId: '',
        destinationAccountId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        purpose: '',
      });

      // Refresh overview
      await fetchCustodyOverview();
      if (activeTab === 'transfers') fetchTransfers();
      if (activeTab === 'movements') fetchMovements();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to execute transfer');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute Reconcile
  const handleExecuteReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileForm.accountId || reconcileForm.verifiedAmount === '' || !reconcileForm.reason) {
      setErrorMessage('Please provide verified amount and reconciliation reason');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      const res = await apiRequest<{ message: string; variance: number }>('/custody/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          accountId: reconcileForm.accountId,
          verifiedAmount: parseFloat(reconcileForm.verifiedAmount),
          reason: reconcileForm.reason,
        }),
      });

      setSuccessMessage(res.data.message || 'Account reconciled successfully');
      setShowReconcileModal(false);
      setReconcileForm({
        accountId: '',
        verifiedAmount: '',
        reason: '',
      });

      await fetchCustodyOverview();
      if (activeTab === 'movements') fetchMovements();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to reconcile account');
    } finally {
      setActionLoading(false);
    }
  };

  // Create New Custody Account
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccountForm.name || !newAccountForm.channel) {
      setErrorMessage('Please provide account name and channel');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMessage(null);
      await apiRequest('/custody/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: newAccountForm.name,
          accountType: newAccountForm.accountType,
          channel: newAccountForm.channel,
          holderId: newAccountForm.holderId || null,
          accountNumber: newAccountForm.accountNumber,
          notes: newAccountForm.notes,
        }),
      });

      setSuccessMessage(`Account '${newAccountForm.name}' created successfully!`);
      setShowNewAccountModal(false);
      setNewAccountForm({
        name: '',
        accountType: 'ACCOUNTANT_CUSTODY',
        channel: 'CASH',
        holderId: '',
        accountNumber: '',
        notes: '',
      });

      await fetchCustodyOverview();
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Failed to create custody account');
    } finally {
      setActionLoading(false);
    }
  };

  // Channel helper styling
  const getChannelBadge = (channel: string) => {
    switch (channel) {
      case 'BANK':
        return {
          label: 'Islami Bank',
          icon: Building2,
          bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        };
      case 'BKASH':
        return {
          label: 'bKash Wallet',
          icon: Smartphone,
          bg: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
        };
      case 'NAGAD':
        return {
          label: 'Nagad Wallet',
          icon: PhoneCall,
          bg: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
        };
      case 'CASH':
      default:
        return {
          label: 'Physical Cash',
          icon: Banknote,
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        };
    }
  };

  // Selected source account for transfer preview
  const selectedSourceAccount = accounts.find((a) => a._id === transferForm.sourceAccountId);
  const selectedDestAccount = accounts.find((a) => a._id === transferForm.destinationAccountId);

  // Reconcile selected account info
  const selectedReconcileAccount = accounts.find((a) => a._id === reconcileForm.accountId);
  const reconcileVariance =
    selectedReconcileAccount && reconcileForm.verifiedAmount !== ''
      ? parseFloat(reconcileForm.verifiedAmount) - selectedReconcileAccount.derivedBalance
      : null;

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
              <Wallet className="w-7 h-7 text-indigo-400" />
              Accountant Custody Ledger
            </h1>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative multi-custodian balances, cross-channel transfers, and real-time transaction ledger.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchCustodyOverview()}
            disabled={loading}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700 flex items-center gap-1.5"
            title="Refresh Custody Balances"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>

          {isAccountant && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-indigo-600/20 flex items-center gap-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              Transfer Funds
            </button>
          )}

          {isAdmin && (
            <>
              <button
                onClick={() => setShowReconcileModal(true)}
                className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Reconcile
              </button>
              <button
                onClick={() => setShowNewAccountModal(true)}
                className="px-3.5 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            </>
          )}
        </div>
      </div>

      {/* Custody Summary Metrics (SRS 15.3, 17) */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Liquid Funds */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#131b2e] to-[#0f172a] border border-indigo-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Total Liquid Funds
              </span>
              <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">
                BDT {(summary.totalLiquidFunds || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-indigo-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Derived from {summary.totalAccountsCount} custody accounts
            </div>
          </div>

          {/* Moin Custody Total */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#1e1b2e] to-[#131124] border border-purple-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Moin Custody (Primary)
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                <Shield className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-purple-300 tracking-tight">
                BDT {(summary.totalMoinCustody || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Cash + Islami Bank + bKash
            </div>
          </div>

          {/* Samrat Custody Total */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-[#1a2333] to-[#101926] border border-blue-500/20 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Samrat Custody (Assistant)
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2">
              <span className="text-2xl font-bold text-blue-300 tracking-tight">
                BDT {(summary.totalSamratCustody || 0).toLocaleString()}
              </span>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Cash + Nagad + bKash
            </div>
          </div>

          {/* Channels Breakdown */}
          <div className="p-4 rounded-xl bg-[#111827] border border-white/10 flex flex-col justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Channel Allocations
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="text-xs">
                <span className="text-gray-400 block">Bank:</span>
                <span className="font-semibold text-blue-400">BDT {(summary.channelTotals.BANK || 0).toLocaleString()}</span>
              </div>
              <div className="text-xs">
                <span className="text-gray-400 block">Cash:</span>
                <span className="font-semibold text-emerald-400">BDT {(summary.channelTotals.CASH || 0).toLocaleString()}</span>
              </div>
              <div className="text-xs">
                <span className="text-gray-400 block">Nagad:</span>
                <span className="font-semibold text-orange-400">BDT {(summary.channelTotals.NAGAD || 0).toLocaleString()}</span>
              </div>
              <div className="text-xs">
                <span className="text-gray-400 block">bKash:</span>
                <span className="font-semibold text-pink-400">BDT {(summary.channelTotals.BKASH || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex space-x-8">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'accounts'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Custody Accounts & Balances ({accounts.length})
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'movements'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Transaction Movement Ledger
          </button>
          <button
            onClick={() => setActiveTab('transfers')}
            className={`py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'transfers'
                ? 'border-indigo-500 text-indigo-400 font-semibold'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            Inter-Account Transfers
          </button>
        </div>
      </div>

      {/* TAB 1: Custody Accounts Grid */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>
              Real-time balances are derived directly from the immutable transaction ledger (Inflows - Outflows).
            </span>
            <span>Total Accounts: {accounts.length}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((acc) => {
              const channelBadge = getChannelBadge(acc.channel);
              const ChannelIcon = channelBadge.icon;
              const holder = acc.holderId;
              const isMoin = holder?.accountantType === 'PRIMARY' || holder?.email === 'admin@nsfoundation.org';
              const isSamrat = holder?.accountantType === 'ASSISTANT' || holder?.email === 'assistant@nsfoundation.org';

              return (
                <div
                  key={acc._id}
                  className="bg-[#111827] border border-white/10 rounded-xl p-5 hover:border-indigo-500/40 transition-all flex flex-col justify-between group shadow-sm"
                >
                  <div>
                    {/* Top channel & holder badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${channelBadge.bg}`}
                      >
                        <ChannelIcon className="w-3.5 h-3.5" />
                        {channelBadge.label}
                      </span>

                      {holder ? (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                            isMoin
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/20'
                              : isSamrat
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                              : 'bg-gray-800 text-gray-300 border-gray-700'
                          }`}
                        >
                          {holder.name.split(' ')[0]} ({isMoin ? 'Primary' : isSamrat ? 'Assistant' : 'Custodian'})
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 bg-gray-800/60 px-2 py-0.5 rounded border border-gray-700">
                          Society Reserve
                        </span>
                      )}
                    </div>

                    {/* Account Name */}
                    <div className="mt-3">
                      <h3 className="text-base font-semibold text-white group-hover:text-indigo-400 transition-colors">
                        {acc.name}
                      </h3>
                      {acc.accountNumber && (
                        <p className="text-xs text-gray-400 font-mono mt-0.5">
                          A/C: {acc.accountNumber}
                        </p>
                      )}
                    </div>

                    {/* Derived Balance Display */}
                    <div className="mt-4 pt-3 border-t border-gray-800">
                      <span className="text-xs text-gray-400 block">Available Derived Balance</span>
                      <div className="flex items-baseline gap-1.5 mt-0.5">
                        <span
                          className={`text-2xl font-bold tracking-tight ${
                            acc.derivedBalance >= 0 ? 'text-white' : 'text-rose-400'
                          }`}
                        >
                          BDT {(acc.derivedBalance || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Inflow vs Outflow Mini-Ledger */}
                    <div className="grid grid-cols-2 gap-2 mt-3 p-2 rounded-lg bg-gray-900/60 border border-gray-800/80 text-xs">
                      <div>
                        <span className="text-gray-500 block flex items-center gap-1">
                          <ArrowDownLeft className="w-3 h-3 text-emerald-400" /> Total In
                        </span>
                        <span className="font-medium text-emerald-400">
                          +BDT {(acc.totalInflow || 0).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500 block flex items-center gap-1">
                          <ArrowUpRight className="w-3 h-3 text-rose-400" /> Total Out
                        </span>
                        <span className="font-medium text-rose-400">
                          -BDT {(acc.totalOutflow || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mt-4 pt-3 border-t border-gray-800 flex items-center gap-2">
                    {isAccountant && (
                      <button
                        onClick={() => {
                          setTransferForm((prev) => ({ ...prev, sourceAccountId: acc._id }));
                          setShowTransferModal(true);
                        }}
                        disabled={acc.derivedBalance <= 0}
                        className="flex-1 px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowRightLeft className="w-3 h-3" />
                        Transfer From
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setMovementAccountFilter(acc._id);
                        setActiveTab('movements');
                      }}
                      className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-700"
                      title="View Ledger Movements"
                    >
                      History
                    </button>

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setReconcileForm({
                            accountId: acc._id,
                            verifiedAmount: acc.derivedBalance.toString(),
                            reason: '',
                          });
                          setShowReconcileModal(true);
                        }}
                        className="px-2 py-1.5 text-gray-400 hover:text-purple-300 hover:bg-purple-500/10 rounded-lg text-xs transition-colors"
                        title="Reconcile with physical / statement balance"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: Transaction Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Account filter */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Account</label>
                <select
                  value={movementAccountFilter}
                  onChange={(e) => {
                    setMovementAccountFilter(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Accounts</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.name} ({acc.channel})
                    </option>
                  ))}
                </select>
              </div>

              {/* Movement Type (IN / OUT) */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Movement Type</label>
                <select
                  value={movementTypeFilter}
                  onChange={(e) => {
                    setMovementTypeFilter(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Types (IN & OUT)</option>
                  <option value="IN">IN (Inflows)</option>
                  <option value="OUT">OUT (Outflows)</option>
                </select>
              </div>

              {/* Source Type */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">Source Event</label>
                <select
                  value={movementSourceFilter}
                  onChange={(e) => {
                    setMovementSourceFilter(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All Sources</option>
                  <option value="MEMBER_PAYMENT">Member Payments</option>
                  <option value="INTERNAL_TRANSFER">Internal Transfers</option>
                  <option value="ADJUSTMENT">Reconciliation Adjustments</option>
                  <option value="EXPENSE">Operational Expenses</option>
                  <option value="INVESTMENT_FUNDING">Investment Funding</option>
                  <option value="INVESTMENT_RETURN">Investment Returns</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">From Date</label>
                <input
                  type="date"
                  value={movementStartDate}
                  onChange={(e) => {
                    setMovementStartDate(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1">To Date</label>
                <input
                  type="date"
                  value={movementEndDate}
                  onChange={(e) => {
                    setMovementEndDate(e.target.value);
                    setMovementPage(1);
                  }}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {(movementAccountFilter || movementTypeFilter || movementSourceFilter || movementStartDate || movementEndDate) && (
              <div className="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between text-xs">
                <span className="text-gray-400">Active filters applied</span>
                <button
                  onClick={() => {
                    setMovementAccountFilter('');
                    setMovementTypeFilter('');
                    setMovementSourceFilter('');
                    setMovementStartDate('');
                    setMovementEndDate('');
                    setMovementPage(1);
                  }}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>

          {/* Movements Table */}
          <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/70 text-gray-400 text-xs font-medium uppercase tracking-wider">
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Account</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Source Event</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Performed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {tableLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                          Loading transaction movements...
                        </div>
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400">
                        No transaction movements recorded matching criteria.
                      </td>
                    </tr>
                  ) : (
                    movements.map((mov) => {
                      const isIncoming = mov.movementType === 'IN';
                      const acc = mov.custodyAccountId;

                      return (
                        <tr key={mov._id} className="hover:bg-gray-800/40 transition-colors">
                          <td className="py-3 px-4 text-gray-300 whitespace-nowrap text-xs font-mono">
                            {new Date(mov.date).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-medium text-white text-xs">{acc?.name || 'Unknown Account'}</div>
                            <div className="text-[11px] text-gray-400">{acc?.channel}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                                isIncoming
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              {isIncoming ? '+' : '-'} {mov.movementType}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`font-semibold ${
                                isIncoming ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isIncoming ? '+' : '-'}BDT {mov.amount.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-300 border border-gray-700">
                              {mov.sourceType}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-gray-300 text-xs max-w-xs truncate" title={mov.description}>
                            {mov.description}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-xs text-gray-400">
                            {mov.performedBy?.name || 'System'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {movementTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-900/50 text-xs">
                <span className="text-gray-400">
                  Showing page {movementPage} of {movementTotalPages} ({movementTotalCount} movements)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={movementPage <= 1}
                    onClick={() => setMovementPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold text-white px-2">{movementPage}</span>
                  <button
                    disabled={movementPage >= movementTotalPages}
                    onClick={() => setMovementPage((p) => Math.min(movementTotalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Inter-Account Transfers */}
      {activeTab === 'transfers' && (
        <div className="space-y-4">
          {/* Search bar & info banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#111827] border border-white/10 rounded-xl p-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={transferSearch}
                onChange={(e) => {
                  setTransferSearch(e.target.value);
                  setTransferPage(1);
                }}
                placeholder="Search by transfer voucher # or purpose..."
                className="w-full bg-[#1F2937] border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
              />
            </div>

            {isAccountant && (
              <button
                onClick={() => setShowTransferModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
              >
                <ArrowRightLeft className="w-4 h-4" />
                New Transfer
              </button>
            )}
          </div>

          {/* Transfers Table */}
          <div className="bg-[#111827] border border-white/10 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-900/70 text-gray-400 text-xs font-medium uppercase tracking-wider">
                    <th className="py-3 px-4">Voucher Number</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Source Account</th>
                    <th className="py-3 px-4">Destination Account</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Purpose</th>
                    <th className="py-3 px-4">Authorized By</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {tableLoading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                          Loading fund transfers...
                        </div>
                      </td>
                    </tr>
                  ) : transfers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        No inter-account transfers recorded yet.
                      </td>
                    </tr>
                  ) : (
                    transfers.map((trf) => (
                      <tr key={trf._id} className="hover:bg-gray-800/40 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                            {trf.transferNumber}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-xs whitespace-nowrap">
                          {new Date(trf.date).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-white text-xs">{trf.sourceAccountId?.name}</div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-1">
                            <span>{trf.sourceAccountId?.channel}</span>
                            {trf.sourceAccountId?.holderId && (
                              <span>• {trf.sourceAccountId.holderId.name.split(' ')[0]}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-medium text-white text-xs">{trf.destinationAccountId?.name}</div>
                          <div className="text-[11px] text-gray-400 flex items-center gap-1">
                            <span>{trf.destinationAccountId?.channel}</span>
                            {trf.destinationAccountId?.holderId && (
                              <span>• {trf.destinationAccountId.holderId.name.split(' ')[0]}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="text-sm font-bold text-white">BDT {trf.amount.toLocaleString()}</span>
                        </td>
                        <td className="py-3 px-4 text-gray-300 text-xs max-w-xs truncate" title={trf.purpose}>
                          {trf.purpose || 'Inter-account fund transfer'}
                        </td>
                        <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">
                          {trf.transferredBy?.name || 'Accountant'}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => setSelectedTransferVoucher(trf)}
                            className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs font-medium border border-gray-700 transition-colors"
                          >
                            Voucher
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {transferTotalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800 bg-gray-900/50 text-xs">
                <span className="text-gray-400">
                  Showing page {transferPage} of {transferTotalPages} ({transferTotalCount} transfers)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={transferPage <= 1}
                    onClick={() => setTransferPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold text-white px-2">{transferPage}</span>
                  <button
                    disabled={transferPage >= transferTotalPages}
                    onClick={() => setTransferPage((p) => Math.min(transferTotalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: FUND TRANSFER (Cross-channel & Inter-accountant)
          ========================================================================= */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Execute Fund Transfer</h2>
                  <p className="text-xs text-gray-400">Atomic inter-accountant & cross-channel fund movement</p>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteTransfer} className="p-6 space-y-4">
              {/* Source Account */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Source Account (Transfer Out)
                </label>
                <select
                  value={transferForm.sourceAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, sourceAccountId: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select source custody account...</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id} disabled={acc.derivedBalance <= 0}>
                      {acc.name} ({acc.channel}) — Available: BDT {acc.derivedBalance.toLocaleString()}
                    </option>
                  ))}
                </select>

                {selectedSourceAccount && (
                  <div className="mt-1.5 flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Holder: {selectedSourceAccount.holderId?.name || 'Society Reserve'}</span>
                    <span className="text-emerald-400 font-semibold">
                      Max Available: BDT {selectedSourceAccount.derivedBalance.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Destination Account */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Destination Account (Transfer In)
                </label>
                <select
                  value={transferForm.destinationAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, destinationAccountId: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                >
                  <option value="">Select destination custody account...</option>
                  {accounts
                    .filter((acc) => acc._id !== transferForm.sourceAccountId)
                    .map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} ({acc.channel}) — Current: BDT {acc.derivedBalance.toLocaleString()}
                      </option>
                    ))}
                </select>

                {selectedDestAccount && (
                  <div className="mt-1.5 flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-900/60 border border-gray-800">
                    <span className="text-gray-400">Holder: {selectedDestAccount.holderId?.name || 'Society Reserve'}</span>
                    <span className="text-blue-400 font-semibold">Channel: {selectedDestAccount.channel}</span>
                  </div>
                )}
              </div>

              {/* Cross-Channel Context Alert */}
              {selectedSourceAccount && selectedDestAccount && selectedSourceAccount.channel !== selectedDestAccount.channel && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-xs text-blue-300 flex items-start gap-2">
                  <ArrowRightLeft className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Cross-Channel Transfer:</strong> Funds will transfer from{' '}
                    <span className="text-white underline">{selectedSourceAccount.channel}</span> to{' '}
                    <span className="text-white underline">{selectedDestAccount.channel}</span>. Twin synchronized
                    movements will be recorded.
                  </span>
                </div>
              )}

              {/* Amount & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Transfer Amount (BDT)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    placeholder="e.g. 25000"
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Transfer Date
                  </label>
                  <input
                    type="date"
                    value={transferForm.date}
                    onChange={(e) => setTransferForm({ ...transferForm, date: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>
              </div>

              {/* Purpose / Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Purpose / Justification
                </label>
                <input
                  type="text"
                  value={transferForm.purpose}
                  onChange={(e) => setTransferForm({ ...transferForm, purpose: e.target.value })}
                  placeholder="e.g. Consolidation of Nagad fees to Islami Bank for land project"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTransferModal(false)}
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
                  Confirm & Transfer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: RECONCILE / ADJUST ACCOUNT BALANCE (Admin Only)
          ========================================================================= */}
      {showReconcileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Reconcile Custody Balance</h2>
                  <p className="text-xs text-gray-400">Audit physical cash / bank statement vs ledger (SRS 18)</p>
                </div>
              </div>
              <button
                onClick={() => setShowReconcileModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteReconcile} className="p-6 space-y-4">
              {/* Target Account */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Custody Account to Reconcile
                </label>
                <select
                  value={reconcileForm.accountId}
                  onChange={(e) => setReconcileForm({ ...reconcileForm, accountId: e.target.value })}
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                >
                  <option value="">Select account...</option>
                  {accounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.name} — Current Ledger: BDT {acc.derivedBalance.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Current Ledger vs Verified Amount */}
              {selectedReconcileAccount && (
                <div className="p-3.5 bg-gray-900/80 rounded-xl border border-gray-800 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Current Ledger Balance:</span>
                    <span className="font-bold text-white">
                      BDT {selectedReconcileAccount.derivedBalance.toLocaleString()}
                    </span>
                  </div>
                  {reconcileVariance !== null && (
                    <div className="flex justify-between pt-2 border-t border-gray-800">
                      <span className="text-gray-400">Calculated Variance:</span>
                      <span
                        className={`font-bold ${
                          reconcileVariance === 0
                            ? 'text-gray-300'
                            : reconcileVariance > 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {reconcileVariance > 0 ? '+' : ''}BDT {reconcileVariance.toLocaleString()}
                        {reconcileVariance === 0 ? ' (Exact Match)' : reconcileVariance > 0 ? ' (Surplus)' : ' (Shortage)'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Verified Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Verified Statement / Physical Count (BDT)
                </label>
                <input
                  type="number"
                  step="any"
                  value={reconcileForm.verifiedAmount}
                  onChange={(e) => setReconcileForm({ ...reconcileForm, verifiedAmount: e.target.value })}
                  placeholder="Enter audited physical or bank count"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              {/* Reason / Audit Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Reconciliation Audit Note
                </label>
                <textarea
                  rows={2}
                  value={reconcileForm.reason}
                  onChange={(e) => setReconcileForm({ ...reconcileForm, reason: e.target.value })}
                  placeholder="e.g. Monthly physical cash count verified by Audit Committee"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder-gray-500"
                  required
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowReconcileModal(false)}
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
                  Submit Reconciliation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: ADD CUSTODY ACCOUNT (Admin Only)
          ========================================================================= */}
      {showNewAccountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Create Custody Account</h2>
                  <p className="text-xs text-gray-400">Define a new holding account or digital channel</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewAccountModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Account Name
                </label>
                <input
                  type="text"
                  value={newAccountForm.name}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, name: e.target.value })}
                  placeholder="e.g. Moin City Bank Account"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Account Channel
                  </label>
                  <select
                    value={newAccountForm.channel}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, channel: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="CASH">Physical Cash</option>
                    <option value="BANK">Bank Account</option>
                    <option value="BKASH">bKash</option>
                    <option value="NAGAD">Nagad</option>
                    <option value="WALLET">Digital Wallet</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Account Type
                  </label>
                  <select
                    value={newAccountForm.accountType}
                    onChange={(e) => setNewAccountForm({ ...newAccountForm, accountType: e.target.value })}
                    className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="ACCOUNTANT_CUSTODY">Accountant Custody</option>
                    <option value="EXTERNAL_WALLET">External Wallet</option>
                    <option value="OPERATIONAL_RESERVE">Operational Reserve</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Account Number / Details (Optional)
                </label>
                <input
                  type="text"
                  value={newAccountForm.accountNumber}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, accountNumber: e.target.value })}
                  placeholder="e.g. 205012345678 or 01711XXXXXX"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                  Operational Notes (Optional)
                </label>
                <input
                  type="text"
                  value={newAccountForm.notes}
                  onChange={(e) => setNewAccountForm({ ...newAccountForm, notes: e.target.value })}
                  placeholder="e.g. Society primary branch account"
                  className="w-full bg-[#1F2937] border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-gray-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewAccountModal(false)}
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
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 4: TRANSFER VOUCHER PREVIEW
          ========================================================================= */}
      {selectedTransferVoucher && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">Transfer Voucher</h2>
              </div>
              <button
                onClick={() => setSelectedTransferVoucher(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="p-4 bg-gray-900/80 rounded-xl border border-gray-800 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-gray-800">
                  <span className="text-gray-400">Voucher Number:</span>
                  <span className="font-mono font-bold text-indigo-400 text-sm">
                    {selectedTransferVoucher.transferNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Transfer Date:</span>
                  <span className="font-semibold text-white">
                    {new Date(selectedTransferVoucher.date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Source:</span>
                  <span className="font-semibold text-white">
                    {selectedTransferVoucher.sourceAccountId?.name} ({selectedTransferVoucher.sourceAccountId?.channel})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Destination:</span>
                  <span className="font-semibold text-white">
                    {selectedTransferVoucher.destinationAccountId?.name} ({selectedTransferVoucher.destinationAccountId?.channel})
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-gray-800">
                  <span className="text-gray-400 font-semibold uppercase">Transferred Amount:</span>
                  <span className="text-lg font-bold text-emerald-400">
                    BDT {selectedTransferVoucher.amount.toLocaleString()}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-gray-400 block font-medium mb-1">Purpose / Justification:</span>
                <p className="text-gray-200 p-2.5 rounded-lg bg-gray-900/60 border border-gray-800 italic">
                  "{selectedTransferVoucher.purpose || 'Direct inter-account transfer'}"
                </p>
              </div>

              <div className="flex justify-between text-gray-500 pt-2 border-t border-gray-800">
                <span>Authorized By: {selectedTransferVoucher.transferredBy?.name}</span>
                <span>{new Date(selectedTransferVoucher.createdAt).toLocaleTimeString()}</span>
              </div>
            </div>

            <div className="px-6 py-3 bg-gray-900/50 border-t border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedTransferVoucher(null)}
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

export default CustodyPage;
