import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  PieChart,
  Calendar,
  Layers,
  Sparkles,
  TrendingUp,
  CreditCard,
  DollarSign,
  AlertTriangle,
  Receipt,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  X,
  Eye,
} from 'lucide-react';

interface CustodyAccountItem {
  _id: string;
  name: string;
  channel: string;
  derivedBalance: number;
}

interface MemberAllocation {
  memberId: string;
  memberCode: string;
  memberName: string;
  year: number;
  finalShares: number;
  shareRatio: number;
  grossEntitlement: number;
  shortfallDeduction: number;
  advanceCredit: number;
  penaltyAdjustment: number;
  netDistributionAmount: number;
  status: 'PENDING' | 'PAID' | 'REVERSED';
}

interface PreviewData {
  year: number;
  basis: string;
  totalPool: number;
  totalPrincipalReturned: number;
  netRealizedProfit: number;
  totalExpenses: number;
  retainedAmount: number;
  distributableAmount: number;
  totalShares: number;
  amountPerShare: number;
  memberCount: number;
  allocations: MemberAllocation[];
}

interface DistributionBatchItem {
  _id: string;
  batchNumber: string;
  year: number;
  title: string;
  status: 'DRAFT' | 'REVIEWED' | 'APPROVED' | 'PAID' | 'REVERSED';
  basis: string;
  totalPool: number;
  netRealizedProfit: number;
  totalExpenses: number;
  retainedAmount: number;
  distributableAmount: number;
  totalShares: number;
  amountPerShare: number;
  memberCount: number;
  custodyAccountId?: {
    _id: string;
    name: string;
    channel: string;
  };
  preparedBy: {
    _id: string;
    name: string;
    email: string;
  };
  reviewedBy?: {
    _id: string;
    name: string;
  };
  reviewedAt?: string;
  approvedBy?: {
    _id: string;
    name: string;
  };
  approvedAt?: string;
  paidBy?: {
    _id: string;
    name: string;
  };
  paidAt?: string;
  createdAt: string;
  notes?: string;
}

