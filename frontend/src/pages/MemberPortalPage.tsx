import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  FileDown,
  ReceiptText,
  TrendingUp,
  Users,
  WalletCards,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Clock,
  PlusCircle,
  X,
  Send,
  Upload,
  Eye,
  Printer,
  Paperclip,
  XCircle,
} from 'lucide-react';
import { apiRequest, getApiUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useLogo } from '../context/LogoContext';
import { downloadMemberReportImage } from '../utils/report-image';
import { PwaInstallCard } from '../components/PwaInstallCard';

type Portal = {
  member: {
    _id: string;
    memberId: string;
    name: string;
    phone: string;
    status: string;
    cashoutDue?: number;
  };
  currentShares: number;
  due: number;
  advance: number;
  payments: Array<{
    _id: string;
    receiptNumber: string;
    paymentDate: string;
    totalAmount: number;
    paymentMethod: string;
    status: string;
  }>;
  ledgers: Array<{
    _id: string;
    month: string;
    principalDue: number;
    penaltyDue: number;
    principalPaid: number;
    penaltyPaid: number;
    status: string;
  }>;
  summary?: {
    totalPayments: number;
    totalDues: number;
    totalPenaltyPaid: number;
    totalPenaltyDue: number;
    totalPrincipalDue?: number;
    cashoutDue?: number;
  };
};

type Transparency = {
  disclosure: {
    showCollections: boolean;
    showExpenses: boolean;
    showInvestmentProjects: boolean;
    showRealizedProfit: boolean;
    showExpectedProfit: boolean;
    allowAnnualProfitLossDownload: boolean;
  };
  collections?: number;
  expenses?: number;
  realizedProfit?: number;
  realizedLoss?: number;
  netRealizedProfit?: number;
  expectedProfit?: number;
  availableAnnualReportYears?: number[];
  projects?: Array<{
    projectId: string;
    name: string;
    category: string;
    status: string;
    maturityDate: string | null;
    totalFunded: number;
    expectedROI: number | null;
  }>;
};

type MemberDepositItem = {
  _id: string;
  receiptId: string;
  uploadedAt: string;
  status: string;
  amount: number;
  paymentMethod: string;
  transactionReference: string;
  paymentDate: string;
  targetMonth: string | null;
  notes: string;
  originalFilename: string;
  hasSlip: boolean;
  mimeType: string;
  paymentId: string | null;
  reviewedAt: string | null;
};

const money = (value: number) =>
  `৳ ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function receiptValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const receiptMoney = (value: number) =>
  `৳ ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const receiptPeriod = (value: string) => {
  const matched = /^(\d{4})-(\d{2})$/.exec(value);
  if (!matched) return value;
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(Number(matched[1]), Number(matched[2]) - 1, 1))
  );
};

const receiptAmountInWords = (value: number) => {
  const underTwenty = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const asWords = (amount: number): string => {
    if (amount < 20) return underTwenty[amount];
    if (amount < 100) return `${tens[Math.floor(amount / 10)]}${amount % 10 ? `-${underTwenty[amount % 10]}` : ''}`;
    if (amount < 1000) return `${underTwenty[Math.floor(amount / 100)]} hundred${amount % 100 ? ` ${asWords(amount % 100)}` : ''}`;
    for (const [size, label] of [
      [1_000_000_000, 'billion'],
      [1_000_000, 'million'],
      [1_000, 'thousand'],
    ] as const) {
      if (amount >= size) return `${asWords(Math.floor(amount / size))} ${label}${amount % size ? ` ${asWords(amount % size)}` : ''}`;
    }
    return 'zero';
  };
  const cents = Math.round((Number(value) - Math.floor(Number(value))) * 100);
  const taka = Math.max(0, Math.floor(Number(value) || 0));
  const phrase = `${asWords(taka)} taka${cents ? ` and ${asWords(cents)} paisa` : ''} only`;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
};

