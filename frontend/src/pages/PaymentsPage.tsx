import React, { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useLogo } from '../context/LogoContext';
import { BrandLogo } from '../components/BrandLogo';
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
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  Pencil,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  FileSignature,
  Loader2,
} from 'lucide-react';
import { downloadMemberReportImage } from '../utils/report-image';
import { ReceiptOcrManager } from '../components/ReceiptOcrManager';

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
  shareCount?: number;
  monthlyObligation?: number;
}

interface AllocationItem {
  targetMonth: string;
  allocationType: string;
  amount: number;
  description: string;
}

const receiptValue = (value: string | number | undefined | null) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const receiptMoney = (value: number) => `৳ ${Number(value || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const receiptPeriod = (value: string) => {
  const matched = /^(\d{4})-(\d{2})$/.exec(value);
  if (!matched) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, 1)));
};

const receiptAmountInWords = (value: number) => {
  const underTwenty = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const asWords = (amount: number): string => {
    if (amount < 20) return underTwenty[amount];
    if (amount < 100) return `${tens[Math.floor(amount / 10)]}${amount % 10 ? `-${underTwenty[amount % 10]}` : ''}`;
    if (amount < 1_000) return `${underTwenty[Math.floor(amount / 100)]} hundred${amount % 100 ? ` ${asWords(amount % 100)}` : ''}`;
    for (const [size, label] of [[1_000_000_000, 'billion'], [1_000_000, 'million'], [1_000, 'thousand']] as const) {
      if (amount >= size) return `${asWords(Math.floor(amount / size))} ${label}${amount % size ? ` ${asWords(amount % size)}` : ''}`;
    }
    return 'zero';
  };
  const cents = Math.round((Number(value) - Math.floor(Number(value))) * 100);
  const taka = Math.max(0, Math.floor(Number(value) || 0));
  const phrase = `${asWords(taka)} taka${cents ? ` and ${asWords(cents)} paisa` : ''} only`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
};

/** A deliberately small, standalone document: it avoids printing the full React
 * application and is constrained to one A4 sheet for fast print/download. */
function createReceiptDocument(payment: PaymentItem, allocations: AllocationItem[], logo: string | null, signatureImage?: string | null) {
  const displayedAllocations = allocations.slice(0, 12);
  const allocationRows = displayedAllocations.map((allocation) => `
    <tr><td>${receiptValue(receiptPeriod(allocation.targetMonth))}</td><td>${receiptValue(allocation.allocationType)}</td><td class="amount">${receiptMoney(allocation.amount)}</td></tr>`).join('');
  const extraAllocations = allocations.length > displayedAllocations.length
    ? `<tr><td colspan="3" class="muted">আরও ${allocations.length - displayedAllocations.length}টি বরাদ্দ মোটের মধ্যে অন্তর্ভুক্ত আছে।</td></tr>`
    : '';
  const optionalLines = [
    payment.penaltyAmount > 0 ? ['Late penalty', payment.penaltyAmount] : null,
    payment.advanceAmount > 0 ? ['Advance payment', payment.advanceAmount] : null,
    payment.cashoutCharge > 0 ? ['Cash-out charge', payment.cashoutCharge] : null,
  ].filter((line): line is [string, number] => line !== null)
    .map(([label, amount]) => `<div class="line"><span>${label}</span><strong>${receiptMoney(amount)}</strong></div>`).join('');

  return `<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>Payment Receipt ${receiptValue(payment.receiptNumber)}</title><style>
    @page { size: A4 portrait; margin: 9mm; }
    * { box-sizing: border-box; } body { margin: 0; color: #152238; font: 10.5pt/1.32 Arial, "Noto Sans Bengali", sans-serif; }
    .receipt { width: 100%; max-width: 192mm; margin: 0 auto; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10mm; page-break-inside: avoid; }
    h1 { margin: 0; font-size: 16pt; letter-spacing: .03em; } .subtitle, .muted { color: #64748b; font-size: 8.5pt; }
    .top { display: flex; justify-content: space-between; gap: 12mm; border-bottom: 2px solid #2563eb; padding-bottom: 5mm; } .brand { display: flex; gap: 4mm; align-items: center; } .logo { width: 22mm; height: 22mm; object-fit: contain; } .receipt-no { color: #1d4ed8; font-weight: 700; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin: 5mm 0; } .meta strong, .total strong { display: block; } .right { text-align: right; }
    table { width: 100%; border-collapse: collapse; margin: 4mm 0; font-size: 9pt; } th { background: #eff6ff; text-align: left; } th, td { padding: 2.1mm 2.5mm; border: 1px solid #cbd5e1; } .amount { text-align: right; white-space: nowrap; }
    .summary { margin-left: auto; width: 82mm; padding: 3.5mm; border: 1px solid #bfdbfe; border-radius: 6px; } .line, .total { display: flex; justify-content: space-between; gap: 8mm; padding: 1mm 0; } .total { margin-top: 2mm; padding-top: 2mm; border-top: 1px solid #94a3b8; font-size: 11pt; } .amount-words { margin-top: 2mm; color: #475569; font-size: 8.5pt; font-style: italic; }
    .footer { display: flex; justify-content: space-between; align-items: flex-end; gap: 8mm; margin-top: 7mm; padding-top: 4mm; border-top: 1px dashed #94a3b8; font-size: 8.5pt; } @media print { .receipt { border-color: #94a3b8; } }
  </style></head><body><main class="receipt">
    <header class="top"><div class="brand">${logo ? `<img class="logo" src="${receiptValue(logo)}" alt="NS Foundation logo">` : ''}<div><h1>NS FOUNDATION COOPERATIVE SOCIETY</h1><div class="subtitle">Official Member Contribution &amp; Payment Receipt</div></div></div><div class="right receipt-no">${receiptValue(payment.receiptNumber)}</div></header>
    <section class="meta"><div><div class="subtitle">Member</div><strong>${receiptValue(payment.memberId?.name)}</strong><div>${receiptValue(payment.memberId?.memberId)} · ${receiptValue(payment.memberId?.phone)}</div></div><div class="right"><div class="subtitle">Payment details</div><strong>${receiptValue(new Date(payment.paymentDate).toLocaleDateString())}</strong><div>${receiptValue(payment.paymentMethod)} · Received by ${receiptValue(payment.receiverId?.name)}</div></div></section>
    <div class="subtitle">Accounting allocations</div><table><thead><tr><th>Period</th><th>Allocation type</th><th class="amount">Amount</th></tr></thead><tbody>${allocationRows}${extraAllocations}</tbody></table>
    <section class="summary"><div class="line"><span>Principal</span><strong>${receiptMoney(payment.principalAmount)}</strong></div>${optionalLines}<div class="total"><span>Total received</span><strong>${receiptMoney(payment.totalAmount)}</strong></div><div class="amount-words">${receiptValue(receiptAmountInWords(payment.totalAmount))}</div></section>
    <footer class="footer">
      <div>
        <span>Custody: ${receiptValue(payment.custodyAccountId?.name)}</span> · <span>Verified deposit</span>
      </div>
      <div style="display: flex; gap: 8mm; align-items: flex-end;">
        <div style="text-align: center; min-width: 38mm;">
          ${signatureImage ? `<img src="${signatureImage}" alt="Authorized Accountant Signature" style="max-height: 36px; max-width: 120px; display: block; margin: 0 auto 3px;" />` : '<div style="height: 36px;"></div>'}
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-weight: 600;">Authorized Accountant</div>
        </div>
        <div style="text-align: center; min-width: 38mm;">
          <div style="height: 36px;"></div>
          <div style="border-top: 1px solid #94a3b8; padding-top: 3px;">Member signature</div>
        </div>
      </div>
    </footer>
  </main></body></html>`;
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
  penaltyWaived?: number;
  cashoutChargeWaived?: number;
  waiverReason?: string;
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
  dueSummary: {
    principal: number;
    penalty: number;
    cashout: number;
    total: number;
    cashoutMemberCount: number;
  };
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

const analyticsDateForPayment = (paymentDate: string, timeframe: 'all' | 'daily' | 'monthly' | 'yearly') => {
  const calendarDate = paymentDate.slice(0, 10);
  if (timeframe === 'all') return '';
  if (timeframe === 'daily') return calendarDate;
  if (timeframe === 'yearly') return calendarDate.slice(0, 4);
  return calendarDate.slice(0, 7);
};

const MONTH_OPTIONS = [
  { value: '01', en: 'January', bn: 'জানুয়ারি' },
  { value: '02', en: 'February', bn: 'ফেব্রুয়ারি' },
  { value: '03', en: 'March', bn: 'মার্চ' },
  { value: '04', en: 'April', bn: 'এপ্রিল' },
  { value: '05', en: 'May', bn: 'মে' },
  { value: '06', en: 'June', bn: 'জুন' },
  { value: '07', en: 'July', bn: 'জুলাই' },
  { value: '08', en: 'August', bn: 'আগস্ট' },
  { value: '09', en: 'September', bn: 'সেপ্টেম্বর' },
  { value: '10', en: 'October', bn: 'অক্টোবর' },
  { value: '11', en: 'November', bn: 'নভেম্বর' },
  { value: '12', en: 'December', bn: 'ডিসেম্বর' },
];

const AVAILABLE_YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

export const PaymentsPage: React.FC = () => {
  const { logo } = useLogo();
  const { user, canAccess, updateUser } = useAuth();
  const { t, language } = usePreferences();
  const canEdit = canAccess('PAYMENTS', 'edit');
  const isAdmin = (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && canEdit;

  // Active Top-level Tab
  const [activeTab, setActiveTab] = useState<'analytics' | 'ledger' | 'rules' | 'ocr'>('analytics');

  // Filter States for Analytics
  const [timeframe, setTimeframe] = useState<'all' | 'daily' | 'monthly' | 'yearly'>('all');
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
  const [analyticsNotice, setAnalyticsNotice] = useState<string | null>(null);

  // Payments Ledger Data
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [ledgerSearch, setLedgerSearch] = useState<string>('');
  const [ledgerYear, setLedgerYear] = useState<string>('');
  const [ledgerMonth, setLedgerMonth] = useState<string>('');
  const [ledgerDay, setLedgerDay] = useState<string>('');
  const [ledgerTimeframe, setLedgerTimeframe] = useState<'all' | 'daily' | 'monthly' | 'yearly'>('all');
  const [ledgerMemberId, setLedgerMemberId] = useState<string>('');
  const [selectedMemberSummary, setSelectedMemberSummary] = useState<{
    member: { _id?: string; memberId: string; name: string; phone: string; currentShares?: number; status?: string; cashoutDue?: number };
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
    };
    recentPayments?: any[];
  } | null>(null);
  const [loadingMemberSummary, setLoadingMemberSummary] = useState<boolean>(false);
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerTotalPages, setLedgerTotalPages] = useState<number>(1);
  const [ledgerTotalCount, setLedgerTotalCount] = useState<number>(0);
  const [loadingPayments, setLoadingPayments] = useState<boolean>(false);
  const [ledgerActionError, setLedgerActionError] = useState<string | null>(null);

  // Common Metadata
  const [membersList, setMembersList] = useState<MemberOption[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccountItem[]>([]);
  const [penaltyRules, setPenaltyRules] = useState<PenaltyRuleItem[]>([]);
  const [penaltyWaivers, setPenaltyWaivers] = useState<PenaltyWaiverItem[]>([]);

  // Accountant Signature State
  const [accountantSignature, setAccountantSignature] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState<boolean>(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureSaving, setSignatureSaving] = useState<boolean>(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

  // Download Report Image Confirmation & Success States
  const [showDownloadConfirmModal, setShowDownloadConfirmModal] = useState<boolean>(false);
  const [isDownloadingReport, setIsDownloadingReport] = useState<boolean>(false);
  const [downloadSuccessModal, setDownloadSuccessModal] = useState<{
    open: boolean;
    fileName: string;
    memberName: string;
    memberId: string;
  } | null>(null);

  // Modal States
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [editingPayment, setEditingPayment] = useState<PaymentItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PaymentItem | null>(null);
  const [deletingPayment, setDeletingPayment] = useState<boolean>(false);
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
    penaltyWaiverAmount: '0',
    cashoutWaiverAmount: '0',
    waiverReason: '',
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
      penaltyWaived: number;
      cashoutChargeWaived: number;
    };
    member: {
      shares: number;
      monthlyObligation: number;
      currentCashoutDue: number;
      newCashoutDue: number;
    };
    gateway: { channel: string; ratePercentage: number; fixedFee: number; roundingIncrement: number; requiredCharge: number; };
    dueSummary: { previousMonthsPrincipal: number; previousMonthsPenalty: number; currentMonthPayable: number; currentMonthPenalty: number; carriedCashoutCharge: number; estimatedCashoutCharge: number; totalDue: number; };
    waivers: { penaltyAmount: number; cashoutAmount: number; reason: string; penaltyByMonth: Array<{ month: string; amount: number }> };
  } | null>(null);

  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [collectSubmitting, setCollectSubmitting] = useState<boolean>(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [memberDueSnapshot, setMemberDueSnapshot] = useState<{
    monthlyObligation: number;
    principal: number;
    penalty: number;
    cashout: number;
    total: number;
  } | null>(null);

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
        apiRequest<MemberOption[]>('/payments/collection-members'),
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
  const fetchStats = useCallback(async (overrides?: { date?: string; receiverId?: string; paymentMethod?: string }) => {
    setLoadingStats(true);
    try {
      const params = new URLSearchParams({
        timeframe,
        date: overrides?.date ?? filterDate,
        receiverId: overrides?.receiverId ?? accountantFilter,
        paymentMethod: overrides?.paymentMethod ?? methodFilter,
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
        ...(ledgerYear ? { year: ledgerYear } : {}),
        ...(ledgerMonth ? { month: ledgerMonth } : {}),
        ...(ledgerDay ? { day: ledgerDay } : {}),
        ...(ledgerMemberId ? { memberId: ledgerMemberId } : {}),
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
  }, [ledgerPage, ledgerSearch, accountantFilter, methodFilter, ledgerYear, ledgerMonth, ledgerDay, ledgerMemberId]);

  // Load official accountant signature
  useEffect(() => {
    apiRequest<{ signature?: string; signatureImage?: string }>('/settings/accountant-signature')
      .then((res) => {
        const sig = res.data?.signatureImage || res.data?.signature;
        if (sig) {
          setAccountantSignature(sig);
          setSignaturePreview(sig);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.signatureImage && !accountantSignature) {
      setAccountantSignature(user.signatureImage);
      setSignaturePreview(user.signatureImage);
    }
  }, [user?.signatureImage, accountantSignature]);

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setSignatureError('Signature image must be less than 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSignaturePreview(reader.result as string);
      setSignatureError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignature = async () => {
    if (!signaturePreview) return;
    setSignatureSaving(true);
    setSignatureError(null);
    try {
      await apiRequest('/auth/signature', {
        method: 'PUT',
        body: JSON.stringify({ signatureImage: signaturePreview }),
      });
      setAccountantSignature(signaturePreview);
      updateUser({ signatureImage: signaturePreview });
      setShowSignatureModal(false);
    } catch (err: unknown) {
      setSignatureError((err as Error).message || 'Failed to save signature');
    } finally {
      setSignatureSaving(false);
    }
  };

  const handleRemoveSignature = async () => {
    setSignatureSaving(true);
    setSignatureError(null);
    try {
      await apiRequest('/auth/signature', {
        method: 'PUT',
        body: JSON.stringify({ signatureImage: null }),
      });
      setAccountantSignature(null);
      setSignaturePreview(null);
      updateUser({ signatureImage: null });
      setShowSignatureModal(false);
    } catch (err: unknown) {
      setSignatureError((err as Error).message || 'Failed to remove signature');
    } finally {
      setSignatureSaving(false);
    }
  };

  const handleStartReportDownload = async () => {
    if (!selectedMemberSummary) return;
    setIsDownloadingReport(true);
    try {
      const reportPayments = (selectedMemberSummary.recentPayments && selectedMemberSummary.recentPayments.length > 0)
        ? selectedMemberSummary.recentPayments.map((p) => ({
            ...p,
            receiverName: p.receiverName || (p.receiverId as any)?.name || '-',
            accountantName: p.accountantName || (p.receiverId as any)?.name || '-',
          }))
        : payments
            .filter(
              (p) =>
                String((p.memberId as any)?._id || (p.memberId as any)) ===
                String(selectedMemberSummary.member._id)
            )
            .map((p) => ({
              ...p,
              receiverName: (p.receiverId as any)?.name || '-',
              accountantName: (p.receiverId as any)?.name || '-',
            }));

      const filename = await downloadMemberReportImage({
        member: selectedMemberSummary.member,
        summary: selectedMemberSummary.summary,
        payments: reportPayments,
        logo,
        signatureImage: accountantSignature || user?.signatureImage || null,
      });

      setShowDownloadConfirmModal(false);
      setDownloadSuccessModal({
        open: true,
        fileName: filename || `NSF_Report_${selectedMemberSummary.member.memberId}_${(selectedMemberSummary.member.name || '').trim().replace(/[^a-zA-Z0-9\u0980-\u09FF]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`,
        memberName: selectedMemberSummary.member.name,
        memberId: selectedMemberSummary.member.memberId,
      });
    } catch (err: unknown) {
      console.error('Failed to download report image:', err);
      alert('Failed to generate report image: ' + ((err as Error)?.message || 'Unknown error'));
    } finally {
      setIsDownloadingReport(false);
    }
  };

  // Fetch Member Summary when a member is selected in Ledger (dynamically updates with period filter)
  useEffect(() => {
    if (!ledgerMemberId) {
      setSelectedMemberSummary(null);
      return;
    }
    setLoadingMemberSummary(true);
    const params = new URLSearchParams();
    if (ledgerTimeframe && ledgerTimeframe !== 'all') params.set('timeframe', ledgerTimeframe);
    if (ledgerYear) params.set('year', ledgerYear);
    if (ledgerMonth) params.set('month', ledgerMonth);
    if (ledgerDay) params.set('day', ledgerDay);

    const queryStr = params.toString() ? `?${params.toString()}` : '';
    apiRequest<{
      member: { _id?: string; memberId: string; name: string; phone: string; currentShares?: number; status?: string; cashoutDue?: number };
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
      };
      recentPayments?: any[];
    }>(`/payments/member-summary/${ledgerMemberId}${queryStr}`)
      .then((res) => {
        setSelectedMemberSummary(res.data);
      })
      .catch((err) => {
        console.error('Error loading member summary:', err);
        setSelectedMemberSummary(null);
      })
      .finally(() => {
        setLoadingMemberSummary(false);
      });
  }, [ledgerMemberId, ledgerTimeframe, ledgerYear, ledgerMonth, ledgerDay]);

  const refreshAnalyticsAfterPayment = useCallback(async (payment: Pick<PaymentItem, 'paymentDate'>) => {
    const analyticsDate = analyticsDateForPayment(payment.paymentDate || formData.paymentDate, timeframe);

    // Always show the committed payment in its own accounting period. This
    // prevents a historical payment being hidden by the previously selected
    // month, receiver, or payment-method filter.
    setActiveTab('analytics');
    if (timeframe !== 'all') setFilterDate(analyticsDate);
    setAccountantFilter('ALL');
    setMethodFilter('ALL');
    setAnalyticsNotice(timeframe === 'all' ? 'Payment recorded. Analytics now show all receipt history.' : `Payment recorded. Analytics now show ${analyticsDate}.`);

    await Promise.all([
      fetchStats({ date: analyticsDate, receiverId: 'ALL', paymentMethod: 'ALL' }),
      fetchPaymentsLedger(),
      fetchMetadata(),
    ]);
  }, [fetchMetadata, fetchPaymentsLedger, fetchStats, formData.paymentDate, timeframe]);

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
          penaltyWaived: number;
          cashoutChargeWaived: number;
        };
        member: {
          shares: number;
          monthlyObligation: number;
          currentCashoutDue: number;
          newCashoutDue: number;
        };
        gateway: { channel: string; ratePercentage: number; fixedFee: number; roundingIncrement: number; requiredCharge: number; };
        dueSummary: { previousMonthsPrincipal: number; previousMonthsPenalty: number; currentMonthPayable: number; currentMonthPenalty: number; carriedCashoutCharge: number; estimatedCashoutCharge: number; totalDue: number; };
        waivers: { penaltyAmount: number; cashoutAmount: number; reason: string; penaltyByMonth: Array<{ month: string; amount: number }> };
      }>('/payments/preview', {
        method: 'POST',
        body: JSON.stringify({
          memberId: formData.memberId,
          paymentDate: formData.paymentDate,
          totalAmount: Number(formData.totalAmount),
          paymentMethod: formData.paymentMethod,
          custodyAccountId: formData.custodyAccountId,
          cashoutChargePaid: Number(formData.cashoutChargePaid) || 0,
          penaltyWaiverAmount: Number(formData.penaltyWaiverAmount) || 0,
          cashoutWaiverAmount: Number(formData.cashoutWaiverAmount) || 0,
          waiverReason: formData.waiverReason,
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
      }>(editingPayment ? `/payments/${editingPayment._id}` : '/payments', {
        method: editingPayment ? 'PUT' : 'POST',
        body: JSON.stringify({
          memberId: formData.memberId,
          receiverId: formData.receiverId || user?.id,
          custodyAccountId: formData.custodyAccountId,
          paymentDate: formData.paymentDate,
          totalAmount: Number(formData.totalAmount),
          paymentMethod: formData.paymentMethod,
          cashoutChargePaid: Number(formData.cashoutChargePaid) || 0,
          penaltyWaiverAmount: Number(formData.penaltyWaiverAmount) || 0,
          cashoutWaiverAmount: Number(formData.cashoutWaiverAmount) || 0,
          waiverReason: formData.waiverReason,
          transactionReference: formData.transactionReference,
          notes: formData.notes,
        }),
      });

      setShowCollectModal(false);
      setEditingPayment(null);
      await Promise.all([
        refreshAnalyticsAfterPayment(res.data.payment),
        handleViewReceipt(res.data.payment._id),
      ]);
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

  const handleEditPayment = (payment: PaymentItem) => {
    setLedgerActionError(null);
    setCollectError(null);
    setAllocationPreview(null);
    setEditingPayment(payment);
    setFormData({
      memberId: payment.memberId._id,
      custodyAccountId: payment.custodyAccountId._id,
      receiverId: payment.receiverId._id,
      paymentDate: payment.paymentDate.slice(0, 10),
      totalAmount: String(payment.totalAmount),
      paymentMethod: payment.paymentMethod,
      cashoutChargePaid: String(payment.cashoutCharge || 0),
      penaltyWaiverAmount: String(payment.penaltyWaived || 0),
      cashoutWaiverAmount: String(payment.cashoutChargeWaived || 0),
      waiverReason: payment.waiverReason || '',
      transactionReference: payment.transactionReference || '',
      notes: payment.notes || '',
    });
    setShowCollectModal(true);
  };

  const handleVoidPayment = async () => {
    if (!pendingDelete) return;
    setLedgerActionError(null);
    setDeletingPayment(true);
    try {
      await apiRequest(`/payments/${pendingDelete._id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Deleted from payment history by authenticated accountant.' }),
      });
      setPendingDelete(null);
      await Promise.all([fetchPaymentsLedger(), fetchStats()]);
    } catch (err: unknown) {
      setLedgerActionError((err as Error).message);
    } finally {
      setDeletingPayment(false);
    }
  };

  const printReceipt = () => {
    if (!selectedReceipt) return;
    // Open synchronously from the click event so browsers do not defer or block
    // the preview. This window contains only the A4 receipt, never the app shell.
    const printWindow = window.open('', '_blank', 'popup,width=860,height=1000');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(createReceiptDocument(selectedReceipt.payment, selectedReceipt.allocations, logo, accountantSignature || user?.signatureImage));
    printWindow.document.close();
    printWindow.focus();
    printWindow.requestAnimationFrame(() => printWindow.print());
  };

  const downloadReceipt = async () => {
    if (!selectedReceipt) return;
    const { payment, allocations } = selectedReceipt;
    const canvas = document.createElement('canvas');
    canvas.width = 1240;
    canvas.height = 1754; // A4 portrait at ~150dpi; always one image/page.
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = '#cbd5e1';
    context.lineWidth = 2;
    context.strokeRect(54, 54, 1132, 1646);
    const text = (value: string, x: number, y: number, font = '26px Arial', color = '#152238') => {
      context.font = font;
      context.fillStyle = color;
      context.fillText(value, x, y);
    };
    let titleX = 90;
    if (logo) {
      const logoImage = new Image();
      await new Promise<void>((resolve) => {
        logoImage.onload = () => resolve();
        logoImage.onerror = () => resolve();
        logoImage.src = logo;
      });
      if (logoImage.complete && logoImage.naturalWidth > 0) {
        const scale = Math.min(92 / logoImage.naturalWidth, 92 / logoImage.naturalHeight);
        const width = logoImage.naturalWidth * scale;
        const height = logoImage.naturalHeight * scale;
        context.drawImage(logoImage, 90 + (92 - width) / 2, 78 + (92 - height) / 2, width, height);
        titleX = 200;
      }
    }
    // Keep the long society name and receipt number on separate header rows.
    // This remains clear whether a logo is present or not.
    text('NS FOUNDATION COOPERATIVE SOCIETY', titleX, 118, 'bold 34px Arial');
    text('Official Member Contribution & Payment Receipt', titleX, 154, '22px Arial', '#64748b');
    context.textAlign = 'right';
    text(payment.receiptNumber, 1150, 78, 'bold 24px Arial', '#1d4ed8');
    context.textAlign = 'left';
    context.strokeStyle = '#2563eb';
    context.lineWidth = 4;
    context.beginPath(); context.moveTo(88, 180); context.lineTo(1152, 180); context.stroke();
    text('Member', 90, 230, 'bold 20px Arial', '#64748b');
    text(payment.memberId?.name || '', 90, 270, 'bold 28px Arial');
    text(`${payment.memberId?.memberId || ''} · ${payment.memberId?.phone || ''}`, 90, 305, '22px Arial', '#475569');
    text('Payment details', 800, 230, 'bold 20px Arial', '#64748b');
    text(new Date(payment.paymentDate).toLocaleDateString(), 800, 270, 'bold 26px Arial');
    text(`${payment.paymentMethod} · ${payment.receiverId?.name || ''}`, 800, 305, '20px Arial', '#475569');
    text('Accounting allocations', 90, 360, 'bold 21px Arial', '#64748b');
    const columns = [90, 410, 780, 1120];
    const tableTop = 382;
    context.fillStyle = '#eff6ff'; context.fillRect(90, tableTop, 1030, 38);
    text('Period', columns[0] + 12, tableTop + 27, 'bold 19px Arial');
    text('Allocation type', columns[1] + 12, tableTop + 27, 'bold 19px Arial');
    text('Amount', columns[2] + 12, tableTop + 27, 'bold 19px Arial');
    let y = tableTop + 38;
    allocations.slice(0, 12).forEach((allocation) => {
      context.strokeStyle = '#cbd5e1'; context.lineWidth = 1;
      context.strokeRect(90, y, 1030, 42);
      context.beginPath(); context.moveTo(columns[1], y); context.lineTo(columns[1], y + 42); context.moveTo(columns[2], y); context.lineTo(columns[2], y + 42); context.stroke();
      text(receiptPeriod(allocation.targetMonth), columns[0] + 12, y + 28, '18px Arial', '#1d4ed8');
      text(allocation.allocationType, columns[1] + 12, y + 28, '18px Arial');
      text(receiptMoney(allocation.amount), columns[2] + 12, y + 28, 'bold 18px Arial');
      y += 42;
    });
    if (allocations.length > 12) { text(`আরও ${allocations.length - 12}টি বরাদ্দ মোটের মধ্যে অন্তর্ভুক্ত আছে।`, 102, y + 28, '17px Arial', '#64748b'); y += 42; }
    y += 50;
    const summary: Array<[string, number]> = [
      ['Principal', payment.principalAmount],
      ...(payment.penaltyAmount > 0 ? [['Late penalty', payment.penaltyAmount] as [string, number]] : []),
      ...(payment.advanceAmount > 0 ? [['Advance payment', payment.advanceAmount] as [string, number]] : []),
      ...(payment.cashoutCharge > 0 ? [['Cash-out charge', payment.cashoutCharge] as [string, number]] : []),
    ];
    summary.forEach(([label, amount]) => { text(label, 700, y, '20px Arial', '#475569'); text(receiptMoney(amount), 940, y, 'bold 20px Arial'); y += 34; });
    context.strokeStyle = '#94a3b8'; context.beginPath(); context.moveTo(690, y); context.lineTo(1120, y); context.stroke(); y += 38;
    text('Total received', 700, y, 'bold 25px Arial'); text(receiptMoney(payment.totalAmount), 930, y, 'bold 25px Arial', '#1d4ed8');
    text(receiptAmountInWords(payment.totalAmount), 700, y + 30, 'italic 17px Arial', '#475569');
    text(`Custody: ${payment.custodyAccountId?.name || ''}`, 90, 1570, '19px Arial', '#475569');
    text('Verified deposit', 90, 1610, 'bold 19px Arial', '#166534');

    const effectiveSig = accountantSignature || user?.signatureImage;
    if (effectiveSig) {
      try {
        const sigImage = new Image();
        await new Promise<void>((resolve) => {
          sigImage.onload = () => resolve();
          sigImage.onerror = () => resolve();
          sigImage.src = effectiveSig;
        });
        if (sigImage.complete && sigImage.naturalWidth > 0) {
          const maxW = 160;
          const maxH = 50;
          const scale = Math.min(maxW / sigImage.naturalWidth, maxH / sigImage.naturalHeight);
          const width = sigImage.naturalWidth * scale;
          const height = sigImage.naturalHeight * scale;
          context.drawImage(sigImage, 500 - width / 2, 1605 - height, width, height);
        }
      } catch {
        // Ignore signature image load failure
      }
    }
    text('Authorized Accountant: __________________', 320, 1610, '19px Arial', '#475569');
    text('Member signature: ______________________', 750, 1610, '19px Arial', '#475569');
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${payment.receiptNumber}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    }, 'image/png');
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

  // The member summary is calculated by the same authoritative allocation
  // engine used when posting a receipt. A zero amount is intentional here:
  // it exposes obligations without allocating or persisting any payment.
  useEffect(() => {
    if (!showCollectModal || !formData.memberId || !formData.custodyAccountId) {
      setMemberDueSnapshot(null);
      return;
    }
    let active = true;
    void apiRequest<{
      member: { monthlyObligation: number };
      dueSummary: { previousMonthsPrincipal: number; previousMonthsPenalty: number; currentMonthPayable: number; currentMonthPenalty: number; carriedCashoutCharge: number; estimatedCashoutCharge: number; totalDue: number };
    }>('/payments/preview', {
      method: 'POST',
      body: JSON.stringify({
        memberId: formData.memberId,
        custodyAccountId: formData.custodyAccountId,
        paymentDate: formData.paymentDate,
        paymentMethod: formData.paymentMethod,
        totalAmount: 0,
      }),
    }).then((res) => {
      if (!active) return;
      const due = res.data.dueSummary;
      setMemberDueSnapshot({
        monthlyObligation: res.data.member.monthlyObligation,
        principal: due.previousMonthsPrincipal + due.currentMonthPayable,
        penalty: due.previousMonthsPenalty + due.currentMonthPenalty,
        cashout: due.carriedCashoutCharge + due.estimatedCashoutCharge,
        total: due.totalDue,
      });
    }).catch(() => { if (active) setMemberDueSnapshot(null); });
    return () => { active = false; };
  }, [showCollectModal, formData.memberId, formData.custodyAccountId, formData.paymentDate, formData.paymentMethod]);

  const setPaymentPeriod = (year: string, month: string) => {
    const currentDay = Number(formData.paymentDate.slice(8, 10)) || 1;
    const maxDay = new Date(Number(year), Number(month), 0).getDate();
    setFormData({ ...formData, paymentDate: `${year}-${month}-${String(Math.min(currentDay, maxDay)).padStart(2, '0')}` });
    setAllocationPreview(null);
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="glass-card px-4 py-3 bg-amber-500/10 border-amber-500/30 text-amber-200 text-xs flex items-center justify-between rounded-xl">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-bold uppercase tracking-wider">Read-Only Access:</span>
            <span>You have viewing permissions for Contributions & Payments. Collecting payments, modifying penalty rules, and uploading receipts are restricted.</span>
          </div>
          {user?.designation && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 uppercase">
              {user.designation}
            </span>
          )}
        </div>
      )}

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

        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setActiveTab('ocr')}
              className={`btn shrink-0 self-start sm:self-auto border transition-all flex items-center gap-2 ${
                activeTab === 'ocr'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'btn-secondary border-blue-500/30 text-blue-400 hover:bg-blue-500/10'
              }`}
            >
              <Sparkles size={18} />
              <span>Upload Receipt (OCR)</span>
            </button>

            <button
              onClick={() => {
                const defaultCustodyAccount = custodyAccounts[0];
                setCollectError(null);
                setAllocationPreview(null);
                setEditingPayment(null);
                setFormData({
                  memberId: membersList[0]?._id || '',
                  custodyAccountId: defaultCustodyAccount?._id || '',
                  receiverId: user?.id || '',
                  paymentDate: new Date().toISOString().split('T')[0],
                  totalAmount: '',
                  paymentMethod: paymentMethodForChannel(defaultCustodyAccount?.channel),
                  cashoutChargePaid: '0',
                  penaltyWaiverAmount: '0',
                  cashoutWaiverAmount: '0',
                  waiverReason: '',
                  transactionReference: '',
                  notes: '',
                });
                setShowCollectModal(true);
              }}
              className="btn btn-primary shrink-0 self-start sm:self-auto shadow-lg shadow-blue-500/20"
            >
              <Plus size={18} />
              <span>{t('Collect Payment')}</span>
            </button>

            {(user?.role === 'ACCOUNTANT' || user?.accountantType || user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') && (
              <button
                type="button"
                onClick={() => {
                  setSignaturePreview(accountantSignature || user?.signatureImage || null);
                  setSignatureError(null);
                  setShowSignatureModal(true);
                }}
                className="btn btn-secondary shrink-0 self-start sm:self-auto flex items-center gap-2 border border-white/10 hover:border-blue-400"
                title={t('Add or update official accountant signature for reports and invoices')}
              >
                <FileSignature size={18} className={accountantSignature ? 'text-emerald-400' : 'text-gray-400'} />
                <span>{accountantSignature ? t('Accountant Signature') : t('Add Signature')}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-white/10 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('analytics')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'analytics'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <TrendingUp size={16} />
          <span>{t('Collection Analytics')}</span>
        </button>

        <button
          onClick={() => setActiveTab('ledger')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'ledger'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Receipt size={16} />
          <span>{t('Receipts & Payment History')}</span>
        </button>

        <button
          onClick={() => setActiveTab('ocr')}
          className={`pb-3 px-4 text-xs font-bold tracking-wider uppercase transition-all duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'ocr'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-white'
          }`}
        >
          <Sparkles size={16} />
          <span>{t('Receipt OCR Queue')}</span>
        </button>
      </div>

      {/* TAB 1: COLLECTION ANALYTICS & STATS DASHBOARD */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {analyticsNotice && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              <span>{analyticsNotice}</span>
              <button type="button" onClick={() => setAnalyticsNotice(null)} className="text-emerald-200 hover:text-white" aria-label="Dismiss analytics update notice">
                <X size={16} />
              </button>
            </div>
          )}
          {/* Filter Bar */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            {/* Redesigned Timeframe & Date Picker */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar size={14} className="text-blue-400" />
                {t('Period:')}
              </span>
              <div className="bg-slate-900/90 p-1 rounded-xl border border-white/10 flex gap-1 shadow-inner">
                {([
                  { key: 'all', labelKey: 'All Time' },
                  { key: 'daily', labelKey: 'Daily' },
                  { key: 'monthly', labelKey: 'Monthly' },
                  { key: 'yearly', labelKey: 'Yearly' },
                ] as const).map(({ key, labelKey }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setTimeframe(key);
                      if (key === 'all') setFilterDate('');
                      else if (key === 'daily') setFilterDate(new Date().toISOString().split('T')[0]);
                      else if (key === 'yearly') setFilterDate(String(new Date().getFullYear()));
                      else {
                        const d = new Date();
                        setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      timeframe === key
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
                        : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                  >
                    {t(labelKey)}
                  </button>
                ))}
              </div>

              {/* Daily Controls */}
              {timeframe === 'daily' && (
                <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-xl border border-white/10">
                  <button
                    type="button"
                    title={t('Previous Day')}
                    aria-label={t('Previous Day')}
                    onClick={() => {
                      const d = new Date(filterDate || new Date().toISOString().split('T')[0]);
                      d.setDate(d.getDate() - 1);
                      setFilterDate(d.toISOString().split('T')[0]);
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <input
                    type="date"
                    aria-label={t('Daily')}
                    className="form-input text-xs py-1 px-2.5 bg-slate-950 border-gray-700 rounded-lg text-white font-medium"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                  />
                  <button
                    type="button"
                    title={t('Next Day')}
                    aria-label={t('Next Day')}
                    onClick={() => {
                      const d = new Date(filterDate || new Date().toISOString().split('T')[0]);
                      d.setDate(d.getDate() + 1);
                      setFilterDate(d.toISOString().split('T')[0]);
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterDate(new Date().toISOString().split('T')[0])}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                  >
                    {t('Today')}
                  </button>
                </div>
              )}

              {/* Monthly Controls - Redesigned with Separate Month and Year Select Options */}
              {timeframe === 'monthly' && (() => {
                const curYear = filterDate && filterDate.includes('-')
                  ? filterDate.slice(0, 4)
                  : String(new Date().getFullYear());
                const curMonth = filterDate && filterDate.includes('-')
                  ? filterDate.slice(5, 7)
                  : String(new Date().getMonth() + 1).padStart(2, '0');

                return (
                  <div className="inline-flex items-center gap-1 bg-slate-900/80 px-1.5 py-1 rounded-xl border border-white/10 shrink-0">
                    <button
                      type="button"
                      title={t('Previous Month')}
                      aria-label={t('Previous Month')}
                      onClick={() => {
                        const y = Number(curYear);
                        const m = Number(curMonth);
                        const d = new Date(y, m - 2, 1);
                        setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    {/* Compact Unified Month & Year Select Group */}
                    <div className="flex items-center rounded-lg border border-white/15 bg-slate-950 px-1 py-0.5">
                      <select
                        aria-label={t('Month')}
                        className="bg-transparent text-xs text-white font-medium py-0.5 px-1 cursor-pointer focus:outline-none border-r border-white/10"
                        value={curMonth}
                        onChange={(e) => setFilterDate(`${curYear}-${e.target.value}`)}
                      >
                        {MONTH_OPTIONS.map((m) => (
                          <option key={m.value} value={m.value} className="bg-slate-900 text-white">
                            {language === 'bn' ? m.bn : m.en}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={t('Year')}
                        className="bg-transparent text-xs text-white font-medium py-0.5 px-1 cursor-pointer focus:outline-none"
                        value={curYear}
                        onChange={(e) => setFilterDate(`${e.target.value}-${curMonth}`)}
                      >
                        {AVAILABLE_YEARS.map((yr) => (
                          <option key={yr} value={String(yr)} className="bg-slate-900 text-white">
                            {yr}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      title={t('Next Month')}
                      aria-label={t('Next Month')}
                      onClick={() => {
                        const y = Number(curYear);
                        const m = Number(curMonth);
                        const d = new Date(y, m, 1);
                        setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        setFilterDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                      }}
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                    >
                      {t('Current Month')}
                    </button>
                  </div>
                );
              })()}

              {/* Yearly Controls */}
              {timeframe === 'yearly' && (
                <div className="inline-flex items-center gap-1 bg-slate-900/80 px-1.5 py-1 rounded-xl border border-white/10 shrink-0">
                  <button
                    type="button"
                    title={t('Previous Year')}
                    aria-label={t('Previous Year')}
                    onClick={() => {
                      const yr = Number(filterDate || new Date().getFullYear()) - 1;
                      setFilterDate(String(yr));
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                  >
                    <ChevronLeft size={15} />
                  </button>
                  <select
                    aria-label={t('Year')}
                    className="bg-slate-950 text-xs text-white font-medium py-0.5 px-2 border border-white/15 rounded-lg focus:outline-none cursor-pointer"
                    value={filterDate || String(new Date().getFullYear())}
                    onChange={(e) => setFilterDate(e.target.value)}
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
                    aria-label={t('Next Year')}
                    onClick={() => {
                      const yr = Number(filterDate || new Date().getFullYear()) + 1;
                      setFilterDate(String(yr));
                    }}
                    className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterDate(String(new Date().getFullYear()))}
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                  >
                    {t('Current Year')}
                  </button>
                </div>
              )}
            </div>

            {/* Accountant / Receiver Filter */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                  {t('Receiver:')}
                </span>
                <select
                  aria-label={t('Receiver:')}
                  className="form-select text-xs py-1.5 px-3 min-w-[140px]"
                  value={accountantFilter}
                  onChange={(e) => setAccountantFilter(e.target.value)}
                >
                  <option value="ALL">{t('All Accountants (Admin)')}</option>
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
                  {t('Method:')}
                </span>
                <select
                  aria-label={t('Method:')}
                  className="form-select text-xs py-1.5 px-3 min-w-[110px]"
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                >
                  <option value="ALL">{t('All Methods')}</option>
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="CASH">{t('Physical Cash')}</option>
                  <option value="BANK_TRANSFER">{t('Bank')}</option>
                </select>
              </div>
            </div>
          </div>

          {/* Primary Metric KPI Cards */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 transition-opacity duration-200 ${loadingStats ? 'opacity-50' : 'opacity-100'}`}>
            <div className="glass-card p-5 border-l-4 border-l-blue-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>{t('Total In')}</span>
                <DollarSign size={18} className="text-blue-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-2">
                ৳ {(stats?.totals.totalReceived || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">
                {stats?.totals.count || 0} {language === 'bn' ? 'টি মোট রশিদ' : 'total receipts'}
              </span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-emerald-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>{timeframe === 'monthly' ? t('Monthly Principal') : t('Principal Collected')}</span>
                <Layers size={18} className="text-emerald-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-2">
                ৳ {(stats?.totals.totalPrincipal || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">
                {timeframe === 'monthly' ? (language === 'bn' ? 'মাসিক পরিশোধিত শেয়ার কিস্তি' : 'Monthly share dues settled') : (language === 'bn' ? 'এই ভিউতে পরিশোধিত শেয়ার কিস্তি' : 'Share dues settled in this view')}
              </span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-rose-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>{t('Penalties Collected')}</span>
                <AlertTriangle size={18} className="text-rose-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-400 mt-2">
                ৳ {(stats?.totals.totalPenalty || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">{language === 'bn' ? 'বিলম্ব জরিমানা আদায়' : 'Late payment fines'}</span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-purple-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>{t('Advance Prepayments')}</span>
                <Sparkles size={18} className="text-purple-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-purple-400 mt-2">
                ৳ {(stats?.totals.totalAdvance || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">{language === 'bn' ? 'ভবিষ্যৎ মাসের অগ্রিম চাঁদা' : 'Prepaid future months'}</span>
            </div>

            <div className="glass-card p-5 border-l-4 border-l-amber-500">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase">
                <span>{t('Cashout Paid')}</span>
                <CreditCard size={18} className="text-amber-400" />
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-amber-400 mt-2">
                ৳ {(stats?.totals.totalCashoutCharge || 0).toLocaleString()}
              </p>
              <span className="text-[11px] text-gray-500 mt-1 block">
                ৳ {stats?.totals.totalUnpaidCashout || 0} {language === 'bn' ? 'অপরিশোধিত বকেয়া' : 'unpaid due'}
              </span>
            </div>
          </div>

          <section className="glass-card p-5" aria-label="Outstanding member dues">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">{t('Total Outstanding Dues')}</h2>
                <p className="mt-1 text-xs text-gray-400">{t('Live organization-wide balance: unpaid principal, penalties, and gateway cash-out charges.')}</p>
              </div>
              <p className="text-xl font-extrabold text-amber-300">৳ {(stats?.dueSummary.total || 0).toLocaleString()}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-3">
                <p className="text-xs font-semibold text-blue-200">{t('Principal Due')}</p>
                <p className="mt-1 text-lg font-extrabold text-white">৳ {(stats?.dueSummary.principal || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-3">
                <p className="text-xs font-semibold text-rose-200">{t('Penalty Due')}</p>
                <p className="mt-1 text-lg font-extrabold text-white">৳ {(stats?.dueSummary.penalty || 0).toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold text-amber-200">{t('Cash-out Charges Due')}</p>
                <p className="mt-1 text-lg font-extrabold text-white">৳ {(stats?.dueSummary.cashout || 0).toLocaleString()}</p>
                <p className="mt-1 text-[11px] text-amber-100/70">
                  {stats?.dueSummary.cashoutMemberCount || 0} {language === 'bn' ? 'জন সদস্য প্রভাবিত' : 'affected members'}
                </p>
              </div>
            </div>
          </section>

          {/* Breakdown Section: By Payment Method & Multi-Accountant Comparison */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Payment Method Breakdown Card */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={16} className="text-blue-400" />
                <span>{t('Collection by Payment Method')}</span>
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                {[
                  { key: 'BANK_TRANSFER', label: 'Bank', color: 'from-blue-500 to-indigo-600' },
                  { key: 'BKASH', label: 'bKash', color: 'from-pink-500 to-rose-600' },
                  { key: 'NAGAD', label: 'Nagad', color: 'from-orange-500 to-amber-600' },
                  { key: 'CASH', label: 'Physical Cash', color: 'from-emerald-500 to-teal-600' },
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
                          {t(m.label)}
                        </span>
                        <p className="text-lg font-extrabold text-white mt-1">
                          ৳ {data.total.toLocaleString()}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
                        <span>{data.count} {language === 'bn' ? 'টি রশিদ' : 'receipts'}</span>
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
          <div>
            <h2 className="text-xl font-extrabold text-white">{t('Payment History')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('Review member payment receipts by a chosen month and year, or search the complete ledger.')}</p>
          </div>
          {/* Search bar, Member filter & Redesigned Date Picker */}
          <div className="glass-card p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Member Selector Dropdown (Swapped to first place, with wide flex-1 matching Search) */}
              <div className="flex items-center gap-2 min-w-[240px] flex-1">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">
                  {t('Member:')}
                </label>
                <select
                  aria-label={t('Member:')}
                  className="form-select text-xs py-2 px-3 bg-slate-900 border-gray-700 rounded-lg text-white flex-1"
                  value={ledgerMemberId || (selectedMemberSummary?.member ? (membersList.find((m) => m._id === selectedMemberSummary.member._id || m.memberId === selectedMemberSummary.member.memberId)?._id || selectedMemberSummary.member._id || '') : '')}
                  onChange={(e) => {
                    setLedgerMemberId(e.target.value);
                    setLedgerPage(1);
                  }}
                >
                  <option value="">{t('All Members')}</option>
                  {selectedMemberSummary?.member && !membersList.some((m) => m._id === selectedMemberSummary.member._id || m.memberId === selectedMemberSummary.member.memberId) && (
                    <option value={selectedMemberSummary.member._id || selectedMemberSummary.member.memberId}>
                      {selectedMemberSummary.member.memberId} — {selectedMemberSummary.member.name}
                    </option>
                  )}
                  {membersList.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search text input (Swapped to second place) */}
              <div className="relative min-w-[240px] flex-1">
                <Search
                  size={18}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  type="text"
                  className="form-input pl-10 text-sm w-full"
                  placeholder={t('Search by receipt #, member name, ID, or phone...')}
                  value={ledgerSearch}
                  onChange={(e) => {
                    setLedgerSearch(e.target.value);
                    setLedgerPage(1);
                  }}
                />
              </div>

              <span className="shrink-0 text-xs font-semibold text-gray-400">
                {t('Records')}: {payments.length} / {ledgerTotalCount} {language === 'bn' ? 'টি' : ''}
              </span>
            </div>

            {/* Redesigned Date Filtering for Payment History */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar size={14} className="text-blue-400" />
                  {t('Period Filter:')}
                </span>
                <div className="bg-slate-900/90 p-1 rounded-xl border border-white/10 flex gap-1 shadow-inner">
                  {([
                    { key: 'all', labelKey: 'All Time' },
                    { key: 'daily', labelKey: 'Daily' },
                    { key: 'monthly', labelKey: 'Monthly' },
                    { key: 'yearly', labelKey: 'Yearly' },
                  ] as const).map(({ key, labelKey }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setLedgerTimeframe(key);
                        setLedgerPage(1);
                        if (key === 'all') {
                          setLedgerDay('');
                          setLedgerMonth('');
                          setLedgerYear('');
                        } else if (key === 'daily') {
                          setLedgerDay(new Date().toISOString().split('T')[0]);
                          setLedgerMonth('');
                          setLedgerYear('');
                        } else if (key === 'monthly') {
                          const d = new Date();
                          setLedgerYear(String(d.getFullYear()));
                          setLedgerMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                          setLedgerDay('');
                        } else if (key === 'yearly') {
                          setLedgerYear('2024');
                          setLedgerMonth('');
                          setLedgerDay('');
                        }
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        ledgerTimeframe === key
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-1 ring-blue-400/50'
                          : 'text-gray-400 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      {t(labelKey)}
                    </button>
                  ))}
                </div>

                {/* Daily mode controls */}
                {ledgerTimeframe === 'daily' && (
                  <div className="flex items-center gap-1.5 bg-slate-900/80 px-2 py-1 rounded-xl border border-white/10">
                    <button
                      type="button"
                      title={t('Previous Day')}
                      aria-label={t('Previous Day')}
                      onClick={() => {
                        const d = new Date(ledgerDay || new Date().toISOString().split('T')[0]);
                        d.setDate(d.getDate() - 1);
                        setLedgerDay(d.toISOString().split('T')[0]);
                        setLedgerPage(1);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <input
                      type="date"
                      aria-label={t('Daily')}
                      className="form-input text-xs py-1 px-2.5 bg-slate-950 border-gray-700 rounded-lg text-white font-medium"
                      value={ledgerDay}
                      onChange={(e) => {
                        setLedgerDay(e.target.value);
                        setLedgerPage(1);
                      }}
                    />
                    <button
                      type="button"
                      title={t('Next Day')}
                      aria-label={t('Next Day')}
                      onClick={() => {
                        const d = new Date(ledgerDay || new Date().toISOString().split('T')[0]);
                        d.setDate(d.getDate() + 1);
                        setLedgerDay(d.toISOString().split('T')[0]);
                        setLedgerPage(1);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerDay(new Date().toISOString().split('T')[0]);
                        setLedgerPage(1);
                      }}
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                    >
                      {t('Today')}
                    </button>
                  </div>
                )}

                {/* Monthly mode controls - Redesigned with Separate Month and Year Select Options */}
                {ledgerTimeframe === 'monthly' && (() => {
                  const curY = ledgerYear || (ledgerMonth ? ledgerMonth.slice(0, 4) : String(new Date().getFullYear()));
                  const curM = ledgerMonth && ledgerMonth.length >= 7 ? ledgerMonth.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, '0');

                  return (
                    <div className="inline-flex items-center gap-1 bg-slate-900/80 px-1.5 py-1 rounded-xl border border-white/10 shrink-0">
                      <button
                        type="button"
                        title={t('Previous Month')}
                        aria-label={t('Previous Month')}
                        onClick={() => {
                          const y = Number(curY);
                          const m = Number(curM);
                          const d = new Date(y, m - 2, 1);
                          const newM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                          setLedgerMonth(newM);
                          setLedgerYear(String(d.getFullYear()));
                          setLedgerPage(1);
                        }}
                        className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                      >
                        <ChevronLeft size={15} />
                      </button>
                      {/* Compact Unified Month & Year Select Group */}
                      <div className="flex items-center rounded-lg border border-white/15 bg-slate-950 px-1 py-0.5">
                        <select
                          aria-label={t('Month')}
                          className="bg-transparent text-xs text-white font-medium py-0.5 px-1 cursor-pointer focus:outline-none border-r border-white/10"
                          value={curM}
                          onChange={(e) => {
                            const newM = `${curY}-${e.target.value}`;
                            setLedgerMonth(newM);
                            setLedgerYear(curY);
                            setLedgerPage(1);
                          }}
                        >
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value} className="bg-slate-900 text-white">
                              {language === 'bn' ? m.bn : m.en}
                            </option>
                          ))}
                        </select>
                        <select
                          aria-label={t('Year')}
                          className="bg-transparent text-xs text-white font-medium py-0.5 px-1 cursor-pointer focus:outline-none"
                          value={curY}
                          onChange={(e) => {
                            const newY = e.target.value;
                            setLedgerYear(newY);
                            setLedgerMonth(`${newY}-${curM}`);
                            setLedgerPage(1);
                          }}
                        >
                          {AVAILABLE_YEARS.map((yr) => (
                            <option key={yr} value={String(yr)} className="bg-slate-900 text-white">
                              {yr}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        title={t('Next Month')}
                        aria-label={t('Next Month')}
                        onClick={() => {
                          const y = Number(curY);
                          const m = Number(curM);
                          const d = new Date(y, m, 1);
                          const newM = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                          setLedgerMonth(newM);
                          setLedgerYear(String(d.getFullYear()));
                          setLedgerPage(1);
                        }}
                        className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                      >
                        <ChevronRight size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date();
                          setLedgerMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                          setLedgerYear(String(d.getFullYear()));
                          setLedgerPage(1);
                        }}
                        className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                      >
                        {t('Current Month')}
                      </button>
                    </div>
                  );
                })()}

                {/* Yearly mode controls */}
                {ledgerTimeframe === 'yearly' && (
                  <div className="inline-flex items-center gap-1 bg-slate-900/80 px-1.5 py-1 rounded-xl border border-white/10 shrink-0">
                    <button
                      type="button"
                      title={t('Previous Year')}
                      aria-label={t('Previous Year')}
                      onClick={() => {
                        const yr = Number(ledgerYear || '2024') - 1;
                        setLedgerYear(String(yr));
                        setLedgerMonth('');
                        setLedgerPage(1);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronLeft size={15} />
                    </button>
                    <select
                      aria-label={t('Year')}
                      className="bg-slate-950 text-xs text-white font-medium py-0.5 px-2 border border-white/15 rounded-lg focus:outline-none cursor-pointer"
                      value={ledgerYear || '2024'}
                      onChange={(e) => {
                        setLedgerYear(e.target.value);
                        setLedgerMonth('');
                        setLedgerPage(1);
                      }}
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
                      aria-label={t('Next Year')}
                      onClick={() => {
                        const yr = Number(ledgerYear || '2024') + 1;
                        setLedgerYear(String(yr));
                        setLedgerMonth('');
                        setLedgerPage(1);
                      }}
                      className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded-md transition"
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerYear(String(new Date().getFullYear()));
                        setLedgerMonth('');
                        setLedgerPage(1);
                      }}
                      className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 transition whitespace-nowrap"
                    >
                      {t('Current Year')}
                    </button>
                  </div>
                )}

                {(ledgerYear || ledgerMonth || ledgerDay || ledgerMemberId || ledgerSearch) && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm h-8 px-2.5 text-xs flex items-center gap-1"
                    onClick={() => {
                      setLedgerTimeframe('all');
                      setLedgerYear('');
                      setLedgerMonth('');
                      setLedgerDay('');
                      setLedgerMemberId('');
                      setLedgerSearch('');
                      setSelectedMemberSummary(null);
                      setLedgerPage(1);
                    }}
                  >
                    <X size={13} /> {t('Reset Filters')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* MEMBER FINANCIAL POSITION SUMMARY CARD (LOCATED DIRECTLY BEFORE PAYMENT HISTORY LIST) */}
          {loadingMemberSummary ? (
            <div className="glass-card p-6 animate-pulse text-center text-sm text-gray-400">
              {t('Loading member financial summary...')}
            </div>
          ) : selectedMemberSummary ? (
            <div className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-900/95 via-blue-950/20 to-slate-900/95 p-5 shadow-xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg">
                    {selectedMemberSummary.member.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-white">{selectedMemberSummary.member.name}</h3>
                      <span className="badge badge-active text-xs">{selectedMemberSummary.member.status || 'ACTIVE'}</span>
                    </div>
                    <p className="text-xs text-gray-400">
                      {t('ID:')} <span className="font-mono text-blue-300 font-semibold">{selectedMemberSummary.member.memberId}</span> · {t('Phone:')} {selectedMemberSummary.member.phone || 'N/A'} · {t('Shares:')} <span className="font-semibold text-white">{selectedMemberSummary.member.currentShares || 1} {language === 'bn' ? 'টি' : 'share(s)'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDownloadConfirmModal(true)}
                    className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 transition"
                  >
                    <ImageIcon size={15} />
                    {t('Download Report Image')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLedgerMemberId('');
                      setSelectedMemberSummary(null);
                    }}
                    className="btn btn-secondary btn-sm"
                    title={t('Back to All Members')}
                  >
                    <X size={15} /> {t('Clear Filter')}
                  </button>
                </div>
              </div>

              {/* Metric Cards: Paid Summary + Dues Breakdown (Zero-value dues hidden; All-cleared state when totalDue === 0) */}
              {(() => {
                const s = selectedMemberSummary.summary;
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
                    {/* Total Paid (Always shown) */}
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

                    {/* Total Principal Paid (Always shown) */}
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

                    {/* Total Advanced Paid (Shown ONLY when > 0) */}
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

                    {/* Total Penalty Paid (Shown ONLY when > 0) */}
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

                    {/* Total Cash-out Charge Paid (Shown ONLY when > 0) */}
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

                    {/* DUES BREAKDOWN: If totalDue is 0, show single Green "All Dues Cleared" card */}
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
                        {/* Total Due Card */}
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

                        {/* Principal Due (Shown ONLY when > 0) */}
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

                        {/* Penalty Due (Shown ONLY when > 0) */}
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

                        {/* Due Cash Out Charge (Shown ONLY when > 0) */}
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
          ) : (
            <div className="px-4 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/5 flex items-center justify-between text-xs text-blue-200">
              <span className="flex items-center gap-2">
                <Users size={15} className="text-blue-400" />
                {t('Select a member from the dropdown above or click on a member name below to view their total payments, dues, penalties, and download the report image.')}
              </span>
            </div>
          )}

          {ledgerActionError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {ledgerActionError}
            </div>
          )}

          {/* Payments Table */}
          <div className="table-container glass-card overflow-x-auto overflow-y-hidden overscroll-x-contain">
            <table className="data-table min-w-[1060px]">
              <thead>
                <tr>
                  <th>{t('Receipt #')}</th>
                  <th>{t('Payment Date')}</th>
                  <th>{t('Member')}</th>
                  <th>{t('Receiver & Custody')}</th>
                  <th>{t('Method')}</th>
                  <th>{t('Total Received')}</th>
                  <th>{t('Breakdown')}</th>
                  <th className="text-right">{t('Action')}</th>
                </tr>
              </thead>
              <tbody>
                {loadingPayments ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                      <span>{t('Loading payments registry...')}</span>
                    </td>
                  </tr>
                ) : payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <Receipt size={32} className="opacity-30 mx-auto mb-3" />
                      <p>{t('No payment records found.')}</p>
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
                        <button
                          type="button"
                          onClick={() => {
                            if (p.memberId?._id) {
                              setLedgerMemberId(p.memberId._id);
                              setLedgerPage(1);
                            }
                          }}
                          className="text-left group cursor-pointer"
                          title={t('View financial summary for this member')}
                        >
                          <p className="font-semibold text-white text-sm group-hover:text-blue-400 transition underline-offset-2 group-hover:underline">
                            {p.memberId?.name || 'Unknown'}
                          </p>
                          <span className="text-[11px] text-gray-400 font-mono group-hover:text-blue-300">
                            {p.memberId?.memberId}
                          </span>
                        </button>
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
                        <span className={`badge text-[10px] ${p.status === 'CANCELLED' ? 'badge-inactive' : 'badge-active'}`}>
                          {p.paymentMethod}
                        </span>
                        {p.status === 'CANCELLED' && <span className="ml-1 text-[10px] font-bold text-rose-300">VOID</span>}
                      </td>
                      <td>
                        <span className="font-extrabold text-sm text-white">
                          ৳ {p.totalAmount.toLocaleString()}
                        </span>
                      </td>
                      <td>
                        <div className="text-[11px] space-y-0.5">
                          <span className="text-emerald-400 block">
                            Pri: ৳ {p.principalAmount}
                          </span>
                          {p.penaltyAmount > 0 && (
                            <span className="text-rose-400 block">
                              Pen: ৳ {p.penaltyAmount}
                            </span>
                          )}
                          {p.advanceAmount > 0 && (
                            <span className="text-purple-400 block">
                              Adv: ৳ {p.advanceAmount}
                            </span>
                          )}
                          {p.cashoutCharge > 0 && (
                            <span className="text-amber-400 block">
                              CO: ৳ {p.cashoutCharge}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleViewReceipt(p._id)}
                            className="btn btn-secondary btn-sm p-1.5"
                            title="View Official Receipt"
                          >
                            <Eye size={14} />
                          </button>
                          {canEdit && p.status !== 'CANCELLED' && (
                            <button onClick={() => handleEditPayment(p)} className="btn btn-secondary btn-sm p-1.5" title="Edit receipt">
                              <Pencil size={14} />
                            </button>
                          )}
                          {canEdit && p.status !== 'CANCELLED' && (
                            <button onClick={() => setPendingDelete(p)} className="btn btn-secondary btn-sm p-1.5 text-rose-300 hover:text-rose-100" title="Delete receipt (audited reversal)">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
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
                {language === 'bn' ? `পৃষ্ঠা ${ledgerPage} এর ${ledgerTotalPages}` : `Page ${ledgerPage} of ${ledgerTotalPages}`}
              </span>
              <div className="flex gap-2">
                <button
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  className="btn btn-secondary btn-sm"
                >
                  <ChevronLeft size={14} />
                  <span>{language === 'bn' ? 'পূর্ববর্তী' : 'Previous'}</span>
                </button>
                <button
                  disabled={ledgerPage >= ledgerTotalPages}
                  onClick={() => setLedgerPage((p) => p + 1)}
                  className="btn btn-secondary btn-sm"
                >
                  <span>{language === 'bn' ? 'পরবর্তী' : 'Next'}</span>
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

      {/* TAB 3: RECEIPT OCR QUEUE & VERIFICATION */}
      {activeTab === 'ocr' && (
        <ReceiptOcrManager
          membersList={membersList}
          custodyAccounts={custodyAccounts}
          onPaymentPosted={(payment) => {
            void refreshAnalyticsAfterPayment(payment);
            if (payment?._id) {
              void handleViewReceipt(payment._id);
            }
          }}
        />
      )}

      {/* MODAL 1: RECORD PAYMENT COLLECTION */}
      {showCollectModal && (
        <div className="modal-overlay">
          <div className="modal-content max-w-2xl">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                {editingPayment ? (
                  <>
                    <div className="mb-1 inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      {t('Edit mode')}
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      {t('Edit Receipt')} <span className="text-amber-300">{editingPayment.receiptNumber}</span>
                    </h3>
                    <p className="mt-0.5 text-xs text-amber-100/75">
                      {t('Update the receipt values, preview the new allocation, then save the audited replacement.')}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-bold text-white">{t('Record Member Contribution')}</h3>
                    <p className="mt-0.5 text-xs text-gray-400">{t('Record payment collected by Moin or Samrat with automatic allocation engine.')}</p>
                  </>
                )}
              </div>
              <button
                onClick={() => { setShowCollectModal(false); setEditingPayment(null); }}
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
                      {m.memberId} - {m.name} ({m.shareCount || 1} {(m.shareCount || 1) === 1 ? 'share' : 'shares'} · ৳{((m.shareCount || 1) * 500).toLocaleString()}/mo)
                    </option>
                  ))}
                </select>
              </div>

              {/* Authoritative member obligation and due snapshot */}
              {selectedMemberObj && (
                <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 space-y-3">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-white/10">
                    <div>
                      <span className="text-gray-400">Selected Member:</span>
                      <span className="font-bold text-white ml-1">{selectedMemberObj.name}</span>
                      <span className="text-gray-400 ml-1 font-mono text-[11px]">({selectedMemberObj.memberId})</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {selectedMemberObj.shareCount ?? 1} Share{((selectedMemberObj.shareCount ?? 1) > 1) ? 's' : ''}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        ৳{((selectedMemberObj.shareCount ?? 1) * 500).toLocaleString()}/mo
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-2">
                      <p className="text-[10px] text-emerald-200">Monthly payable</p>
                      <p className="mt-1 font-bold text-emerald-300">৳ {memberDueSnapshot?.monthlyObligation.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border border-blue-400/20 bg-blue-500/10 p-2">
                      <p className="text-[10px] text-blue-200">Principal due</p>
                      <p className="mt-1 font-bold text-blue-300">৳ {memberDueSnapshot?.principal.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-2">
                      <p className="text-[10px] text-rose-200">Penalty due</p>
                      <p className="mt-1 font-bold text-rose-300">৳ {memberDueSnapshot?.penalty.toLocaleString() ?? '—'}</p>
                    </div>
                    <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-2">
                      <p className="text-[10px] text-amber-200">Cash-out due</p>
                      <p className="mt-1 font-bold text-amber-300">৳ {memberDueSnapshot?.cashout.toLocaleString() ?? '—'}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-xs">
                    <span className="text-gray-400">Total current dues</span>
                    <span className="font-extrabold text-white">৳ {memberDueSnapshot?.total.toLocaleString() ?? '—'}</span>
                  </div>
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
                  <label className="form-label">Payment period</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="form-select"
                      aria-label="Payment year"
                      value={formData.paymentDate.slice(0, 4)}
                      onChange={(e) => setPaymentPeriod(e.target.value, formData.paymentDate.slice(5, 7))}
                    >
                      {[2024, 2025, 2026, 2027, 2028].map((year) => <option key={year} value={year}>{year}</option>)}
                    </select>
                    <select
                      className="form-select"
                      aria-label="Payment month"
                      value={formData.paymentDate.slice(5, 7)}
                      onChange={(e) => setPaymentPeriod(formData.paymentDate.slice(0, 4), e.target.value)}
                    >
                      {[
                        'January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December',
                      ].map((month, index) => <option key={month} value={String(index + 1).padStart(2, '0')}>{month}</option>)}
                    </select>
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">The recorded day is retained when the payment period changes.</p>
                </div>
              </div>

              {/* Total Cash Amount */}
              <div className="form-group">
                <label className="form-label">Total Amount Received, Including Any Cash-out Charge (৳)</label>
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
                    {memberDueSnapshot && memberDueSnapshot.cashout > 0 && (
                      <div className="mt-1 flex items-center justify-between text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                        <span>Due Cash-out: ৳ {memberDueSnapshot.cashout.toLocaleString()}</span>
                        <button
                          type="button"
                          className="text-[10px] text-white bg-amber-600 hover:bg-amber-500 px-1.5 py-0.5 rounded font-semibold transition"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              cashoutChargePaid: String(memberDueSnapshot.cashout),
                            }));
                            setAllocationPreview(null);
                          }}
                        >
                          Settle Full Due (৳ {memberDueSnapshot.cashout})
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-gray-500 mt-0.5 block">
                      Includes a prior carried charge if the member settles it now.
                    </span>
                  </div>
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-xs text-gray-400">
                    The unpaid portion is calculated automatically from the selected gateway and carried forward to the next month.
                  </div>
                </div>
              </div>

              <div className="p-4 bg-rose-500/5 rounded-xl border border-rose-500/20 space-y-3">
                <div>
                  <p className="text-xs font-bold text-rose-200 uppercase tracking-wider">Per-payment waiver</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    An accountant may forgive outstanding penalties or cash-out charges. Penalty waivers apply to the oldest previous dues first, then the current month. The reason is stored in the payment and audit trail.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold block mb-1">Penalty waiver (৳)</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input text-xs"
                      value={formData.penaltyWaiverAmount}
                      onChange={(e) => {
                        setFormData({ ...formData, penaltyWaiverAmount: e.target.value });
                        setAllocationPreview(null);
                      }}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 font-semibold block mb-1">Cash-out charge waiver (৳)</label>
                    <input
                      type="number"
                      min={0}
                      className="form-input text-xs"
                      value={formData.cashoutWaiverAmount}
                      onChange={(e) => {
                        setFormData({ ...formData, cashoutWaiverAmount: e.target.value });
                        setAllocationPreview(null);
                      }}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-gray-400 font-semibold block mb-1">Waiver reason {Number(formData.penaltyWaiverAmount) > 0 || Number(formData.cashoutWaiverAmount) > 0 ? '(required)' : '(optional)'}</label>
                  <input
                    type="text"
                    className="form-input text-xs"
                    minLength={Number(formData.penaltyWaiverAmount) > 0 || Number(formData.cashoutWaiverAmount) > 0 ? 5 : undefined}
                    placeholder="e.g. Board-approved hardship waiver"
                    value={formData.waiverReason}
                    onChange={(e) => {
                      setFormData({ ...formData, waiverReason: e.target.value });
                      setAllocationPreview(null);
                    }}
                  />
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
                      Member Shares: {allocationPreview.member.shares} (৳ {allocationPreview.member.monthlyObligation}/mo)
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {allocationPreview.allocations.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded bg-slate-900/60 border border-white/5"
                      >
                        <span className="text-gray-300">
                          {receiptPeriod(a.targetMonth)} &bull; {a.description}
                        </span>
                        <span className="font-bold text-white">৳ {a.amount}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs font-bold">
                    <span className="text-gray-400">Total Accounted For:</span>
                    <span className="text-emerald-400">
                      ৳ {formData.totalAmount} (Pri: ৳ {allocationPreview.breakdown.principalAmount}, Pen: ৳ {allocationPreview.breakdown.penaltyAmount}, Adv: ৳ {allocationPreview.breakdown.advanceAmount})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="rounded-lg bg-slate-900/60 border border-white/5 p-3 space-y-1"><p className="font-bold text-blue-300">Current gateway charge</p><p className="text-white">৳ {allocationPreview.gateway.requiredCharge} <span className="text-gray-500 font-normal">({allocationPreview.gateway.ratePercentage}% · round up to {allocationPreview.gateway.roundingIncrement})</span></p><p className="text-gray-400">Paid now: ৳ {allocationPreview.breakdown.cashoutChargePaid} · carried: ৳ {allocationPreview.member.newCashoutDue}</p></div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 space-y-1"><p className="font-bold text-amber-200">Member total due snapshot</p><p className="text-white">৳ {allocationPreview.dueSummary.totalDue}</p><p className="text-gray-400">Past: {allocationPreview.dueSummary.previousMonthsPrincipal + allocationPreview.dueSummary.previousMonthsPenalty} · This month: {allocationPreview.dueSummary.currentMonthPayable + allocationPreview.dueSummary.currentMonthPenalty} · Carried fee: {allocationPreview.dueSummary.carriedCashoutCharge}</p></div>
                  </div>
                  {(allocationPreview.waivers.penaltyAmount > 0 || allocationPreview.waivers.cashoutAmount > 0) && (
                    <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-100">
                      Waived in this payment: penalty ৳ {allocationPreview.waivers.penaltyAmount} · cash-out ৳ {allocationPreview.waivers.cashoutAmount}
                      {allocationPreview.waivers.penaltyByMonth.length > 0 && ` · penalty months: ${allocationPreview.waivers.penaltyByMonth.map((item) => `${item.month} (৳ ${item.amount})`).join(', ')}`}
                    </div>
                  )}
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
                  onClick={() => { setShowCollectModal(false); setEditingPayment(null); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={collectSubmitting || !formData.totalAmount}
                  className="btn btn-primary px-6"
                >
                  {collectSubmitting ? t('Saving Receipt...') : editingPayment ? t('Save Receipt Correction') : t('Confirm & Save Receipt')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE RECEIPT CONFIRMATION */}
      {pendingDelete && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-receipt-title">
          <div className="modal-content max-w-md overflow-hidden border border-rose-500/30">
            <div className="flex items-start gap-4 border-b border-rose-500/20 bg-rose-500/10 p-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-400/30 bg-rose-500/20 text-rose-300">
                <AlertTriangle size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 id="delete-receipt-title" className="text-lg font-extrabold text-white">{t('Delete Receipt?')}</h3>
                <p className="mt-1 text-xs leading-5 text-rose-100/80">{t('This action reverses the receipt and removes it from active payment history.')}</p>
              </div>
              <button type="button" onClick={() => setPendingDelete(null)} disabled={deletingPayment} className="text-gray-400 transition-colors hover:text-white" aria-label={t('Cancel')}>
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div className="rounded-xl border border-white/10 bg-slate-950/40 p-4 text-sm">
                <p className="font-mono font-bold text-blue-300">{pendingDelete.receiptNumber}</p>
                <p className="mt-1 font-semibold text-white">{pendingDelete.memberId.name}</p>
                <p className="mt-1 text-xs text-gray-400">৳ {pendingDelete.totalAmount.toLocaleString()} · {new Date(pendingDelete.paymentDate).toLocaleDateString()}</p>
              </div>
              <p className="text-xs leading-5 text-gray-400">{t('A compensating custody reversal and audit record will be kept for accountability.')}</p>
              <div className="flex justify-end gap-3 border-t border-white/10 pt-4">
                <button type="button" className="btn btn-secondary" disabled={deletingPayment} onClick={() => setPendingDelete(null)}>{t('Cancel')}</button>
                <button type="button" className="btn bg-rose-600 px-5 text-white hover:bg-rose-500 disabled:opacity-60" disabled={deletingPayment} onClick={() => void handleVoidPayment()}>
                  {deletingPayment ? t('Deleting Receipt...') : t('Delete Receipt')}
                </button>
              </div>
            </div>
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
                <BrandLogo size="xl" className="mb-3" />
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
                            {receiptPeriod(a.targetMonth)}
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
                {(selectedReceipt.payment.penaltyWaived || 0) > 0 && (
                  <div className="flex justify-between text-rose-200">
                    <span>Penalty Waived:</span>
                    <span>৳ {selectedReceipt.payment.penaltyWaived}</span>
                  </div>
                )}
                {(selectedReceipt.payment.cashoutChargeWaived || 0) > 0 && (
                  <div className="flex justify-between text-amber-200">
                    <span>Cash-out Charge Waived:</span>
                    <span>৳ {selectedReceipt.payment.cashoutChargeWaived}</span>
                  </div>
                )}
                {selectedReceipt.payment.waiverReason && (
                  <p className="pt-1 text-[11px] text-gray-400">Waiver reason: {selectedReceipt.payment.waiverReason}</p>
                )}
                <div className="pt-2 border-t border-white/10 flex justify-between font-extrabold text-sm text-white">
                  <span>Total Cash Received:</span>
                  <span className="text-blue-400">
                    ৳ {selectedReceipt.payment.totalAmount.toLocaleString()}
                  </span>
                </div>
                <p className="pt-1 text-[11px] italic text-gray-400">
                  {receiptAmountInWords(selectedReceipt.payment.totalAmount)}
                </p>
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
                onClick={downloadReceipt}
                className="btn btn-secondary text-xs"
              >
                <Download size={15} />
                <span>Download Receipt</span>
              </button>
              <button
                type="button"
                onClick={printReceipt}
                className="btn btn-secondary text-xs"
              >
                <Printer size={15} />
                <span>Print Receipt</span>
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
                  <label className="form-label">Rate (৳ / Share)</label>
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

      {/* Accountant Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileSignature className="text-blue-400" size={20} />
                <h3 className="text-base font-bold text-white">
                  {t('Official Accountant Signature')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSignatureModal(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-400">
              {t('Upload your transparent or clean signature image (PNG or JPG). It will appear automatically on official payment receipts, printouts, and downloaded member financial statements.')}
            </p>

            {signatureError && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{signatureError}</span>
              </div>
            )}

            {/* Preview Box */}
            <div className="p-4 rounded-xl border border-dashed border-white/20 bg-slate-900/60 flex flex-col items-center justify-center min-h-[120px]">
              {signaturePreview ? (
                <div className="space-y-2 text-center">
                  <div className="p-3 bg-white rounded-lg inline-block shadow">
                    <img
                      src={signaturePreview}
                      alt="Signature Preview"
                      className="max-h-24 max-w-[240px] object-contain"
                    />
                  </div>
                  <p className="text-[11px] text-gray-400 font-medium">
                    {t('Current Signature Preview')}
                  </p>
                </div>
              ) : (
                <div className="text-center text-gray-500 text-xs space-y-1">
                  <FileSignature size={32} className="mx-auto text-gray-600 mb-1" />
                  <p>{t('No signature uploaded yet.')}</p>
                  <p className="text-[10px] text-gray-600">{t('PNG with transparent background recommended')}</p>
                </div>
              )}
            </div>

            {/* File Upload Input */}
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1.5">
                {t('Choose Signature Image File')}
              </label>
              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={handleSignatureFileChange}
                className="form-input text-xs w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-white/10 gap-2">
              {accountantSignature ? (
                <button
                  type="button"
                  disabled={signatureSaving}
                  onClick={handleRemoveSignature}
                  className="btn btn-outline-danger btn-sm text-xs"
                >
                  <Trash2 size={14} className="mr-1" />
                  {t('Remove Signature')}
                </button>
              ) : <div />}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSignatureModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="button"
                  disabled={signatureSaving || !signaturePreview}
                  onClick={handleSaveSignature}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {signatureSaving ? (
                    <span>{t('Saving...')}</span>
                  ) : (
                    <>
                      <CheckCircle2 size={15} />
                      <span>{t('Save Signature')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Download Report Image Confirmation Modal */}
      {showDownloadConfirmModal && selectedMemberSummary && (
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
                  {selectedMemberSummary.member.name} ({selectedMemberSummary.member.memberId})
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-white/5 space-y-2 text-xs text-gray-300">
              <p>
                {t('Are you sure you want to generate and download the financial report image for')}{' '}
                <strong className="text-white">{selectedMemberSummary.member.name}</strong>?
              </p>
              <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-[11px] text-gray-400">
                <div>
                  {t('ID:')} <span className="text-blue-300 font-mono font-semibold">{selectedMemberSummary.member.memberId}</span>
                </div>
                <div>
                  {t('Shares:')} <span className="text-white font-semibold">{selectedMemberSummary.member.currentShares || 1}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDownloadingReport}
                onClick={() => setShowDownloadConfirmModal(false)}
                className="btn btn-secondary btn-sm"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={isDownloadingReport}
                onClick={handleStartReportDownload}
                className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-md shadow-blue-500/20 hover:from-blue-500 hover:to-indigo-500 transition"
              >
                {isDownloadingReport ? (
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

      {/* Download Report Image Success Modal */}
      {downloadSuccessModal?.open && (
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
                  {downloadSuccessModal.memberName} ({downloadSuccessModal.memberId})
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-emerald-500/20 space-y-2 text-xs text-gray-300">
              <p className="text-gray-200">
                {t('The statement image has been saved to your downloads folder.')}
              </p>
              <div className="pt-2 border-t border-white/5 flex items-center gap-2 text-[11px] font-mono text-emerald-300 break-all">
                <Download size={13} className="shrink-0 text-emerald-400" />
                <span>{downloadSuccessModal.fileName}</span>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2">
              <button
                type="button"
                onClick={() => setDownloadSuccessModal(null)}
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