const money = (amount: unknown) =>
  `৳ ${Number(amount || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

export const DistributionPage: React.FC = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAuthorizedStaff =
    user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT';

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'workspace' | 'ledger'>('workspace');

  // Preview form states
  const [targetYear, setTargetYear] = useState<number>(() => new Date().getFullYear() - 1 || 2024);
  const [retainedAmount, setRetainedAmount] = useState<string>('0');
  const [customProfit, setCustomProfit] = useState<string>('');
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Draft Creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [batchTitle, setBatchTitle] = useState('');
  const [batchNotes, setBatchNotes] = useState('');
  const [submittingBatch, setSubmittingBatch] = useState(false);

  // Ledger state
  const [batches, setBatches] = useState<DistributionBatchItem[]>([]);
  const [loadingBatches, setLoadingBatches] = useState<boolean>(false);
  const [selectedBatch, setSelectedBatch] = useState<DistributionBatchItem | null>(null);
  const [batchDetails, setBatchDetails] = useState<{
    batch: DistributionBatchItem;
    distributions: MemberAllocation[];
  } | null>(null);

  // Settlement Execution Modal
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccountItem[]>([]);
  const [selectedCustodyId, setSelectedCustodyId] = useState('');
  const [processingPayout, setProcessingPayout] = useState(false);

  // Search & Pagination in Allocation Tables
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'memberCode' | 'memberName' | 'finalShares' | 'netDistributionAmount'>('memberCode');
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Notification / Alert
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 1. Load Live Preview
  const loadPreview = useCallback(async () => {
    try {
      setLoadingPreview(true);
      setPreviewError(null);
      const params = new URLSearchParams({
        year: String(targetYear),
        retainedAmount: retainedAmount || '0',
      });
      if (customProfit.trim()) params.append('customProfitAmount', customProfit.trim());

      const res = await apiRequest<PreviewData>(`/distributions/preview?${params.toString()}`);
      setPreview(res.data);
      if (!batchTitle) {
        setBatchTitle(`Annual Final Distribution ${targetYear}`);
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to calculate distribution preview.');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [targetYear, retainedAmount, customProfit, batchTitle]);

  // 2. Load Batches
  const loadBatches = useCallback(async () => {
    try {
      setLoadingBatches(true);
      const res = await apiRequest<{ batches: DistributionBatchItem[] }>('/distributions/batches');
      setBatches(res.data.batches || []);
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Failed to load distribution batches.' });
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  // 3. Load Custody Accounts for Payout
  const loadCustodyAccounts = useCallback(async () => {
    try {
      const res = await apiRequest<CustodyAccountItem[]>('/custody/accounts');
      setCustodyAccounts(res.data || []);
      if (res.data && res.data.length > 0) {
        setSelectedCustodyId(res.data[0]._id);
      }
    } catch {
      // Handled silently
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'workspace') {
      loadPreview();
    } else {
      loadBatches();
    }
  }, [activeTab, loadPreview, loadBatches]);

  // Create Batch
  const handleCreateBatch = async () => {
    try {
      setSubmittingBatch(true);
      const payload = {
        year: targetYear,
        title: batchTitle.trim() || `Annual Final Distribution ${targetYear}`,
        retainedAmount: Number(retainedAmount) || 0,
        customProfitAmount: customProfit ? Number(customProfit) : undefined,
        notes: batchNotes.trim() || undefined,
      };

      const res = await apiRequest<DistributionBatchItem>('/distributions/batches', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setShowCreateModal(false);
      setAlertMsg({
        type: 'success',
        text: `Distribution batch ${res.data.batchNumber} created in DRAFT status.`,
      });
      setActiveTab('ledger');
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Could not create distribution batch.' });
    } finally {
      setSubmittingBatch(false);
    }
  };

  // Review Batch
  const handleReviewBatch = async (batchId: string) => {
    try {
      const res = await apiRequest<DistributionBatchItem>(`/distributions/batches/${batchId}/review`, {
        method: 'POST',
      });
      setAlertMsg({
        type: 'success',
        text: `Batch ${res.data.batchNumber} submitted for sign-off (REVIEWED).`,
      });
      loadBatches();
      if (selectedBatch?._id === batchId) setSelectedBatch(res.data);
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Could not review batch.' });
    }
  };

  // Approve Batch (Super Admin only)
  const handleApproveBatch = async (batchId: string) => {
    try {
      const res = await apiRequest<DistributionBatchItem>(`/distributions/batches/${batchId}/approve`, {
        method: 'POST',
      });
      setAlertMsg({
        type: 'success',
        text: `Batch ${res.data.batchNumber} successfully APPROVED by Super Administrator.`,
      });
      loadBatches();
      if (selectedBatch?._id === batchId) setSelectedBatch(res.data);
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Could not approve batch.' });
    }
  };

  // Open Payout Modal
  const openPayoutModal = (batch: DistributionBatchItem) => {
    setSelectedBatch(batch);
    loadCustodyAccounts();
    setShowPayoutModal(true);
  };

  // Execute Settlement
  const handleExecutePayment = async () => {
    if (!selectedBatch || !selectedCustodyId) return;
    try {
      setProcessingPayout(true);
      await apiRequest(`/distributions/batches/${selectedBatch._id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ custodyAccountId: selectedCustodyId }),
      });

      setShowPayoutModal(false);
      setAlertMsg({
        type: 'success',
        text: `Settlement for batch ${selectedBatch.batchNumber} successfully executed! Custody balance deducted and member records marked PAID.`,
      });
      loadBatches();
      if (batchDetails?.batch._id === selectedBatch._id) {
        viewBatchDetails(selectedBatch);
      }
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Settlement execution failed.' });
    } finally {
      setProcessingPayout(false);
    }
  };

  // View Batch Details
  const viewBatchDetails = async (batch: DistributionBatchItem) => {
    try {
      setSelectedBatch(batch);
      const res = await apiRequest<{ batch: DistributionBatchItem; distributions: MemberAllocation[] }>(
        `/distributions/batches/${batch._id}`
      );
      setBatchDetails(res.data);
      setPage(1);
    } catch (err: any) {
      setAlertMsg({ type: 'error', text: err?.message || 'Failed to load batch allocations.' });
    }
  };

  // Export CSV
  const handleExportCsv = (batchId: string, batchNumber: string) => {
    const token = localStorage.getItem('token') || '';
    const link = document.createElement('a');
    link.href = `/api/distributions/batches/${batchId}/export`;
    link.setAttribute('download', `ns-foundation-distribution-${batchNumber}.csv`);
    // Native fetch download with auth header
    fetch(`/api/distributions/batches/${batchId}/export`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        link.href = url;
        link.download = `ns-foundation-distribution-${batchNumber}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch(() => {
        setAlertMsg({ type: 'error', text: 'Could not download CSV export.' });
      });
  };

  // Allocation Filtering & Sorting
  const currentAllocations =
    activeTab === 'workspace' ? preview?.allocations || [] : batchDetails?.distributions || [];

  const filteredAllocations = currentAllocations
    .filter(
      (item) =>
        item.memberCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.memberName.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortAsc ? valA - valB : valB - valA;
      }
      return sortAsc
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });

  const totalPages = Math.max(1, Math.ceil(filteredAllocations.length / pageSize));
  const paginatedAllocations = filteredAllocations.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-400">
            <PieChart size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">
              Issue #12 · Governance & Settlement
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Final Distribution & Annual Settlement
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-400">
            Authoritative year-end distribution derived from finalized share baselines, pooled returns, and multi-tier sign-off.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          {activeTab === 'workspace' && preview && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary btn-sm flex items-center gap-2 text-xs font-bold uppercase tracking-wider shadow-lg shadow-blue-600/25"
            >
              <Sparkles size={15} />
              <span>Generate Draft Batch</span>
            </button>
          )}

          <button
            onClick={activeTab === 'workspace' ? loadPreview : loadBatches}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw
              size={14}
              className={loadingPreview || loadingBatches ? 'animate-spin text-blue-400' : 'text-gray-400'}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Primary Top Navigation Tabs (Identical to Contributions & Payments) */}
      <div className="flex border-b border-white/10 gap-2 sm:gap-4 overflow-x-auto no-scrollbar">
        <button
          onClick={() => {
            setActiveTab('workspace');
            setBatchDetails(null);
          }}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'workspace'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <PieChart size={16} />
          <span>Distribution Workspace & Preview</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'ledger'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Layers size={16} />
          <span>Settlement Ledger & Batches</span>
        </button>
      </div>

      {/* Alert Banner */}
      {alertMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex items-center justify-between ${
            alertMsg.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}
        >
          <span>{alertMsg.text}</span>
          <button onClick={() => setAlertMsg(null)} className="hover:opacity-75">
            <X size={16} />
          </button>
        </div>
      )}

      {/* TAB 1: WORKSPACE & LIVE PREVIEW */}
      {activeTab === 'workspace' && (
        <div className="space-y-8 sm:space-y-10">
          {/* Controls & Configuration Filter Bar */}
          <div className="glass-card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-6 flex-wrap">
              {/* Accounting Year Picker */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-400" />
                  <span>Target Year:</span>
                </span>
                <select
                  value={targetYear}
                  onChange={(e) => setTargetYear(Number(e.target.value))}
                  className="form-select text-xs py-1.5 px-3 min-w-[110px]"
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={yr}>
                      FY {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Retained Reserve Input */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-amber-400" />
                  <span>Retained Reserve (৳):</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="0"
                  value={retainedAmount}
                  onChange={(e) => setRetainedAmount(e.target.value)}
                  className="form-input text-xs py-1.5 px-3 max-w-[130px]"
                />
              </div>

              {/* Custom Profit Allocation */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-emerald-400" />
                  <span>Custom Profit (Optional ৳):</span>
                </span>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  placeholder="Auto-calculated"
                  value={customProfit}
                  onChange={(e) => setCustomProfit(e.target.value)}
                  className="form-input text-xs py-1.5 px-3 max-w-[150px]"
                />
              </div>
            </div>

            <button
              onClick={loadPreview}
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
            >
              <RefreshCw size={13} className={loadingPreview ? 'animate-spin text-blue-400' : ''} />
              <span>Recalculate</span>
            </button>
          </div>

          {previewError && (
            <div className="glass-card p-5 border-l-4 border-l-rose-500 flex items-center gap-3 text-rose-300">
              <AlertTriangle size={20} className="shrink-0 text-rose-400" />
              <div>
                <p className="text-sm font-bold">Calculation Notice</p>
                <p className="text-xs text-rose-300/90 mt-0.5">{previewError}</p>
              </div>
            </div>
          )}

          {/* Source of Funds Metric Cards (Contributions & Payments cards design) */}
          {preview && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
                {/* Card 1: Distributable Pool */}
                <div className="glass-card p-5 border-l-4 border-l-blue-500 hover:border-blue-500/50 transition-all">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Distributable Pool</span>
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      <DollarSign size={18} />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                    {money(preview.distributableAmount)}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                    <span>Year {preview.year} allocation</span>
                    <span className="text-blue-400 font-semibold">100% Reconciled</span>
                  </div>
                </div>

                {/* Card 2: Net Realized Profit */}
                <div className="glass-card p-5 border-l-4 border-l-emerald-500 hover:border-emerald-500/50 transition-all">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Realized Profit Pool</span>
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Sparkles size={18} />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-3 tracking-tight">
                    {money(preview.netRealizedProfit)}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                    <span>From matured projects</span>
                    <span className="text-gray-500">Expenses: {money(preview.totalExpenses)}</span>
                  </div>
                </div>

                {/* Card 3: Retained Capital Reserve */}
                <div className="glass-card p-5 border-l-4 border-l-amber-500 hover:border-amber-500/50 transition-all">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Retained Reserve</span>
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      <ShieldCheck size={18} />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-3 tracking-tight">
                    {money(preview.retainedAmount)}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                    <span>Withheld for emergency fund</span>
                    <span className="text-amber-400 font-semibold">Retained in custody</span>
                  </div>
                </div>

                {/* Card 4: Rate Per Share & Member Count */}
                <div className="glass-card p-5 border-l-4 border-l-purple-500 hover:border-purple-500/50 transition-all">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                    <span>Yield Per Share</span>
                    <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      <Receipt size={18} />
                    </div>
                  </div>
                  <p className="text-2xl sm:text-3xl font-extrabold text-purple-400 mt-3 tracking-tight">
                    {money(preview.amountPerShare)}
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                    <span>{preview.totalShares} total shares</span>
                    <span className="text-purple-400 font-semibold">
                      {preview.memberCount} members
                    </span>
                  </div>
                </div>
              </div>

              {/* Member Allocations Table Card */}
              <div className="glass-card p-5 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Layers size={16} className="text-blue-400" />
                      <span>Member Entitlement Breakdown</span>
                    </h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Pro-rata payout per member based on finalized December share count, with shortfall/advance offsets.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search
                        size={15}
                        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
                      />
                      <input
                        type="text"
                        placeholder="Search member..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setPage(1);
                        }}
                        className="form-input text-xs py-1.5 pl-8 pr-3 max-w-[180px]"
                      />
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th
                          className="cursor-pointer hover:text-white"
                          onClick={() => {
                            setSortField('memberCode');
                            setSortAsc(!sortAsc);
                          }}
                        >
                          Member ID {sortField === 'memberCode' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th
                          className="cursor-pointer hover:text-white"
                          onClick={() => {
                            setSortField('memberName');
                            setSortAsc(!sortAsc);
                          }}
                        >
                          Name {sortField === 'memberName' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th
                          className="text-right cursor-pointer hover:text-white"
                          onClick={() => {
                            setSortField('finalShares');
                            setSortAsc(!sortAsc);
                          }}
                        >
                          Final Shares {sortField === 'finalShares' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-right">Share Ratio</th>
                        <th className="text-right">Gross Payout</th>
                        <th className="text-right">Deductions</th>
                        <th
                          className="text-right cursor-pointer hover:text-white"
                          onClick={() => {
                            setSortField('netDistributionAmount');
                            setSortAsc(!sortAsc);
                          }}
                        >
                          Net Payable {sortField === 'netDistributionAmount' ? (sortAsc ? '↑' : '↓') : ''}
                        </th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedAllocations.length ? (
                        paginatedAllocations.map((item) => (
                          <tr key={item.memberId} className="hover:bg-white/[0.02]">
                            <td className="font-bold text-blue-400">{item.memberCode}</td>
                            <td className="font-semibold text-white">{item.memberName}</td>
                            <td className="text-right font-extrabold text-white">
                              {item.finalShares}
                            </td>
                            <td className="text-right text-gray-400">
                              {(item.shareRatio * 100).toFixed(2)}%
                            </td>
                            <td className="text-right text-gray-300">
                              {money(item.grossEntitlement)}
                            </td>
                            <td className="text-right">
                              {item.shortfallDeduction > 0 ? (
                                <span className="text-rose-400 font-semibold">
                                  - {money(item.shortfallDeduction)}
                                </span>
                              ) : item.advanceCredit > 0 ? (
                                <span className="text-emerald-400 font-semibold">
                                  + {money(item.advanceCredit)}
                                </span>
                              ) : (
                                <span className="text-gray-500">—</span>
                              )}
                            </td>
                            <td className="text-right font-extrabold text-emerald-400 text-base">
                              {money(item.netDistributionAmount)}
                            </td>
                            <td className="text-center">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-300 border border-amber-500/25">
                                Preview
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            No member allocations match the search filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs text-gray-400">
                  <span>
                    Showing {paginatedAllocations.length} of {filteredAllocations.length} members
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="p-1.5 rounded-lg border border-white/10 bg-slate-900/80 text-gray-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="font-semibold text-white">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="p-1.5 rounded-lg border border-white/10 bg-slate-900/80 text-gray-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: SETTLEMENT LEDGER & BATCHES */}
      {activeTab === 'ledger' && (
        <div className="space-y-6">
          {batchDetails ? (
            /* Detailed View of Single Batch */
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setBatchDetails(null)}
                  className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 uppercase tracking-wider"
                >
                  <ChevronLeft size={16} />
                  <span>Back to Batch List</span>
                </button>

                <button
                  onClick={() =>
                    handleExportCsv(batchDetails.batch._id, batchDetails.batch.batchNumber)
                  }
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                >
                  <Download size={14} />
                  <span>Export CSV</span>
                </button>
              </div>

              {/* Batch Overview Banner Card */}
              <div className="glass-card p-6 border-l-4 border-l-blue-500 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {batchDetails.batch.batchNumber}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${
                          batchDetails.batch.status === 'PAID'
                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                            : batchDetails.batch.status === 'APPROVED'
                            ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                            : batchDetails.batch.status === 'REVIEWED'
                            ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                            : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {batchDetails.batch.status}
                      </span>
                    </div>
                    <h2 className="text-xl font-extrabold text-white mt-1">
                      {batchDetails.batch.title}
                    </h2>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-gray-400 uppercase font-semibold">Total Settlement</p>
                    <p className="text-2xl font-extrabold text-emerald-400">
                      {money(batchDetails.batch.distributableAmount)}
                    </p>
                  </div>
                </div>

                {/* Audit & Workflow Trail */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/5 text-xs text-gray-400">
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-500">
                      Prepared By
                    </span>
                    <span className="text-white font-medium">
                      {batchDetails.batch.preparedBy?.name || 'Staff'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-500">
                      Reviewed By
                    </span>
                    <span className="text-white font-medium">
                      {batchDetails.batch.reviewedBy?.name || 'Pending Review'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-500">
                      Authorized By
                    </span>
                    <span className="text-white font-medium">
                      {batchDetails.batch.approvedBy?.name || 'Pending Super Admin'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-bold text-gray-500">
                      Disbursement Account
                    </span>
                    <span className="text-cyan-400 font-semibold">
                      {batchDetails.batch.custodyAccountId?.name || 'Pending Selection'}
                    </span>
                  </div>
                </div>

                {/* Action Controls for Batch */}
                <div className="flex items-center gap-3 pt-2">
                  {batchDetails.batch.status === 'DRAFT' && isAuthorizedStaff && (
                    <button
                      onClick={() => handleReviewBatch(batchDetails.batch._id)}
                      className="btn btn-primary btn-sm text-xs font-bold uppercase tracking-wider"
                    >
                      <span>Submit For Sign-Off</span>
                    </button>
                  )}

                  {batchDetails.batch.status === 'REVIEWED' && isSuperAdmin && (
                    <button
                      onClick={() => handleApproveBatch(batchDetails.batch._id)}
                      className="btn btn-primary btn-sm text-xs font-bold uppercase tracking-wider bg-purple-600 hover:bg-purple-500"
                    >
                      <ShieldCheck size={14} />
                      <span>Approve Batch (Super Admin)</span>
                    </button>
                  )}

                  {batchDetails.batch.status === 'APPROVED' && isSuperAdmin && (
                    <button
                      onClick={() => openPayoutModal(batchDetails.batch)}
                      className="btn btn-primary btn-sm text-xs font-bold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/25"
                    >
                      <CreditCard size={14} />
                      <span>Disburse Payouts</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Member Settlement Line Items */}
              <div className="glass-card p-5 sm:p-6 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Receipt size={16} className="text-blue-400" />
                  <span>Member Settlement Records ({batchDetails.distributions.length})</span>
                </h3>

                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Member Code</th>
                        <th>Name</th>
                        <th className="text-right">Final Shares</th>
                        <th className="text-right">Share %</th>
                        <th className="text-right">Gross</th>
                        <th className="text-right">Adjustments</th>
                        <th className="text-right">Net Paid</th>
                        <th className="text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchDetails.distributions.map((d) => (
                        <tr key={d.memberId} className="hover:bg-white/[0.02]">
                          <td className="font-bold text-blue-400">{d.memberCode}</td>
                          <td className="font-semibold text-white">{d.memberName}</td>
                          <td className="text-right font-extrabold text-white">{d.finalShares}</td>
                          <td className="text-right text-gray-400">
                            {(d.shareRatio * 100).toFixed(2)}%
                          </td>
                          <td className="text-right text-gray-300">
                            {money(d.grossEntitlement)}
                          </td>
                          <td className="text-right text-xs">
                            {d.shortfallDeduction > 0 ? (
                              <span className="text-rose-400 font-semibold">
                                - {money(d.shortfallDeduction)}
                              </span>
                            ) : d.advanceCredit > 0 ? (
                              <span className="text-emerald-400 font-semibold">
                                + {money(d.advanceCredit)}
                              </span>
                            ) : (
                              <span className="text-gray-500">—</span>
                            )}
                          </td>
                          <td className="text-right font-extrabold text-emerald-400">
                            {money(d.netDistributionAmount)}
                          </td>
                          <td className="text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                d.status === 'PAID'
                                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            /* Batches List */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers size={16} className="text-blue-400" />
                  <span>Historical Settlement Batches</span>
                </h2>
                <span className="text-xs text-gray-400">{batches.length} batches recorded</span>
              </div>

              {loadingBatches ? (
                <div className="glass-card p-12 text-center text-sm text-gray-400">
                  <RefreshCw size={20} className="animate-spin text-blue-400 mx-auto mb-2" />
                  <span>Loading distribution batches…</span>
                </div>
              ) : batches.length === 0 ? (
                <div className="glass-card p-12 text-center text-sm text-gray-400 space-y-2">
                  <p className="font-semibold text-white">No Distribution Batches Yet</p>
                  <p className="text-xs text-gray-500">
                    Switch to the workspace tab to calculate and generate a new year-end distribution batch.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {batches.map((batch) => (
                    <div
                      key={batch._id}
                      className="glass-card p-5 sm:p-6 border-l-4 hover:border-l-blue-500 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      style={{
                        borderLeftColor:
                          batch.status === 'PAID'
                            ? '#10B981'
                            : batch.status === 'APPROVED'
                            ? '#3B82F6'
                            : batch.status === 'REVIEWED'
                            ? '#A855F7'
                            : '#F59E0B',
                      }}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-slate-900 border border-white/10 text-white">
                            {batch.batchNumber}
                          </span>
                          <span className="text-xs font-semibold text-gray-400">
                            FY {batch.year}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              batch.status === 'PAID'
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                : batch.status === 'APPROVED'
                                ? 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
                                : batch.status === 'REVIEWED'
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {batch.status}
                          </span>
                        </div>

                        <h3 className="text-base sm:text-lg font-bold text-white">{batch.title}</h3>

                        <div className="flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                          <span>{batch.memberCount} beneficiaries</span>
                          <span>·</span>
                          <span>{batch.totalShares} shares</span>
                          <span>·</span>
                          <span>Rate: {money(batch.amountPerShare)}/share</span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:items-end justify-between gap-3 pt-3 sm:pt-0 border-t border-white/5 sm:border-t-0">
                        <div className="sm:text-right">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            Total Disbursed
                          </span>
                          <p className="text-xl sm:text-2xl font-extrabold text-white">
                            {money(batch.distributableAmount)}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            onClick={() => viewBatchDetails(batch)}
                            className="btn btn-secondary btn-sm text-xs font-semibold flex items-center gap-1"
                          >
                            <Eye size={13} />
                            <span>View Allocations</span>
                          </button>

                          {batch.status === 'DRAFT' && isAuthorizedStaff && (
                            <button
                              onClick={() => handleReviewBatch(batch._id)}
                              className="btn btn-primary btn-sm text-xs font-semibold"
                            >
                              <span>Submit Review</span>
                            </button>
                          )}

                          {batch.status === 'REVIEWED' && isSuperAdmin && (
                            <button
                              onClick={() => handleApproveBatch(batch._id)}
                              className="btn btn-primary btn-sm text-xs font-semibold bg-purple-600 hover:bg-purple-500"
                            >
                              <span>Approve</span>
                            </button>
                          )}

                          {batch.status === 'APPROVED' && isSuperAdmin && (
                            <button
                              onClick={() => openPayoutModal(batch)}
                              className="btn btn-primary btn-sm text-xs font-semibold bg-emerald-600 hover:bg-emerald-500"
                            >
                              <span>Pay Out</span>
                            </button>
                          )}

                          <button
                            onClick={() => handleExportCsv(batch._id, batch.batchNumber)}
                            className="p-2 rounded-lg border border-white/10 hover:bg-white/10 text-gray-300"
                            title="Export CSV"
                          >
                            <Download size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE DRAFT BATCH MODAL */}
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sparkles size={18} className="text-blue-400" />
                <span>Create Distribution Batch</span>
              </h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 space-y-1">
                <p className="font-bold">Summary of New Batch:</p>
                <p>• Year: <strong>{targetYear}</strong></p>
                <p>• Total Distributable Amount: <strong>{money(preview?.distributableAmount)}</strong></p>
                <p>• Beneficiary Members: <strong>{preview?.memberCount}</strong></p>
              </div>

              <div>
                <label className="form-label block mb-1 font-semibold text-gray-300">
                  Batch Title
                </label>
                <input
                  type="text"
                  value={batchTitle}
                  onChange={(e) => setBatchTitle(e.target.value)}
                  placeholder={`Annual Final Distribution ${targetYear}`}
                  className="form-input text-xs"
                />
              </div>

              <div>
                <label className="form-label block mb-1 font-semibold text-gray-300">
                  Internal Governance Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={batchNotes}
                  onChange={(e) => setBatchNotes(e.target.value)}
                  placeholder="Notes on AGM decision, audit approvals, or special reserve withholding..."
                  className="form-input text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setShowCreateModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateBatch}
                disabled={submittingBatch}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {submittingBatch ? <RefreshCw size={14} className="animate-spin" /> : null}
                <span>Confirm & Create Draft</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXECUTE PAYOUT MODAL */}
      {showPayoutModal && selectedBatch && (
        <div className="modal-overlay">
          <div className="modal-content p-6 space-y-5 border-rose-500/30">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle size={18} className="text-rose-400" />
                <span>Execute Irreversible Settlement</span>
              </h3>
              <button
                onClick={() => setShowPayoutModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 space-y-2">
                <p className="font-extrabold text-sm">CRITICAL FINANCIAL ACTION</p>
                <p>
                  Executing this settlement will disburse{' '}
                  <strong>{money(selectedBatch.distributableAmount)}</strong> across{' '}
                  <strong>{selectedBatch.memberCount}</strong> members.
                </p>
                <p>
                  An outgoing <code>CustodyMovement</code> will be posted to the selected custody
                  account, and beneficiary records will be locked as <strong>PAID</strong>.
                </p>
              </div>

              <div>
                <label className="form-label block mb-1 font-semibold text-gray-300">
                  Select Payout Custody Account
                </label>
                <select
                  value={selectedCustodyId}
                  onChange={(e) => setSelectedCustodyId(e.target.value)}
                  className="form-select text-xs"
                >
                  {custodyAccounts.map((acc) => (
                    <option key={acc._id} value={acc._id}>
                      {acc.name} ({acc.channel}) — Available: {money(acc.derivedBalance)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setShowPayoutModal(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleExecutePayment}
                disabled={processingPayout}
                className="btn btn-primary btn-sm bg-rose-600 hover:bg-rose-500 flex items-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                {processingPayout ? <RefreshCw size={14} className="animate-spin" /> : null}
                <span>Disburse Now</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