function createMemberReceiptDocument(payment: any, allocations: any[], logo: string | null) {
  const displayedAllocations = (allocations || []).slice(0, 12);
  const allocationRows = displayedAllocations
    .map(
      (a) => `
    <tr><td>${receiptValue(receiptPeriod(a.targetMonth))}</td><td>${receiptValue(a.allocationType)}</td><td class="amount">${receiptMoney(a.amount)}</td></tr>`
    )
    .join('');
  const extraAllocations =
    (allocations || []).length > displayedAllocations.length
      ? `<tr><td colspan="3" class="muted">আরও ${(allocations || []).length - displayedAllocations.length}টি বরাদ্দ অন্তর্ভুক্ত রয়েছে।</td></tr>`
      : '';
  const optionalLines = [
    payment.penaltyAmount > 0 ? ['বিলম্ব জরিমানা (Penalty)', payment.penaltyAmount] : null,
    payment.advanceAmount > 0 ? ['অতিরিক্ত অগ্রিম (Advance)', payment.advanceAmount] : null,
    payment.cashoutCharge > 0 ? ['ক্যাশআউট চার্জ (Cash-out)', payment.cashoutCharge] : null,
  ]
    .filter((line): line is [string, number] => line !== null)
    .map(
      ([label, amount]) => `<div class="line"><span>${label}</span><strong>${receiptMoney(amount)}</strong></div>`
    )
    .join('');

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
    <section class="meta"><div><div class="subtitle">Member</div><strong>${receiptValue(payment.memberId?.name)}</strong><div>${receiptValue(payment.memberId?.memberId)} · ${receiptValue(payment.memberId?.phone)}</div></div><div class="right"><div class="subtitle">Payment details</div><strong>${receiptValue(new Date(payment.paymentDate).toLocaleDateString())}</strong><div>${receiptValue(payment.paymentMethod)} · Received by ${receiptValue(payment.receiverId?.name || 'Accountant')}</div></div></section>
    <div class="subtitle">Accounting allocations</div><table><thead><tr><th>Period</th><th>Allocation type</th><th class="amount">Amount</th></tr></thead><tbody>${allocationRows}${extraAllocations}</tbody></table>
    <section class="summary"><div class="line"><span>Principal</span><strong>${receiptMoney(payment.principalAmount)}</strong></div>${optionalLines}<div class="total"><span>Total received</span><strong>${receiptMoney(payment.totalAmount)}</strong></div><div class="amount-words">${receiptValue(receiptAmountInWords(payment.totalAmount))}</div></section>
    <footer class="footer">
      <div>
        <span>Verified cooperative financial record</span>
      </div>
      <div style="text-align: center; min-width: 45mm;">
        <div style="height: 30px;"></div>
        <div style="border-top: 1px solid #94a3b8; padding-top: 3px; font-weight: 600;">Authorized Officer</div>
      </div>
    </footer>
  </main></body></html>`;
}

export const MemberPortalPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = usePreferences();
  const { logo } = useLogo();
  const [data, setData] = useState<Portal | null>(null);
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [deposits, setDeposits] = useState<MemberDepositItem[]>([]);
  const [error, setError] = useState('');
  const [downloadingImg, setDownloadingImg] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [submittingDeposit, setSubmittingDeposit] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState('');

  // Slip file upload state
  const [slipFile, setSlipFile] = useState<{
    name: string;
    type: string;
    base64: string;
    preview: string;
    size: number;
  } | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Modal viewers state
  const [viewingSlip, setViewingSlip] = useState<{
    receiptId: string;
    filename: string;
    mimeType: string;
    url: string;
  } | null>(null);

  const [viewingReceipt, setViewingReceipt] = useState<{
    payment: any;
    allocations: any[];
  } | null>(null);

  // Deposit Form
  const [depositForm, setDepositForm] = useState({
    amount: '',
    paymentMethod: 'BKASH',
    transactionReference: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    targetMonth: '',
    notes: '',
  });

  const fetchPortalData = async () => {
    try {
      const [portal, overview, myDeposits] = await Promise.all([
        apiRequest<Portal>('/member-portal/me'),
        apiRequest<Transparency>('/member-portal/organization-transparency'),
        apiRequest<MemberDepositItem[]>('/member-portal/my-deposits'),
      ]);
      setData(portal.data);
      setTransparency(overview.data);
      if (myDeposits.data) setDeposits(myDeposits.data);
    } catch (err: any) {
      setError(err.message || 'Error loading member portal data');
    }
  };

  useEffect(() => {
    fetchPortalData();
  }, []);

  const handleFileSelect = (file: File) => {
    if (file.size > 15 * 1024 * 1024) {
      setError('ফাইলের আকার সর্বোচ্চ ১৫ মেগাবাইট হতে পারবে / File exceeds 15MB limit.');
      return;
    }
    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSlipFile({
        name: file.name,
        type: file.type || 'image/jpeg',
        base64,
        preview: isImage ? base64 : '',
        size: file.size,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositForm.amount || Number(depositForm.amount) <= 0) {
      setError('সঠিক টাকার পরিমাণ উল্লেখ করুন / Please enter a valid amount.');
      return;
    }
    if (!depositForm.transactionReference.trim()) {
      setError('ট্রানজেকশন আইডি (TrxID) অথবা ব্যাংক রেফারেন্স আবশ্যক / Transaction Reference is required.');
      return;
    }
    try {
      setSubmittingDeposit(true);
      setError('');

      const payload = {
        amount: Number(depositForm.amount),
        paymentMethod: depositForm.paymentMethod,
        transactionReference: depositForm.transactionReference.trim(),
        paymentDate: depositForm.paymentDate,
        targetMonth: depositForm.targetMonth.trim() || undefined,
        notes: depositForm.notes.trim() || undefined,
        slipFile: slipFile
          ? {
              name: slipFile.name,
              type: slipFile.type,
              base64: slipFile.base64,
            }
          : undefined,
      };

      await apiRequest('/member-portal/deposit-request', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setDepositSuccess('আপনার পেমেন্ট স্লিপ সফলভাবে সাবমিট হয়েছে! হিসাবরক্ষক যাচাই করে লেজারে অনুমোদন করবেন।');
      setShowDepositModal(false);
      setSlipFile(null);
      setDepositForm({
        amount: '',
        paymentMethod: 'BKASH',
        transactionReference: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        targetMonth: '',
        notes: '',
      });

      // Refresh list
      await fetchPortalData();
    } catch (err: any) {
      setError(err.message || 'Failed to submit deposit');
    } finally {
      setSubmittingDeposit(false);
    }
  };

  const handleViewSlip = async (receiptId: string, filename: string, mimeType: string) => {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(getApiUrl(`/member-portal/my-deposits/${receiptId}/slip`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Could not load slip document');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setViewingSlip({ receiptId, filename, mimeType, url });
    } catch (err: any) {
      setError(err.message || 'Error opening slip');
    }
  };

  const handleCloseSlipModal = () => {
    if (viewingSlip?.url) {
      URL.revokeObjectURL(viewingSlip.url);
    }
    setViewingSlip(null);
  };

  const handleViewPaymentReceipt = async (paymentId: string) => {
    try {
      const res = await apiRequest<{ payment: any; allocations: any[] }>(
        `/member-portal/payments/${paymentId}/receipt`
      );
      setViewingReceipt(res.data);
    } catch (err: any) {
      setError(err.message || 'Could not fetch official payment receipt');
    }
  };

  const handlePrintReceipt = () => {
    if (!viewingReceipt) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to print official payment receipts.');
      return;
    }
    printWindow.document.write(
      createMemberReceiptDocument(
        viewingReceipt.payment,
        viewingReceipt.allocations,
        logo
      )
    );
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 350);
  };

  const download = async (path: string, name: string) => {
    const response = await fetch(getApiUrl(`/documents${path}`), {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
    });
    if (!response.ok) {
      setError('This document is not available to your account.');
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadReportImage = async () => {
    if (!data) return;
    try {
      setDownloadingImg(true);
      const computedSummary = {
        totalPayments:
          data.summary?.totalPayments ??
          data.payments.reduce((s, p) => s + (p.status !== 'CANCELLED' ? Number(p.totalAmount || 0) : 0), 0),
        totalDues: data.summary?.totalDues ?? Number(data.due + (data.member.cashoutDue || 0)),
        totalPenaltyPaid:
          data.summary?.totalPenaltyPaid ?? data.ledgers.reduce((s, l) => s + Number(l.penaltyPaid || 0), 0),
        totalPenaltyDue:
          data.summary?.totalPenaltyDue ??
          data.ledgers.reduce((s, l) => s + Math.max(0, Number(l.penaltyDue || 0) - Number(l.penaltyPaid || 0)), 0),
      };

      await downloadMemberReportImage({
        member: {
          ...data.member,
          currentShares: data.currentShares,
        },
        summary: computedSummary,
        payments: data.payments,
        logo,
      });
    } finally {
      setDownloadingImg(false);
    }
  };

  if (error) return <div className="alert alert-error">{error}</div>;
  if (!data || !transparency) return <div className="glass-card p-6 text-gray-400">Loading your member account…</div>;

  const disclosure = transparency.disclosure;

  // Derived financial summary
  const summaryTotalPayments =
    data.summary?.totalPayments ??
    data.payments.reduce((s, p) => s + (p.status !== 'CANCELLED' ? Number(p.totalAmount || 0) : 0), 0);
  const summaryTotalDues = data.summary?.totalDues ?? Number(data.due + (data.member.cashoutDue || 0));
  const summaryTotalPenaltyPaid =
    data.summary?.totalPenaltyPaid ?? data.ledgers.reduce((s, l) => s + Number(l.penaltyPaid || 0), 0);
  const summaryTotalPenaltyDue =
    data.summary?.totalPenaltyDue ??
    data.ledgers.reduce((s, l) => s + Math.max(0, Number(l.penaltyDue || 0) - Number(l.penaltyPaid || 0)), 0);
  const summaryCashoutDue = data.summary?.cashoutDue ?? Number(data.member?.cashoutDue || 0);

  // Unpaid/Due months for quick selection in modal
  const dueLedgers = (data.ledgers || []).filter((l) => {
    const totalDue = Number(l.principalDue || 0) + Number(l.penaltyDue || 0);
    const totalPaid = Number(l.principalPaid || 0) + Number(l.penaltyPaid || 0);
    return totalDue > totalPaid;
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-blue-400">{t('Member self-service')}</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">
          {t('Welcome,')} {data.member.name}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {data.member.memberId} · {t('Your shares, contributions, and account status.')}
        </p>
      </header>

      {/* PWA Mobile & Desktop App Hub */}
      <PwaInstallCard />

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card icon={<Users />} label={t('Current shares')} value={String(data.currentShares)} />
        <Card icon={<WalletCards />} label={t('Outstanding due')} value={money(summaryTotalDues)} />
        <Card icon={<WalletCards />} label={t('Advance credit')} value={money(data.advance)} />
      </div>

      {depositSuccess && (
        <div className="alert alert-success flex items-center justify-between p-4 bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 rounded-xl animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400" />
            <span>{depositSuccess}</span>
          </div>
          <button onClick={() => setDepositSuccess('')} className="text-emerald-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Official Actions & Annual Statement Section */}
      <section className="glass-card p-5">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h2 className="font-bold text-white text-lg">{t('Member Quick Actions')}</h2>
            <p className="text-sm text-gray-400 mt-1">
              পেমেন্ট ডিপোজিট স্লিপ জমা দিন অথবা ব্যক্তিগত স্টেটমেন্ট ডাউনলোড করুন
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center gap-2 shadow-lg shadow-emerald-600/20"
              onClick={() => {
                setShowDepositModal(true);
                setDepositSuccess('');
              }}
            >
              <PlusCircle size={16} />
              পেমেন্ট স্লিপ জমা দিন / Deposit
            </button>
            <button
              className="btn btn-secondary flex items-center gap-2"
              onClick={() => user?.memberId && download(`/members/${user.memberId}/statement.pdf`, 'my-member-statement.pdf')}
            >
              <FileDown size={16} />
              Download Statement PDF
            </button>
          </div>
        </div>
      </section>

      {/* MEMBER FINANCIAL POSITION TOTALS SUMMARY */}
      <section className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-900/90 via-blue-950/20 to-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ReceiptText size={20} className="text-blue-400" />
              {t('Financial Totals & Balance Summary')}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {t('Your payment totals, dues, and penalties breakdown')}
            </p>
          </div>
          <button
            type="button"
            disabled={downloadingImg}
            onClick={handleDownloadReportImage}
            className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-blue-500/20"
          >
            <ImageIcon size={16} />
            {downloadingImg ? t('Generating image...') : t('Download Report Image')}
          </button>
        </div>

        {/* Metric Cards: 4 default, 5 when member has Due Cash Out Charge */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${summaryCashoutDue > 0 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                {t('Total Paid')}
              </span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPayments)}</p>
            <p className="text-[11px] text-emerald-300/80 mt-1">সর্বমোট পরিশোধিত চাঁদা ও জমাকৃত অর্থ</p>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                {t('Total Dues')}
              </span>
              <AlertCircle size={16} className="text-rose-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalDues)}</p>
            <p className="text-[11px] text-rose-300/80 mt-1">
              {summaryCashoutDue > 0 ? 'মূল বকেয়া + জরিমানা + ক্যাশআউট' : 'মূল বকেয়া + জরিমানা + অন্যান্য'}
            </p>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                {t('Penalty Paid')}
              </span>
              <Clock size={16} className="text-blue-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPenaltyPaid)}</p>
            <p className="text-[11px] text-blue-300/80 mt-1">দেরির কারণে ইতিমধ্যে প্রদত্ত জরিমানা</p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                {t('Penalty Due')}
              </span>
              <AlertCircle size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPenaltyDue)}</p>
            <p className="text-[11px] text-amber-300/80 mt-1">অনাদায়ী বিলম্ব জরিমানার পরিমাণ</p>
          </div>

          {summaryCashoutDue > 0 && (
            <div className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-950/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-fuchsia-400 uppercase tracking-wider">
                  {t('Due Cash Out Charge')}
                </span>
                <AlertCircle size={16} className="text-fuchsia-400" />
              </div>
              <p className="text-2xl font-black text-white mt-2">{money(summaryCashoutDue)}</p>
              <p className="text-[11px] text-fuchsia-300/80 mt-1">অপরিশোধিত গেটওয়ে ক্যাশআউট ফি</p>
            </div>
          )}
        </div>
      </section>

      {/* MY SUBMITTED DEPOSITS & APPROVAL STATUS (আমার জমাকৃত পেমেন্ট স্লিপ ও অনুমোদন স্থিতি) */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="font-bold text-white text-lg flex items-center gap-2">
              <Send size={18} className="text-emerald-400" />
              আমার জমাকৃত পেমেন্ট স্লিপ ও অনুমোদন স্থিতি
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              আপনার প্রেরিত জমা রসিদ ও হিসাবরক্ষকের অনুমোদন অবস্থা (Live Review Queue)
            </p>
          </div>
          <span className="text-xs text-gray-400 font-medium bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/5">
            মোট জমাদান: {deposits.length} টি
          </span>
        </div>

        <div className="table-container">
          <table className="data-table min-w-[650px]">
            <thead>
              <tr>
                <th>জমার তারিখ</th>
                <th>উদ্দিষ্ট মাস</th>
                <th>টাকার পরিমাণ</th>
                <th>মাধ্যম ও TrxID</th>
                <th>জমা স্লিপ</th>
                <th>অনুমোদন স্থিতি</th>
                <th className="text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {deposits.length > 0 ? (
                deposits.map((item) => (
                  <tr key={item._id}>
                    <td className="whitespace-nowrap text-xs text-gray-300">
                      {new Date(item.paymentDate || item.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="whitespace-nowrap font-medium text-blue-300 text-xs">
                      {item.targetMonth ? `📅 ${item.targetMonth}` : 'সাধারণ জমা'}
                    </td>
                    <td className="font-bold text-emerald-400 whitespace-nowrap">
                      {money(item.amount)}
                    </td>
                    <td className="text-xs text-gray-300 whitespace-nowrap">
                      <span className="font-semibold text-white">{item.paymentMethod}</span>
                      {item.transactionReference && (
                        <span className="block font-mono text-[11px] text-gray-400">
                          {item.transactionReference}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      {item.hasSlip ? (
                        <button
                          type="button"
                          onClick={() => handleViewSlip(item.receiptId, item.originalFilename, item.mimeType)}
                          className="btn btn-secondary btn-xs flex items-center gap-1.5 text-xs text-blue-300 hover:text-white"
                          title="রসিদ স্লিপ দেখুন"
                        >
                          <Eye size={13} />
                          স্লিপ দেখুন
                        </button>
                      ) : (
                        <span className="text-[11px] text-gray-500 italic">স্লিপ নেই</span>
                      )}
                    </td>
                    <td>
                      {item.status === 'POSTED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <CheckCircle2 size={12} />
                          অনুমোদিত
                        </span>
                      ) : item.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          <XCircle size={12} />
                          প্রত্যাখ্যাত
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          <Clock size={12} />
                          অপেক্ষমান
                        </span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap">
                      {item.paymentId ? (
                        <button
                          type="button"
                          onClick={() => handleViewPaymentReceipt(item.paymentId!)}
                          className="btn btn-primary btn-xs flex items-center gap-1 ml-auto text-xs bg-blue-600 hover:bg-blue-500"
                        >
                          <ReceiptText size={13} />
                          অফিসিয়াল রশিদ
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">যাচাই চলছে</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="text-center text-gray-500 py-8">
                    আপনি এখনও কোনো পেমেন্ট স্লিপ জমা দেননি। উপরের "পেমেন্ট স্লিপ জমা দিন" বোতামে ক্লিক করে সহজে স্লিপ পাঠান।
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Contribution / Payment History Table */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="font-bold text-white flex items-center gap-2">
            <ReceiptText size={18} />
            {t('Contribution history')}
          </h2>
          <span className="text-xs text-gray-400 font-medium">
            মোট পরিশোধিত ভাউচার: {data.payments.length} টি
          </span>
        </div>
        <div className="table-container">
          <table className="data-table min-w-[600px]">
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th className="min-w-[180px]">{t('Receipt #')}</th>
                <th className="min-w-[130px]">{t('Method')}</th>
                <th>{t('Amount')}</th>
                <th>{t('Status')}</th>
                <th className="text-right">রশিদ ভাউচার</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.length ? (
                data.payments.map((p) => (
                  <tr key={p._id}>
                    <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="font-mono text-blue-300 font-semibold pr-6 whitespace-nowrap">{p.receiptNumber}</td>
                    <td className="whitespace-nowrap">{p.paymentMethod}</td>
                    <td className="font-semibold text-emerald-400">{money(p.totalAmount)}</td>
                    <td>
                      <span className={`badge ${p.status === 'PAID' ? 'badge-active' : 'badge-inactive'}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => handleViewPaymentReceipt(p._id)}
                        className="btn btn-secondary btn-xs inline-flex items-center gap-1.5 text-xs text-blue-300 hover:text-white"
                        title="অফিসিয়াল রশিদ দেখুন ও প্রিন্ট করুন"
                      >
                        <Eye size={13} />
                        রশিদ দেখুন
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-8">
                    No contributions have been recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Monthly Account Status */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="font-bold text-white">{t('Monthly account status')}</h2>
          <span className="text-xs text-gray-400">প্রতি মাসের চাঁদা ও কিস্তির বিবরণী</span>
        </div>
        <div className="table-container mt-4">
          <table className="data-table min-w-[580px]">
            <thead>
              <tr>
                <th>{t('Month')}</th>
                <th>{t('Due')}</th>
                <th>{t('Paid')}</th>
                <th>{t('Status')}</th>
                <th className="text-right">অ্যাকশন</th>
              </tr>
            </thead>
            <tbody>
              {data.ledgers.map((l) => {
                const totalDue = Number(l.principalDue || 0) + Number(l.penaltyDue || 0);
                const totalPaid = Number(l.principalPaid || 0) + Number(l.penaltyPaid || 0);
                const isOverdue = totalDue > totalPaid;
                const remainingDue = Math.max(0, totalDue - totalPaid);

                return (
                  <tr key={l._id}>
                    <td className="font-medium text-white">{l.month}</td>
                    <td className="text-rose-300 font-semibold">{money(totalDue)}</td>
                    <td className="text-emerald-400 font-semibold">{money(totalPaid)}</td>
                    <td>
                      <span className={`badge ${!isOverdue ? 'badge-active' : 'badge-inactive'}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="text-right">
                      {isOverdue && (
                        <button
                          type="button"
                          onClick={() => {
                            setDepositForm({
                              ...depositForm,
                              targetMonth: l.month,
                              amount: String(remainingDue),
                            });
                            setShowDepositModal(true);
                          }}
                          className="btn btn-primary btn-xs inline-flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                          <PlusCircle size={12} />
                          জমা দিন
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Transparency Section */}
      <section className="glass-card p-5">
        <div className="flex gap-2 items-center">
          <BarChart3 size={19} className="text-emerald-300" />
          <div>
            <h2 className="font-bold text-white">{t('NS Foundation today')}</h2>
            <p className="text-sm text-gray-400 mt-1">
              Organization-level information approved by the Super Admin. It does not include other Members’ personal records.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {disclosure.showCollections && (
            <Card icon={<WalletCards />} label={t('Organization collections')} value={money(transparency.collections || 0)} />
          )}
          {disclosure.showExpenses && (
            <Card icon={<ReceiptText />} label={t('Organization expenses')} value={money(transparency.expenses || 0)} />
          )}
          {disclosure.showRealizedProfit && (
            <Card
              icon={<TrendingUp />}
              label={t('Net realized profit')}
              value={money(transparency.netRealizedProfit || 0)}
              note={`Profit ${money(transparency.realizedProfit || 0)} · Loss ${money(transparency.realizedLoss || 0)}`}
            />
          )}
          {disclosure.showExpectedProfit && (
            <Card
              icon={<TrendingUp />}
              label={t('Expected active-project profit')}
              value={money(transparency.expectedProfit || 0)}
              note="Projection only; not guaranteed."
            />
          )}
        </div>
        {disclosure.showInvestmentProjects && (
          <div className="table-container mt-5">
            <table className="data-table min-w-[700px]">
              <thead>
                <tr>
                  <th>{t('Project')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('Invested')}</th>
                  <th>{t('Expected ROI')}</th>
                  <th>{t('Maturity')}</th>
                </tr>
              </thead>
              <tbody>
                {transparency.projects?.length ? (
                  transparency.projects.map((project) => (
                    <tr key={project.projectId}>
                      <td>
                        <strong>{project.name}</strong>
                        <span className="block text-xs text-gray-400">
                          {project.projectId} · {project.category}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-active">{project.status}</span>
                      </td>
                      <td>{money(project.totalFunded)}</td>
                      <td>{project.expectedROI === null ? 'Not set' : `${project.expectedROI}%`}</td>
                      <td>{project.maturityDate ? new Date(project.maturityDate).toLocaleDateString() : 'Not scheduled'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-7">
                      No active or matured projects are available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {disclosure.allowAnnualProfitLossDownload && (
          <div className="mt-5 pt-5 border-t border-white/10">
            <h3 className="font-semibold text-white">{t('Annual profit & loss reports')}</h3>
            <p className="text-xs text-gray-400 mt-1">
              Only final, locked annual reports are available. Audit packs and operational detail remain restricted.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {transparency.availableAnnualReportYears?.length ? (
                transparency.availableAnnualReportYears.map((year) => (
                  <button
                    key={year}
                    className="btn btn-secondary btn-sm"
                    onClick={() => download(`/annual/${year}/report.pdf`, `annual-profit-loss-${year}.pdf`)}
                  >
                    <FileDown size={14} />
                    {year} PDF
                  </button>
                ))
              ) : (
                <span className="text-sm text-gray-500">No locked annual report is available yet.</span>
              )}
            </div>
          </div>
        )}
      </section>

      {/* MEMBER DEPOSIT SUBMISSION MODAL */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
            <button
              onClick={() => {
                setShowDepositModal(false);
                setSlipFile(null);
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <PlusCircle size={22} />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">পেমেন্ট স্লিপ জমা দিন</h3>
                <p className="text-xs text-gray-400">বিকাশ, নগদ বা ব্যাংক জমার রশিদ ও তথ্য পাঠান</p>
              </div>
            </div>

            <form onSubmit={handleDepositSubmit} className="space-y-4">
              {/* Quick Select Due Months */}
              {dueLedgers.length > 0 && (
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <label className="block text-xs font-semibold text-amber-300 mb-1.5 flex items-center gap-1.5">
                    <Clock size={13} />
                    বকেয়া মাসসমূহ (দ্রুত সিলেক্ট করতে ক্লিক করুন):
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dueLedgers.map((dl) => {
                      const remaining = Math.max(
                        0,
                        Number(dl.principalDue || 0) +
                          Number(dl.penaltyDue || 0) -
                          (Number(dl.principalPaid || 0) + Number(dl.penaltyPaid || 0))
                      );
                      const isSelected = depositForm.targetMonth === dl.month;
                      return (
                        <button
                          key={dl._id}
                          type="button"
                          onClick={() => {
                            setDepositForm({
                              ...depositForm,
                              targetMonth: dl.month,
                              amount: remaining > 0 ? String(remaining) : depositForm.amount,
                            });
                          }}
                          className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : 'bg-slate-900 text-gray-300 border-slate-700 hover:border-emerald-500/60'
                          }`}
                        >
                          📅 {dl.month} (বকেয়া: ৳ {remaining.toLocaleString()})
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Month input */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  কোন মাসের জন্য জমা (Target Month)
                </label>
                <input
                  type="text"
                  placeholder="যেমন: 2026-10 অথবা অক্টোবর ২০২৬"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  value={depositForm.targetMonth}
                  onChange={(e) => setDepositForm({ ...depositForm, targetMonth: e.target.value })}
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  টাকার পরিমাণ (BDT) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="যেমন: 2000"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 font-semibold"
                  value={depositForm.amount}
                  onChange={(e) => setDepositForm({ ...depositForm, amount: e.target.value })}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  পেমেন্ট মাধ্যম *
                </label>
                <select
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  value={depositForm.paymentMethod}
                  onChange={(e) => setDepositForm({ ...depositForm, paymentMethod: e.target.value })}
                >
                  <option value="BKASH">bKash (বিকাশ)</option>
                  <option value="NAGAD">Nagad (নগদ)</option>
                  <option value="BANK_TRANSFER">Bank Transfer (ব্যাংক স্থানান্তর)</option>
                  <option value="CASH">Cash (ক্যাশ জমা)</option>
                </select>
              </div>

              {/* Transaction Reference */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  ট্রানজেকশন আইডি / ব্যাংক ভাউচার নং *
                </label>
                <input
                  type="text"
                  required
                  placeholder="যেমন: BLA1234567 বা ব্যাংক ডিপোজিট স্লিপ নং"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono"
                  value={depositForm.transactionReference}
                  onChange={(e) => setDepositForm({ ...depositForm, transactionReference: e.target.value })}
                />
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  পেমেন্টের তারিখ
                </label>
                <input
                  type="date"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  value={depositForm.paymentDate}
                  onChange={(e) => setDepositForm({ ...depositForm, paymentDate: e.target.value })}
                />
              </div>

              {/* Real Slip / Receipt Upload Section */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Paperclip size={13} className="text-emerald-400" />
                    রশিদ বা পেমেন্ট স্ক্রিনশট আপলোড (ঐচ্ছিক কিন্তু বাঞ্ছনীয়)
                  </span>
                  <span className="text-[11px] text-gray-500">JPG, PNG, PDF (সর্বোচ্চ ১৫ MB)</span>
                </label>

                {!slipFile ? (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
                    }}
                    onClick={() => document.getElementById('slip-input-file')?.click()}
                    className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                      dragActive
                        ? 'border-emerald-500 bg-emerald-950/30'
                        : 'border-slate-700 hover:border-emerald-500/60 bg-slate-950'
                    }`}
                  >
                    <input
                      id="slip-input-file"
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                    />
                    <Upload size={22} className="mx-auto text-gray-400 mb-1" />
                    <p className="text-xs text-gray-300 font-medium">
                      ক্লিক করে ছবি সিলেক্ট করুন অথবা এখানে ড্র্যাগ করুন
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      বিকাশ/নগদ সফল পেমেন্টের স্ক্রিনশট বা ব্যাংকের জমা রশিদ
                    </p>
                  </div>
                ) : (
                  <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {slipFile.preview ? (
                        <img
                          src={slipFile.preview}
                          alt="Slip Preview"
                          className="w-12 h-12 object-cover rounded-lg border border-slate-700 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-emerald-400 flex-shrink-0">
                          <Paperclip size={20} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{slipFile.name}</p>
                        <p className="text-[11px] text-gray-400">
                          {(slipFile.size / 1024).toFixed(1)} KB · প্রস্তুত
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSlipFile(null)}
                      className="text-gray-400 hover:text-rose-400 p-1"
                      title="ফাইল মুছে ফেলুন"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  অতিরিক্ত বিবরণ / মন্তব্য (ঐচ্ছিক)
                </label>
                <textarea
                  rows={2}
                  placeholder="যেমন: অক্টোবর মাসের নিয়মিত চাঁদা ও বিকাশ খরচ"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                  value={depositForm.notes}
                  onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowDepositModal(false);
                    setSlipFile(null);
                  }}
                  className="btn btn-secondary px-4 py-2 text-sm"
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  disabled={submittingDeposit}
                  className="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5 py-2 text-sm flex items-center gap-2"
                >
                  <Send size={15} />
                  {submittingDeposit ? 'জমা হচ্ছে...' : 'পেমেন্ট রিকোয়েস্ট পাঠান'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SLIP IMAGE VIEWER MODAL */}
      {viewingSlip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-2xl w-full p-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Paperclip size={18} className="text-blue-400" />
                <h3 className="text-sm font-bold text-white truncate max-w-md">
                  জমাকৃত স্লিপ: {viewingSlip.filename}
                </h3>
              </div>
              <button onClick={handleCloseSlipModal} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto flex items-center justify-center bg-black/40 rounded-xl p-2 border border-slate-800">
              {viewingSlip.mimeType.includes('pdf') ? (
                <iframe
                  src={viewingSlip.url}
                  title="Deposit Slip PDF"
                  className="w-full h-[60vh] rounded-lg"
                />
              ) : (
                <img
                  src={viewingSlip.url}
                  alt="Deposit Slip"
                  className="max-h-[60vh] max-w-full object-contain rounded-lg"
                />
              )}
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-800 mt-4">
              <a
                href={viewingSlip.url}
                download={viewingSlip.filename || 'deposit-slip.png'}
                className="btn btn-primary btn-sm flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500"
              >
                <FileDown size={14} />
                ডাউনলোড
              </a>
              <button
                type="button"
                onClick={handleCloseSlipModal}
                className="btn btn-secondary btn-sm"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OFFICIAL PAYMENT RECEIPT VIEWER MODAL */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold">
                  <ReceiptText size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Payment Receipt</h3>
                  <p className="text-xs text-blue-400 font-mono">
                    {viewingReceipt.payment.receiptNumber}
                  </p>
                </div>
              </div>
              <button onClick={() => setViewingReceipt(null)} className="text-gray-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Printable Content */}
            <div className="p-4 bg-slate-950 rounded-xl border border-white/10 space-y-4 text-xs">
              {/* Header */}
              <div className="text-center pb-3 border-b border-white/10">
                {logo && <img src={logo} alt="NS Foundation Logo" className="h-10 mx-auto mb-2 object-contain" />}
                <h4 className="text-sm font-black text-white tracking-wide uppercase">
                  NS FOUNDATION COOPERATIVE SOCIETY
                </h4>
                <p className="text-[11px] text-gray-400">
                  Official Member Contribution & Payment Receipt
                </p>
              </div>

              {/* Meta */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-gray-500 uppercase font-bold text-[10px] block">সদস্যের তথ্য</span>
                  <p className="font-bold text-white text-sm">{viewingReceipt.payment.memberId?.name}</p>
                  <p className="text-gray-400 font-mono">{viewingReceipt.payment.memberId?.memberId}</p>
                  <p className="text-gray-400">{viewingReceipt.payment.memberId?.phone}</p>
                </div>
                <div className="text-right">
                  <span className="text-gray-500 uppercase font-bold text-[10px] block">পেমেন্ট বিবরণ</span>
                  <p className="font-mono text-gray-300">
                    {new Date(viewingReceipt.payment.paymentDate).toLocaleDateString()}
                  </p>
                  <p className="text-gray-300 font-semibold">{viewingReceipt.payment.paymentMethod}</p>
                  <p className="text-gray-400">
                    Receiver: {viewingReceipt.payment.receiverId?.name || 'Accountant'}
                  </p>
                </div>
              </div>

              {/* Allocations table */}
              <div>
                <span className="text-gray-400 uppercase font-bold text-[10px] block mb-1.5">
                  হিসাব লেজার বরাদ্দ (Allocations):
                </span>
                <div className="rounded-lg border border-white/10 overflow-hidden">
                  <table className="w-full text-left">
                    <thead className="bg-white/5 text-gray-400">
                      <tr>
                        <th className="p-2">মাস/Period</th>
                        <th className="p-2">খাত/Type</th>
                        <th className="p-2 text-right">পরিমাণ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {viewingReceipt.allocations?.map((a: any, i: number) => (
                        <tr key={i}>
                          <td className="p-2 font-mono text-blue-400">{receiptPeriod(a.targetMonth)}</td>
                          <td className="p-2 text-gray-300">{a.allocationType}</td>
                          <td className="p-2 text-right font-bold text-white">৳ {a.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Financial summary breakdown */}
              <div className="p-3 bg-white/5 rounded-lg space-y-1">
                <div className="flex justify-between text-gray-300">
                  <span>মূল চাঁদা (Principal):</span>
                  <span>৳ {viewingReceipt.payment.principalAmount?.toLocaleString()}</span>
                </div>
                {viewingReceipt.payment.penaltyAmount > 0 && (
                  <div className="flex justify-between text-rose-400">
                    <span>বিলম্ব জরিমানা (Late Penalty):</span>
                    <span>৳ {viewingReceipt.payment.penaltyAmount?.toLocaleString()}</span>
                  </div>
                )}
                {viewingReceipt.payment.advanceAmount > 0 && (
                  <div className="flex justify-between text-purple-400">
                    <span>অতিরিক্ত অগ্রিম (Advance):</span>
                    <span>৳ {viewingReceipt.payment.advanceAmount?.toLocaleString()}</span>
                  </div>
                )}
                {viewingReceipt.payment.cashoutCharge > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>ক্যাশআউট চার্জ (Cashout Charge):</span>
                    <span>৳ {viewingReceipt.payment.cashoutCharge?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-white/10 mt-1">
                  <span>সর্বমোট পরিশোধ (Total Received):</span>
                  <span className="text-emerald-400">
                    ৳ {viewingReceipt.payment.totalAmount?.toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 italic pt-1">
                  {receiptAmountInWords(viewingReceipt.payment.totalAmount)}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-4">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="btn btn-primary btn-sm flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500"
              >
                <Printer size={15} />
                প্রিন্ট করুন / Print Voucher
              </button>
              <button
                type="button"
                onClick={() => setViewingReceipt(null)}
                className="btn btn-secondary btn-sm"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Card = ({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note?: string;
}) => (
  <div className="rounded-xl border border-white/10 bg-slate-900/50 p-5">
    <div className="text-blue-300">{icon}</div>
    <p className="text-sm text-gray-400 mt-3">{label}</p>
    <p className="text-2xl font-extrabold text-white mt-1">{value}</p>
    {note && <p className="text-xs text-gray-500 mt-2">{note}</p>}
  </div>
);
