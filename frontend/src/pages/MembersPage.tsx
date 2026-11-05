import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiRequest, getApiUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { usePreferences } from '../context/PreferencesContext';
import { useLogo } from '../context/LogoContext';
import { ModuleGuide } from '../components/ModuleGuide';
import { BrandLogo } from '../components/BrandLogo';
import { TableScrollControls } from '../components/TableScrollControls';
import {
  Users,
  UserCheck,
  UserX,
  UserMinus,
  UserRoundX,
  Search,
  Plus,
  Edit2,
  Trash2,
  Eye,
  X,
  Phone,
  Mail,
  Calendar,
  RefreshCw,
  FileText,
  Upload,
  Printer,
  DollarSign,
  CheckCircle2,
  ShieldCheck,
  Pencil,
  ExternalLink,
} from 'lucide-react';

export const DESIGNATION_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  DIRECTOR: { label: 'Director', badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  PRESIDENT: { label: 'President', badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  ACCOUNTANT: { label: 'Accountant', badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  ASSISTANT_ACCOUNTANT: { label: 'Assistant Accountant', badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
  GENERAL_SECRETARY: { label: 'General Secretary', badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  CONVENER: { label: 'Convener', badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  GENERAL_MEMBER: { label: 'General Member', badgeClass: 'bg-gray-500/15 text-gray-300 border-gray-500/20' },
};

interface MemberData {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  linkedPhones?: string[];
  email?: string;
  designation?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'DROPPED';
  joinDate: string;
  address?: string;
  shareCount: number;
  shareAmount: number;
  monthlyPayable: number;
  shareEffectiveMonth?: string | null;
  createdAt: string;
}

interface MemberStats {
  total: number;
  active: number;
  inactive: number;
  dropped: number;
  totalShares: number;
}

export interface ExitRecord {
  _id: string;
  status: string;
  eligibleAmount?: number;
  deductionRate?: number;
  deductionAmount: number;
  netAmount: number;
  paymentMethod?: string;
  transactionRef?: string;
  authorizerName?: string;
  documentName?: string;
  receiptUrl?: string;
  receiptNumber?: string;
  notes?: string;
  memberId: {
    _id?: string;
    memberId: string;
    name: string;
    phone?: string;
    status?: string;
    currentShares?: number;
  };
  installments?: Array<{
    dueDate?: string;
    amount: number;
    paidAmount: number;
    paidAt?: string;
    custodyMovementId?:
      | {
          _id?: string;
          amount?: number;
          date?: string;
          description?: string;
          custodyAccountId?: {
            _id?: string;
            name?: string;
            channel?: string;
            accountNumber?: string;
          };
        }
      | string;
  }>;
  requestedBy?: { name?: string; email?: string };
  approvedBy?: { name?: string; email?: string };
  createdAt?: string;
  updatedAt?: string;
}

interface CustodyAcc {
  _id: string;
  name: string;
  channel: string;
  accountType?: string;
  holderId?: { _id?: string; name?: string; email?: string; accountantType?: string } | string | null;
  cachedBalance: number;
}

export const MembersPage: React.FC = () => {
  const { user, canAccess } = useAuth();
  const { logo } = useLogo();
  const { t, formatNumber, formatDate, language } = usePreferences();
  const isBn = language === 'bn';

  const canEdit = canAccess('MEMBERS', 'edit');
  const canDelete = canAccess('MEMBERS', 'edit') && (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN');
  const canManageGovernance = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  // Navigation tab: ROSTER vs EXITS (synced with ?tab=EXITS)
  const [activeTab, setActiveTab] = useState<'ROSTER' | 'EXITS'>(() => {
    if (typeof window !== 'undefined') {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab === 'EXITS') return 'EXITS';
    }
    return 'ROSTER';
  });

  const handleTabChange = (tab: 'ROSTER' | 'EXITS') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'EXITS') url.searchParams.set('tab', 'EXITS');
      else url.searchParams.delete('tab');
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const urlTab = new URLSearchParams(window.location.search).get('tab');
      if (urlTab === 'EXITS') setActiveTab('EXITS');
      else if (urlTab === 'ROSTER') setActiveTab('ROSTER');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Member Directory State
  const [members, setMembers] = useState<MemberData[]>([]);
  const [stats, setStats] = useState<MemberStats>({ total: 0, active: 0, inactive: 0, dropped: 0, totalShares: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals state for Members
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showDetailsModal, setShowDetailsModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [selectedMember, setSelectedMember] = useState<MemberData | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<{
    token: string;
    summary: { total: number; valid: number; invalid: number };
    rows: Array<{ memberId: string; name: string; phone: string; errors: string[] }>;
  } | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');

  // Form states for Add/Edit Member
  const [nextIdPreview, setNextIdPreview] = useState<string>('NSF001');
  const [shareAmount, setShareAmount] = useState<number>(500);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    linkedPhones: '',
    email: '',
    designation: 'GENERAL_MEMBER',
    status: 'ACTIVE',
    joinDate: new Date().toISOString().split('T')[0],
    address: '',
    initialShareCount: '1',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // -------------------------------------------------------------
  // Member Exit & Refund Settlement Sub-Module State
  // -------------------------------------------------------------
  const [exits, setExits] = useState<ExitRecord[]>([]);
  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAcc[]>([]);
  const [accountantSignature, setAccountantSignature] = useState<string | null>(null);
  const [exitNotice, setExitNotice] = useState<string | null>(null);
  const [exitError, setExitError] = useState<string | null>(null);

  // Table Horizontal Scroll Refs
  const exitsTableRef = useRef<HTMLDivElement>(null);
  const rosterTableRef = useRef<HTMLDivElement>(null);

  // Propose / Settle Exit Modal
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [exitMemberId, setExitMemberId] = useState<string>('');
  const [exitEligibleAmount, setExitEligibleAmount] = useState<string>('');
  const [exitWaiveDeduction, setExitWaiveDeduction] = useState<boolean>(false);
  const [exitDeductionRate, setExitDeductionRate] = useState<string>('9.99');
  const [exitDeductionAmount, setExitDeductionAmount] = useState<string>('');
  const [exitNetAmount, setExitNetAmount] = useState<string>('');
  const [exitAccountantKey, setExitAccountantKey] = useState<'MOIN' | 'SAMRAT'>('MOIN');
  const [exitPaymentMethod, setExitPaymentMethod] = useState<string>('BKASH');
  const [exitTransactionRef, setExitTransactionRef] = useState<string>('');
  const [exitAuthorizerName, setExitAuthorizerName] = useState<string>('');
  const [exitNotes, setExitNotes] = useState<string>('');
  const [exitAutoSettle, setExitAutoSettle] = useState<boolean>(true);
  const [exitReceiptFile, setExitReceiptFile] = useState<File | null>(null);
  const [exitReceiptNumber, setExitReceiptNumber] = useState<string>('');
  const [exitSubmitting, setExitSubmitting] = useState<boolean>(false);

  // Upload Document Receipt Modal
  const [uploadingExit, setUploadingExit] = useState<ExitRecord | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadReceiptNo, setUploadReceiptNo] = useState<string>('');
  const [uploadSubmitting, setUploadSubmitting] = useState<boolean>(false);

  // View / Print Voucher Modal
  const [viewingExit, setViewingExit] = useState<ExitRecord | null>(null);

  // Document Viewer Lightbox / Modal
  const [previewDocUrl, setPreviewDocUrl] = useState<string | null>(null);
  const [previewDocTitle, setPreviewDocTitle] = useState<string>('');
  const [previewDocError, setPreviewDocError] = useState<boolean>(false);

  // Edit Exit Modal
  const [editingExit, setEditingExit] = useState<ExitRecord | null>(null);
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null);
  const [editForm, setEditForm] = useState({
    eligibleAmount: '',
    deductionRate: '9.99',
    deductionAmount: '',
    netAmount: '',
    paymentMethod: 'BKASH',
    transactionRef: '',
    authorizerName: '',
    status: 'SETTLED',
    accountantKey: 'MOIN' as 'MOIN' | 'SAMRAT',
    custodyAccountId: '',
    documentName: '',
    receiptUrl: '',
    receiptNumber: '',
    notes: '',
  });
  const [editSaving, setEditSaving] = useState<boolean>(false);

  // Delete Exit Modal
  const [deletingExit, setDeletingExit] = useState<ExitRecord | null>(null);
  const [deleteSaving, setDeleteSaving] = useState<boolean>(false);

  // Settle Single Exit Modal
  const [settlingExit, setSettlingExit] = useState<ExitRecord | null>(null);
  const [settleAccountantKey, setSettleAccountantKey] = useState<'MOIN' | 'SAMRAT'>('MOIN');
  const [settleSubmitting, setSettleSubmitting] = useState<boolean>(false);

  // Debounce search effect (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch Members, Stats, Exits & Custody Accounts
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: '1',
        limit: '1000',
        search: debouncedSearch,
        status: statusFilter,
      });

      const [membersRes, statsRes, shareSettingRes, exitsRes, custodyRes] = await Promise.all([
        apiRequest<MemberData[]>(`/members?${queryParams.toString()}`),
        apiRequest<MemberStats>('/members/stats'),
        apiRequest<{ value: number }>('/settings/share-amount'),
        apiRequest<ExitRecord[]>('/governance/exits').catch(() => ({ data: [] })),
        apiRequest<CustodyAcc[]>('/payments/custody-accounts').catch(() => ({ data: [] })),
      ]);

      setMembers(membersRes.data || []);
      setStats(statsRes.data || { total: 0, active: 0, inactive: 0, dropped: 0, totalShares: 0 });
      setShareAmount(Number(shareSettingRes.data?.value) || 500);
      setExits(exitsRes.data || []);

      const rawAccounts = custodyRes.data || [];
      setCustodyAccounts(rawAccounts);

      apiRequest<{ signature?: string; signatureImage?: string }>('/settings/accountant-signature')
        .then((res) => {
          const sig = res.data?.signatureImage || res.data?.signature;
          if (sig) setAccountantSignature(sig);
        })
        .catch(() => {});
    } catch (err) {
      console.error('Error loading members data:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Group custody accounts by accountant
  const groupedCustody = useMemo(() => {
    const moin: CustodyAcc[] = [];
    const samrat: CustodyAcc[] = [];
    const other: CustodyAcc[] = [];
    let moinTotal = 0;
    let samratTotal = 0;

    for (const a of custodyAccounts) {
      const h = typeof a.holderId === 'object' && a.holderId !== null ? a.holderId : null;
      const type = h?.accountantType;
      const name = (a.name || '').toLowerCase();
      const bal = Number(a.cachedBalance || 0);

      if (type === 'PRIMARY_ACCOUNTANT' || type === 'PRIMARY' || name.includes('moin') || name.includes('ibbl') || name.includes('petty cash')) {
        moin.push(a);
        moinTotal += bal;
      } else if (type === 'SECONDARY_ACCOUNTANT' || type === 'ASSISTANT' || name.includes('samrat')) {
        samrat.push(a);
        samratTotal += bal;
      } else {
        other.push(a);
      }
    }
    return { moin, samrat, other, moinTotal, samratTotal };
  }, [custodyAccounts]);

  // Resolve internal custody account based on selected Accountant and Payment Method
  const resolveCustodyAccountId = useCallback(
    (accountantKey: 'MOIN' | 'SAMRAT', method: string): string => {
      const normMethod = (method || 'BKASH').toUpperCase();
      const pool = accountantKey === 'MOIN' ? groupedCustody.moin : groupedCustody.samrat;

      // 1. Try matching channel in accountant's specific pool
      const match = pool.find((a) => {
        const ch = (a.channel || '').toUpperCase();
        const nm = (a.name || '').toUpperCase();
        if (normMethod === 'BKASH') return ch === 'BKASH' || nm.includes('BKASH');
        if (normMethod === 'NAGAD') return ch === 'NAGAD' || nm.includes('NAGAD');
        if (normMethod === 'BANK') return ch === 'BANK' || nm.includes('BANK') || nm.includes('IBBL');
        if (normMethod === 'CASH') return ch === 'CASH' || nm.includes('CASH');
        return false;
      });
      if (match) return match._id;

      // 2. Global fallback for Bank if held by Moin/Society
      if (accountantKey === 'MOIN' && normMethod === 'BANK') {
        const bankAcc = custodyAccounts.find((a) => (a.channel || '').toUpperCase() === 'BANK');
        if (bankAcc) return bankAcc._id;
      }

      // 3. Fallback to first available account in the accountant's pool
      if (pool.length > 0) return pool[0]._id;
      return custodyAccounts[0]?._id || '';
    },
    [groupedCustody, custodyAccounts]
  );

  // Handle Propose Exit calculations
  const handleSelectExitMember = async (memberDbId: string) => {
    setExitMemberId(memberDbId);
    if (!memberDbId) {
      setExitEligibleAmount('');
      setExitDeductionAmount('');
      setExitNetAmount('');
      return;
    }
    try {
      const summary = await apiRequest<{
        member: any;
        summary: { totalPrincipalPaid?: number; totalPayments?: number };
      }>(`/payments/member-summary/${memberDbId}`);
      const principal = summary.data?.summary?.totalPrincipalPaid ?? 0;
      setExitEligibleAmount(String(principal));
      if (exitWaiveDeduction || Number(exitDeductionRate) === 0) {
        setExitDeductionAmount('0');
        setExitNetAmount(String(principal));
      } else {
        const rate = parseFloat(exitDeductionRate) || 9.99;
        const ded = Math.round((principal * (rate / 100) + Number.EPSILON) * 100) / 100;
        setExitDeductionAmount(String(ded));
        setExitNetAmount(String(Math.round((principal - ded + Number.EPSILON) * 100) / 100));
      }
    } catch {
      setExitEligibleAmount('0');
      setExitDeductionAmount('0');
      setExitNetAmount('0');
    }
  };

  const handleExitEligibleChange = (val: string) => {
    setExitEligibleAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num >= 0) {
      if (exitWaiveDeduction || Number(exitDeductionRate) === 0) {
        setExitDeductionAmount('0');
        setExitNetAmount(String(num));
      } else {
        const rate = parseFloat(exitDeductionRate) || 9.99;
        const ded = Math.round((num * (rate / 100) + Number.EPSILON) * 100) / 100;
        setExitDeductionAmount(String(ded));
        setExitNetAmount(String(Math.round((num - ded + Number.EPSILON) * 100) / 100));
      }
    } else {
      setExitDeductionAmount('');
      setExitNetAmount('');
    }
  };

  const handleExitRateChange = (rateStr: string) => {
    const rate = parseFloat(rateStr) || 0;
    setExitDeductionRate(rateStr);
    const isWaived = rate === 0;
    setExitWaiveDeduction(isWaived);
    if (isWaived && !exitAuthorizerName) {
      setExitAuthorizerName('Salah Uddin Shuvo (Director)');
    }
    const eligible = parseFloat(exitEligibleAmount) || 0;
    const ded = isWaived ? 0 : Math.round((eligible * (rate / 100) + Number.EPSILON) * 100) / 100;
    const net = Math.round((eligible - ded + Number.EPSILON) * 100) / 100;
    setExitDeductionAmount(String(ded));
    setExitNetAmount(String(net));
  };

  const handleExitDeductionAmountChange = (dedStr: string) => {
    setExitDeductionAmount(dedStr);
    const ded = parseFloat(dedStr) || 0;
    const eligible = parseFloat(exitEligibleAmount) || 0;
    const net = Math.max(0, Math.round((eligible - ded + Number.EPSILON) * 100) / 100);
    const rate = eligible > 0 ? Math.round(((ded / eligible) * 100 + Number.EPSILON) * 100) / 100 : 0;
    setExitNetAmount(String(net));
    setExitDeductionRate(String(rate));
    setExitWaiveDeduction(rate === 0);
    if (rate === 0 && !exitAuthorizerName) {
      setExitAuthorizerName('Salah Uddin Shuvo (Director)');
    }
  };

  const handleExitNetAmountChange = (netStr: string) => {
    setExitNetAmount(netStr);
    const net = parseFloat(netStr) || 0;
    const eligible = parseFloat(exitEligibleAmount) || 0;
    const ded = Math.max(0, Math.round((eligible - net + Number.EPSILON) * 100) / 100);
    const rate = eligible > 0 ? Math.round(((ded / eligible) * 100 + Number.EPSILON) * 100) / 100 : 0;
    setExitDeductionAmount(String(ded));
    setExitDeductionRate(String(rate));
    setExitWaiveDeduction(rate === 0);
    if (rate === 0 && !exitAuthorizerName) {
      setExitAuthorizerName('Salah Uddin Shuvo (Director)');
    }
  };

  const handleToggleWaiveDeduction = (waived: boolean) => {
    setExitWaiveDeduction(waived);
    const num = parseFloat(exitEligibleAmount) || 0;
    if (waived) {
      setExitDeductionRate('0');
      setExitDeductionAmount('0');
      setExitNetAmount(String(num));
      if (!exitAuthorizerName) {
        setExitAuthorizerName('Salah Uddin Shuvo (Director)');
      }
    } else {
      setExitDeductionRate('9.99');
      const ded = Math.round((num * (9.99 / 100) + Number.EPSILON) * 100) / 100;
      setExitDeductionAmount(String(ded));
      setExitNetAmount(String(Math.round((num - ded + Number.EPSILON) * 100) / 100));
    }
  };

  // Submit Propose / Settle Exit with optional Receipt Upload
  const handleProposeExitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exitMemberId) return setExitError(t('Please select a member.'));
    const eligibleNum = parseFloat(exitEligibleAmount);
    if (isNaN(eligibleNum) || eligibleNum < 0) {
      return setExitError(t('Eligible principal must be a positive number.'));
    }

    setExitSubmitting(true);
    setExitError(null);
    setExitNotice(null);

    try {
      let documentName = '';
      let receiptUrl = '';
      let receiptNumber = exitReceiptNumber.trim();

      // If a receipt file was chosen, upload it first
      if (exitReceiptFile) {
        const uploadForm = new FormData();
        uploadForm.append('file', exitReceiptFile);
        if (receiptNumber) uploadForm.append('receiptNumber', receiptNumber);

        const uploadRes = await fetch(getApiUrl('/governance/exits/upload-receipt'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: uploadForm,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.message || 'Failed to upload receipt document.');
        documentName = uploadJson.data?.documentName || exitReceiptFile.name;
        receiptUrl = uploadJson.data?.receiptUrl || '';
        receiptNumber = uploadJson.data?.receiptNumber || receiptNumber;
      }

      const targetCustodyId = resolveCustodyAccountId(exitAccountantKey, exitPaymentMethod);

      await apiRequest('/governance/exits', {
        method: 'POST',
        body: JSON.stringify({
          memberId: exitMemberId,
          eligibleAmount: eligibleNum,
          deductionRate: exitWaiveDeduction ? 0 : parseFloat(exitDeductionRate) || 0,
          deductionAmount: parseFloat(exitDeductionAmount) || 0,
          netAmount: parseFloat(exitNetAmount) || eligibleNum,
          custodyAccountId: targetCustodyId,
          autoSettle: exitAutoSettle,
          paymentMethod: exitPaymentMethod,
          transactionRef: exitTransactionRef,
          authorizerName: exitAuthorizerName,
          documentName,
          receiptUrl,
          receiptNumber,
          notes: exitNotes,
        }),
      });

      setExitNotice(
        exitAutoSettle
          ? t('Member exit settlement completed, money deducted from custody, and receipt attached.')
          : t('Member exit settlement proposed successfully.')
      );
      setShowExitModal(false);
      setExitReceiptFile(null);
      setExitReceiptNumber('');
      setExitDeductionAmount('');
      await fetchData();
    } catch (err) {
      setExitError((err as Error).message);
    } finally {
      setExitSubmitting(false);
    }
  };

  // Upload or Update Receipt File for an Existing Exit Record
  const handleOpenUploadReceipt = (exit: ExitRecord) => {
    setUploadingExit(exit);
    setUploadFile(null);
    setUploadReceiptNo(exit.receiptNumber || `RCPT-EXIT-${exit.memberId?.memberId || Date.now().toString().slice(-4)}`);
  };

  const handleUploadReceiptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadingExit || !uploadFile) {
      return alert(t('Please select a receipt document file (PDF, PNG, JPG).'));
    }
    setUploadSubmitting(true);

    try {
      const uploadForm = new FormData();
      uploadForm.append('file', uploadFile);
      if (uploadReceiptNo) uploadForm.append('receiptNumber', uploadReceiptNo.trim());

      const uploadRes = await fetch(getApiUrl('/governance/exits/upload-receipt'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: uploadForm,
      });

      const uploadJson = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadJson.message || 'Receipt upload failed.');

      const documentName = uploadJson.data?.documentName || uploadFile.name;
      const receiptUrl = uploadJson.data?.receiptUrl || '';
      const receiptNumber = uploadJson.data?.receiptNumber || uploadReceiptNo;

      // Update exit record with receipt info
      await apiRequest(`/governance/exits/${uploadingExit._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          documentName,
          receiptUrl,
          receiptNumber,
        }),
      });

      setExitNotice(t('Payment receipt voucher document uploaded and linked successfully.'));
      setUploadingExit(null);
      setUploadFile(null);
      await fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setUploadSubmitting(false);
    }
  };

  // Settle an unsettled exit
  const handleConfirmSettleExit = async () => {
    if (!settlingExit) return;
    setSettleSubmitting(true);
    try {
      const targetCustodyId = resolveCustodyAccountId(settleAccountantKey, settlingExit.paymentMethod || 'BKASH');
      await apiRequest(`/governance/exits/${settlingExit._id}/settle`, {
        method: 'POST',
        body: JSON.stringify({ custodyAccountId: targetCustodyId }),
      });
      setExitNotice(t('Member exit settlement completed and deducted from custody.'));
      setSettlingExit(null);
      await fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSettleSubmitting(false);
    }
  };

  // Start Edit Exit
  const handleStartEditExit = (exit: ExitRecord) => {
    setEditingExit(exit);
    setEditReceiptFile(null);
    const inst = exit.installments?.[0];
    const mov = inst?.custodyMovementId && typeof inst.custodyMovementId === 'object' ? inst.custodyMovementId : null;
    const acc = mov?.custodyAccountId && typeof mov.custodyAccountId === 'object' ? mov.custodyAccountId : null;
    
    const isSamrat = (acc?.name || '').toLowerCase().includes('samrat') ||
      groupedCustody.samrat.some((s) => s._id === acc?._id);
    const accountantKey: 'MOIN' | 'SAMRAT' = isSamrat ? 'SAMRAT' : 'MOIN';

    const eligible = exit.eligibleAmount ?? (Number(exit.netAmount || 0) + Number(exit.deductionAmount || 0));
    const dedRate = exit.deductionRate ?? 9.99;
    const dedAmt = exit.deductionAmount ?? (dedRate === 0 ? 0 : Math.round((eligible * (dedRate / 100) + Number.EPSILON) * 100) / 100);
    const net = exit.netAmount ?? Math.round((eligible - dedAmt + Number.EPSILON) * 100) / 100;

    setEditForm({
      eligibleAmount: String(eligible),
      deductionRate: String(dedRate),
      deductionAmount: String(dedAmt),
      netAmount: String(net),
      paymentMethod: exit.paymentMethod || 'BKASH',
      transactionRef: exit.transactionRef || '',
      authorizerName: exit.authorizerName || '',
      status: exit.status || 'SETTLED',
      accountantKey,
      custodyAccountId: acc?._id || '',
      documentName: exit.documentName || '',
      receiptUrl: exit.receiptUrl || '',
      receiptNumber: exit.receiptNumber || '',
      notes: exit.notes || '',
    });
  };

  const handleEditEligibleChange = (val: string) => {
    const num = parseFloat(val);
    const rate = parseFloat(editForm.deductionRate) || 0;
    if (!isNaN(num) && num >= 0) {
      const ded = rate === 0 ? 0 : Math.round((num * (rate / 100) + Number.EPSILON) * 100) / 100;
      const net = Math.round((num - ded + Number.EPSILON) * 100) / 100;
      setEditForm((prev) => ({ ...prev, eligibleAmount: val, deductionAmount: String(ded), netAmount: String(net) }));
    } else {
      setEditForm((prev) => ({ ...prev, eligibleAmount: val }));
    }
  };

  const handleEditRateChange = (rateStr: string) => {
    const rate = parseFloat(rateStr) || 0;
    const eligible = parseFloat(editForm.eligibleAmount) || 0;
    const ded = rate === 0 ? 0 : Math.round((eligible * (rate / 100) + Number.EPSILON) * 100) / 100;
    const net = Math.round((eligible - ded + Number.EPSILON) * 100) / 100;
    setEditForm((prev) => ({
      ...prev,
      deductionRate: rateStr,
      deductionAmount: String(ded),
      netAmount: String(net),
      authorizerName: rate === 0 && !prev.authorizerName ? 'Salah Uddin Shuvo (Director)' : prev.authorizerName,
    }));
  };

  const handleEditDeductionAmountChange = (dedStr: string) => {
    const ded = parseFloat(dedStr) || 0;
    const eligible = parseFloat(editForm.eligibleAmount) || 0;
    const net = Math.max(0, Math.round((eligible - ded + Number.EPSILON) * 100) / 100);
    const rate = eligible > 0 ? Math.round(((ded / eligible) * 100 + Number.EPSILON) * 100) / 100 : 0;
    setEditForm((prev) => ({
      ...prev,
      deductionAmount: dedStr,
      netAmount: String(net),
      deductionRate: String(rate),
      authorizerName: rate === 0 && !prev.authorizerName ? 'Salah Uddin Shuvo (Director)' : prev.authorizerName,
    }));
  };

  const handleEditNetAmountChange = (netStr: string) => {
    const net = parseFloat(netStr) || 0;
    const eligible = parseFloat(editForm.eligibleAmount) || 0;
    const ded = Math.max(0, Math.round((eligible - net + Number.EPSILON) * 100) / 100);
    const rate = eligible > 0 ? Math.round(((ded / eligible) * 100 + Number.EPSILON) * 100) / 100 : 0;
    setEditForm((prev) => ({
      ...prev,
      netAmount: netStr,
      deductionAmount: String(ded),
      deductionRate: String(rate),
      authorizerName: rate === 0 && !prev.authorizerName ? 'Salah Uddin Shuvo (Director)' : prev.authorizerName,
    }));
  };

  const handleSaveEditExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExit) return;
    setEditSaving(true);
    try {
      let documentName = editForm.documentName;
      let receiptUrl = editForm.receiptUrl;
      let receiptNumber = editForm.receiptNumber.trim();

      // If a receipt file was chosen in Edit modal, upload it first
      if (editReceiptFile) {
        const uploadForm = new FormData();
        uploadForm.append('file', editReceiptFile);
        if (receiptNumber) uploadForm.append('receiptNumber', receiptNumber);

        const uploadRes = await fetch(getApiUrl('/governance/exits/upload-receipt'), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: uploadForm,
        });

        const uploadJson = await uploadRes.json();
        if (!uploadRes.ok) throw new Error(uploadJson.message || 'Failed to upload receipt document.');
        documentName = uploadJson.data?.documentName || editReceiptFile.name;
        receiptUrl = uploadJson.data?.receiptUrl || '';
        receiptNumber = uploadJson.data?.receiptNumber || receiptNumber;
      }

      const targetCustodyId = resolveCustodyAccountId(editForm.accountantKey, editForm.paymentMethod);

      await apiRequest(`/governance/exits/${editingExit._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          eligibleAmount: parseFloat(editForm.eligibleAmount) || 0,
          deductionRate: parseFloat(editForm.deductionRate) || 0,
          deductionAmount: parseFloat(editForm.deductionAmount) || 0,
          netAmount: parseFloat(editForm.netAmount) || 0,
          paymentMethod: editForm.paymentMethod,
          transactionRef: editForm.transactionRef,
          authorizerName: editForm.authorizerName,
          status: editForm.status,
          custodyAccountId: targetCustodyId || undefined,
          documentName,
          receiptUrl,
          receiptNumber,
          notes: editForm.notes,
        }),
      });
      setExitNotice(t('Exit settlement updated successfully.'));
      setEditingExit(null);
      setEditReceiptFile(null);
      await fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDeleteExit = async () => {
    if (!deletingExit) return;
    setDeleteSaving(true);
    try {
      await apiRequest(`/governance/exits/${deletingExit._id}`, {
        method: 'DELETE',
      });
      setExitNotice(t('Exit settlement deleted and custody balance restored.'));
      setDeletingExit(null);
      await fetchData();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleteSaving(false);
    }
  };

  // Print Official Settlement Voucher
  const printSettlementVoucher = (exit: ExitRecord) => {
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
    const sigImage = accountantSignature || user?.signatureImage;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Settlement Voucher - ${member?.memberId || 'NSF'}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 24px; background: #fff; line-height: 1.5; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 24px; }
          .brand-row { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 8px; }
          .voucher-logo { height: 64px; width: 64px; object-fit: contain; border-radius: 8px; }
          .org-title { font-size: 24px; font-weight: 800; color: #0f172a; letter-spacing: 0.5px; text-transform: uppercase; margin: 0; }
          .org-sub { font-size: 13px; color: #475569; margin-top: 4px; font-weight: 500; }
          .voucher-title { display: inline-block; margin-top: 12px; padding: 6px 20px; background: #0f172a; color: #fff; font-size: 13px; font-weight: 700; border-radius: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
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
          .declaration { background: #f8fafc; border-left: 4px solid #0f172a; padding: 12px 16px; font-size: 12px; color: #334155; line-height: 1.6; margin-bottom: 36px; border-radius: 0 4px 4px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 36px; }
          .sig-box { text-align: center; }
          .sig-holder { height: 50px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 4px; }
          .sig-img { max-height: 48px; max-width: 140px; object-fit: contain; display: block; }
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
          <div class="brand-row">
            ${logo ? `<img class="voucher-logo" src="${logo}" alt="NS Foundation Logo" />` : ''}
            <div>
              <h1 class="org-title">NS Foundation</h1>
              <div class="org-sub">Cooperative Society Registration & Mutual Finance Governance</div>
            </div>
          </div>
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
            <div class="field-row"><span class="label">Payment Method:</span><span class="value">${exit.paymentMethod || 'bKash / Custody'}</span></div>
            <div class="field-row"><span class="label">Reference / TrxID:</span><span class="value">${exit.transactionRef || 'N/A'}</span></div>
            <div class="field-row"><span class="label">Disbursing Account:</span><span class="value">${custodyName}</span></div>
            <div class="field-row"><span class="label">Receipt Voucher #:</span><span class="value">${exit.receiptNumber || 'RCPT-SETTLED'}</span></div>
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
              <td>Net Refund Amount Paid to Exited Member</td>
              <td class="text-right">${isWaived ? '100.00%' : '90.01%'}</td>
              <td class="text-right">৳ ${net.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="declaration">
          <strong>Settlement Confirmation:</strong> This official voucher confirms that the above-named member has ceased participation in NS Foundation Cooperative Society. All future share allocations and monthly contributions have been waived, setting future dues to ৳0.00. The net refund of <strong>৳ ${net.toFixed(2)}</strong> has been disbursed from official custody funds as authorized by executive governance.
          ${exit.documentName ? `<br/><em>Attached Proof Document: ${exit.documentName} (Receipt: ${exit.receiptNumber || 'VERIFIED'})</em>` : ''}
        </div>

        <div class="signatures">
          <div class="sig-box">
            <div class="sig-holder">
              ${sigImage ? `<img class="sig-img" src="${sigImage}" alt="Accountant Signature" />` : ''}
            </div>
            <div class="sig-line">Official Accountant</div>
            <div class="sig-sub">NS Foundation Cooperative Society</div>
          </div>
          <div class="sig-box">
            <div class="sig-holder"></div>
            <div class="sig-line">${exit.authorizerName || 'Director / President'}</div>
            <div class="sig-sub">Executive Board Approval</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Import CSV handlers
  const previewImport = async () => {
    if (!importFile) return setFormError('Choose an approved CSV file first.');
    setFormError('');
    const form = new FormData();
    form.append('file', importFile);
    try {
      const response = await fetch(getApiUrl('/members/import/preview'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: form,
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to preview CSV.');
      setImportPreview(body.data);
    } catch (error) {
      setFormError((error as Error).message);
    }
  };

  const saveImport = async () => {
    if (!importPreview) return;
    if (temporaryPassword.length < 12) return setFormError('Temporary password must contain at least 12 characters.');
    setSubmitting(true);
    setFormError('');
    try {
      await apiRequest('/members/import/save', {
        method: 'POST',
        body: JSON.stringify({ previewToken: importPreview.token, temporaryPassword }),
      });
      setShowImport(false);
      setImportPreview(null);
      setImportFile(null);
      setTemporaryPassword('');
      await fetchData();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Add Member
  const handleOpenAddModal = async () => {
    setFormError(null);
    setFormData({
      name: '',
      phone: '',
      linkedPhones: '',
      email: '',
      designation: 'GENERAL_MEMBER',
      status: 'ACTIVE',
      joinDate: new Date().toISOString().split('T')[0],
      address: '',
      initialShareCount: '1',
    });

    try {
      const res = await apiRequest<{ nextId: string }>('/members/next-id');
      setNextIdPreview(res.data.nextId);
    } catch {
      setNextIdPreview('NSF001');
    }

    setShowAddModal(true);
  };

  const handleOpenEditModal = (m: MemberData) => {
    setSelectedMember(m);
    setFormError(null);
    setFormData({
      name: m.name,
      phone: m.phone,
      linkedPhones: (m.linkedPhones || []).join(', '),
      email: m.email || '',
      designation: m.designation || 'GENERAL_MEMBER',
      status: m.status,
      joinDate: m.joinDate ? m.joinDate.split('T')[0] : '',
      address: m.address || '',
      initialShareCount: String(m.shareCount || 1),
    });
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!/^(?:01[3-9]\d{8}|\+?[1-9]\d{6,14})$/.test(formData.phone.replace(/[\s().-]/g, ''))) {
      setFormError(t('Enter a Bangladesh mobile number or an international phone number.'));
      return;
    }
    setSubmitting(true);

    try {
      await apiRequest('/members', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      setShowAddModal(false);
      fetchData();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;
    setFormError(null);
    if (!/^(?:01[3-9]\d{8}|\+?[1-9]\d{6,14})$/.test(formData.phone.replace(/[\s().-]/g, ''))) {
      setFormError(t('Enter a Bangladesh mobile number or an international phone number.'));
      return;
    }
    setSubmitting(true);

    const linkedPhonesList = formData.linkedPhones
      ? formData.linkedPhones
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
      : [];

    try {
      await apiRequest(`/members/${selectedMember._id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          linkedPhones: linkedPhonesList,
          email: formData.email,
          designation: formData.designation,
          status: formData.status,
          joinDate: formData.joinDate,
          address: formData.address,
        }),
      });
      setShowEditModal(false);
      fetchData();
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedMember) return;
    setSubmitting(true);

    try {
      await apiRequest(`/members/${selectedMember._id}`, {
        method: 'DELETE',
      });
      setShowDeleteModal(false);
      fetchData();
    } catch (err: unknown) {
      alert((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto pb-10">
      {/* 1. MODULE INSTRUCTION CARD */}
      <ModuleGuide moduleKey="MEMBERS" defaultOpen={false} />

      {!canEdit && (
        <div className="glass-card px-4 py-3 bg-amber-500/10 border-amber-500/30 text-amber-200 text-xs flex items-center justify-between rounded-xl">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-bold uppercase tracking-wider">{t('Read-Only Access')}:</span>
            <span>
              {t(
                'You have viewing permission for Member Management. Profile updates, additions, and deletions are restricted.'
              )}
            </span>
          </div>
          {user?.designation && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 border border-amber-500/30 text-amber-300 uppercase">
              {user.designation}
            </span>
          )}
        </div>
      )}

      {/* Global Alerts */}
      {exitNotice && (
        <div className="alert alert-success flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} />
            <span>{exitNotice}</span>
          </div>
          <button type="button" onClick={() => setExitNotice(null)} className="text-gray-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}
      {exitError && (
        <div className="alert alert-error flex items-center justify-between">
          <span>{exitError}</span>
          <button type="button" onClick={() => setExitError(null)} className="text-gray-400 hover:text-white">
            <X size={15} />
          </button>
        </div>
      )}

      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-400">
            <Users size={18} />
            <span className="text-xs font-bold uppercase tracking-wider">{t('Membership · Registry')}</span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {t('Member Management')}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-gray-400">
            {t(
              'Registry of cooperative society members, share allocations, dropped member exits, and refund payment vouchers.'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={fetchData}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-blue-400' : 'text-gray-400'} />
            <span>{t('Refresh')}</span>
          </button>

          {activeTab === 'ROSTER' && canEdit && (
            <>
              <button
                onClick={() => {
                  setShowImport(true);
                  setImportPreview(null);
                  setFormError('');
                }}
                className="btn btn-secondary btn-sm text-xs font-bold uppercase tracking-wider"
              >
                {t('Import CSV')}
              </button>
              <button
                onClick={handleOpenAddModal}
                className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider shrink-0"
              >
                <Plus size={16} />
                <span>{t('Add Member')}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. TAB NAVIGATION (ROSTER vs DROPPED EXITS) */}
      <div className="flex items-center gap-2 border-b border-white/10 pb-1">
        <button
          type="button"
          onClick={() => handleTabChange('ROSTER')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'ROSTER'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/40'
              : 'text-gray-400 hover:text-white bg-slate-900/50 hover:bg-slate-800/60 border border-white/5'
          }`}
        >
          <Users size={16} />
          <span>{isBn ? 'সদস্য তালিকা ও প্রোফাইল' : 'Member Directory'}</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-white/20 text-white font-mono">
            {stats.total}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('EXITS')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all ${
            activeTab === 'EXITS'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/25 border border-rose-400/40'
              : 'text-gray-400 hover:text-white bg-slate-900/50 hover:bg-slate-800/60 border border-white/5'
          }`}
        >
          <UserRoundX size={16} className={activeTab === 'EXITS' ? 'text-white' : 'text-rose-400'} />
          <span>{isBn ? 'বাতিলকৃত সদস্য ও রিফান্ড সেটেলমেন্ট' : 'Dropped Members & Exit Settlements'}</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-rose-500/30 text-rose-200 border border-rose-500/40 font-mono">
            {exits.length || stats.dropped}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: MEMBER DIRECTORY & ROSTER                                          */}
      {/* ========================================================================= */}
      {activeTab === 'ROSTER' && (
        <div className="space-y-6 animate-fadeIn">
          {/* KPI Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-5">
            {/* Card 1: Total Registered */}
            <div className="glass-card p-5 border-l-4 border-l-blue-500 hover:border-blue-500/50 transition-all">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <span>{t('Total Registered')}</span>
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Users size={18} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">{stats.total}</p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                <span>{t('Society registry')}</span>
                <span className="text-blue-400 font-semibold">{t('100% recorded')}</span>
              </div>
            </div>

            {/* Card 2: Total Shares */}
            <div className="glass-card p-5 border-l-4 border-l-violet-500 hover:border-violet-500/50 transition-all">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <span>{t('Total Society Shares')}</span>
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-300 border border-violet-500/20">
                  <Users size={18} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">
                {formatNumber(stats.totalShares)}
              </p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                <span>{t('Current allocated shares')}</span>
                <span className="text-violet-300 font-semibold">{t('Live total')}</span>
              </div>
            </div>

            {/* Card 3: Active Members */}
            <div className="glass-card p-5 border-l-4 border-l-emerald-500 hover:border-emerald-500/50 transition-all">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <span>{t('Active Members')}</span>
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <UserCheck size={18} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">{stats.active}</p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                <span>{t('Eligible for dividends')}</span>
                <span className="text-emerald-400 font-semibold">
                  {stats.total > 0 ? `${Math.round((stats.active / stats.total) * 100)}% ${t('active')}` : '0%'}
                </span>
              </div>
            </div>

            {/* Card 4: Inactive Members */}
            <div className="glass-card p-5 border-l-4 border-l-amber-500 hover:border-amber-500/50 transition-all">
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <span>{t('Inactive Members')}</span>
                <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  <UserMinus size={18} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">{stats.inactive}</p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                <span>{t('Temporarily dormant')}</span>
                <span className="text-amber-400 font-semibold">
                  {stats.total > 0 ? `${Math.round((stats.inactive / stats.total) * 100)}% ${t('dormant')}` : '0%'}
                </span>
              </div>
            </div>

            {/* Card 5: Dropped / Archived */}
            <div
              onClick={() => setActiveTab('EXITS')}
              className="glass-card p-5 border-l-4 border-l-rose-500 hover:border-rose-500/50 transition-all cursor-pointer group"
              title="Click to view Dropped Members & Exit Settlements"
            >
              <div className="flex items-center justify-between text-gray-400 text-xs font-semibold uppercase tracking-wider">
                <span className="group-hover:text-rose-300 transition-colors">{t('Dropped / Archived')}</span>
                <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:scale-105 transition-transform">
                  <UserX size={18} />
                </div>
              </div>
              <p className="text-2xl sm:text-3xl font-extrabold text-white mt-3 tracking-tight">{stats.dropped}</p>
              <div className="flex items-center justify-between text-[11px] text-gray-400 mt-3 pt-2.5 border-t border-white/5">
                <span className="text-rose-400 font-semibold flex items-center gap-1">
                  <span>{isBn ? 'রিফান্ড সেটেলমেন্ট দেখুন' : 'View Settlements'}</span>
                  <ExternalLink size={11} />
                </span>
                <span className="text-gray-500 font-mono">৳0 Dues</span>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar */}
          <div className="glass-card p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="relative flex-1 min-w-[280px]">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                className="form-input pl-9 text-xs sm:text-sm"
                placeholder={t('Search by name, phone number, or Member ID (e.g. NSF001)...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-1.5 items-center flex-wrap">
                {['ALL', 'ACTIVE', 'INACTIVE', 'DROPPED'].map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                      statusFilter === st
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                        : 'text-gray-400 hover:text-white bg-slate-900/60 border border-white/5'
                    }`}
                  >
                    {t(st)}
                  </button>
                ))}
              </div>

              <div className="text-xs text-gray-400 flex items-center">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 mr-2" />
                <span>
                  {stats.total} {t(stats.total === 1 ? 'registered member' : 'registered members')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end mb-2">
            <TableScrollControls containerRef={rosterTableRef} />
          </div>

          {/* Member List Table */}
          <div ref={rosterTableRef} className="table-container member-list-container glass-card max-h-[70vh] overflow-y-auto overscroll-contain">
            <table className="data-table member-list-table">
              <thead>
                <tr>
                  <th className="w-16 text-center whitespace-nowrap font-bold">{t('SL NO')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Member ID')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Full Name')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Contact Info')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Shares')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Monthly Payable')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Status')}</th>
                  <th className="whitespace-nowrap font-bold">{t('Join Date')}</th>
                  <th className="text-right whitespace-nowrap font-bold">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-400">
                      <div className="w-8 h-8 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
                      <span>Loading members registry...</span>
                    </td>
                  </tr>
                ) : members.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-gray-400">
                      <Users size={32} className="opacity-30 mx-auto mb-3" />
                      <p>No members found matching your search criteria.</p>
                    </td>
                  </tr>
                ) : (
                  members.map((m, idx) => {
                    const serialNo = idx + 1;
                    const isDropped = m.status === 'DROPPED';
                    const badgeClass =
                      m.status === 'ACTIVE'
                        ? 'badge-active'
                        : m.status === 'INACTIVE'
                        ? 'badge-inactive'
                        : 'badge-dropped';

                    return (
                      <tr key={m._id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="text-center font-mono text-xs font-bold text-gray-400">
                          <span className="inline-block px-2 py-0.5 rounded bg-white/5 border border-white/5 text-gray-300">
                            {String(serialNo).padStart(2, '0')}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono font-bold text-xs text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/25">
                            {m.memberId}
                          </span>
                        </td>
                        <td>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-white text-sm whitespace-nowrap">{m.name}</p>
                              {m.designation && m.designation !== 'GENERAL_MEMBER' && (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                    DESIGNATION_CONFIG[m.designation]?.badgeClass ||
                                    'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                  }`}
                                >
                                  {t(DESIGNATION_CONFIG[m.designation]?.label || m.designation)}
                                </span>
                              )}
                            </div>
                            {m.address && (
                              <p className="text-xs text-gray-400 truncate max-w-[180px] mt-1">{m.address}</p>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5 text-xs text-gray-300">
                              <Phone size={13} className="text-gray-500" />
                              <span>{m.phone}</span>
                            </div>
                            {m.email && (
                              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                <Mail size={12} className="text-gray-500" />
                                <span>{m.email}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-col gap-0.5 whitespace-nowrap">
                            <span className="font-bold text-white">
                              {isDropped ? '0 shares' : `${m.shareCount} ${m.shareCount === 1 ? 'share' : 'shares'}`}
                            </span>
                            <span className="text-[11px] text-gray-500">
                              BDT {formatNumber(m.shareAmount || shareAmount)} {t('each')}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`font-semibold whitespace-nowrap ${isDropped ? 'text-gray-500' : 'text-emerald-300'}`}>
                            BDT {formatNumber(isDropped ? 0 : m.monthlyPayable ?? ((m.shareCount || 0) * shareAmount))}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${badgeClass}`}>{t(m.status)}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-1.5 text-xs text-gray-400">
                            <Calendar size={13} className="text-gray-500" />
                            <span>{formatDate(m.joinDate)}</span>
                          </div>
                        </td>
                        <td className="text-right">
                          <div className="inline-flex gap-1.5 whitespace-nowrap">
                            <button
                              onClick={() => {
                                setSelectedMember(m);
                                setShowDetailsModal(true);
                              }}
                              className="btn btn-secondary btn-sm px-2 py-1.5"
                              title="View Member Details"
                            >
                              <Eye size={14} />
                              <span className="hidden xl:inline">{t('View')}</span>
                            </button>

                            {isDropped && (
                              <button
                                onClick={() => {
                                  setActiveTab('EXITS');
                                }}
                                className="btn btn-sm px-2 py-1.5 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                                title="View Refund Settlement"
                              >
                                <DollarSign size={14} />
                                <span className="hidden xl:inline">{isBn ? 'রিফান্ড' : 'Refund'}</span>
                              </button>
                            )}

                            {canEdit && (
                              <button
                                onClick={() => handleOpenEditModal(m)}
                                className="btn btn-secondary btn-sm px-2 py-1.5"
                                title="Edit Member"
                              >
                                <Edit2 size={14} />
                                <span className="hidden xl:inline">{t('Edit')}</span>
                              </button>
                            )}

                            {canDelete && !isDropped && (
                              <button
                                onClick={() => {
                                  setSelectedMember(m);
                                  setShowDeleteModal(true);
                                }}
                                className="btn btn-danger btn-sm px-2 py-1.5"
                                title="Drop Member"
                              >
                                <Trash2 size={14} />
                                <span className="hidden xl:inline">{t('Drop')}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: DROPPED MEMBERS & EXIT REFUND SETTLEMENTS                          */}
      {/* ========================================================================= */}
      {activeTab === 'EXITS' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Sub-module Header */}
          <div className="glass-card p-5 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex gap-3 items-center">
                <div className="p-3 rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-inner">
                  <UserRoundX size={24} />
                </div>
                <div>
                  <h2 className="font-bold text-white text-lg">
                    {isBn ? 'বাতিলকৃত সদস্য তালিকা ও রিফান্ড সেটেলমেন্ট ভাউচার' : 'Dropped Members & Exit Refund Settlements'}
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5 max-w-2xl">
                    {isBn
                      ? 'বাদ পড়া সদস্যদের মোট জমাকৃত মূলধন, প্রশাসনিক কর্তন, কোন হিসাবরক্ষকের কাস্টডি থেকে কত টাকা পরিশোধ করা হয়েছে এবং পেমেন্ট রিসিট ডকুমেন্ট এক জায়গা থেকে ম্যানেজ করুন।'
                      : 'Audit-verified departed members, refund calculation, custody disbursal tracking, and attached payment receipt vouchers.'}
                  </p>
                </div>
              </div>

              {canManageGovernance && (
                <button
                  type="button"
                  onClick={() => {
                    setExitMemberId('');
                    setExitEligibleAmount('');
                    setExitDeductionRate('9.99');
                    setExitDeductionAmount('');
                    setExitNetAmount('');
                    setExitWaiveDeduction(false);
                    setExitReceiptFile(null);
                    setExitReceiptNumber('');
                    setExitPaymentMethod('BKASH');
                    setExitTransactionRef('');
                    setExitAuthorizerName('');
                    setExitNotes('');
                    setExitAccountantKey('MOIN');
                    setShowExitModal(true);
                  }}
                  className="btn btn-primary btn-sm flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-600 shadow-md shadow-rose-600/20"
                >
                  <Plus size={16} />
                  <span>{isBn ? 'নতুন রিফান্ড ও সেটেলমেন্ট' : 'Propose & Settle Exit'}</span>
                </button>
              )}
            </div>

            {/* Reconciliation KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3.5">
                <span className="text-[11px] text-gray-400 block uppercase font-medium">
                  {isBn ? 'মোট বাদ পড়া সদস্য' : 'Total Exited Members'}
                </span>
                <span className="text-xl font-bold text-white mt-1 block">
                  {exits.filter((e) => e.status === 'SETTLED').length} {isBn ? 'জন' : 'members'}
                </span>
                <span className="text-[10px] text-emerald-400 mt-0.5 block flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  <span>{isBn ? 'বকেয়া সম্পূর্ণ ৳ ০.০০' : 'Dues ৳0.00 waived'}</span>
                </span>
              </div>

              <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-3.5">
                <span className="text-[11px] text-blue-300 block uppercase font-medium">
                  {isBn ? 'মোট জমাকৃত মূলধন' : 'Total Eligible Principal'}
                </span>
                <span className="text-xl font-bold text-blue-400 mt-1 block">
                  ৳{' '}
                  {exits
                    .filter((e) => e.status === 'SETTLED')
                    .reduce(
                      (s, e) =>
                        s + Number(e.eligibleAmount ?? (Number(e.netAmount || 0) + Number(e.deductionAmount || 0))),
                      0
                    )
                    .toLocaleString()}
                </span>
                <span className="text-[10px] text-blue-300/70 mt-0.5 block">
                  {isBn ? 'মোট প্রদেয় সঞ্চয়' : 'Pre-exit capital'}
                </span>
              </div>

              <div className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3.5">
                <span className="text-[11px] text-rose-300 block uppercase font-medium">
                  {isBn ? 'সমিতি প্রশাসনিক কর্তন' : 'Foundation Retention'}
                </span>
                <span className="text-xl font-bold text-rose-400 mt-1 block">
                  ৳{' '}
                  {exits
                    .filter((e) => e.status === 'SETTLED')
                    .reduce((s, e) => s + Number(e.deductionAmount || 0), 0)
                    .toLocaleString()}
                </span>
                <span className="text-[10px] text-rose-300/70 mt-0.5 block">
                  {isBn ? 'নীতিমালা অনুযায়ী কর্তন' : 'Retained operational funds'}
                </span>
              </div>

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3.5">
                <span className="text-[11px] text-emerald-300 block uppercase font-medium">
                  {isBn ? 'কাস্টডি থেকে পরিশোধিত' : 'Net Disbursed from Custody'}
                </span>
                <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                  ৳{' '}
                  {exits
                    .filter((e) => e.status === 'SETTLED')
                    .reduce((s, e) => s + Number(e.netAmount || 0), 0)
                    .toLocaleString()}
                </span>
                <span className="text-[10px] text-emerald-300/70 mt-0.5 block">
                  {isBn ? 'প্রমাণিত নগদ/বিকাশ বিতরণ' : 'Disbursed from custody'}
                </span>
              </div>
            </div>

            <div className="flex justify-end mt-4 mb-2">
              <TableScrollControls containerRef={exitsTableRef} />
            </div>

            {/* Dropped Members Table */}
            <div ref={exitsTableRef} className="table-container">
              <table className="data-table min-w-[760px]">
                <thead>
                  <tr>
                    <th>{isBn ? 'সদস্য' : 'Member'}</th>
                    <th>{isBn ? 'জমাকৃত মূলধন' : 'Eligible Amount'}</th>
                    <th>{isBn ? 'কর্তন নীতি' : 'Retention'}</th>
                    <th>{isBn ? 'নিট রিফান্ড' : 'Net Refund'}</th>
                    <th>{isBn ? 'পরিশোধকারী ও মাধ্যম' : 'Disbursed By & Channel'}</th>
                    <th>{isBn ? 'পেমেন্ট রিসিট ভাউচার' : 'Receipt Proof'}</th>
                    <th className="text-right">{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {exits.length ? (
                    exits.map((e) => {
                      const isSettled = e.status === 'SETTLED';
                      const isWaived = (e.deductionRate ?? 9.99) === 0;
                      const eligible = Number(
                        e.eligibleAmount ?? (Number(e.netAmount || 0) + Number(e.deductionAmount || 0))
                      );

                      // Extract paying custody account
                      const inst = e.installments?.[0];
                      const mov =
                        inst?.custodyMovementId && typeof inst.custodyMovementId === 'object'
                          ? inst.custodyMovementId
                          : null;
                      const acc =
                        mov?.custodyAccountId && typeof mov.custodyAccountId === 'object'
                          ? mov.custodyAccountId
                          : null;

                      const isSamrat = (acc?.name || '').toLowerCase().includes('samrat') ||
                        groupedCustody.samrat.some((s) => s._id === acc?._id);
                      const payingAccountantName = isSamrat
                        ? (isBn ? 'সম্রাট (সহকারী হিসাবরক্ষক)' : 'Samrat (Secondary Accountant)')
                        : (isBn ? 'মঈন উদ্দীন (প্রধান হিসাবরক্ষক)' : 'Moin Uddin (Primary Accountant)');
                      const authorizerShort = e.authorizerName || (isBn ? 'পরিচালক অনুমোদিত' : 'Director Authorized');
                      const trxRef = e.transactionRef || '';

                      return (
                        <tr key={e._id} className="hover:bg-white/[0.02] transition-colors">
                          {/* 1. Member Info */}
                          <td>
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-blue-400 font-bold text-xs">{e.memberId?.memberId}</span>
                                <span className="text-white font-medium text-xs sm:text-sm">{e.memberId?.name}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                {e.memberId?.phone && (
                                  <span className="text-[11px] text-gray-400 font-mono">
                                    {e.memberId.phone}
                                  </span>
                                )}
                                <span
                                  className={`badge text-[10px] font-bold py-0 px-1.5 ${
                                    isSettled
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  }`}
                                >
                                  {isSettled ? (isBn ? 'নিষ্পন্ন' : 'SETTLED') : (isBn ? 'প্রস্তাবিত' : 'PENDING')}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 2. Gross Capital */}
                          <td>
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-200 text-xs sm:text-sm">৳ {eligible.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[10px] text-gray-400">{isBn ? 'মোট সঞ্চয়' : 'Pre-exit capital'}</span>
                            </div>
                          </td>

                          {/* 3. Deduction Policy */}
                          <td>
                            {isWaived ? (
                              <div className="flex flex-col">
                                <span className="text-emerald-400 font-bold text-xs">৳ 0.00</span>
                                <span className="text-[10px] text-amber-300 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/25 w-fit mt-0.5">
                                  {isBn ? '০% (পরিচালক মওকুফ)' : '0% (Director Waived)'}
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="text-rose-400 font-medium text-xs">
                                  - ৳ {Number(e.deductionAmount || 0).toFixed(2)}
                                </span>
                                <span className="text-[10px] text-gray-400 mt-0.5">
                                  {e.deductionRate ?? 9.99}% {isBn ? 'প্রশাসনিক কর্তন' : 'Retention'}
                                </span>
                              </div>
                            )}
                          </td>

                          {/* 4. Net Refund Payout */}
                          <td>
                            <div className="flex flex-col">
                              <span className="text-emerald-400 font-bold text-sm sm:text-base">
                                ৳ {Number(e.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-emerald-300/70">{isBn ? 'পরিশোধিত' : 'Disbursed'}</span>
                            </div>
                          </td>

                          {/* 5. Combined: Paid By, Custody & Channel */}
                          <td>
                            <div className="flex flex-col max-w-[210px]">
                              <span className="text-blue-300 font-semibold text-xs flex items-center gap-1.5 truncate" title={payingAccountantName}>
                                <ShieldCheck size={13} className="text-blue-400 shrink-0" />
                                <span className="truncate">{payingAccountantName}</span>
                              </span>
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                                <span className="font-mono text-gray-300">{e.paymentMethod || 'bKash'}</span>
                                {trxRef && (
                                  <>
                                    <span>•</span>
                                    <span className="font-mono text-amber-300/90 truncate max-w-[90px]" title={trxRef}>{trxRef}</span>
                                  </>
                                )}
                                {authorizerShort && (
                                  <>
                                    <span>•</span>
                                    <span className="text-amber-200/80 truncate max-w-[100px]" title={authorizerShort}>
                                      {authorizerShort}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 6. Payment Receipt Voucher Proof */}
                          <td>
                            <div className="space-y-1">
                              {e.documentName || e.receiptUrl ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewDocError(false);
                                      if (e.receiptUrl) {
                                        const token = localStorage.getItem('token') || '';
                                        const rawUrl = e.receiptUrl;
                                        const finalUrl = rawUrl.includes('token=') ? rawUrl : `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
                                        setPreviewDocUrl(finalUrl);
                                        setPreviewDocTitle(e.documentName || `Voucher ${e.receiptNumber || e.memberId?.memberId}`);
                                      } else {
                                        setViewingExit(e);
                                      }
                                    }}
                                    className="btn btn-sm text-xs flex items-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/35 text-blue-300 border border-blue-500/35 px-2.5 py-1 rounded-lg transition shadow-sm font-semibold"
                                    title={isBn ? 'রিসিট ডকুমেন্ট ভিউ করুন' : 'View Receipt Document'}
                                  >
                                    <FileText size={13} className="text-blue-400" />
                                    <span>{isBn ? 'রিসিট দেখুন' : 'View Receipt'}</span>
                                    <Eye size={12} className="text-blue-300" />
                                  </button>

                                  {canManageGovernance && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenUploadReceipt(e)}
                                      className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline flex items-center gap-0.5"
                                      title={isBn ? 'রিসিট পরিবর্তন করুন' : 'Replace Receipt'}
                                    >
                                      <Upload size={10} />
                                      <span>{isBn ? 'পরিবর্তন' : 'Replace'}</span>
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div>
                                  {canManageGovernance ? (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenUploadReceipt(e)}
                                      className="btn btn-sm text-xs flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 px-2.5 py-1 rounded-lg transition font-medium"
                                    >
                                      <Upload size={12} />
                                      <span>{isBn ? 'রিসিট যুক্ত করুন' : 'Attach Receipt'}</span>
                                    </button>
                                  ) : (
                                    <span className="text-[11px] text-gray-500 italic block">
                                      {isBn ? 'রিসিট যুক্ত নেই' : 'No receipt'}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 7. Action Buttons */}
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Eye Icon Button for Full Details & Audit Modal */}
                              <button
                                type="button"
                                onClick={() => setViewingExit(e)}
                                className="p-2 rounded-lg bg-blue-500/15 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition shadow-sm"
                                title={isBn ? 'সম্পূর্ণ হিসাব ও অডিট বিবরণী (আই ভিউ)' : 'View Settlement Breakdown & Audit Details'}
                              >
                                <Eye size={15} />
                              </button>

                              {/* Print Official Voucher */}
                              <button
                                type="button"
                                onClick={() => printSettlementVoucher(e)}
                                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-gray-300 border border-white/10 transition"
                                title={isBn ? 'অফিসিয়াল ভাউচার প্রিন্ট করুন' : 'Print Voucher'}
                              >
                                <Printer size={15} />
                              </button>

                              {/* Settle Button if not settled */}
                              {!isSettled && canManageGovernance && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSettlingExit(e);
                                    setSettleAccountantKey('MOIN');
                                  }}
                                  className="btn btn-warning btn-sm text-xs py-1 px-2 flex items-center gap-1"
                                  title={t('Settle / Deduct Custody')}
                                >
                                  <DollarSign size={13} />
                                  <span>{t('Settle')}</span>
                                </button>
                              )}

                              {/* Edit Button */}
                              {canManageGovernance && (
                                <button
                                  type="button"
                                  onClick={() => handleStartEditExit(e)}
                                  className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition"
                                  title={t('Edit Settlement')}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}

                              {/* Delete Button */}
                              {canManageGovernance && (
                                <button
                                  type="button"
                                  onClick={() => setDeletingExit(e)}
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                                  title={t('Delete Settlement')}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="py-8 text-center text-gray-500" colSpan={7}>
                        {isBn ? 'কোনো বাতিলকৃত সদস্য রেকর্ড পাওয়া যায়নি।' : 'No dropped member exit settlements recorded.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PROPOSE & SETTLE EXIT MODAL */}
      {showExitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-lg w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <UserRoundX className="text-rose-400" size={20} />
                <h3 className="text-base font-bold text-white">
                  {isBn ? 'সদস্য বাতিল ও রিফান্ড সেটেলমেন্ট' : 'Propose & Settle Exit'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="text-gray-400 hover:text-white transition p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleProposeExitSubmit} className="space-y-4">
              {/* Member Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Select Member')} *</label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={exitMemberId}
                  onChange={(e) => handleSelectExitMember(e.target.value)}
                >
                  <option value="">{t('-- Choose Member to Exit --')}</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.memberId} — {m.name} ({m.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Gross Eligible Principal */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isBn ? 'জমাকৃত মোট মূলধন' : 'Gross Eligible Principal'} (৳) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  className="form-input text-xs w-full"
                  placeholder="e.g. 2000"
                  value={exitEligibleAmount}
                  onChange={(e) => handleExitEligibleChange(e.target.value)}
                />
              </div>

              {/* Deduction Presets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-300">
                    {isBn ? 'কর্তন নীতি নির্বাচন' : 'Deduction Policy / Presets'}
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {isBn ? 'ক্লিক করে দ্রুত রেট বসান' : 'Quick select preset rate'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { rate: '0', label: isBn ? '০% (মওকুফ - সম্পূর্ণ ফেরত)' : '0% (Waived - Full Refund)' },
                    { rate: '9.99', label: isBn ? '৯.৯৯% (স্ট্যান্ডার্ড নীতি)' : '9.99% (Standard Policy)' },
                  ].map((p) => {
                    const isSelected = !exitWaiveDeduction
                      ? Number(exitDeductionRate) === Number(p.rate)
                      : p.rate === '0';
                    return (
                      <button
                        key={p.rate}
                        type="button"
                        onClick={() => handleExitRateChange(p.rate)}
                        className={`text-xs py-2 px-3 rounded-xl font-bold border transition text-center ${
                          isSelected
                            ? 'bg-rose-600/35 text-rose-200 border-rose-500 shadow-sm shadow-rose-600/20 ring-1 ring-rose-500/50'
                            : 'bg-slate-900/70 text-gray-300 border-white/10 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Waive Deduction Checkbox */}
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
                    {isBn ? '০% কর্তন (পরিচালকের বিশেষ অনুমোদন)' : 'Waive Deduction (Director Authorized)'}
                  </span>
                  <span className="text-[11px] text-amber-200/70 block mt-0.5">
                    {isBn
                      ? 'পরিচালক মহোদয়ের সিদ্ধান্তে কোনো কর্তন ছাড়াই সম্পূর্ণ ১০০% মূলধন ফেরত প্রদান করা হবে।'
                      : 'Disburse 100% full refund with 0% deduction upon authorization of Director (e.g. Salah Uddin Shuvo).'}
                  </span>
                </label>
              </div>

              {/* Deduction Rate, Deduction Amount & Net Amount */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Deduction Rate (%)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={exitWaiveDeduction}
                    className="form-input text-xs w-full disabled:opacity-50"
                    value={exitDeductionRate}
                    onChange={(e) => handleExitRateChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-rose-300 mb-1">
                    {isBn ? 'কর্তনকৃত টাকা' : 'Deduction Amount'} (৳)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={exitWaiveDeduction}
                    className="form-input text-xs w-full text-rose-400 font-medium disabled:opacity-50"
                    placeholder="e.g. 198"
                    value={exitDeductionAmount}
                    onChange={(e) => handleExitDeductionAmountChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-300 mb-1">
                    {isBn ? 'নিট রিফান্ড প্রদেয়' : 'Net Refund Payout'} (৳) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-emerald-400 font-bold"
                    placeholder="e.g. 1802"
                    value={exitNetAmount}
                    onChange={(e) => handleExitNetAmountChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Payment Method & Transaction Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Payment Method')}</label>
                  <select
                    className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                    value={exitPaymentMethod}
                    onChange={(e) => setExitPaymentMethod(e.target.value)}
                  >
                    <option value="BKASH">{t('bKash')}</option>
                    <option value="BANK">{t('Bank Transfer')}</option>
                    <option value="NAGAD">{t('Nagad')}</option>
                    <option value="CASH">{t('Cash Handover')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">
                    {t('Transaction Ref / Voucher No')}
                  </label>
                  <input
                    type="text"
                    className="form-input text-xs w-full font-mono"
                    placeholder="e.g. BK-REFUND-032"
                    value={exitTransactionRef}
                    onChange={(e) => setExitTransactionRef(e.target.value)}
                  />
                </div>
              </div>

              {/* Disbursing Accountant Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isBn ? 'পরিশোধকারী হিসাবরক্ষক (কাস্টডি তহবিল)' : 'Disbursing Accountant (Custody Pool)'} *
                </label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={exitAccountantKey}
                  onChange={(e) => setExitAccountantKey(e.target.value as 'MOIN' | 'SAMRAT')}
                >
                  <option value="MOIN">
                    {isBn ? 'মঈন উদ্দীন (প্রধান হিসাবরক্ষক)' : 'Moin Uddin (Primary Accountant)'} — (
                    {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                    {groupedCustody.moinTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </option>
                  <option value="SAMRAT">
                    {isBn ? 'সম্রাট (সহকারী হিসাবরক্ষক)' : 'Samrat (Secondary Accountant)'} — (
                    {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                    {groupedCustody.samratTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {isBn
                    ? 'নির্বাচিত পেমেন্ট মাধ্যম অনুসারে অভ্যন্তরীণ কাস্টডি চ্যানেল স্বয়ংক্রিয়ভাবে সমন্বয় করা হবে।'
                    : 'The internal custody channel will be automatically reconciled based on the selected payment method.'}
                </p>
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
              </div>

              {/* Receipt File Upload Directly in Propose Modal */}
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-blue-300">
                    {isBn ? 'পেমেন্ট রিসিট ভাউচার ফাইল আপলোড (ঐচ্ছিক)' : 'Upload Receipt Proof Document (Optional)'}
                  </label>
                  <span className="text-[10px] text-gray-400">PDF, PNG, JPG, WebP</span>
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="form-input text-xs w-full cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
                  onChange={(e) => setExitReceiptFile(e.target.files?.[0] || null)}
                />
                {exitReceiptFile && (
                  <div className="flex items-center justify-between text-xs text-blue-200 bg-blue-900/40 p-2 rounded-lg border border-blue-500/30">
                    <span className="truncate">{exitReceiptFile.name} ({(exitReceiptFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setExitReceiptFile(null)}
                      className="text-rose-400 hover:text-rose-300 p-1"
                      title={isBn ? 'ফাইল সরান' : 'Remove File'}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  className="form-input text-xs w-full font-mono mt-1"
                  placeholder="Receipt Voucher # (e.g. RCPT-EXIT-032)"
                  value={exitReceiptNumber}
                  onChange={(e) => setExitReceiptNumber(e.target.value)}
                />
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
                  {isBn
                    ? 'তাত্ক্ষণিকভাবে সেটেল করুন এবং নির্বাচিত কাস্টডি একাউন্ট থেকে টাকা বিয়োগ করুন'
                    : 'Settle immediately and deduct net refund from the selected custody account'}
                </span>
              </label>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Notes')}</label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  placeholder="e.g. Refund disbursed as per director instructions."
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
                  disabled={exitSubmitting}
                  className="btn btn-primary btn-sm flex items-center gap-1.5 bg-gradient-to-r from-rose-600 to-amber-600"
                >
                  {exitSubmitting ? t('Processing...') : isBn ? 'সেটেলমেন্ট সম্পন্ন করুন' : 'Confirm & Settle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SETTLEMENT VOUCHER MODAL */}
      {viewingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fadeIn">
          <div className="glass-card max-w-2xl w-full p-6 space-y-4 border border-white/20 shadow-2xl rounded-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <BrandLogo size="sm" />
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isBn ? 'সদস্য রিফান্ড সেটেলমেন্ট বিবরণী' : 'Member Exit Settlement Details'}
                  </h3>
                  <span className="text-[11px] text-gray-400">NS Foundation Cooperative Society</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printSettlementVoucher(viewingExit)}
                  className="btn btn-secondary btn-sm flex items-center gap-1.5 bg-blue-600/20 text-blue-300 border border-blue-500/30 hover:bg-blue-600/30"
                  title="Print Official Voucher"
                >
                  <Printer size={15} />
                  <span>{isBn ? 'প্রিন্ট ভাউচার' : 'Print Voucher'}</span>
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

            {/* Member Info */}
            <div className="p-4 rounded-xl border border-white/10 bg-slate-950/60 flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="font-mono text-blue-400 font-bold text-sm">{viewingExit.memberId?.memberId}</span>
                <span className="text-white text-base font-bold ml-2">{viewingExit.memberId?.name}</span>
                {viewingExit.memberId?.phone && (
                  <span className="text-gray-400 text-xs ml-3 font-mono">({viewingExit.memberId.phone})</span>
                )}
              </div>
              <span className="badge text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {t(viewingExit.status)}
              </span>
            </div>

            {/* Financial Breakdown */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60">
                <span className="text-[11px] text-gray-400 block uppercase font-medium">
                  {isBn ? 'মোট জমাকৃত মূলধন' : 'Eligible Amount'}
                </span>
                <span className="text-lg font-bold text-white mt-1 block">
                  ৳{' '}
                  {Number(
                    viewingExit.eligibleAmount || viewingExit.netAmount + viewingExit.deductionAmount
                  ).toFixed(2)}
                </span>
              </div>
              <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-950/20">
                <span className="text-[11px] text-rose-300 block uppercase font-medium">
                  {isBn ? 'প্রশাসনিক কর্তন' : 'Deduction'} ({viewingExit.deductionRate ?? 9.99}%)
                </span>
                <span className="text-lg font-bold text-rose-400 mt-1 block">
                  {viewingExit.deductionRate === 0
                    ? '৳ 0.00'
                    : `- ৳ ${Number(viewingExit.deductionAmount || 0).toFixed(2)}`}
                </span>
                {viewingExit.deductionRate === 0 && (
                  <span className="text-[10px] text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30 inline-block mt-1">
                    {isBn ? '০% (পরিচালক মওকুফ)' : '0% (Director Waived)'}
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20">
                <span className="text-[11px] text-emerald-300 block uppercase font-medium">
                  {isBn ? 'পরিশোধিত নিট রিফান্ড' : 'Net Refund Paid'}
                </span>
                <span className="text-xl font-extrabold text-emerald-400 mt-1 block">
                  ৳ {Number(viewingExit.netAmount || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Disbursing Custody & Payment Proof */}
            <div className="p-3.5 rounded-xl border border-white/10 bg-slate-900/60 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-400 block">{isBn ? 'পেমেন্ট চ্যানেল ও রেফারেন্স' : 'Payment Method & Trx'}</span>
                <strong className="text-white mt-0.5 block">
                  {viewingExit.paymentMethod || 'bKash'} • {viewingExit.transactionRef || 'N/A'}
                </strong>
              </div>
              <div>
                <span className="text-gray-400 block">{isBn ? 'অনুমোদনকারী' : 'Authorized By'}</span>
                <strong className="text-amber-300 mt-0.5 block">
                  {viewingExit.authorizerName || 'Salah Uddin Shuvo (Director)'}
                </strong>
              </div>
            </div>

            {/* Document Details Card */}
            {viewingExit.documentName && (
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-950/20 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileText className="text-blue-400" size={18} />
                  <div>
                    <span className="text-blue-300 font-bold block">{viewingExit.documentName}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      Receipt #: {viewingExit.receiptNumber || 'RCPT-SETTLED'}
                    </span>
                  </div>
                </div>
                {viewingExit.receiptUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewDocUrl(viewingExit.receiptUrl || null);
                      setPreviewDocTitle(viewingExit.documentName || 'Receipt');
                    }}
                    className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                  >
                    <Eye size={13} />
                    <span>{isBn ? 'প্রিভিউ দেখুন' : 'Preview Document'}</span>
                  </button>
                )}
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
                <h3 className="text-base font-bold text-white">
                  {isBn ? 'সেটেলমেন্ট এডিট করুন' : 'Edit Member Exit Settlement'}
                </h3>
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
              <div className="p-3 rounded-xl border border-white/10 bg-slate-950/60">
                <span className="font-mono text-blue-400 font-bold">{editingExit.memberId?.memberId}</span>
                <span className="text-white ml-2 font-medium">{editingExit.memberId?.name}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Eligible Amount')} (৳)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full"
                    value={editForm.eligibleAmount}
                    onChange={(e) => handleEditEligibleChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Deduction Rate (%)')}</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full"
                    value={editForm.deductionRate}
                    onChange={(e) => handleEditRateChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Deduction Presets */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-gray-300">
                    {isBn ? 'কর্তন নীতি নির্বাচন' : 'Deduction Presets'}
                  </label>
                  <span className="text-[11px] text-gray-400">
                    {isBn ? 'ক্লিক করে দ্রুত রেট বসান' : 'Quick select preset rate'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { rate: '0', label: isBn ? '০% (মওকুফ - সম্পূর্ণ ফেরত)' : '0% (Waived - Full Refund)' },
                    { rate: '9.99', label: isBn ? '৯.৯৯% (স্ট্যান্ডার্ড নীতি)' : '9.99% (Standard Policy)' },
                  ].map((p) => {
                    const isSelected = Number(editForm.deductionRate) === Number(p.rate);
                    return (
                      <button
                        key={p.rate}
                        type="button"
                        onClick={() => handleEditRateChange(p.rate)}
                        className={`text-xs py-1.5 px-3 rounded-xl font-bold border transition text-center ${
                          isSelected
                            ? 'bg-rose-600/35 text-rose-200 border-rose-500 shadow-sm shadow-rose-600/20 ring-1 ring-rose-500/50'
                            : 'bg-slate-900/70 text-gray-300 border-white/10 hover:bg-slate-800/80 hover:text-white'
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-rose-300 mb-1">{t('Deduction Amount')} (৳)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-rose-400 font-medium"
                    value={editForm.deductionAmount}
                    onChange={(e) => handleEditDeductionAmountChange(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-emerald-300 mb-1">{t('Net Refund')} (৳)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    className="form-input text-xs w-full text-emerald-400 font-bold"
                    value={editForm.netAmount}
                    onChange={(e) => handleEditNetAmountChange(e.target.value)}
                  />
                </div>
              </div>

              {/* Disbursing Accountant Selector */}
              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isBn ? 'পরিশোধকারী হিসাবরক্ষক (কাস্টডি তহবিল)' : 'Disbursing Accountant (Custody Pool)'} *
                </label>
                <select
                  required
                  className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                  value={editForm.accountantKey}
                  onChange={(e) => setEditForm({ ...editForm, accountantKey: e.target.value as 'MOIN' | 'SAMRAT' })}
                >
                  <option value="MOIN">
                    {isBn ? 'মঈন উদ্দীন (প্রধান হিসাবরক্ষক)' : 'Moin Uddin (Primary Accountant)'} — (
                    {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                    {groupedCustody.moinTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </option>
                  <option value="SAMRAT">
                    {isBn ? 'সম্রাট (সহকারী হিসাবরক্ষক)' : 'Samrat (Secondary Accountant)'} — (
                    {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                    {groupedCustody.samratTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                  </option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {isBn
                    ? 'নির্বাচিত পেমেন্ট মাধ্যম অনুসারে অভ্যন্তরীণ কাস্টডি চ্যানেল স্বয়ংক্রিয়ভাবে সমন্বয় করা হবে।'
                    : 'The internal custody channel will be automatically reconciled based on the selected payment method.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Payment Method')}</label>
                  <select
                    className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                    value={editForm.paymentMethod}
                    onChange={(e) => setEditForm({ ...editForm, paymentMethod: e.target.value })}
                  >
                    <option value="BKASH">{t('bKash')}</option>
                    <option value="BANK">{t('Bank Transfer')}</option>
                    <option value="NAGAD">{t('Nagad')}</option>
                    <option value="CASH">{t('Cash Handover')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-300 mb-1">{t('Transaction Ref')}</label>
                  <input
                    type="text"
                    className="form-input text-xs w-full font-mono"
                    value={editForm.transactionRef}
                    onChange={(e) => setEditForm({ ...editForm, transactionRef: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Authorized By')}</label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
                  value={editForm.authorizerName}
                  onChange={(e) => setEditForm({ ...editForm, authorizerName: e.target.value })}
                />
              </div>

              {/* Receipt Document Upload in Edit Modal */}
              <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-blue-300">
                    {isBn ? 'পেমেন্ট রিসিট ভাউচার ডকুমেন্ট আপলোড / পরিবর্তন' : 'Upload / Replace Receipt Document'}
                  </label>
                  {editForm.documentName && (
                    <span className="text-[11px] text-gray-400 truncate max-w-[200px]" title={editForm.documentName}>
                      বর্তমান: {editForm.documentName}
                    </span>
                  )}
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="form-input text-xs w-full cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white"
                  onChange={(e) => setEditReceiptFile(e.target.files?.[0] || null)}
                />
                {editReceiptFile && (
                  <div className="flex items-center justify-between text-xs text-blue-200 bg-blue-900/40 p-2 rounded-lg border border-blue-500/30">
                    <span className="truncate">{editReceiptFile.name} ({(editReceiptFile.size / 1024).toFixed(1)} KB)</span>
                    <button
                      type="button"
                      onClick={() => setEditReceiptFile(null)}
                      className="text-rose-400 hover:text-rose-300 p-1"
                      title={isBn ? 'ফাইল সরান' : 'Remove File'}
                    >
                      <X size={14} />
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-0.5">{isBn ? 'ডকুমেন্ট ফাইলের নাম' : 'Document Name'}</label>
                    <input
                      type="text"
                      className="form-input text-xs w-full"
                      value={editForm.documentName}
                      onChange={(e) => setEditForm({ ...editForm, documentName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-400 mb-0.5">{isBn ? 'রিসিট ভাউচার নং' : 'Receipt Number'}</label>
                    <input
                      type="text"
                      className="form-input text-xs w-full font-mono"
                      value={editForm.receiptNumber}
                      onChange={(e) => setEditForm({ ...editForm, receiptNumber: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">{t('Notes')}</label>
                <input
                  type="text"
                  className="form-input text-xs w-full"
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

      {/* DELETE / ROLLBACK EXIT MODAL */}
      {deletingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-rose-500/30 shadow-2xl rounded-2xl">
            <div className="flex items-center gap-2 text-rose-400">
              <Trash2 size={22} />
              <h3 className="text-base font-bold text-white">{t('Delete Exit Settlement')}</h3>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              {t('Are you sure you want to delete the exit settlement for')}{' '}
              <strong className="text-white">{deletingExit.memberId?.name}</strong>?{' '}
              {t('This will restore custody balance and re-open the member record.')}
            </p>
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
                onClick={handleConfirmDeleteExit}
                disabled={deleteSaving}
                className="btn btn-danger btn-sm"
              >
                {deleteSaving ? t('Deleting...') : t('Confirm Delete')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SETTLE EXIT MODAL */}
      {settlingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-amber-500/30 shadow-2xl rounded-2xl">
            <div className="flex items-center gap-2 text-amber-400">
              <DollarSign size={20} />
              <h3 className="text-base font-bold text-white">{isBn ? 'সদস্য রিফান্ড সেটেল করুন' : 'Settle Member Exit'}</h3>
            </div>
            <p className="text-xs text-gray-300">
              {isBn ? 'সদস্য' : 'Member'}: <strong className="text-white">{settlingExit.memberId?.name}</strong> ({settlingExit.memberId?.memberId})<br />
              {isBn ? 'পরিশোধিতব্য নিট রিফান্ড' : 'Net Refund Payout'}: <strong className="text-emerald-400 font-bold">৳ {Number(settlingExit.netAmount || 0).toFixed(2)}</strong>
            </p>
            <div>
              <label className="block text-xs font-bold text-gray-300 mb-1">
                {isBn ? 'পরিশোধকারী হিসাবরক্ষক (কাস্টডি তহবিল)' : 'Disbursing Accountant (Custody Pool)'} *
              </label>
              <select
                required
                className="form-select text-xs w-full bg-slate-950 border-gray-700 text-white rounded-lg p-2.5"
                value={settleAccountantKey}
                onChange={(e) => setSettleAccountantKey(e.target.value as 'MOIN' | 'SAMRAT')}
              >
                <option value="MOIN">
                  {isBn ? 'মঈন উদ্দীন (প্রধান হিসাবরক্ষক)' : 'Moin Uddin (Primary Accountant)'} — (
                  {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                  {groupedCustody.moinTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </option>
                <option value="SAMRAT">
                  {isBn ? 'সম্রাট (সহকারী হিসাবরক্ষক)' : 'Samrat (Secondary Accountant)'} — (
                  {isBn ? 'মোট তহবিল: ৳' : 'Total Custody: ৳'}
                  {groupedCustody.samratTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </option>
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                {isBn
                  ? 'নির্বাচিত পেমেন্ট মাধ্যম অনুসারে অভ্যন্তরীণ কাস্টডি চ্যানেল স্বয়ংক্রিয়ভাবে সমন্বয় করা হবে।'
                  : 'The internal custody channel will be automatically reconciled based on the selected payment method.'}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button type="button" onClick={() => setSettlingExit(null)} className="btn btn-secondary btn-sm">{t('Cancel')}</button>
              <button type="button" onClick={handleConfirmSettleExit} disabled={settleSubmitting} className="btn btn-primary btn-sm bg-amber-600 hover:bg-amber-500">
                {settleSubmitting ? t('Processing...') : isBn ? 'কাস্টডি থেকে বিতরণ সম্পন্ন করুন' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT ROSTER CSV MODAL */}
      {showImport && (
        <div className="modal-overlay">
          <div className="modal-content max-w-3xl">
            <div className="p-5 border-b border-white/10 flex justify-between">
              <div>
                <h3 className="font-bold text-white">{t('Import approved 2024 member roster')}</h3>
                <p className="text-xs text-gray-400 mt-1">{t('1. Choose CSV · 2. Review validation · 3. Save once.')}</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400"><X size={19} /></button>
            </div>
            <div className="p-5 space-y-4">
              {formError && <div className="alert alert-error">{formError}</div>}
              <input type="file" accept=".csv,text/csv" className="form-input" onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportPreview(null); }} />
              {!importPreview ? (
                <button className="btn btn-primary" disabled={!importFile} onClick={previewImport}>{t('Preview and validate')}</button>
              ) : (
                <>
                  <div className={`rounded-xl p-3 text-sm ${importPreview.summary.invalid ? 'bg-rose-500/10 text-rose-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
                    {importPreview.summary.total} rows · {importPreview.summary.valid} valid · {importPreview.summary.invalid} invalid
                  </div>
                  <div className="max-h-56 overflow-auto table-container">
                    <table className="data-table">
                      <thead><tr><th>Member ID</th><th>Name</th><th>Mobile</th><th>Validation</th></tr></thead>
                      <tbody>
                        {importPreview.rows.map((row) => (
                          <tr key={row.memberId}><td>{row.memberId}</td><td>{row.name}</td><td>{row.phone}</td><td>{row.errors.length ? row.errors.join(' ') : 'Ready'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <label className="form-label">{t('Temporary activation password (12+ characters; expires after 30 days)')}</label>
                  <input className="form-input" type="password" autoComplete="new-password" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} />
                  {!importPreview.summary.invalid && (
                    <button className="btn btn-primary" disabled={submitting} onClick={saveImport}>{submitting ? 'Saving…' : t('Confirm and save to database')}</button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DETAILS MODAL FOR REGULAR MEMBER */}
      {showDetailsModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7 max-w-lg">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold font-mono text-sm">
                  {selectedMember.memberId.replace('NSF', '')}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white leading-none">{selectedMember.name}</h3>
                  <span className="text-xs text-gray-400 font-mono">{selectedMember.memberId}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDetailsModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2.5 mt-4 text-xs">
              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">{t('Board Designation / Role')}:</span>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                    DESIGNATION_CONFIG[selectedMember.designation || 'GENERAL_MEMBER']?.badgeClass ||
                    'bg-gray-500/20 text-gray-300'
                  }`}
                >
                  {t(
                    DESIGNATION_CONFIG[selectedMember.designation || 'GENERAL_MEMBER']?.label ||
                      selectedMember.designation ||
                      'General Member'
                  )}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">{t('Membership Status')}:</span>
                <span
                  className={`badge ${
                    selectedMember.status === 'ACTIVE'
                      ? 'badge-active'
                      : selectedMember.status === 'INACTIVE'
                      ? 'badge-inactive'
                      : 'badge-dropped'
                  }`}
                >
                  {t(selectedMember.status)}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">{t('Phone Number')}:</span>
                <span className="text-white font-semibold">{selectedMember.phone}</span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-slate-900/60 border border-white/5">
                <span className="text-gray-400 font-medium">{t('Shares')}:</span>
                <span className="text-white font-semibold">
                  {selectedMember.status === 'DROPPED' ? 0 : selectedMember.shareCount}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-100/70 font-medium">{t('Monthly Payable')}:</span>
                <span className="text-emerald-300 font-semibold">
                  ৳{' '}
                  {selectedMember.status === 'DROPPED'
                    ? '0.00'
                    : new Intl.NumberFormat('en-BD').format(selectedMember.monthlyPayable)}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-5">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setShowDetailsModal(false)}
              >
                {t('Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD MEMBER */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">{t('Register New Member')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {t('Sequential ID assigned:')} <strong className="text-blue-400 font-mono">{nextIdPreview}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">{t('Full Name')} *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  placeholder={t('e.g. Moin Bin Nizam')}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">{t('Primary Phone')} *</label>
                  <input
                    type="tel"
                    required
                    className="form-input"
                    placeholder="017xxxxxxxx"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t('Email Address')}</label>
                  <input
                    type="email"
                    className="form-input"
                    placeholder="member@nsfoundation.org"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">{t('Initial Shares')} *</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    className="form-input"
                    value={formData.initialShareCount}
                    onChange={(e) => setFormData({ ...formData, initialShareCount: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t('Join Date')} *</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={formData.joinDate}
                    onChange={(e) => setFormData({ ...formData, joinDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setShowAddModal(false)}
                >
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-xs">
                  {submitting ? t('Registering...') : t('Create Member')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT MEMBER */}
      {showEditModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-white">{t('Edit Member Profile')}</h3>
                <span className="font-mono text-blue-400 font-bold text-xs">{selectedMember.memberId}</span>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded-md"
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-400 text-xs mb-4">
                {formError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="form-group mb-0">
                <label className="form-label">{t('Full Name')} *</label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="form-group mb-0">
                  <label className="form-label">{t('Primary Phone')} *</label>
                  <input
                    type="tel"
                    required
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="form-group mb-0">
                  <label className="form-label">{t('Status')}</label>
                  <select
                    className="form-select bg-slate-900 border-gray-700 text-white"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  >
                    <option value="ACTIVE">{t('ACTIVE')}</option>
                    <option value="INACTIVE">{t('INACTIVE')}</option>
                    <option value="DROPPED">{t('DROPPED')}</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-white/10">
                <button
                  type="button"
                  className="btn btn-secondary text-xs"
                  onClick={() => setShowEditModal(false)}
                >
                  {t('Cancel')}
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary text-xs">
                  {submitting ? t('Saving...') : t('Save Changes')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DROP MEMBER */}
      {showDeleteModal && selectedMember && (
        <div className="modal-overlay">
          <div className="modal-content p-7 max-w-md">
            <h3 className="text-lg font-bold text-red-400 mb-2">{t('Confirm Drop Member')}</h3>
            <p className="text-xs text-gray-300 leading-relaxed mb-6">
              {t('Are you sure you want to mark member')}{' '}
              <strong className="text-white">{selectedMember.name}</strong> ({selectedMember.memberId}){' '}
              {t('as DROPPED? This will set all future monthly dues to ৳0.00.')}
            </p>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                className="btn btn-secondary text-xs"
                onClick={() => setShowDeleteModal(false)}
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                disabled={submitting}
                className="btn btn-danger text-xs"
                onClick={handleDeleteConfirm}
              >
                {submitting ? t('Processing...') : t('Confirm Drop')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* UPLOAD RECEIPT VOUCHER MODAL */}
      {uploadingExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="glass-card max-w-md w-full p-6 space-y-4 border border-blue-500/30 shadow-2xl rounded-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Upload className="text-blue-400" size={20} />
                <h3 className="text-base font-bold text-white">
                  {isBn ? 'পেমেন্ট রিসিট ভাউচার আপলোড' : 'Upload Payment Receipt Voucher'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setUploadingExit(null)}
                className="text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleUploadReceiptSubmit} className="space-y-4">
              <div className="p-3 rounded-xl border border-white/10 bg-slate-950/60 text-xs">
                <span className="text-gray-400 block">{isBn ? 'সদস্য' : 'Member'}:</span>
                <strong className="text-white font-mono text-sm">{uploadingExit.memberId?.memberId}</strong>
                <span className="text-gray-200 ml-2 font-medium">{uploadingExit.memberId?.name}</span>
                <span className="block text-emerald-400 font-semibold mt-1">
                  {isBn ? 'নিট রিফান্ড পরিশোধ' : 'Net Refund Paid'}: ৳ {Number(uploadingExit.netAmount || 0).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isBn ? 'রিসিট ভাউচার নং / রেফারেন্স' : 'Receipt Voucher Number / Reference'}
                </label>
                <input
                  type="text"
                  required
                  className="form-input text-xs w-full font-mono"
                  placeholder="e.g. RCPT-EXIT-007"
                  value={uploadReceiptNo}
                  onChange={(e) => setUploadReceiptNo(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 mb-1">
                  {isBn ? 'রিসিট ডকুমেন্ট ফাইল (PDF, PNG, JPG)' : 'Receipt File (PDF, PNG, JPG)'} *
                </label>
                <input
                  type="file"
                  required
                  accept=".pdf,image/png,image/jpeg,image/webp"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="form-input text-xs w-full file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600/30 file:text-blue-300 hover:file:bg-blue-600/50"
                />
                <span className="text-[11px] text-gray-400 mt-1 block">
                  {isBn
                    ? 'বিকাশ স্টেটমেন্ট, ব্যাংক ডিপোজিট স্লিপ অথবা ক্যাশ রিসিট ভাউচারের ছবি বা পিডিএফ'
                    : 'Attach scan, photo, or PDF of bank transfer or bKash disbursal'}
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setUploadingExit(null)}
                  className="btn btn-secondary btn-sm"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={uploadSubmitting || !uploadFile}
                  className="btn btn-primary btn-sm flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500"
                >
                  {uploadSubmitting ? t('Uploading...') : isBn ? 'আপলোড ও সেভ করুন' : 'Upload & Link Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DOCUMENT PREVIEW LIGHTBOX */}
      {previewDocUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
          <div className="glass-card max-w-4xl w-full p-5 space-y-3 border border-white/20 shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FileText className="text-blue-400" size={20} />
                <div>
                  <h3 className="text-sm font-bold text-white truncate max-w-md">
                    {previewDocTitle || 'Payment Receipt Voucher'}
                  </h3>
                  <span className="text-[11px] text-gray-400">NS Foundation Audit Document</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDocUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm text-xs flex items-center gap-1"
                  title="Open original in new tab"
                >
                  <ExternalLink size={13} />
                  <span>{isBn ? 'নতুন ট্যাবে খুলুন' : 'Open Tab'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewDocUrl(null);
                    setPreviewDocTitle('');
                  }}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-xl bg-slate-950/80 border border-white/10 flex items-center justify-center min-h-[420px] p-4">
              {previewDocError ? (
                <div className="text-center space-y-3 max-w-md p-6 rounded-2xl bg-slate-900/90 border border-amber-500/30">
                  <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-400 mx-auto flex items-center justify-center">
                    <FileText size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-white">
                    {isBn ? 'রিসিট ডকুমেন্ট ফাইলটি স্টোরেজে পাওয়া যায়নি' : 'Receipt Document Not Found on Server'}
                  </h4>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    {isBn
                      ? 'এই সেটেলমেন্টের জন্য বাহ্যিক স্লিপ ফাইলটি এখনও আপলোড করা হয়নি অথবা ডিস্ক স্টোরেজে অনুপস্থিত। আপনি অফিসিয়াল ভাউচার দেখতে পারেন।'
                      : 'The receipt attachment file is missing or not yet uploaded. You can view or print the generated official voucher.'}
                  </p>
                  <div className="flex justify-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        const target = exits.find(
                          (ex) => ex.documentName === previewDocTitle || ex.receiptUrl?.includes(previewDocUrl.split('?')[0])
                        );
                        setPreviewDocUrl(null);
                        setPreviewDocError(false);
                        if (target) setViewingExit(target);
                      }}
                      className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                    >
                      <Eye size={14} />
                      <span>{isBn ? 'অফিসিয়াল ভাউচার দেখুন' : 'View Official Voucher'}</span>
                    </button>
                  </div>
                </div>
              ) : previewDocUrl.toLowerCase().includes('.pdf') ? (
                <iframe
                  src={previewDocUrl}
                  title="PDF Preview"
                  className="w-full h-[65vh] rounded-lg border-0"
                  onError={() => setPreviewDocError(true)}
                />
              ) : (
                <img
                  src={previewDocUrl}
                  alt="Receipt Document Preview"
                  className="max-h-[68vh] max-w-full object-contain rounded-lg shadow-lg"
                  onError={() => setPreviewDocError(true)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default MembersPage;
