import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  Plus,
  Search,
  Calendar,
  DollarSign,
  AlertTriangle,
  Receipt,
  FileText,
  Shield,
  Layers,
  Sparkles,
  TrendingUp,
  X,
  Eye,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface CustodyAccountItem {
  _id: string;
  name: string;
  accountType: string;
  channel: string;
  accountNumber?: string;
  cachedBalance: number;
  holderId?: {
    _id: string;
    name: string;
    email: string;
    accountantType: string;
  };
}

interface MemberOption {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  status: string;
  cashoutDue?: number;
}

interface AllocationItem {
  targetMonth: string;
  allocationType: string;
  amount: number;
  description: string;
}

interface PaymentItem {
  _id: string;
  receiptNumber: string;
  memberId: {
    _id: string;
    name: string;
    memberId: string;
    phone: string;
    address?: string;
  };
  receiverId: {
    _id: string;
    name: string;
    email: string;
    accountantType?: string;
  };
  custodyAccountId: {
    _id: string;
    name: string;
    channel: string;
    accountNumber?: string;
  };
  paymentDate: string;
  totalAmount: number;
  principalAmount: number;
  penaltyAmount: number;
  cashoutCharge: number;
  unpaidCashoutCharge?: number;
  advanceAmount: number;
  paymentMethod: string;
  transactionReference?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

interface PaymentStats {
  timeframe: string;
  totals: {
    totalReceived: number;
    totalPrincipal: number;
    totalPenalty: number;
    totalAdvance: number;
    totalCashoutCharge: number;
    totalUnpaidCashout: number;
    count: number;
  };
  byMethod: Record<string, { total: number; count: number }>;
  byAccountant: Array<{
    _id: string;
    name: string;
    email: string;
    accountantType?: string;
    total: number;
    principal: number;
    penalty: number;
    advance: number;
    cashout: number;
    count: number;
  }>;
}

interface PenaltyRuleItem {
  _id: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  ratePerShare: number;
  graceDayOfMonth: number;
  description?: string;
}

interface PenaltyWaiverItem {
  _id: string;
  month: string;
  isGlobal: boolean;
  reason: string;
  memberId?: {
    name: string;
    memberId: string;
  };
}

const paymentMethodForChannel = (channel?: string) =>
  channel === 'BANK' ? 'BANK_TRANSFER' : channel === 'NAGAD' ? 'NAGAD' : channel === 'CASH' ? 'CASH' : 'BKASH';

export const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Active Top-level Tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'ledger' | 'rules'>('analytics');

