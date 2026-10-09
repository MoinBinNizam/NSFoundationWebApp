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
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useLogo } from '../context/LogoContext';
import { downloadMemberReportImage } from '../utils/report-image';

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

const money = (value: number) => `৳ ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const MemberPortalPage: React.FC = () => {
  const { user } = useAuth();
  const { logo } = useLogo();
  const [data, setData] = useState<Portal | null>(null);
  const [transparency, setTransparency] = useState<Transparency | null>(null);
  const [error, setError] = useState('');
  const [downloadingImg, setDownloadingImg] = useState(false);

  useEffect(() => {
    Promise.all([
      apiRequest<Portal>('/member-portal/me'),
      apiRequest<Transparency>('/member-portal/organization-transparency'),
    ])
      .then(([portal, overview]) => {
        setData(portal.data);
        setTransparency(overview.data);
      })
      .catch((err) => setError(err.message));
  }, []);

  const download = async (path: string, name: string) => {
    const response = await fetch(`/api/documents${path}`, {
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

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <p className="text-xs font-bold uppercase tracking-wider text-blue-400">Member self-service</p>
        <h1 className="text-3xl font-extrabold text-white mt-1">Welcome, {data.member.name}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {data.member.memberId} · Your shares, contributions, and account status.
        </p>
      </header>

      {/* Top Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card icon={<Users />} label="Current shares" value={String(data.currentShares)} />
        <Card icon={<WalletCards />} label="Outstanding due" value={money(summaryTotalDues)} />
        <Card icon={<WalletCards />} label="Advance credit" value={money(data.advance)} />
      </div>

      {/* Official Annual Statement Section */}
      <section className="glass-card p-5">
        <div className="flex justify-between items-center gap-3">
          <div>
            <h2 className="font-bold text-white">Official annual statement</h2>
            <p className="text-sm text-gray-400 mt-1">Download your personal statement only.</p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => user?.memberId && download(`/members/${user.memberId}/statement.pdf`, 'my-member-statement.pdf')}
          >
            <FileDown size={16} />
            Download PDF
          </button>
        </div>
      </section>

      {/* Transparency Section */}
      <section className="glass-card p-5">
        <div className="flex gap-2 items-center">
          <BarChart3 size={19} className="text-emerald-300" />
          <div>
            <h2 className="font-bold text-white">NS Foundation today</h2>
            <p className="text-sm text-gray-400 mt-1">
              Organization-level information approved by the Super Admin. It does not include other Members’ personal records.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
          {disclosure.showCollections && (
            <Card icon={<WalletCards />} label="Organization collections" value={money(transparency.collections || 0)} />
          )}
          {disclosure.showExpenses && (
            <Card icon={<ReceiptText />} label="Organization expenses" value={money(transparency.expenses || 0)} />
          )}
          {disclosure.showRealizedProfit && (
            <Card
              icon={<TrendingUp />}
              label="Net realized profit"
              value={money(transparency.netRealizedProfit || 0)}
              note={`Profit ${money(transparency.realizedProfit || 0)} · Loss ${money(transparency.realizedLoss || 0)}`}
            />
          )}
          {disclosure.showExpectedProfit && (
            <Card
              icon={<TrendingUp />}
              label="Expected active-project profit"
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
                  <th>Project</th>
                  <th>Status</th>
                  <th>Invested</th>
                  <th>Expected ROI</th>
                  <th>Maturity</th>
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
            <h3 className="font-semibold text-white">Annual profit & loss reports</h3>
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

      {/* MEMBER FINANCIAL POSITION TOTALS SUMMARY (BEFORE THE PAYMENT HISTORY LIST) */}
      <section className="rounded-2xl border border-blue-500/30 bg-gradient-to-br from-slate-900/90 via-blue-950/20 to-slate-900/90 p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ReceiptText size={20} className="text-blue-400" />
              চাঁদা ও বকেয়া আর্থিক সারসংক্ষেপ (Financial Totals)
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              আপনার পরিশোধিত মোট চাঁদা, বকেয়া এবং জরিমানার বিস্তারিত হিসাব
            </p>
          </div>
          <button
            type="button"
            disabled={downloadingImg}
            onClick={handleDownloadReportImage}
            className="btn btn-primary btn-sm flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold shadow-md shadow-blue-500/20"
          >
            <ImageIcon size={16} />
            {downloadingImg ? 'ছবি তৈরি হচ্ছে...' : 'রিপোর্ট ছবি ডাউনলোড (Download Image)'}
          </button>
        </div>

        {/* 4 Total Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                মোট পরিশোধিত (Total Paid)
              </span>
              <CheckCircle2 size={16} className="text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPayments)}</p>
            <p className="text-[11px] text-emerald-300/80 mt-1">সর্বমোট প্রাপ্ত চাঁদা ও জমাকৃত অর্থ</p>
          </div>

          <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                মোট বকেয়া (Total Dues)
              </span>
              <AlertCircle size={16} className="text-rose-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalDues)}</p>
            <p className="text-[11px] text-rose-300/80 mt-1">মূল বকেয়া + জরিমানা + অন্যান্য</p>
          </div>

          <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                পরিশোধিত জরিমানা (Penalty Paid)
              </span>
              <Clock size={16} className="text-blue-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPenaltyPaid)}</p>
            <p className="text-[11px] text-blue-300/80 mt-1">দেরির কারণে ইতিমধ্যে প্রদত্ত জরিমানা</p>
          </div>

          <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                বকেয়া জরিমানা (Penalty Due)
              </span>
              <AlertCircle size={16} className="text-amber-400" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{money(summaryTotalPenaltyDue)}</p>
            <p className="text-[11px] text-amber-300/80 mt-1">অনাদায়ী বিলম্ব জরিমানার পরিমাণ</p>
          </div>
        </div>
      </section>

      {/* Contribution / Payment History Table */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <h2 className="font-bold text-white flex items-center gap-2">
            <ReceiptText size={18} />
            Contribution history
          </h2>
          <span className="text-xs text-gray-400 font-medium">
            মোট লেনদেন: {data.payments.length} টি
          </span>
        </div>
        <div className="table-container">
          <table className="data-table min-w-[540px]">
            <thead>
              <tr>
                <th>Date</th>
                <th>Receipt</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.length ? (
                data.payments.map((p) => (
                  <tr key={p._id}>
                    <td>{new Date(p.paymentDate).toLocaleDateString()}</td>
                    <td className="font-mono text-blue-300 font-semibold">{p.receiptNumber}</td>
                    <td>{p.paymentMethod}</td>
                    <td className="font-semibold text-emerald-400">{money(p.totalAmount)}</td>
                    <td>
                      <span className={`badge ${p.status === 'PAID' ? 'badge-active' : 'badge-inactive'}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="text-center text-gray-500 py-8">
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
        <h2 className="font-bold text-white">Monthly account status</h2>
        <div className="table-container mt-4">
          <table className="data-table min-w-[540px]">
            <thead>
              <tr>
                <th>Month</th>
                <th>Due</th>
                <th>Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.ledgers.map((l) => (
                <tr key={l._id}>
                  <td>{l.month}</td>
                  <td>{money(l.principalDue + l.penaltyDue)}</td>
                  <td>{money(l.principalPaid + l.penaltyPaid)}</td>
                  <td>{l.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
