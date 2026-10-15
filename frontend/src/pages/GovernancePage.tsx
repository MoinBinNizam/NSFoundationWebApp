import React, { useCallback, useEffect, useState } from 'react';
import {
  BookOpenCheck,
  CalendarCheck2,
  UserRoundX,
  FileText,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Lock,
  Unlock,
  DollarSign,
  ShieldCheck,
  Eye,
  Pencil,
  Trash2,
  AlignLeft,
  Printer,
} from 'lucide-react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { groupCustodyAccounts } from '../utils/custodyUtils';

type Policy = {
  _id: string;
  serialNumber: number;
  title: string;
  category: string;
  content: string;
  currentVersion: number;
};

type Closing = {
  _id: string;
  year: number;
  status: string;
  summary: Record<string, number>;
};

type Exit = {
  _id: string;
  status: string;
  eligibleAmount?: number;
  deductionRate?: number;
  deductionAmount: number;
  netAmount: number;
  paymentMethod?: string;
  transactionRef?: string;
  authorizerName?: string;
  notes?: string;
  memberId: { _id?: string; memberId: string; name: string; phone?: string; status?: string; currentShares?: number };
  installments?: Array<{
    dueDate?: string;
    amount: number;
    paidAmount: number;
    paidAt?: string;
    custodyMovementId?: {
      _id?: string;
      amount?: number;
      date?: string;
      description?: string;
      custodyAccountId?: { _id?: string; name?: string; channel?: string; accountNumber?: string };
    } | string;
  }>;
  requestedBy?: { name?: string; email?: string };
  approvedBy?: { name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
};

type CustodyAcc = {
  _id: string;
  name: string;
  channel: string;
  accountType?: string;
  holderId?: { _id?: string; name?: string; email?: string; accountantType?: string } | string | null;
  cachedBalance: number;
};

type MemberItem = {
  _id: string;
  memberId: string;
  name: string;
  status: string;
  phone?: string;
};

export const GovernancePage: React.FC = () => {
  const { user } = useAuth();
  const { t, language } = usePreferences();
  const canManage = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [policies, setPolicies] = useState<Policy[]>([]);
  const [closings, setClosings] = useState<Closing[]>([]);
  const [exits, setExits] = useState<Exit[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAcc[]>([]);

  // Policy Document State
  const [policyDocContent, setPolicyDocContent] = useState<string>('');
  const [savingPolicyDoc, setSavingPolicyDoc] = useState<boolean>(false);
  const [policyDocNotice, setPolicyDocNotice] = useState<string | null>(null);

  // General Notification
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Policy Item Form
  const [policy, setPolicy] = useState({ serialNumber: '', title: '', category: '', content: '' });
  const [year, setYear] = useState(String(new Date().getFullYear()));

  // Exit Modal State
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [exitMemberId, setExitMemberId] = useState<string>('');
  const [exitEligibleAmount, setExitEligibleAmount] = useState<string>('');
  const [exitWaiveDeduction, setExitWaiveDeduction] = useState<boolean>(false);
  const [exitDeductionRate, setExitDeductionRate] = useState<string>('9.99');
  const [exitNetAmount, setExitNetAmount] = useState<string>('');
  const [exitPaymentMethod, setExitPaymentMethod] = useState<string>('BANK');
  const [exitTransactionRef, setExitTransactionRef] = useState<string>('');
  const [exitAuthorizerName, setExitAuthorizerName] = useState<string>('');
  const [exitCustodyId, setExitCustodyId] = useState<string>('');
  const [exitNotes, setExitNotes] = useState<string>('');
  const [exitAutoSettle, setExitAutoSettle] = useState<boolean>(true);
  const [exitSubmitting, setExitSubmitting] = useState<boolean>(false);

  // Settle Single Exit Modal State
  const [settlingExit, setSettlingExit] = useState<Exit | null>(null);
  const [settleCustodyId, setSettleCustodyId] = useState<string>('');
  const [settleSubmitting, setSettleSubmitting] = useState<boolean>(false);

  // View Exit Modal State
  const [viewingExit, setViewingExit] = useState<Exit | null>(null);

  // Edit Exit Modal State
  const [editingExit, setEditingExit] = useState<Exit | null>(null);
  const [editForm, setEditForm] = useState<{
    eligibleAmount: string;
    deductionRate: string;
    deductionAmount: string;
    netAmount: string;
    paymentMethod: string;
    transactionRef: string;
    authorizerName: string;
    status: string;
    custodyAccountId: string;
    notes: string;
  }>({
    eligibleAmount: '',
    deductionRate: '9.99',
    deductionAmount: '',
    netAmount: '',
    paymentMethod: 'BANK',
    transactionRef: '',
    authorizerName: '',
    status: 'SETTLED',
    custodyAccountId: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Delete Exit Modal State
  const [deletingExit, setDeletingExit] = useState<Exit | null>(null);
  const [deleteSaving, setDeleteSaving] = useState<boolean>(false);

  const load = useCallback(async () => {
    try {
      const [p, c, e, doc, m, ca] = await Promise.all([
        apiRequest<Policy[]>('/governance/policies'),
        apiRequest<Closing[]>('/governance/annual'),
        apiRequest<Exit[]>('/governance/exits'),
        apiRequest<{ content: string }>('/governance/policies/document').catch(() => ({ data: { content: '' } })),
        apiRequest<MemberItem[]>('/members?limit=200').catch(() => ({ data: [] })),
        apiRequest<CustodyAcc[]>('/payments/custody-accounts').catch(() => ({ data: [] })),
      ]);
      setPolicies(p.data || []);
      setClosings(c.data || []);
      setExits(e.data || []);
      setPolicyDocContent(doc.data?.content || '');
      setMembers(m.data || []);
      setCustodyAccounts(ca.data || []);
      if (ca.data?.[0]) {
        setExitCustodyId(ca.data[0]._id);
        setSettleCustodyId(ca.data[0]._id);
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createPolicy = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await apiRequest('/governance/policies', {
        method: 'POST',
        body: JSON.stringify({ ...policy, serialNumber: Number(policy.serialNumber) }),
      });
      setPolicy({ serialNumber: '', title: '', category: '', content: '' });
      setNotice('Policy version 1 created.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const formatPoliciesText = (rawText: string): string => {
    if (!rawText) return '';
    // Normalize accidental splits of percentages or decimals
    let formatted = rawText
      .replace(/\r\n/g, '\n')
      .replace(/([০-৯\d]+)[।.]\s*([০-৯\d]+%)/g, '$1.$2')
      .replace(/থেকে\s*\n+\s*([০-৯\d.]+)/g, 'থেকে $1');

    formatted = formatted.replace(
      /(^|[^\d০-৯.])([০-৯\d]{1,3})(?:।|\.(?![০-৯\d])|\))\s*/g,
      (_match, prefix, num, offset, fullStr) => {
        // If preceded by a digit or dot, it's a decimal like 9.99
        if (offset > 0 && /[\d০-৯.]/.test(fullStr[offset - 1])) {
          return _match;
        }
        // If followed by digits (decimal part), don't split
        const rest = fullStr.slice(offset + _match.length);
        if (/^[০-৯\d]/.test(rest)) {
          return _match;
        }
        const isStart = offset === 0 || prefix === '' || prefix === '\n';
        const cleanPrefix = prefix.replace(/\n+$/, '');
        return (isStart ? '' : cleanPrefix + '\n\n') + (num + '। ');
      }
    );
    // Sub-clauses like ক), খ), a), b)
    formatted = formatted.replace(/(^|[^\n])\s*([ক-হa-zA-Z])[)\]]\s*/g, '$1\n   $2) ');
    return formatted.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleSavePolicyDoc = async () => {
    setSavingPolicyDoc(true);
    setPolicyDocNotice(null);
    setError('');
    try {
      const formatted = formatPoliciesText(policyDocContent);
      setPolicyDocContent(formatted);
      await apiRequest('/governance/policies/document', {
        method: 'POST',
        body: JSON.stringify({ content: formatted }),
      });
      setPolicyDocNotice(t('Policy document saved successfully.'));
      setTimeout(() => setPolicyDocNotice(null), 4000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingPolicyDoc(false);
    }
  };

  const createClosing = async () => {
    try {
      await apiRequest('/governance/annual', { method: 'POST', body: JSON.stringify({ year: Number(year) }) });
      setNotice('Annual closing draft created.');
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const action = async (id: string, name: 'review' | 'approve' | 'lock' | 'unlock') => {
    try {
      await apiRequest(`/governance/annual/${id}/${name}`, { method: 'POST' });
      setNotice(
        name === 'unlock'
          ? t('Annual closing unlocked.')
          : name === 'lock'
          ? t('Annual closing locked.')
          : `Annual closing ${name}ed.`
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // When a member is chosen in the propose exit modal, prefill their principal paid
  const handleSelectExitMember = async (memberDbId: string) => {
    setExitMemberId(memberDbId);
    if (!memberDbId) {
      setExitEligibleAmount('');
      setExitNetAmount('');
      return;
    }
    try {
      const res = await apiRequest<{ summary: { totalPrincipalPaid?: number } }>(
        `/payments/member-summary/${memberDbId}`
      );
      if (res.data?.summary?.totalPrincipalPaid !== undefined) {
        const principal = res.data.summary.totalPrincipalPaid;
        setExitEligibleAmount(String(principal));
        if (exitWaiveDeduction || Number(exitDeductionRate) === 0) {
          setExitNetAmount(String(principal));
        } else {
          const rate = parseFloat(exitDeductionRate) || 9.99;
          const ded = Math.round((principal * (rate / 100) + Number.EPSILON) * 100) / 100;
          setExitNetAmount(String(Math.round((principal - ded + Number.EPSILON) * 100) / 100));
        }
      }
    } catch {
      // Ignore
    }
  };

  const handleExitEligibleChange = (val: string) => {
    setExitEligibleAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      if (exitWaiveDeduction || Number(exitDeductionRate) === 0) {
        setExitNetAmount(String(num));
      } else {
        const rate = parseFloat(exitDeductionRate) || 9.99;
        const ded = Math.round((num * (rate / 100) + Number.EPSILON) * 100) / 100;
        setExitNetAmount(String(Math.round((num - ded + Number.EPSILON) * 100) / 100));
      }
    } else {
      setExitNetAmount('');
    }
  };

  const handleToggleWaiveDeduction = (waived: boolean) => {
    setExitWaiveDeduction(waived);
    const num = parseFloat(exitEligibleAmount) || 0;
    if (waived) {
      setExitDeductionRate('0');
      setExitNetAmount(String(num));
      if (!exitAuthorizerName) {
        setExitAuthorizerName('Salah Uddin Shuvo (Director)');
      }
      if (!exitNotes) {
        setExitNotes('Authorized by Director Salah Uddin Shuvo for 100% full refund with 0% deduction.');
      }
    } else {
      setExitDeductionRate('9.99');
      const ded = Math.round((num * 0.0999 + Number.EPSILON) * 100) / 100;
      setExitNetAmount(String(Math.round((num - ded + Number.EPSILON) * 100) / 100));
    }
  };

  const handleProposeExitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitMemberId || !exitEligibleAmount || Number(exitEligibleAmount) < 0) return;
    setExitSubmitting(true);
    setError('');
    try {
      const eligible = Number(exitEligibleAmount);
      const isWaived = exitWaiveDeduction || Number(exitDeductionRate) === 0;
      const rate = isWaived ? 0 : Number(exitDeductionRate || 9.99);
      const net = exitNetAmount !== '' ? Number(exitNetAmount) : (isWaived ? eligible : Math.round((eligible * (1 - rate / 100) + Number.EPSILON) * 100) / 100);
      const deduction = Math.max(0, Math.round((eligible - net + Number.EPSILON) * 100) / 100);

      await apiRequest('/governance/exits', {
        method: 'POST',
        body: JSON.stringify({
          memberId: exitMemberId,
          eligibleAmount: eligible,
          deductionRate: rate,
          deductionAmount: deduction,
          netAmount: net,
          paymentMethod: exitPaymentMethod,
          transactionRef: exitTransactionRef || undefined,
          authorizerName: exitAuthorizerName || undefined,
          custodyAccountId: exitCustodyId,
          autoSettle: exitAutoSettle,
          notes: exitNotes || undefined,
        }),
      });
      setNotice(
        exitAutoSettle
          ? t('Member exit settlement completed and deducted from custody.')
          : t('Member exit settlement proposed successfully.')
      );
      setShowExitModal(false);
      setExitMemberId('');
      setExitEligibleAmount('');
      setExitNetAmount('');
      setExitDeductionRate('9.99');
      setExitWaiveDeduction(false);
      setExitPaymentMethod('BANK');
      setExitTransactionRef('');
      setExitAuthorizerName('');
      setExitNotes('');
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setExitSubmitting(false);
    }
  };

  const handleSettleExistingExit = async () => {
    if (!settlingExit || !settleCustodyId) return;
    setSettleSubmitting(true);
    setError('');
    try {
      await apiRequest(`/governance/exits/${settlingExit._id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ custodyAccountId: settleCustodyId }),
      });
      setNotice(t('Member exit settlement completed and deducted from custody.'));
      setSettlingExit(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSettleSubmitting(false);
    }
  };

  const handleStartEditExit = (exit: Exit) => {
    const eligible = exit.eligibleAmount ?? (Number(exit.netAmount || 0) + Number(exit.deductionAmount || 0));
    const rate = exit.deductionRate !== undefined ? exit.deductionRate : 9.99;
    const deduction = exit.deductionAmount ?? 0;
    const net = exit.netAmount ?? 0;

    let custodyId = '';
    if (exit.installments && exit.installments.length > 0) {
      const inst = exit.installments[0];
      if (inst.custodyMovementId && typeof inst.custodyMovementId === 'object' && inst.custodyMovementId.custodyAccountId) {
        custodyId = typeof inst.custodyMovementId.custodyAccountId === 'object'
          ? inst.custodyMovementId.custodyAccountId._id || ''
          : inst.custodyMovementId.custodyAccountId;
      }
    }
    if (!custodyId && custodyAccounts[0]) {
      custodyId = custodyAccounts[0]._id;
    }

    setEditForm({
      eligibleAmount: String(eligible),
      deductionRate: String(rate),
      deductionAmount: String(deduction),
      netAmount: String(net),
      paymentMethod: exit.paymentMethod || 'BANK',
      transactionRef: exit.transactionRef || '',
      authorizerName: exit.authorizerName || '',
      status: exit.status || 'SETTLED',
      custodyAccountId: custodyId,
      notes: exit.notes || '',
    });
    setEditingExit(exit);
  };

  const handleEditEligibleOrRateChange = (newEligibleStr: string, newRateStr: string) => {
    const el = parseFloat(newEligibleStr);
    const r = parseFloat(newRateStr);
    if (!isNaN(el) && !isNaN(r)) {
      const ded = r === 0 ? 0 : Math.round((el * (r / 100) + Number.EPSILON) * 100) / 100;
      const net = Math.round((el - ded + Number.EPSILON) * 100) / 100;
      setEditForm((prev) => ({
        ...prev,
        eligibleAmount: newEligibleStr,
        deductionRate: newRateStr,
        deductionAmount: String(ded),
        netAmount: String(net),
      }));
    } else {
      setEditForm((prev) => ({
        ...prev,
        eligibleAmount: newEligibleStr,
        deductionRate: newRateStr,
      }));
    }
  };

  const handleSaveEditExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExit) return;
    setEditSaving(true);
    setError('');
    try {
      await apiRequest(`/governance/exits/${editingExit._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          eligibleAmount: Number(editForm.eligibleAmount),
          deductionRate: Number(editForm.deductionRate),
          deductionAmount: Number(editForm.deductionAmount),
          netAmount: Number(editForm.netAmount),
          paymentMethod: editForm.paymentMethod || undefined,
          transactionRef: editForm.transactionRef || undefined,
          authorizerName: editForm.authorizerName || undefined,
          status: editForm.status,
          custodyAccountId: editForm.custodyAccountId || undefined,
          notes: editForm.notes || undefined,
        }),
      });
      setNotice(t('Exit settlement updated successfully.'));
      setEditingExit(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDeleteExit = async () => {
    if (!deletingExit) return;
    setDeleteSaving(true);
    setError('');
    try {
      await apiRequest(`/governance/exits/${deletingExit._id}`, {
        method: 'DELETE',
      });
      setNotice(t('Exit settlement deleted successfully.'));
      setDeletingExit(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeleteSaving(false);
    }
  };

  const printSettlementVoucher = (exit: Exit) => {
    const printWindow = window.open('', '_blank', 'width=850,height=900');
    if (!printWindow) return;

    const member = exit.memberId;
    const isWaived = (exit.deductionRate ?? 9.99) === 0;
    const eligible = Number(exit.eligibleAmount ?? (Number(exit.netAmount || 0) + Number(exit.deductionAmount || 0)));
    const deduction = Number(exit.deductionAmount || 0);
    const net = Number(exit.netAmount || 0);
    const dateStr = exit.createdAt ? new Date(exit.createdAt).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB');

    const inst = exit.installments?.[0];
    const mov = inst?.custodyMovementId && typeof inst.custodyMovementId === 'object' ? inst.custodyMovementId : null;
    const acc = mov?.custodyAccountId && typeof mov.custodyAccountId === 'object' ? mov.custodyAccountId : null;
    const custodyName = acc?.name || 'Accountant Custody';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Settlement Voucher - ${member?.memberId || 'NSF'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .org-title { font-size: 26px; font-weight: 800; color: #0f172a; letter-spacing: 1px; text-transform: uppercase; margin: 0; }
          .org-sub { font-size: 13px; color: #475569; margin-top: 4px; font-weight: 500; }
          .voucher-title { display: inline-block; margin-top: 14px; padding: 6px 20px; background: #0f172a; color: #fff; font-size: 13px; font-weight: 700; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; font-size: 13px; }
          .card { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; background: #f8fafc; }
          .card-title { font-size: 11px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
          .field-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
          .field-row:last-child { margin-bottom: 0; }
          .label { color: #64748b; font-weight: 500; }
          .value { font-weight: 600; color: #0f172a; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 13px; }
          th { background: #0f172a; color: #fff; text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
          td { padding: 12px 14px; border-bottom: 1px solid #cbd5e1; }
          tr:nth-child(even) td { background: #f8fafc; }
          .text-right { text-align: right; }
          .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; background: #f1f5f9; color: #0f172a; }
          .declaration { background: #f8fafc; border-left: 4px solid #0f172a; padding: 12px 16px; font-size: 12px; color: #334155; line-height: 1.6; margin-bottom: 40px; border-radius: 0 4px 4px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 40px; }
          .sig-box { text-align: center; }
          .sig-line { border-top: 1px dashed #475569; padding-top: 8px; font-size: 12px; font-weight: 600; color: #0f172a; }
          .sig-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
          .badge-waived { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="org-title">NS Foundation</h1>
          <div class="org-sub">Cooperative Society Registration & Mutual Finance Governance</div>
          <div class="voucher-title">Official Member Exit & Settlement Voucher</div>
        </div>

        <div class="meta-grid">
          <div class="card">
            <div class="card-title">Member Information</div>
            <div class="field-row"><span class="label">Member ID:</span><span class="value">${member?.memberId || '—'}</span></div>
            <div class="field-row"><span class="label">Full Name:</span><span class="value">${member?.name || '—'}</span></div>
            <div class="field-row"><span class="label">Contact Phone:</span><span class="value">${member?.phone || '—'}</span></div>
            <div class="field-row"><span class="label">Membership Status:</span><span class="value">${member?.status || 'DROPPED'}</span></div>
          </div>
          <div class="card">
            <div class="card-title">Voucher & Authorization Details</div>
            <div class="field-row"><span class="label">Settlement Date:</span><span class="value">${dateStr}</span></div>
            <div class="field-row"><span class="label">Payment Method:</span><span class="value">${exit.paymentMethod || 'Bank Transfer / Custody'}</span></div>
            <div class="field-row"><span class="label">Reference / TrxID:</span><span class="value">${exit.transactionRef || 'N/A'}</span></div>
            <div class="field-row"><span class="label">Authorized By:</span><span class="value">${exit.authorizerName || 'Director / Board Authorized'}</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="text-right">Policy Rate</th>
              <th class="text-right">Amount (BDT)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gross Eligible Principal Paid to Date</td>
              <td class="text-right">100.00%</td>
              <td class="text-right">৳ ${eligible.toFixed(2)}</td>
            </tr>
            <tr>
              <td>
                Foundation Exit Retention / Operational Deduction
                ${isWaived ? '<span class="badge badge-waived" style="margin-left: 8px;">Waived by Director</span>' : ''}
              </td>
              <td class="text-right">${exit.deductionRate ?? 9.99}%</td>
              <td class="text-right">- ৳ ${deduction.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Net Payout Disbursed to Member</td>
              <td class="text-right">Final</td>
              <td class="text-right">৳ ${net.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="card" style="margin-bottom: 20px;">
          <div class="card-title">Disbursement & Custody Account</div>
          <div class="field-row"><span class="label">Disbursing Account:</span><span class="value">${custodyName}</span></div>
          ${exit.notes ? `<div class="field-row" style="margin-top: 6px;"><span class="label">Remarks / Notes:</span><span class="value" style="font-weight: 400;">${exit.notes}</span></div>` : ''}
        </div>

        <div class="declaration">
          <strong>Clearance Declaration:</strong> I hereby acknowledge receipt of <strong>৳ ${net.toFixed(2)}</strong> from NS Foundation as the full and final settlement of my principal equity contributions upon exit. I confirm that all mutual financial obligations, share entitlements, and cooperative rights have been mutually settled without any pending liabilities.
        </div>

        <div class="signatures">
          <div class="sig-box">
            <div style="height: 45px;"></div>
            <div class="sig-line">Exiting Member Signature</div>
            <div class="sig-sub">${member?.name || 'Member'} — Date</div>
          </div>
          <div class="sig-box">
            <div style="height: 45px;"></div>
            <div class="sig-line">Authorized Signatory / Accountant</div>
            <div class="sig-sub">${exit.authorizerName || 'NS Foundation Authority'} — Date</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Grouped custody accounts for categorized dropdowns
  const groupedCustody = groupCustodyAccounts(custodyAccounts);

  // Calculated values for the modal preview
  const eligibleNum = Number(exitEligibleAmount) || 0;
  const isWaived = exitWaiveDeduction || Number(exitDeductionRate) === 0;
  const modalRate = isWaived ? 0 : Number(exitDeductionRate || 9.99);
  const modalDeduction = isWaived ? 0 : Math.round((eligibleNum * (modalRate / 100) + Number.EPSILON) * 100) / 100;
  const modalNetRefund = exitNetAmount !== '' ? Number(exitNetAmount) : Math.round((eligibleNum - modalDeduction + Number.EPSILON) * 100) / 100;

  return (
    <div className="space-y-6 max-w-7xl pb-12">
      <header>
        <div className="text-blue-400 text-xs font-bold uppercase tracking-wide">{t('Governance controls')}</div>
        <h1 className="text-2xl font-extrabold text-white mt-1">{t('Annual Closing, Policy & Member Exit')}</h1>
        <p className="text-sm text-gray-400 mt-1">
          {t('Transferred-share accumulated entitlement remains pending organizational decision and is never calculated here.')}
        </p>
      </header>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{t(error)}</span>
        </div>
      )}
      {notice && (
        <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={16} />
          <span>{t(notice)}</span>
        </div>
      )}

      {/* 1. ANNUAL CLOSING SECTION */}
      <section className="glass-card p-5">
        <div className="flex gap-2 items-center">
          <CalendarCheck2 className="text-blue-300" />
          <h2 className="font-bold text-white text-lg">{t('Annual closing')}</h2>
        </div>
        <div className="flex flex-wrap gap-2 mt-4 items-center">
          <input
            className="form-input max-w-40"
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
          {canManage && (
            <button className="btn btn-primary" onClick={createClosing}>
              {t('Create draft')}
            </button>
          )}
        </div>
        <div className="table-container mt-4">
          <table className="data-table min-w-[720px]">
            <thead>
              <tr>
                <th>{t('Year')}</th>
                <th>{t('Status')}</th>
                <th>{t('Collections')}</th>
                <th>{t('Expenses')}</th>
                <th>{t('Due')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {closings.map((c) => (
                <tr key={c._id}>
                  <td className="font-bold text-white">{c.year}</td>
                  <td>
                    <span
                      className={`badge text-xs font-semibold ${
                        c.status === 'LOCKED'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          : c.status === 'APPROVED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      }`}
                    >
                      {t(c.status)}
                    </span>
                  </td>
                  <td>৳ {Number(c.summary?.collections || 0).toFixed(2)}</td>
                  <td>৳ {Number(c.summary?.expenses || 0).toFixed(2)}</td>
                  <td>৳ {Number(c.summary?.outstandingDues || 0).toFixed(2)}</td>
                  <td className="flex gap-2">
                    {c.status === 'DRAFT' && canManage && (
                      <button className="btn btn-secondary btn-sm" onClick={() => action(c._id, 'review')}>
                        {t('Review')}
                      </button>
                    )}
                    {canManage && c.status === 'REVIEWED' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => action(c._id, 'approve')}>
                        {t('Approve')}
                      </button>
                    )}
                    {canManage && c.status === 'APPROVED' && (
                      <button className="btn btn-danger btn-sm flex items-center gap-1" onClick={() => action(c._id, 'lock')}>
                        <Lock size={13} />
                        <span>{t('Lock')}</span>
                      </button>
                    )}
                    {canManage && c.status === 'LOCKED' && (
                      <button
                        className="btn btn-warning btn-sm flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow-md shadow-amber-600/30"
                        onClick={() => action(c._id, 'unlock')}
                        title={t('Unlock to allow payment updates and historical corrections')}
                      >
                        <Unlock size={13} />
                        <span>{t('Unlock')}</span>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. NS FOUNDATION POLICIES SECTION (LOCALIZED) */}
      <section className="glass-card p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex gap-2 items-center">
            <BookOpenCheck className="text-violet-300" size={22} />
            <h2 className="font-bold text-white text-lg">
              {t('NS Foundation Policies')}
            </h2>
          </div>
          <span className="text-xs text-gray-400">
            {language === 'bn' ? 'অফিশিয়াল গঠনতন্ত্র ও নীতিমালা সংরক্ষণাগার' : 'Official Foundation Constitution & Policies Archive'}
          </span>
        </div>

        {/* Big Textarea for Complete Policy Document */}
        <div className="p-4 rounded-xl border border-white/10 bg-slate-900/60 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
              <FileText size={15} className="text-blue-400" />
              <span>{t('Complete Policy Document')}</span>
            </label>
            <div className="flex items-center gap-2">
              {policyDocNotice && (
                <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={14} />
                  {policyDocNotice}
                </span>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    const formatted = formatPoliciesText(policyDocContent);
                    setPolicyDocContent(formatted);
                    setPolicyDocNotice(t('Policy document formatted.'));
                    setTimeout(() => setPolicyDocNotice(null), 3000);
                  }}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs text-blue-300 border-blue-500/30 hover:bg-blue-500/10"
                  title={t('Format / Organize')}
                >
                  <AlignLeft size={14} />
                  <span>{t('Format / Organize')}</span>
                </button>
              )}
            </div>
          </div>

          <textarea
            rows={16}
            value={policyDocContent}
            onChange={(e) => setPolicyDocContent(e.target.value)}
            disabled={!canManage}
            placeholder={
              language === 'bn'
                ? 'এখানে এন এস ফাউন্ডেশনের পূর্ণাঙ্গ নীতিমালা, উপবিধি ও নিয়মাবলি পেস্ট বা লিখুন...'
                : 'Paste or write the complete NS Foundation policies, bylaws, and guidelines here...'
            }
            className="form-input text-xs font-mono leading-relaxed p-3.5 bg-slate-950/80 border-gray-700 rounded-xl text-gray-200 w-full focus:ring-2 focus:ring-blue-500/40"
          />

          {canManage && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={savingPolicyDoc}
                onClick={handleSavePolicyDoc}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {savingPolicyDoc ? (
                  <span>{t('Saving...')}</span>
                ) : (
                  <>
                    <CheckCircle2 size={15} />
                    <span>{t('Save Policy Document')}</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Structured Policy Rules Form & Cards */}
        {canManage && (
          <form onSubmit={createPolicy} className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/5">
            <input
              className="form-input"
              required
              type="number"
              placeholder={t('Serial number')}
              value={policy.serialNumber}
              onChange={(e) => setPolicy({ ...policy, serialNumber: e.target.value })}
            />
            <input
              className="form-input"
              required
              placeholder={t('Title')}
              value={policy.title}
              onChange={(e) => setPolicy({ ...policy, title: e.target.value })}
            />
            <input
              className="form-input"
              required
              placeholder={t('Category')}
              value={policy.category}
              onChange={(e) => setPolicy({ ...policy, category: e.target.value })}
            />
            <textarea
              className="form-input sm:col-span-2 min-h-24"
              required
              placeholder={t('Formal policy content')}
              value={policy.content}
              onChange={(e) => setPolicy({ ...policy, content: e.target.value })}
            />
            <button className="btn btn-secondary self-start">{t('Add policy')}</button>
          </form>
        )}

        <div className="space-y-3 pt-2">
          {policies.map((p) => (
            <article className="rounded-xl border border-white/10 p-4 bg-slate-900/40" key={p._id}>
              <div className="flex justify-between gap-2">
                <strong className="text-white">
                  {p.serialNumber}. {p.title}
                </strong>
                <span className="text-xs text-violet-300">v{p.currentVersion}</span>
              </div>
              <p className="text-xs text-gray-400 mt-1">{t(p.category)}</p>
              <p className="text-sm text-gray-300 mt-2 whitespace-pre-wrap">{p.content}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 3. MEMBER EXIT SETTLEMENTS SECTION */}
      <section className="glass-card p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 items-center">
            <UserRoundX className="text-rose-300" size={22} />
            <div>
              <h2 className="font-bold text-white text-lg">{t('Member exit settlements')}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {t('As per foundation policy, 9.99% is deducted from eligible principal refunds and deducted from custody account.')}
              </p>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowExitModal(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-600 shadow-md shadow-rose-600/20"
            >
              <Plus size={16} />
              <span>{t('Propose & Settle Exit')}</span>
            </button>
          )}
        </div>

        {/* Quick Reconciliation Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3.5">
            <span className="text-[11px] text-gray-400 block uppercase font-medium">{t('Total Exited Members')}</span>
            <span className="text-xl font-bold text-white mt-1 block">
              {exits.filter((e) => e.status === 'SETTLED').length}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5 block">{t('Settled records')}</span>
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-3.5">
            <span className="text-[11px] text-blue-300 block uppercase font-medium">{t('Total Principal Refunded')}</span>
            <span className="text-xl font-bold text-blue-400 mt-1 block">
              ৳ {exits
                .filter((e) => e.status === 'SETTLED')
                .reduce((s, e) => s + Number(e.eligibleAmount ?? (Number(e.netAmount || 0) + Number(e.deductionAmount || 0))), 0)
                .toLocaleString()}
            </span>
            <span className="text-[10px] text-blue-300/70 mt-0.5 block">{t('Total member capital')}</span>
          </div>

          <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5">
            <span className="text-[11px] text-rose-300 block uppercase font-medium">{t('Foundation Retention')}</span>
            <span className="text-xl font-bold text-rose-400 mt-1 block">
              ৳ {exits
                .filter((e) => e.status === 'SETTLED')
                .reduce((s, e) => s + Number(e.deductionAmount || 0), 0)
                .toLocaleString()}
            </span>
            <span className="text-[10px] text-rose-300/70 mt-0.5 block">{t('Retained operational funds')}</span>
          </div>

          <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3.5">
            <span className="text-[11px] text-emerald-300 block uppercase font-medium">{t('Total Net Disbursed')}</span>
            <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
              ৳ {exits
                .filter((e) => e.status === 'SETTLED')
                .reduce((s, e) => s + Number(e.netAmount || 0), 0)
                .toLocaleString()}
            </span>
            <span className="text-[10px] text-emerald-300/70 mt-0.5 block">{t('Disbursed from custody')}</span>
          </div>
        </div>

        <div className="table-container mt-2">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>{t('Member')}</th>
                <th>{t('Status')}</th>
                <th>{t('Eligible Amount')}</th>
                <th>{t('Deduction')}</th>
                <th>{t('Net Refund')}</th>
                <th>{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {exits.length ? (
                exits.map((e) => {
                  const isSettled = e.status === 'SETTLED';
                  const isWaived = e.deductionRate === 0;
                  return (
                    <tr key={e._id}>
                      <td>
                        <span className="font-mono text-blue-400 font-bold">{e.memberId?.memberId}</span>
                        <span className="text-white ml-2 font-medium">{e.memberId?.name}</span>
                        {e.memberId?.status && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                            {e.memberId.status}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge text-xs font-bold ${
                            isSettled
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {t(e.status)}
                        </span>
                      </td>
                      <td className="font-medium text-gray-200">
                        ৳ {Number(e.eligibleAmount ?? (Number(e.netAmount || 0) + Number(e.deductionAmount || 0))).toFixed(2)}
                      </td>
                      <td>
                        {isWaived ? (
                          <div className="flex flex-col">
                            <span className="text-emerald-400 font-bold text-xs">৳ 0.00</span>
                            <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20 w-fit mt-0.5">
                              {t('0% (Director Waived)')}
                            </span>
                          </div>
                        ) : (
                          <span className="text-rose-400 font-medium">৳ {Number(e.deductionAmount || 0).toFixed(2)}</span>
                        )}
                      </td>
                      <td className="text-emerald-400 font-bold text-base">৳ {Number(e.netAmount || 0).toFixed(2)}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* View Button */}
                          <button
                            type="button"
                            onClick={() => setViewingExit(e)}
                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition"
                            title={t('View Settlement')}
                          >
                            <Eye size={15} />
                          </button>

                          {/* Settle Button if not settled */}
                          {!isSettled && canManage && (
                            <button
                              type="button"
                              onClick={() => {
                                setSettlingExit(e);
                                if (custodyAccounts[0]) setSettleCustodyId(custodyAccounts[0]._id);
                              }}
                              className="btn btn-warning btn-sm text-xs py-1 px-2 flex items-center gap-1"
                              title={t('Settle / Deduct Custody')}
                            >
                              <DollarSign size={13} />
                              <span>{t('Settle')}</span>
                            </button>
                          )}

                          {/* Edit Button */}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => handleStartEditExit(e)}
                              className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition"
                              title={t('Edit Settlement')}
                            >
                              <Pencil size={15} />
                            </button>
                          )}

                          {/* Delete Button */}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setDeletingExit(e)}
                              className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                              title={t('Delete Settlement')}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="py-6 text-center text-gray-500" colSpan={6}>
                    {t('No exit settlements proposed.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* PROPOSE & SETTLE EXIT MODAL */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-lg w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <UserRoundX className="text-rose-400" size={20} />
                <h3 className="text-base font-bold text-white">{t('Propose & Settle Exit')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProposeExitSubmit} className="space-y-4">
              {/* Member Selector (Dropped members grouped first) */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Select Member')}</label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={exitMemberId}
                  onChange={(e) => handleSelectExitMember(e.target.value)}
                >
                  <option value="">{t('-- Select Member --')}</option>
                  <optgroup label={t('Dropped / Exited Members')}>
                    {members
                      .filter((m) => m.status === 'DROPPED')
                      .map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.memberId} — {m.name} (DROPPED)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label={t('Active Members')}>
                    {members
                      .filter((m) => m.status === 'ACTIVE')
                      .map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.memberId} — {m.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Eligible Principal Amount */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {t('Eligible Amount')} (৳)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="form-input text-xs w-full"
                  placeholder="e.g. 2500"
                  value={exitEligibleAmount}
                  onChange={(e) => handleExitEligibleChange(e.target.value)}
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  {t('Total principal contributions made by the member prior to exiting.')}
                </span>
              </div>

              {/* Waive Deduction Checkbox (Director Authorization) */}
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-950/20 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="waiveDeductionCheckbox"
                  checked={exitWaiveDeduction}
                  onChange={(e) => handleToggleWaiveDeduction(e.target.checked)}
                  className="rounded mt-0.5 border-amber-500/40 bg-slate-950 text-amber-500 focus:ring-amber-500"
                />
                <label htmlFor="waiveDeductionCheckbox" className="cursor-pointer select-none">
                  <span className="text-xs font-bold text-amber-300 block">
                    {t('Waive Deduction (Director Authorized)')}
                  </span>
                  <span className="text-[11px] text-amber-200/70 block mt-0.5">
                    {t('Return 100% full principal refund with 0% deduction upon authorization of Director (e.g. Salah Uddin Shuvo).')}
                  </span>
                </label>
              </div>

              {/* Deduction Rate & Manual Net Refund */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Deduction Rate (%)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={exitWaiveDeduction}
                    className="form-input text-xs w-full disabled:opacity-50"
                    value={exitDeductionRate}
                    onChange={(e) => {
                      setExitDeductionRate(e.target.value);
                      const rate = parseFloat(e.target.value) || 0;
                      const ded = Math.round((eligibleNum * (rate / 100) + Number.EPSILON) * 100) / 100;
                      setExitNetAmount(String(Math.round((eligibleNum - ded + Number.EPSILON) * 100) / 100));
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-300 mb-1">
                    {t('Net Refund Payout')} (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-emerald-400 font-bold"
                    placeholder="e.g. 1500"
                    value={exitNetAmount}
                    onChange={(e) => setExitNetAmount(e.target.value)}
                  />
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    {t('Accountant can manually adjust or round amount')}
                  </span>
                </div>
              </div>

              {/* Live Calculation Preview Card */}
              {eligibleNum > 0 && (
                <div className="p-3.5 rounded-xl border border-white/10 bg-slate-950/60 space-y-2">
                  <div className="flex justify-between text-xs text-gray-300">
                    <span>{t('Gross Eligible Principal')}:</span>
                    <strong className="text-white">৳ {eligibleNum.toFixed(2)}</strong>
                  </div>
                  <div className="flex justify-between text-xs text-rose-400">
                    <span>{t('Policy Deduction')} ({isWaived ? '0%' : `${exitDeductionRate}%`}):</span>
                    <strong>{isWaived ? '৳ 0.00' : `- ৳ ${modalDeduction.toFixed(2)}`}</strong>
                  </div>
                  <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-bold text-emerald-400">
                    <span>{t('Net Refund Payout')}:</span>
                    <span className="text-base">৳ {modalNetRefund.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Payment Method & Transaction Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Payment Method')}</label>
                  <select
                    className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                    value={exitPaymentMethod}
                    onChange={(e) => setExitPaymentMethod(e.target.value)}
                  >
                    <option value="BANK">{t('Bank Transfer')}</option>
                    <option value="BKASH">{t('bKash')}</option>
                    <option value="NAGAD">{t('Nagad')}</option>
                    <option value="CASH">{t('Cash Handover')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Transaction Ref / Voucher No')}</label>
                  <input
                    type="text"
                    className="form-input text-xs w-full"
                    placeholder="e.g. IBBL-TRX-101 or Cash Voucher"
                    value={exitTransactionRef}
                    onChange={(e) => setExitTransactionRef(e.target.value)}
                  />
                </div>
              </div>

              {/* Authorizer Name */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {t('Director Authorization / Authorizer Name')}
                </label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  placeholder="e.g. Salah Uddin Shuvo (Director)"
                  value={exitAuthorizerName}
                  onChange={(e) => setExitAuthorizerName(e.target.value)}
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  {t('Director or authority approving 100% full refund without policy deduction.')}
                </span>
              </div>

              {/* Custody Account Selector (Grouped by Accountant) */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Custody Account')}</label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={exitCustodyId}
                  onChange={(e) => setExitCustodyId(e.target.value)}
                >
                  <optgroup label={`${t("Accountant Moin's Custody")} (৳${groupedCustody.moinTotal.toLocaleString()})`}>
                    {groupedCustody.moin.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`${t("Accountant Samrat's Custody")} (৳${groupedCustody.samratTotal.toLocaleString()})`}>
                    {groupedCustody.samrat.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  {groupedCustody.external.length > 0 && (
                    <optgroup label={`${t('Investment / Partner Wallets')} (৳${groupedCustody.externalTotal.toLocaleString()})`}>
                      {groupedCustody.external.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Auto Settle Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exitAutoSettle}
                  onChange={(e) => setExitAutoSettle(e.target.checked)}
                  className="rounded border-gray-700 bg-slate-950 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-200">
                  {t('Settle immediately and deduct net refund from the selected custody account')}
                </span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Notes')}</label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  placeholder="e.g. Member exit settlement completed as per foundation rules."
                  value={exitNotes}
                  onChange={(e) => setExitNotes(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowExitModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={exitSubmitting || !exitMemberId || eligibleNum <= 0}
                  className="btn btn-primary btn-sm"
                >
                  {exitSubmitting ? t('Processing...') : t('Submit Settlement')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTLE EXISTING EXIT MODAL */}
      {settlingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white">{t('Settle Member Exit')}</h3>
              <button
                type="button"
                onClick={() => setSettlingExit(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-300">
                {t('Disburse remaining payout for')} <strong>{settlingExit.memberId?.memberId} — {settlingExit.memberId?.name}</strong>.
              </p>

              <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 flex justify-between items-center text-sm font-bold text-emerald-400">
                <span>{t('Net Refund Payout')}:</span>
                <span className="text-lg">৳ {Number(settlingExit.netAmount || 0).toFixed(2)}</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Select Custody Account')}</label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={settleCustodyId}
                  onChange={(e) => setSettleCustodyId(e.target.value)}
                >
                  <optgroup label={`${t("Accountant Moin's Custody")} (৳${groupedCustody.moinTotal.toLocaleString()})`}>
                    {groupedCustody.moin.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`${t("Accountant Samrat's Custody")} (৳${groupedCustody.samratTotal.toLocaleString()})`}>
                    {groupedCustody.samrat.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  {groupedCustody.external.length > 0 && (
                    <optgroup label={`${t('Investment / Partner Wallets')} (৳${groupedCustody.externalTotal.toLocaleString()})`}>
                      {groupedCustody.external.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSettlingExit(null)}
                className="btn btn-secondary btn-sm"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={settleSubmitting}
                onClick={handleSettleExistingExit}
                className="btn btn-primary btn-sm flex items-center gap-1.5"
              >
                {settleSubmitting ? t('Processing...') : t('Confirm & Deduct Custody')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW EXIT MODAL */}
      {viewingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-2xl w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Eye className="text-blue-400" size={20} />
                <h3 className="text-base font-bold text-white">{t('Member Exit Settlement Details')}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printSettlementVoucher(viewingExit)}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30 transition shadow-sm"
                  title={t('Print Settlement Voucher')}
                >
                  <Printer size={15} />
                  <span>{t('Print Voucher')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingExit(null)}
                  className="text-gray-400 hover:text-white transition p-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Member Info Card */}
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/60 flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="font-mono text-blue-400 font-bold text-sm">{viewingExit.memberId?.memberId}</span>
                <span className="text-white text-base font-bold ml-2">{viewingExit.memberId?.name}</span>
                {viewingExit.memberId?.phone && (
                  <span className="text-gray-400 text-xs ml-3 font-mono">({viewingExit.memberId.phone})</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {viewingExit.memberId?.status && (
                  <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">
                    {viewingExit.memberId.status}
                  </span>
                )}
                <span
                  className={`badge text-xs font-bold ${
                    viewingExit.status === 'SETTLED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {t(viewingExit.status)}
                </span>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60">
                <span className="text-[11px] text-gray-400 block uppercase font-medium">{t('Eligible Amount')}</span>
                <span className="text-lg font-bold text-white mt-1 block">
                  ৳ {Number(viewingExit.eligibleAmount || viewingExit.netAmount + viewingExit.deductionAmount).toFixed(2)}
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/20">
                <span className="text-[11px] text-rose-300 block uppercase font-medium">
                  {t('Deduction')} ({viewingExit.deductionRate ?? 9.99}%)
                </span>
                <span className="text-lg font-bold text-rose-400 mt-1 block">
                  {viewingExit.deductionRate === 0 ? '৳ 0.00' : `- ৳ ${Number(viewingExit.deductionAmount || 0).toFixed(2)}`}
                </span>
                {viewingExit.deductionRate === 0 && (
                  <span className="text-[10px] text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 inline-block mt-1">
                    {t('0% (Director Waived)')}
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
                <span className="text-[11px] text-emerald-300 block uppercase font-medium">{t('Net Refund')}</span>
                <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                  ৳ {Number(viewingExit.netAmount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method & Authorization Card */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block">{t('Payment Method')}</span>
                <strong className="text-white mt-0.5 block">{viewingExit.paymentMethod || 'Bank Transfer'}</strong>
              </div>
              <div>
                <span className="text-gray-400 block">{t('Transaction Ref / Voucher')}</span>
                <strong className="text-white font-mono mt-0.5 block">{viewingExit.transactionRef || '—'}</strong>
              </div>
              <div>
                <span className="text-gray-400 block">{t('Authorized By')}</span>
                <strong className="text-amber-300 mt-0.5 block">{viewingExit.authorizerName || '—'}</strong>
              </div>
            </div>

            {/* Custody Movement / Disbursed Account */}
            {(() => {
              const inst = viewingExit.installments?.[0];
              const mov = inst?.custodyMovementId && typeof inst.custodyMovementId === 'object' ? inst.custodyMovementId : null;
              const acc = mov?.custodyAccountId && typeof mov.custodyAccountId === 'object' ? mov.custodyAccountId : null;
              if (!acc && !mov) return null;
              return (
                <div className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60 space-y-1.5">
                  <div className="text-xs font-bold text-gray-300 uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-blue-400" />
                    <span>{t('Disbursed Custody Account')}</span>
                  </div>
                  <div className="text-sm text-white flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <strong className="text-blue-300">{acc?.name || t('Accountant Custody')}</strong>
                      {acc?.channel && <span className="text-gray-400 text-xs ml-2">({acc.channel})</span>}
                    </div>
                    {mov?.date && (
                      <span className="text-xs text-gray-400 font-mono">
                        {new Date(mov.date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  {mov?.description && (
                    <p className="text-xs text-gray-400 italic">{mov.description}</p>
                  )}
                </div>
              );
            })()}

            {/* Installments Table */}
            {viewingExit.installments && viewingExit.installments.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  {t('Installments Schedule')} ({viewingExit.installments.length})
                </h4>
                <div className="table-container">
                  <table className="data-table text-xs">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>{t('Due Date')}</th>
                        <th>{t('Amount')}</th>
                        <th>{t('Paid Amount')}</th>
                        <th>{t('Paid Date')}</th>
                        <th>{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingExit.installments.map((inst, idx) => (
                        <tr key={idx}>
                          <td className="font-mono text-gray-400">Q{idx + 1}</td>
                          <td className="text-gray-300">
                            {inst.dueDate ? new Date(inst.dueDate).toLocaleDateString() : '—'}
                          </td>
                          <td className="font-medium text-white">৳ {Number(inst.amount).toFixed(2)}</td>
                          <td className="text-emerald-400 font-medium">৳ {Number(inst.paidAmount).toFixed(2)}</td>
                          <td className="text-gray-300">
                            {inst.paidAt ? new Date(inst.paidAt).toLocaleDateString() : '—'}
                          </td>
                          <td>
                            <span
                              className={`badge text-[10px] ${
                                inst.paidAmount >= inst.amount
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {inst.paidAmount >= inst.amount ? t('Paid') : t('Pending')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actors and Timestamps */}
            <div className="p-3 rounded-xl border border-white/5 bg-slate-950/40 text-xs text-gray-400 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {viewingExit.requestedBy && (
                <div>
                  <span className="font-semibold text-gray-300">{t('Requested By')}: </span>
                  <span>{viewingExit.requestedBy.name || viewingExit.requestedBy.email || '—'}</span>
                </div>
              )}
              {viewingExit.approvedBy && (
                <div>
                  <span className="font-semibold text-gray-300">{t('Approved By')}: </span>
                  <span>{viewingExit.approvedBy.name || viewingExit.approvedBy.email || '—'}</span>
                </div>
              )}
              {viewingExit.createdAt && (
                <div>
                  <span className="font-semibold text-gray-300">{t('Created')}: </span>
                  <span>{new Date(viewingExit.createdAt).toLocaleString()}</span>
                </div>
              )}
              {viewingExit.updatedAt && (
                <div>
                  <span className="font-semibold text-gray-300">{t('Updated')}: </span>
                  <span>{new Date(viewingExit.updatedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Notes */}
            {viewingExit.notes && (
              <div className="p-3 rounded-xl border border-white/5 bg-slate-950/40 text-xs">
                <span className="font-bold text-gray-300 block mb-1">{t('Notes')}:</span>
                <p className="text-gray-300 whitespace-pre-wrap">{viewingExit.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setViewingExit(null)}
                className="btn btn-secondary btn-sm"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT EXIT MODAL */}
      {editingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-lg w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Pencil className="text-amber-400" size={20} />
                <h3 className="text-base font-bold text-white">{t('Edit Member Exit Settlement')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingExit(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEditExit} className="space-y-4">
              {/* Member Read-only Info */}
              <div className="p-3 rounded-xl border border-white/10 bg-slate-950/60">
                <span className="text-[11px] text-gray-400 uppercase font-semibold block">{t('Member')}</span>
                <span className="font-mono text-blue-400 font-bold">{editingExit.memberId?.memberId}</span>
                <span className="text-white ml-2 font-medium">{editingExit.memberId?.name}</span>
                {editingExit.memberId?.status && (
                  <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/5 text-gray-400">
                    {editingExit.memberId.status}
                  </span>
                )}
              </div>

              {/* Eligible Principal Amount & Deduction Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Eligible Amount')} (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full"
                    value={editForm.eligibleAmount}
                    onChange={(e) => handleEditEligibleOrRateChange(e.target.value, editForm.deductionRate)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Deduction Rate (%)')}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full"
                    value={editForm.deductionRate}
                    onChange={(e) => handleEditEligibleOrRateChange(editForm.eligibleAmount, e.target.value)}
                  />
                </div>
              </div>

              {/* Calculated Deduction Amount & Net Refund */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Deduction Amount')} (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-rose-400 font-medium"
                    value={editForm.deductionAmount}
                    onChange={(e) => setEditForm({ ...editForm, deductionAmount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Net Refund')} (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-emerald-400 font-bold"
                    value={editForm.netAmount}
                    onChange={(e) => setEditForm({ ...editForm, netAmount: e.target.value })}
                  />
                </div>
              </div>

              {/* Payment Method & Transaction Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Payment Method')}</label>
                  <select
                    className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                    value={editForm.paymentMethod}
                    onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                  >
                    <option value="BANK">{t('Bank Transfer')}</option>
                    <option value="BKASH">{t('bKash')}</option>
                    <option value="NAGAD">{t('Nagad')}</option>
                    <option value="CASH">{t('Cash Handover')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Transaction Ref / Voucher No')}</label>
                  <input
                    type="text"
                    className="form-input text-xs w-full"
                    placeholder="e.g. IBBL-TRX-101 or Cash Voucher"
                    value={editForm.transactionRef}
                    onChange={(e) => setEditForm({ ...editForm, transactionRef: e.target.value })}
                  />
                </div>
              </div>

              {/* Authorizer Name */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {t('Director Authorization / Authorizer Name')}
                </label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  placeholder="e.g. Salah Uddin Shuvo (Director)"
                  value={editForm.authorizerName}
                  onChange={(e) => setEditForm({ ...editForm, authorizerName: e.target.value })}
                />
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Status')}</label>
                <select
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                >
                  <option value="SETTLED">{t('SETTLED')}</option>
                  <option value="PROPOSED">{t('PROPOSED')}</option>
                  <option value="APPROVED">{t('APPROVED')}</option>
                </select>
              </div>

              {/* Custody Account */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Disbursed Custody Account')}</label>
                <select
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={editForm.custodyAccountId}
                  onChange={(e) => setEditForm({ ...editForm, custodyAccountId: e.target.value })}
                >
                  <option value="">{t('-- Select Custody Account --')}</option>
                  <optgroup label={`${t("Accountant Moin's Custody")} (৳${groupedCustody.moinTotal.toLocaleString()})`}>
                    {groupedCustody.moin.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={`${t("Accountant Samrat's Custody")} (৳${groupedCustody.samratTotal.toLocaleString()})`}>
                    {groupedCustody.samrat.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                      </option>
                    ))}
                  </optgroup>
                  {groupedCustody.external.length > 0 && (
                    <optgroup label={`${t('Investment / Partner Wallets')} (৳${groupedCustody.externalTotal.toLocaleString()})`}>
                      {groupedCustody.external.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} (Balance: ৳{c.cachedBalance?.toFixed(2)})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Notes')}</label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  placeholder={t('Optional settlement remarks...')}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingExit(null)}
                  className="btn btn-secondary btn-sm"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="btn btn-primary btn-sm flex items-center gap-1.5"
                >
                  {editSaving ? t('Saving...') : t('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE EXIT MODAL */}
      {deletingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-rose-500/30 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Trash2 className="text-rose-400" size={20} />
                <h3 className="text-base font-bold text-white">{t('Confirm Delete Settlement')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingExit(null)}
                className="text-gray-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-gray-300">
                {t('Are you sure you want to delete this exit settlement?')}
              </p>

              <div className="p-3 rounded-xl border border-white/10 bg-slate-950/60 text-xs space-y-1">
                <div>
                  <span className="text-gray-400">{t('Member')}: </span>
                  <strong className="text-white font-mono">{deletingExit.memberId?.memberId}</strong>
                  <span className="text-gray-200 ml-1.5">{deletingExit.memberId?.name}</span>
                </div>
                <div>
                  <span className="text-gray-400">{t('Net Refund')}: </span>
                  <strong className="text-emerald-400">৳ {Number(deletingExit.netAmount || 0).toFixed(2)}</strong>
                </div>
                <div>
                  <span className="text-gray-400">{t('Status')}: </span>
                  <span
                    className={`badge text-[10px] font-bold ${
                      deletingExit.status === 'SETTLED'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    {t(deletingExit.status)}
                  </span>
                </div>
              </div>

              {deletingExit.status === 'SETTLED' && (
                <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>
                    {t(
                      'Notice: Since this settlement is marked as SETTLED, deleting it will reverse any linked custody movements and restore the deducted funds back to the custody account balance.'
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setDeletingExit(null)}
                className="btn btn-secondary btn-sm"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={deleteSaving}
                onClick={handleConfirmDeleteExit}
                className="btn btn-danger btn-sm flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
              >
                {deleteSaving ? t('Deleting...') : t('Delete Settlement')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