  // Filter States for Analytics
  const [timeframe, setTimeframe] = useState<'daily' | 'monthly' | 'yearly'>('monthly');
  const [filterDate, setFilterDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  });
  const [accountantFilter, setAccountantFilter] = useState<string>('ALL');
  const [methodFilter, setMethodFilter] = useState<string>('ALL');

  // Stats Data
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // Payments Ledger Data
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState<number>(1);
  const [ledgerTotalCount, setLedgerTotalCount] = useState<number>(0);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);

  // Common Metadata
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccountItem[]>([]);
  const [penaltyRules, setPenaltyRules] = useState<PenaltyRuleItem[]>([]);
  const [penaltyWaivers, setPenaltyWaivers] = useState<PenaltyWaiverItem[]>([]);

  // Modal States
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<{
    payment: PaymentItem;
    allocations: AllocationItem[];
  } | null>(null);
  const [showAddRuleModal, setShowAddRuleModal] = useState<boolean>(false);
  const [showAddWaiverModal, setShowAddWaiverModal] = useState<boolean>(false);

  // Collect Payment Form State
  const [formData, setFormData] = useState({
    memberId: '',
    custodyAccountId: '',
    receiverId: user?.id || '',
    paymentDate: new Date().toISOString().split('T')[0],
    totalAmount: '',
    paymentMethod: 'BKASH',
    cashoutChargePaid: '0',
    transactionReference: '',
    notes: '',
  });

  const [allocationPreview, setAllocationPreview] = useState<{
    allocations: AllocationItem[];
    breakdown: {
      principalAmount: number;
      penaltyAmount: number;
      advanceAmount: number;
      cashoutChargePaid: number;
    };
    member: {
      shares: number;
      monthlyObligation: number;
      currentCashoutDue: number;
      newCashoutDue: number;
    };
    gateway: { channel: string; ratePercentage: number; fixedFee: number; roundingIncrement: number; requiredCharge: number; };
    dueSummary: { previousMonthsPrincipal: number; previousMonthsPenalty: number; currentMonthPayable: number; currentMonthPenalty: number; carriedCashoutCharge: number; estimatedCashoutCharge: number; totalDue: number; };
  } | null>(null);

  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [collectSubmitting, setCollectSubmitting] = useState<boolean>(false);
  const [collectError, setCollectError] = useState<string | null>(null);

  // Admin Penalty Rule Form
  const [ruleFormData, setRuleFormData] = useState({
    effectiveFrom: '',
    effectiveTo: '',
    ratePerShare: 40,
    graceDayOfMonth: 15,
    description: '',
  });

  // Admin Penalty Waiver Form
  const [waiverFormData, setWaiverFormData] = useState({
    month: '',
    isGlobal: true,
    reason: '',
  });

  // Fetch Meta Data (Custody accounts, members, rules)
  const fetchMetadata = useCallback(async () => {
    try {
      const [membersRes, custodyRes, rulesRes, waiversRes] = await Promise.all([
        apiRequest<MemberOption[]>('/members?limit=200'),
        apiRequest<CustodyAccountItem[]>('/payments/custody-accounts'),
        apiRequest<PenaltyRuleItem[]>('/payments/penalty-rules'),
        apiRequest<PenaltyWaiverItem[]>('/payments/penalty-waivers'),
      ]);

      setMembersList(membersRes.data || []);
      setCustodyAccounts(custodyRes.data || []);
      setPenaltyRules(rulesRes.data || []);
      setPenaltyWaivers(waiversRes.data || []);

      // Default custody account if available
      if (custodyRes.data && custodyRes.data.length > 0 && !formData.custodyAccountId) {
        setFormData((prev) => ({ ...prev, custodyAccountId: custodyRes.data[0]._id, paymentMethod: paymentMethodForChannel(custodyRes.data[0].channel) }));
      }
    } catch (err) {
      console.error('Error fetching metadata:', err);
    }
  }, [formData.custodyAccountId]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Fetch Stats Analytics
  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams({
        timeframe,
        date: filterDate,
        receiverId: accountantFilter,
        paymentMethod: methodFilter,
      });
      const res = await apiRequest<PaymentStats>(`/payments/stats?${params.toString()}`);
      setStats(res.data);
    } catch (err) {
      console.error('Error loading stats:', err);
    } finally {
      setLoadingStats(false);
    }
  }, [timeframe, filterDate, accountantFilter, methodFilter]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Fetch Payments Ledger
  const fetchPaymentsLedger = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const params = new URLSearchParams({
        page: String(ledgerPage),
        limit: '15',
        search: ledgerSearch,
        receiverId: accountantFilter,
        paymentMethod: methodFilter,
      });
      const res = await apiRequest<PaymentItem[]>(`/payments?${params.toString()}`);
      setPayments(res.data || []);
      if (res.pagination) {
        setLedgerTotalPages(res.pagination.totalPages);
        setLedgerTotalCount(res.pagination.total);
      }
    } catch (err) {
      console.error('Error loading payments:', err);
    } finally {
      setLoadingPayments(false);
    }
  }, [ledgerPage, ledgerSearch, accountantFilter, methodFilter]);

  useEffect(() => {
    if (activeTab === 'ledger') {
      fetchPaymentsLedger();
    }
  }, [activeTab, fetchPaymentsLedger]);

  // Trigger preview calculation
  const handleCalculatePreview = async () => {
    if (!formData.memberId || !formData.totalAmount || Number(formData.totalAmount) <= 0) {
      return;
    }
    setPreviewLoading(true);
    setCollectError(null);
    try {
      const res = await apiRequest<{
        allocations: AllocationItem[];
        breakdown: {
          principalAmount: number;
          penaltyAmount: number;
          advanceAmount: number;
          cashoutChargePaid: number;
        };
        member: {
          shares: number;
          monthlyObligation: number;
          currentCashoutDue: number;
          newCashoutDue: number;
        };
        gateway: { channel: string; ratePercentage: number; fixedFee: number; roundingIncrement: number; requiredCharge: number; };
        dueSummary: { previousMonthsPrincipal: number; previousMonthsPenalty: number; currentMonthPayable: number; currentMonthPenalty: number; carriedCashoutCharge: number; estimatedCashoutCharge: number; totalDue: number; };
      }>('/payments/preview', {
        method: 'POST',
        body: JSON.stringify({
          memberId: formData.memberId,
          paymentDate: formData.paymentDate,
          totalAmount: Number(formData.totalAmount),
          paymentMethod: formData.paymentMethod,
          custodyAccountId: formData.custodyAccountId,
          cashoutChargePaid: Number(formData.cashoutChargePaid) || 0,
        }),
      });
      setAllocationPreview(res.data);
    } catch (err: unknown) {
      setCollectError((err as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Submit Payment Collection
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setCollectError(null);
    setCollectSubmitting(true);

    try {
      const res = await apiRequest<{
        payment: PaymentItem;
        receiptNumber: string;
      }>('/payments', {
        method: 'POST',
        body: JSON.stringify({
          memberId: formData.memberId,
          receiverId: formData.receiverId || user?.id,
          custodyAccountId: formData.custodyAccountId,
          paymentDate: formData.paymentDate,
          totalAmount: Number(formData.totalAmount),
          paymentMethod: formData.paymentMethod,
          cashoutChargePaid: Number(formData.cashoutChargePaid) || 0,
          transactionReference: formData.transactionReference,
          notes: formData.notes,
        }),
      });

      setShowCollectModal(false);
      // Open receipt modal for newly collected payment
      handleViewReceipt(res.data.payment._id);
      fetchStats();
      fetchPaymentsLedger();
      fetchMetadata();
    } catch (err: unknown) {
      setCollectError((err as Error).message);
    } finally {
      setCollectSubmitting(false);
    }
  };

  // View Receipt Modal
  const handleViewReceipt = async (paymentId: string) => {
    try {
      const res = await apiRequest<{
        payment: PaymentItem;
        allocations: AllocationItem[];
      }>(`/payments/${paymentId}`);
      setSelectedReceipt(res.data);
      setShowReceiptModal(true);
    } catch (err) {
      console.error('Error fetching receipt details:', err);
    }
  };

  // Submit Admin Penalty Rule
  const handleSavePenaltyRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/payments/penalty-rules', {
        method: 'POST',
        body: JSON.stringify(ruleFormData),
      });
      setShowAddRuleModal(false);
      fetchMetadata();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  // Submit Admin Penalty Waiver
  const handleCreatePenaltyWaiver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/payments/penalty-waivers', {
        method: 'POST',
        body: JSON.stringify(waiverFormData),
      });
      setShowAddWaiverModal(false);
      fetchMetadata();
    } catch (err: unknown) {
      alert((err as Error).message);
    }
  };

  const selectedMemberObj = membersList.find((m) => m._id === formData.memberId);

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Contributions & Payments
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Dual-accountant collection registry, payment allocation engine, and gateway cashout management.
          </p>
        </div>

        <button
          onClick={() => {
            setCollectError(null);
            setAllocationPreview(null);
            setFormData({
              memberId: membersList[0]?._id || '',
              custodyAccountId: custodyAccounts[0]?._id || '',
              receiverId: user?.id || '',
              paymentDate: new Date().toISOString().split('T')[0],
              totalAmount: '',
              paymentMethod: 'BKASH',
              cashoutChargePaid: '0',
              transactionReference: '',
              notes: '',
            });
            setShowCollectModal(true);
          }}
          className="btn btn-primary shrink-0 self-start sm:self-auto shadow-lg shadow-blue-500/20"
        >
          <Plus size={18} />
          <span>Collect Payment</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 ${
            activeTab === 'analytics'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <TrendingUp size={16} />
          <span>Collection Analytics</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 ${
            activeTab === 'ledger'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Receipt size={16} />
          <span>Receipts & Payment History</span>
        </button>

      </div>

      {/* TAB 1: COLLECTION ANALYTICS & STATS DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Timeframe selector: Daily | Monthly | Yearly */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Interval:
              </span>
              <div className="bg-slate-900/80 p-1 rounded-xl border border-white/10 flex gap-1">
                {(['daily', 'monthly', 'yearly'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTimeframe(t);
                      if (t === 'daily') setFilterDate(new Date().toISOString().split('T')[0]);
                      else if (t === 'yearly') setFilterDate(String(new Date().getFullYear()));
                      else {
                        const d = new Date();
                        setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all ${
                      timeframe === t
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* Date Input based on timeframe */}
              {timeframe === 'daily' && (
                <input
                  type="date"
                  className="form-input text-xs py-1.5 px-3 max-w-[150px]"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              )}

              {timeframe === 'monthly' && (
                <input
                  type="month"
                  className="form-input text-xs py-1.5 px-3 max-w-[150px]"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                />
              )}

              {timeframe === 'yearly' && (
                <select
                  className="form-select text-xs py-1.5 px-3 max-w-[120px]"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                >
                  {[2024, 2025, 2026, 2027].map((yr) => (
                    <option key={yr} value={String(yr)}>
                      {yr}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Accountant / Receiver Filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Receiver:
                </span>
                <select
                  className="form-select text-xs py-1.5 px-3 min-w-[140px]"
                  value={accountantFilter}
                  onChange={(e) => setAccountantFilter(e.target.value)}
                >
                  <option value="ALL">All Accountants (Admin)</option>
                  {custodyAccounts
                    .filter((c) => c.holderId)
                    .map((c) => c.holderId!)
                    .filter((v, i, a) => a.findIndex((t) => t._id === v._id) === i)
                    .map((acc) => (
                      <option key={acc._id} value={acc._id}>
                        {acc.name} ({acc.accountantType || 'ACC'})
                      </option>
                    ))}
                </select>
              </div>

              {/* Method Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  Method:
                </span>
                <select
                  className="form-select text-xs py-1.5 px-3 min-w-[110px]"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="ALL">All Methods</option>
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="CASH">Physical Cash</option>
                  <option value="BANK_TRANSFER">Bank</option>
                </select>
              </div>
            </div>
          </div>

          {/* Primary Metric KPI Cards */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 transition-opacity duration-200 ${loadingStats ? 'opacity-50' : 'opacity-100'}`}>
            <div className="glass-card p-5 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>Total Received</span>
                <DollarSign size={18} className="text-blue-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
                ৳ {(stats?.totals.totalReceived || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">
                {stats?.totals.count || 0} total receipts
              </span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>Monthly Principal</span>
                <Layers size={18} className="text-emerald-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2">
                ৳ {(stats?.totals.totalPrincipal || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Monthly share dues settled</span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-rose-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>Penalties Collected</span>
                <AlertTriangle size={18} className="text-rose-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-400 mt-2">
                ৳ {(stats?.totals.totalPenalty || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Late payment fines</span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>Advance Prepayments</span>
                <Sparkles size={18} className="text-purple-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-400 mt-2">
                ৳ {(stats?.totals.totalAdvance || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">Prepaid future months</span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>Cashout Paid</span>
                <CreditCard size={18} className="text-amber-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-2">
                ৳ {(stats?.totals.totalCashoutCharge || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">
                ৳ {stats?.totals.totalUnpaidCashout || 0} unpaid due
              </span>
            </div>
          </div>

          {/* Breakdown Section: By Payment Method & Multi-Accountant Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Method Breakdown Card */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={16} className="text-blue-400" />
                <span>Collection by Payment Method</span>
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { key: 'BKASH', label: 'bKash', color: 'from-pink-500 to-rose-600' },
                  { key: 'NAGAD', label: 'Nagad', color: 'from-orange-500 to-amber-600' },
                  { key: 'CASH', label: 'Physical Cash', color: 'from-emerald-500 to-teal-600' },
                  { key: 'BANK_TRANSFER', label: 'Bank', color: 'from-blue-500 to-indigo-600' },
                ].map((m) => {
                  const data = stats?.byMethod[m.key] || { total: 0, count: 0 };
                  const pct =
                    stats?.totals.totalReceived && stats.totals.totalReceived > 0
                      ? Math.round((data.total / stats.totals.totalReceived) * 100)
                      : 0;

                  return (
                    <div
                      key={m.key}
                      className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex flex-col justify-between"
                    >
                      <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                          {m.label}
                        </span>
                        <p className="text-lg font-extrabold text-white mt-1">
                          ৳ {data.total.toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
                        <span>{data.count} receipts</span>
                        <span className="font-bold text-blue-400">{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Admin Multi-Accountant Comparison Card */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" />
                <span>Dual Accountant Collection Comparison</span>
              </h2>

              {stats?.byAccountant && stats.byAccountant.length > 0 ? (
                <div className="space-y-3 pt-2">
                  {stats.byAccountant.map((acc) => (
                    <div
                      key={acc._id}
                      className="p-4 rounded-xl bg-slate-900/60 border border-white/5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                          {acc.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white">{acc.name}</p>
                          <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                            {acc.accountantType || 'ACCOUNTANT'}
                          </span>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-base font-extrabold text-white">
                          ৳ {acc.total.toLocaleString()}
                        </p>
                        <span className="text-[11px] text-gray-400">
                          {acc.count} collections (৳ {acc.penalty} penalty)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500 text-xs">
                  No accountant collections recorded for the selected interval.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RECEIPTS & PAYMENT HISTORY LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Search bar & count */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[280px]">
              <Search
                size={18}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
              />
              <input
                type="text"
                className="form-input pl-10 text-sm"
                placeholder="Search receipts by receipt #, member name, ID, or phone..."
                value={ledgerSearch}
                onChange={(e) => {
                  setLedgerSearch(e.target.value);
                  setLedgerPage(1);
                }}
              />
            </div>

            <span className="text-xs font-semibold text-gray-400">
              Showing {payments.length} of {ledgerTotalCount} records
            </span>
          </div>

          {/* Payments Table */}
          <div className="table-container glass-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Receipt #</th>
                  <th>Payment Date</th>
                  <th>Member</th>
                  <th>Receiver & Custody</th>
                  <th>Method</th>
                  <th>Total Received</th>
                  <th>Breakdown</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayments ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                      <span>Loading payments registry...</span>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <Receipt size={32} className="opacity-30 mx-auto mb-3" />
                      <p>No payment records found.</p>
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p._id} className="hover:bg-white/[0.02] transition-colors">
                      <td>
                        <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/25">
                          {p.receiptNumber}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs text-gray-300">
                          <Calendar size={13} className="text-gray-500" />
                          <span>{new Date(p.paymentDate).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="font-semibold text-white text-sm">
                            {p.memberId?.name || 'Unknown'}
                          </p>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {p.memberId?.memberId}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <p className="text-xs font-bold text-white">
                            {p.receiverId?.name}
                          </p>
                          <span className="text-[11px] text-gray-400">
                            {p.custodyAccountId?.name}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-active text-[10px]">
                          {p.paymentMethod}
                        </span>
                      </td>
                      <td>
                        <span className="font-extrabold text-sm text-white">
                          ৳ {p.totalAmount.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div className="text-[11px] space-y-0.5">
                          <span className="text-emerald-400 block">
                            Pri: ৳{p.principalAmount}
                          </span>
                          {p.penaltyAmount > 0 && (
                            <span className="text-rose-400 block">
                              Pen: ৳{p.penaltyAmount}
                            </span>
                          )}
                          {p.advanceAmount > 0 && (
                            <span className="text-purple-400 block">
                              Adv: ৳{p.advanceAmount}
                            </span>
                          )}
                          {p.cashoutCharge > 0 && (
                            <span className="text-amber-400 block">
                              CO: ৳{p.cashoutCharge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => handleViewReceipt(p._id)}
                          className="btn btn-secondary btn-sm p-1.5"
                          title="View Official Receipt"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {ledgerTotalPages > 1 && (
            <div className="flex items-center justify-between p-3 glass-card">
              <span className="text-xs text-gray-400">
                Page {ledgerPage} of {ledgerTotalPages}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  className="btn btn-secondary btn-sm"
                >
                  <ChevronLeft size={14} />
                  <span>Previous</span>
                </button>
                <button
                  disabled={ledgerPage >= ledgerTotalPages}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  className="btn btn-secondary btn-sm"
                >
                  <span>Next</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ADMIN PENALTY RULES & WAIVERS CONFIGURATION */}
      {activeTab === 'rules' && isAdmin && (
        <div className="space-y-6">
          {/* Rules header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-white">Dynamic Penalty Rules</h2>
              <p className="text-xs text-gray-400">
                Configure rate per share and monthly grace period deadlines without hardcoded rules.
              </p>
            </div>
            <button
              onClick={() => {
                setRuleFormData({
                  effectiveFrom: '',
                  effectiveTo: '',
                  ratePerShare: 40,
                  graceDayOfMonth: 15,
                  description: '',
                });
                setShowAddRuleModal(true);
              }}
              className="btn btn-secondary btn-sm"
            >
              <Plus size={14} />
              <span>Add Penalty Rule</span>
            </button>
          </div>

          {/* Rules Table */}
          <div className="table-container glass-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Effective From</th>
                  <th>Effective To</th>
                  <th>Rate Per Share</th>
                  <th>Grace Day (Deadline)</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {penaltyRules.map((r) => (
                  <tr key={r._id}>
                    <td className="font-mono text-xs font-bold text-blue-400">
                      {r.effectiveFrom}
                    </td>
                    <td className="font-mono text-xs text-gray-400">
                      {r.effectiveTo || 'Active (Ongoing)'}
                    </td>
                    <td className="font-bold text-rose-400 text-sm">
                      ৳ {r.ratePerShare} / share
                    </td>
                    <td className="text-xs text-gray-300">
                      {r.graceDayOfMonth}th of month
                    </td>
                    <td className="text-xs text-gray-400">{r.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Waivers header */}
          <div className="flex items-center justify-between pt-6 border-t border-white/10">
            <div>
              <h2 className="text-base font-bold text-white">Monthly Penalty Waivers</h2>
              <p className="text-xs text-gray-400">
                Months where penalties were formally waived for all members.
              </p>
            </div>
            <button
              onClick={() => {
                setWaiverFormData({
                  month: '',
                  isGlobal: true,
                  reason: '',
                });
                setShowAddWaiverModal(true);
              }}
              className="btn btn-secondary btn-sm"
            >
              <Plus size={14} />
              <span>Grant Waiver</span>
            </button>
          </div>

          {/* Waivers Table */}
          <div className="table-container glass-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Waived Month</th>
                  <th>Scope</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {penaltyWaivers.map((w) => (
                  <tr key={w._id}>
                    <td className="font-mono text-xs font-bold text-emerald-400">
                      {w.month}
                    </td>
                    <td>
                      <span className="badge badge-active text-[10px]">
                        {w.isGlobal ? 'ALL MEMBERS (GLOBAL)' : 'SPECIFIC MEMBER'}
                      </span>
                    </td>
                    <td className="text-xs text-gray-300">{w.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: RECORD PAYMENT COLLECTION */}
      {showCollectModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  Record Member Contribution
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Record payment collected by Moin or Samrat with automatic allocation engine.
                </p>
              </div>
              <button
                onClick={() => setShowCollectModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-6 space-y-4">
              {collectError && (
                <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl text-red-400 text-xs font-medium">
                  {collectError}
                </div>
              )}

              {/* Member Selection */}
              <div className="form-group">
                <label className="form-label">Select Member</label>
                <select
                  required
                  className="form-select"
                  value={formData.memberId}
                  onChange={(e) => {
                    setFormData({ ...formData, memberId: e.target.value });
                    setAllocationPreview(null);
                  }}
                >
                  <option value="">-- Choose Member --</option>
                  {membersList.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} - {m.name} ({m.phone})
                    </option>
                  ))}
                </select>
              </div>

              {/* Member Status & Unpaid Cashout Due Alert */}
              {selectedMemberObj && (
                <div className="p-3.5 bg-slate-900/80 rounded-xl border border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Selected Member:</span>
                    <span className="font-bold text-white">{selectedMemberObj.name}</span>
                  </div>

                  {(selectedMemberObj.cashoutDue || 0) > 0 ? (
                    <div className="flex items-center gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
                      <AlertTriangle size={15} className="shrink-0" />
                      <span>
                        Member has <strong>৳ {selectedMemberObj.cashoutDue}</strong> previous unpaid gateway cashout charge due!
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 flex items-center gap-1.5">
                      <CheckCircle2 size={13} className="text-emerald-400" />
                      <span>No pending gateway cash out charges due.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Grid: Receiver & Custody Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Receiving Accountant</label>
                  <select
                    required
                    className="form-select"
                    value={formData.receiverId}
                    onChange={(e) => {
                      const newReceiverId = e.target.value;
                      setFormData({ ...formData, receiverId: newReceiverId });
                      // Find default custody account for this receiver
                      const accs = custodyAccounts.filter(
                        (c) => c.holderId?._id === newReceiverId
                      );
                      if (accs.length > 0) {
                        setFormData((prev) => ({
                          ...prev,
                          receiverId: newReceiverId,
                          custodyAccountId: accs[0]._id,
                          paymentMethod: paymentMethodForChannel(accs[0].channel),
                        }));
                      }
                    }}
                  >
                    {custodyAccounts
                      .filter((c) => c.holderId)
                      .map((c) => c.holderId!)
                      .filter((v, i, a) => a.findIndex((t) => t._id === v._id) === i)
                      .map((acc) => (
                        <option key={acc._id} value={acc._id}>
                          {acc.name} ({acc.accountantType || 'ACC'})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Destination Custody Account</label>
                  <select
                    required
                    className="form-select"
                    value={formData.custodyAccountId}
                    onChange={(e) => {
                      const account = custodyAccounts.find((item) => item._id === e.target.value);
                      setFormData({ ...formData, custodyAccountId: e.target.value, paymentMethod: paymentMethodForChannel(account?.channel) });
                      setAllocationPreview(null);
                    }}
                  >
                    {custodyAccounts
                      .filter(
                        (c) =>
                          !formData.receiverId ||
                          c.holderId?._id === formData.receiverId
                      )
                      .map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.channel})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Gateway and payment date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Applied Payment Gateway</label>
                  <div className="form-input flex items-center bg-slate-900/70 text-gray-300">
                    {formData.paymentMethod === 'BANK_TRANSFER' ? 'Bank / CellFin' : formData.paymentMethod === 'CASH' ? 'Physical Cash' : formData.paymentMethod === 'BKASH' ? 'bKash' : 'Nagad'}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">Set automatically from the destination custody account.</p>
                </div>

                <div className="form-group">
                  <label className="form-label">Payment Date</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.paymentDate}
                    onChange={(e) =>
                      setFormData({ ...formData, paymentDate: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Total Cash Amount */}
              <div className="form-group">
                <label className="form-label">Total Amount Received, Including Any Cash-out Charge (BDT)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min={1}
                    className="form-input text-base font-bold text-white flex-1"
                    placeholder="e.g. 1000, 2000, 6000"
                    value={formData.totalAmount}
                    onChange={(e) => {
                      setFormData({ ...formData, totalAmount: e.target.value });
                      setAllocationPreview(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleCalculatePreview}
                    disabled={previewLoading || !formData.totalAmount}
                    className="btn btn-secondary text-xs px-4 shrink-0"
                  >
                    {previewLoading ? 'Calculating...' : 'Preview Allocation'}
                  </button>
                </div>
              </div>

              {/* Cash Out Charge Options */}
              <div className="p-4 bg-slate-900/60 rounded-xl border border-white/5 space-y-3">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  Gateway Cash Out Settlement:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold block mb-1">
                      Cash Out Charge Paid with this payment:
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="form-input text-xs"
                      placeholder="0"
                      value={formData.cashoutChargePaid}
                      onChange={(e) =>
                        setFormData({ ...formData, cashoutChargePaid: e.target.value })
                      }
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                      Includes a prior carried charge if the member settles it now.
                    </span>
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-gray-400">
                    The unpaid portion is calculated automatically from the selected gateway and carried forward to the next month.
                  </div>
                </div>
              </div>

              {/* Allocation Preview Card */}
              {allocationPreview && (
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl space-y-3 animate-fadeIn">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-blue-400 uppercase tracking-wider">
                      Authoritative Allocation Breakdown:
                    </span>
                    <span className="text-gray-300">
                      Member Shares: {allocationPreview.member.shares} (৳{allocationPreview.member.monthlyObligation}/mo)
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {allocationPreview.allocations.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-slate-900/60 border border-white/5"
                      >
                        <span className="text-gray-300">
                          {a.targetMonth} &bull; {a.description}
                        </span>
                        <span className="font-bold text-white">৳ {a.amount}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-400">Total Accounted For:</span>
                    <span className="text-emerald-400">
                      ৳ {formData.totalAmount} (Pri: ৳{allocationPreview.breakdown.principalAmount}, Pen: ৳{allocationPreview.breakdown.penaltyAmount}, Adv: ৳{allocationPreview.breakdown.advanceAmount})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="rounded-lg bg-slate-900/60 border border-white/5 p-3 space-y-1"><p className="font-bold text-blue-300">Current gateway charge</p><p className="text-white">BDT {allocationPreview.gateway.requiredCharge} <span className="text-gray-500 font-normal">({allocationPreview.gateway.ratePercentage}% · round up to {allocationPreview.gateway.roundingIncrement})</span></p><p className="text-gray-400">Paid now: BDT {allocationPreview.breakdown.cashoutChargePaid} · carried: BDT {allocationPreview.member.newCashoutDue}</p></div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1"><p className="font-bold text-amber-200">Member total due snapshot</p><p className="text-white">BDT {allocationPreview.dueSummary.totalDue}</p><p className="text-gray-400">Past: {allocationPreview.dueSummary.previousMonthsPrincipal + allocationPreview.dueSummary.previousMonthsPenalty} · This month: {allocationPreview.dueSummary.currentMonthPayable + allocationPreview.dueSummary.currentMonthPenalty} · Carried fee: {allocationPreview.dueSummary.carriedCashoutCharge}</p></div>
                  </div>
                </div>
              )}

              {/* Transaction Ref & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Transaction Reference (TrxID)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 9J283H4992 (bKash/Nagad)"
                    value={formData.transactionReference}
                    onChange={(e) =>
                      setFormData({ ...formData, transactionReference: e.target.value })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes (Optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Paid in cash at society office"
                    value={formData.notes}
                    onChange={(e) =>
                      setFormData({ ...formData, notes: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectSubmitting || !formData.totalAmount}
                  className="btn btn-primary px-6"
                >
                  {collectSubmitting ? 'Recording Payment...' : 'Confirm & Save Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: OFFICIAL BRANDED PAYMENT RECEIPT */}
      {showReceiptModal && selectedReceipt && (
        <div className="modal-overlay">
          <div className="modal-content max-w-xl">
            <div className="p-6 bg-slate-900 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
                  <FileText size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    Payment Receipt
                  </h3>
                  <p className="text-xs text-blue-400 font-mono">
                    {selectedReceipt.payment.receiptNumber}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            {/* Receipt Printable Body */}
            <div className="receipt-print p-6 space-y-5 text-gray-200">
              {/* Society Header */}
              <div className="text-center pb-4 border-b border-white/10">
                <h4 className="text-lg font-black text-white tracking-wide">
                  NS FOUNDATION COOPERATIVE SOCIETY
                </h4>
                <p className="text-xs text-gray-400">
                  Official Member Contribution & Payment Voucher
                </p>
              </div>

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 block uppercase font-bold text-[10px]">
                    Member Details
                  </span>
                  <p className="font-bold text-white text-sm">
                    {selectedReceipt.payment.memberId?.name}
                  </p>
                  <p className="text-gray-400 font-mono">
                    ID: {selectedReceipt.payment.memberId?.memberId}
                  </p>
                  <p className="text-gray-400">
                    Phone: {selectedReceipt.payment.memberId?.phone}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-gray-500 block uppercase font-bold text-[10px]">
                    Payment Voucher
                  </span>
                  <p className="font-mono text-gray-300">
                    Date: {new Date(selectedReceipt.payment.paymentDate).toLocaleDateString()}
                  </p>
                  <p className="text-gray-300">
                    Method: <strong>{selectedReceipt.payment.paymentMethod}</strong>
                  </p>
                  <p className="text-gray-300">
                    Receiver: {selectedReceipt.payment.receiverId?.name}
                  </p>
                </div>
              </div>

              {/* Allocations Table */}
              <div>
                <span className="text-gray-400 block uppercase font-bold text-[10px] mb-2">
                  Accounting Allocations:
                </span>
                <div className="rounded-xl border border-white/10 overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/5 text-gray-400">
                      <tr>
                        <th className="p-2.5">Period</th>
                        <th className="p-2.5">Allocation Type</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {selectedReceipt.allocations.map((a, i) => (
                        <tr key={i}>
                          <td className="p-2.5 font-mono text-blue-400">
                            {a.targetMonth}
                          </td>
                          <td className="p-2.5 text-gray-300">
                            {a.allocationType}
                          </td>
                          <td className="p-2.5 text-right font-bold text-white">
                            ৳ {a.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals Summary */}
              <div className="p-3.5 bg-white/5 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-300">
                  <span>Principal Obligations:</span>
                  <span>৳ {selectedReceipt.payment.principalAmount}</span>
                </div>
                {selectedReceipt.payment.penaltyAmount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>Late Penalties:</span>
                    <span>৳ {selectedReceipt.payment.penaltyAmount}</span>
                  </div>
                )}
                {selectedReceipt.payment.advanceAmount > 0 && (
                  <div className="flex justify-between text-purple-400">
                    <span>Advance Prepayment:</span>
                    <span>৳ {selectedReceipt.payment.advanceAmount}</span>
                  </div>
                )}
                {selectedReceipt.payment.cashoutCharge > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Cash Out Charge Paid:</span>
                    <span>৳ {selectedReceipt.payment.cashoutCharge}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/10 flex justify-between font-extrabold text-sm text-white">
                  <span>Total Cash Received:</span>
                  <span className="text-blue-400">
                    ৳ {selectedReceipt.payment.totalAmount.toLocaleString()} BDT
                  </span>
                </div>
              </div>

              {/* Custody Account & Status */}
              <div className="flex items-center justify-between text-xs text-gray-500 pt-2">
                <span>
                  Custody: {selectedReceipt.payment.custodyAccountId?.name}
                </span>
                <span className="badge badge-active text-[10px]">
                  VERIFIED DEPOSIT
                </span>
              </div>
              <div className="receipt-signatures hidden">
                <div>Handling officer / Assistant Accountant signature</div>
                <div>Member signature</div>
              </div>
            </div>

            {/* Receipt Modal Footer */}
            <div className="p-4 border-t border-white/10 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="btn btn-secondary text-xs"
              >
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="btn btn-primary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ADMIN ADD PENALTY RULE */}
      {showAddRuleModal && isAdmin && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Add Dynamic Penalty Rule
              </h3>
              <button
                onClick={() => setShowAddRuleModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSavePenaltyRule} className="p-6 space-y-4">
              <div className="form-group">
                <label className="form-label">Effective From (YYYY-MM)</label>
                <input
                  type="month"
                  required
                  className="form-input"
                  value={ruleFormData.effectiveFrom}
                  onChange={(e) =>
                    setRuleFormData({ ...ruleFormData, effectiveFrom: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Effective To (Optional)</label>
                <input
                  type="month"
                  className="form-input"
                  value={ruleFormData.effectiveTo}
                  onChange={(e) =>
                    setRuleFormData({ ...ruleFormData, effectiveTo: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Rate (BDT / Share)</label>
                  <input
                    type="number"
                    required
                    min={0}
                    className="form-input"
                    value={ruleFormData.ratePerShare}
                    onChange={(e) =>
                      setRuleFormData({
                        ...ruleFormData,
                        ratePerShare: Number(e.target.value),
                      })
                    }
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Grace Day (Deadline)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={31}
                    className="form-input"
                    value={ruleFormData.graceDayOfMonth}
                    onChange={(e) =>
                      setRuleFormData({
                        ...ruleFormData,
                        graceDayOfMonth: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Standard penalty rate"
                  value={ruleFormData.description}
                  onChange={(e) =>
                    setRuleFormData({ ...ruleFormData, description: e.target.value })
                  }
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddRuleModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: ADMIN ADD PENALTY WAIVER */}
      {showAddWaiverModal && isAdmin && (
        <div className="modal-overlay">
          <div className="modal-content max-w-md">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Grant Monthly Penalty Waiver
              </h3>
              <button
                onClick={() => setShowAddWaiverModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreatePenaltyWaiver} className="p-6 space-y-4">
              <div className="form-group">
                <label className="form-label">Month to Waive (YYYY-MM)</label>
                <input
                  type="month"
                  required
                  className="form-input"
                  value={waiverFormData.month}
                  onChange={(e) =>
                    setWaiverFormData({ ...waiverFormData, month: e.target.value })
                  }
                />
              </div>

              <div className="form-group">
                <label className="form-label">Reason for Waiver</label>
                <textarea
                  required
                  rows={3}
                  className="form-textarea"
                  placeholder="e.g. Approved organizational general meeting decision"
                  value={waiverFormData.reason}
                  onChange={(e) =>
                    setWaiverFormData({ ...waiverFormData, reason: e.target.value })
                  }
                />
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddWaiverModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Grant Waiver
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
