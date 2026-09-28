import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../services/api';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  RefreshCw,
  X,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

export interface MemberOption {
  _id: string;
  memberId: string;
  name: string;
  phone: string;
  status: string;
  cashoutDue?: number;
}

export interface CustodyOption {
  _id: string;
  name: string;
  accountType: string;
  channel: string;
  accountNumber?: string;
  cachedBalance: number;
}

export interface ReceiptItem {
  _id: string;
  receiptId: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  gateway: 'BKASH' | 'NAGAD' | 'BANK' | 'UNKNOWN';
  status: 'RECEIPT_UPLOADED' | 'PROCESSING' | 'EXTRACTED' | 'NEEDS_REVIEW' | 'READY_TO_POST' | 'POSTED' | 'OCR_FAILED' | 'MATCH_FAILED' | 'DUPLICATE_SUSPECTED';
  extractedData: {
    memberIdentifier: string | null;
    memberName: string | null;
    senderPhone: string | null;
    receiverAccount: string | null;
    amount: number | null;
    date: string | null;
    transactionId: string | null;
    reference: string | null;
    fee: number | null;
    rawText?: string;
    confidence: number;
    provider: string;
  };
  reviewedData?: {
    memberId?: string | null;
    custodyAccountId?: string | null;
    amount?: number;
    paymentDate?: string;
    paymentMethod?: string;
    cashoutChargePaid?: number;
    transactionReference?: string;
    notes?: string;
  };
  memberMatch?: {
    selectedMemberId: string | null;
    confidence: number;
    strategy: string;
    candidates: Array<{ memberId: string; name: string; phone: string; score: number }>;
  };
  custodyMatch?: {
    selectedCustodyAccountId: string | null;
    confidence: number;
    strategy: string;
    candidates: Array<{ custodyAccountId: string; name: string; accountNumber: string; channel: string; score: number }>;
  };
  duplicateCheck?: {
    isDuplicate: boolean;
    duplicateType: string;
    matchedReceiptId?: string | null;
    matchedPaymentId?: string | null;
    overrideReason?: string | null;
  };
  paymentId?: string | null;
  uploadedAt: string;
}

interface ReceiptOcrManagerProps {
  membersList: MemberOption[];
  custodyAccounts: CustodyOption[];
  onPaymentPosted?: (payment: any) => void;
  onClose?: () => void;
  isModalView?: boolean;
}

export const ReceiptOcrManager: React.FC<ReceiptOcrManagerProps> = ({
  membersList,
  custodyAccounts,
  onPaymentPosted,
  onClose,
  isModalView = false,
}) => {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);
  const [fileBlobUrl, setFileBlobUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);

  // Review Form State
  const [reviewMemberId, setReviewMemberId] = useState<string>('');
  const [reviewCustodyId, setReviewCustodyId] = useState<string>('');
  const [reviewPaymentMethod, setReviewPaymentMethod] = useState<string>('BKASH');
  const [reviewAmount, setReviewAmount] = useState<string>('');
  const [reviewDate, setReviewDate] = useState<string>('');
  const [reviewTrxId, setReviewTrxId] = useState<string>('');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [allocationPreview, setAllocationPreview] = useState<any>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch receipts list
  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    try {
      const query = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await apiRequest<{ receipts: ReceiptItem[] }>(`/payments/receipts${query}`);
      if (res.data?.receipts) {
        setReceipts(res.data.receipts);
      }
    } catch (err: any) {
      console.error('Failed to fetch receipts:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  // Handle file upload
  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(`Uploading ${files.length} receipt${files.length > 1 ? 's' : ''} & running OCR...`);
    setActionError(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('receipts', files[i]);
    }

    try {
      const res = await apiRequest<{ results: ReceiptItem[] }>('/payments/receipts', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(null);
      await fetchReceipts();

      // If single file uploaded, automatically open review
      if (res.data?.results?.length === 1) {
        openReview(res.data.results[0]);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to upload and extract receipt.');
      setUploadProgress(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Open Receipt in Review Modal
  const openReview = async (receipt: ReceiptItem) => {
    setSelectedReceipt(receipt);
    setActionError(null);
    setAllocationPreview(null);

    // Initial form values from review or extracted data
    const memberId =
      receipt.reviewedData?.memberId ||
      receipt.memberMatch?.selectedMemberId ||
      receipt.memberMatch?.candidates?.[0]?.memberId ||
      '';

    const custodyId =
      receipt.reviewedData?.custodyAccountId ||
      receipt.custodyMatch?.selectedCustodyAccountId ||
      receipt.custodyMatch?.candidates?.[0]?.custodyAccountId ||
      custodyAccounts[0]?._id ||
      '';

    const method =
      receipt.reviewedData?.paymentMethod ||
      (receipt.gateway === 'NAGAD' ? 'NAGAD' : receipt.gateway === 'BANK' ? 'BANK_TRANSFER' : 'BKASH');

    const amount = String(receipt.reviewedData?.amount || receipt.extractedData?.amount || '');
    const date = receipt.reviewedData?.paymentDate
      ? new Date(receipt.reviewedData.paymentDate).toISOString().split('T')[0]
      : receipt.extractedData?.date || new Date().toISOString().split('T')[0];

    const trxId = receipt.reviewedData?.transactionReference || receipt.extractedData?.transactionId || '';
    const notes = receipt.reviewedData?.notes || '';

    setReviewMemberId(memberId);
    setReviewCustodyId(custodyId);
    setReviewPaymentMethod(method);
    setReviewAmount(amount);
    setReviewDate(date);
    setReviewTrxId(trxId);
    setReviewNotes(notes);
    setOverrideReason(receipt.duplicateCheck?.overrideReason || '');

    // Fetch file blob for private viewing
    setLoadingFile(true);
    setFileBlobUrl(null);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/payments/receipts/${receipt.receiptId}/file`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setFileBlobUrl(url);
      }
    } catch (e) {
      console.error('Failed to load receipt file stream:', e);
    } finally {
      setLoadingFile(false);
    }

    // Automatically trigger allocation preview if member & amount present
    if (memberId && amount && Number(amount) > 0) {
      try {
        const prevRes = await apiRequest<any>('/payments/preview', {
          method: 'POST',
          body: JSON.stringify({
            memberId,
            custodyAccountId: custodyId,
            paymentDate: date,
            totalAmount: Number(amount),
            paymentMethod: method,
          }),
        });
        if (prevRes.data) {
          setAllocationPreview(prevRes.data);
        }
      } catch (err) {
        console.warn('Could not auto-generate preview:', err);
      }
    }
  };

  const closeReview = () => {
    setSelectedReceipt(null);
    if (fileBlobUrl) {
      URL.revokeObjectURL(fileBlobUrl);
      setFileBlobUrl(null);
    }
  };

  // Live preview calculation when inputs change
  const handleRecalculatePreview = async () => {
    if (!reviewMemberId || !reviewAmount || Number(reviewAmount) <= 0) return;
    try {
      const prevRes = await apiRequest<any>('/payments/preview', {
        method: 'POST',
        body: JSON.stringify({
          memberId: reviewMemberId,
          custodyAccountId: reviewCustodyId,
          paymentDate: reviewDate,
          totalAmount: Number(reviewAmount),
          paymentMethod: reviewPaymentMethod,
        }),
      });
      if (prevRes.data) {
        setAllocationPreview(prevRes.data);
      }
    } catch (err: any) {
      console.warn('Preview calculation error:', err);
    }
  };

  // Save reviewed receipt fields
  const handleSaveReview = async () => {
    if (!selectedReceipt) return;
    setSubmitting(true);
    setActionError(null);

    try {
      const res = await apiRequest<{ receipt: ReceiptItem }>(
        `/payments/receipts/${selectedReceipt.receiptId}/review`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            memberId: reviewMemberId || null,
            custodyAccountId: reviewCustodyId || null,
            paymentMethod: reviewPaymentMethod,
            amount: Number(reviewAmount) || null,
            paymentDate: reviewDate ? new Date(reviewDate) : undefined,
            transactionReference: reviewTrxId,
            notes: reviewNotes,
          }),
        }
      );

      setSelectedReceipt(res.data.receipt);
      await fetchReceipts();
    } catch (err: any) {
      setActionError(err.message || 'Failed to save review details.');
    } finally {
      setSubmitting(false);
    }
  };

  // Post payment to authoritative ledger
  const handleConfirmAndPost = async () => {
    if (!selectedReceipt) return;
    setSubmitting(true);
    setActionError(null);

    // If duplicate suspected, ensure override reason
    if (selectedReceipt.duplicateCheck?.isDuplicate && !overrideReason.trim()) {
      setActionError('Duplicate Suspected: You must provide an authorized override reason before posting.');
      setSubmitting(false);
      return;
    }

    try {
      // If override reason needed, save override first
      if (selectedReceipt.duplicateCheck?.isDuplicate && overrideReason.trim()) {
        await apiRequest(`/payments/receipts/${selectedReceipt.receiptId}/override`, {
          method: 'POST',
          body: JSON.stringify({ overrideReason }),
        });
      }

      // First ensure latest review fields are saved
      await apiRequest(`/payments/receipts/${selectedReceipt.receiptId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({
          memberId: reviewMemberId,
          custodyAccountId: reviewCustodyId,
          paymentMethod: reviewPaymentMethod,
          amount: Number(reviewAmount),
          paymentDate: reviewDate ? new Date(reviewDate) : undefined,
          transactionReference: reviewTrxId,
          notes: reviewNotes,
        }),
      });

      // Authoritative Post
      const postRes = await apiRequest<{ receipt: ReceiptItem; payment: any }>(
        `/payments/receipts/${selectedReceipt.receiptId}/post`,
        { method: 'POST' }
      );

      await fetchReceipts();
      closeReview();

      if (onPaymentPosted && postRes.data?.payment) {
        onPaymentPosted(postRes.data.payment);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to post payment to ledger.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'POSTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} /> Posted
          </span>
        );
      case 'READY_TO_POST':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Sparkles size={12} /> Ready to Post
          </span>
        );
      case 'DUPLICATE_SUSPECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <ShieldAlert size={12} /> Duplicate Suspected
          </span>
        );
      case 'NEEDS_REVIEW':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Clock size={12} /> Needs Review
          </span>
        );
    }
  };

  const getGatewayBadge = (gw: string) => {
    const color =
      gw === 'BKASH'
        ? 'text-pink-400 bg-pink-500/10 border-pink-500/20'
        : gw === 'NAGAD'
        ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
        : gw === 'BANK'
        ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
        : 'text-gray-400 bg-gray-500/10 border-gray-500/20';

    return <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${color}`}>{gw}</span>;
  };

  return (
    <div className={`space-y-6 ${isModalView ? 'p-2' : ''}`}>
      {/* Top Banner & Upload Section */}
      <div className="glass-card p-6 border border-white/10 rounded-2xl relative overflow-hidden bg-gradient-to-br from-slate-900/90 to-blue-950/40">
        {isModalView && onClose && (
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all absolute top-4 right-4"
          >
            <X size={20} />
          </button>
        )}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Sparkles size={14} />
              <span>Smart Optical Extraction</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Payment Receipt OCR &amp; Verification
            </h2>
            <p className="text-gray-400 text-sm max-w-xl">
              Upload bKash, Nagad, or Bank deposit screenshots &amp; PDFs. The system auto-extracts TrxID, amounts, and
              matches candidate members. Review and verify before authoritative posting.
            </p>
          </div>

          {/* Upload Button & Dropzone trigger */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <RefreshCw size={18} className="animate-spin" />
                  <span>Processing OCR...</span>
                </>
              ) : (
                <>
                  <Upload size={18} />
                  <span>Upload Receipt(s)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {uploadProgress && (
          <div className="mt-4 p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2 animate-pulse">
            <RefreshCw size={14} className="animate-spin" />
            <span>{uploadProgress}</span>
          </div>
        )}

        {actionError && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Filter Tabs & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {['ALL', 'NEEDS_REVIEW', 'READY_TO_POST', 'DUPLICATE_SUSPECTED', 'POSTED'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                statusFilter === st
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-900/60 text-gray-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <button
          onClick={fetchReceipts}
          disabled={loading}
          className="p-2 rounded-lg bg-slate-900/60 text-gray-400 hover:text-white transition-all flex items-center gap-1.5 text-xs"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Receipts Queue Table / Cards */}
      {loading ? (
        <div className="glass-card p-12 text-center text-gray-400 text-sm">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-blue-400" />
          Loading receipts queue...
        </div>
      ) : receipts.length === 0 ? (
        <div className="glass-card p-12 text-center space-y-3">
          <FileText size={36} className="mx-auto text-gray-500 opacity-50" />
          <h3 className="text-base font-bold text-white">No Receipts Found</h3>
          <p className="text-gray-400 text-xs max-w-sm mx-auto">
            {statusFilter === 'ALL'
              ? 'Upload a payment screenshot or bank receipt to start the auto-extraction workflow.'
              : `No receipts matching filter "${statusFilter.replace(/_/g, ' ')}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {receipts.map((rcpt) => {
            const matchedMember = membersList.find(
              (m) =>
                m._id === (rcpt.reviewedData?.memberId || rcpt.memberMatch?.selectedMemberId || rcpt.memberMatch?.candidates?.[0]?.memberId)
            );

            return (
              <div
                key={rcpt.receiptId}
                onClick={() => openReview(rcpt)}
                className="glass-card p-5 border border-white/10 rounded-2xl hover:border-blue-500/40 transition-all cursor-pointer space-y-4 group bg-slate-900/60 hover:bg-slate-900/90"
              >
                {/* Header: ID, Gateway, Status */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {getGatewayBadge(rcpt.gateway)}
                    <span className="text-xs font-mono font-bold text-gray-300">{rcpt.receiptId}</span>
                  </div>
                  {getStatusBadge(rcpt.status)}
                </div>

                {/* Amount & Date Card */}
                <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-gray-400 uppercase tracking-wider block">Amount</span>
                    <span className="text-lg font-black text-white">
                      ৳ {rcpt.reviewedData?.amount || rcpt.extractedData?.amount || '0'}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-gray-400 uppercase tracking-wider block">Date</span>
                    <span className="text-xs font-medium text-gray-300">
                      {rcpt.reviewedData?.paymentDate
                        ? new Date(rcpt.reviewedData.paymentDate).toLocaleDateString()
                        : rcpt.extractedData?.date || 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Candidate Member */}
                <div className="space-y-1">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wider block">Candidate Member</span>
                  {matchedMember ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                          {matchedMember.name[0]}
                        </div>
                        <span className="text-xs font-bold text-white truncate max-w-[140px]">
                          {matchedMember.name}
                        </span>
                      </div>
                      <span className="text-[11px] text-blue-400 font-mono font-semibold">
                        {matchedMember.memberId}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-400/80 italic flex items-center gap-1">
                      <AlertTriangle size={12} /> Member Unassigned
                    </span>
                  )}
                </div>

                {/* TrxID / Ref */}
                <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5 text-gray-400">
                  <span className="truncate max-w-[150px]">
                    TrxID: <strong className="text-gray-200">{rcpt.extractedData?.transactionId || 'None'}</strong>
                  </span>
                  <span className="text-blue-400 font-bold group-hover:translate-x-1 transition-transform inline-flex items-center gap-1">
                    Review <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* REVIEW & POST MODAL */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
          <div className="glass-card w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl border border-white/15 shadow-2xl overflow-hidden bg-slate-900">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Review Payment Receipt
                    <span className="text-xs font-mono text-gray-400 font-normal">({selectedReceipt.receiptId})</span>
                  </h3>
                  <p className="text-xs text-gray-400">
                    Verify extracted metadata against the original receipt before posting.
                  </p>
                </div>
              </div>

              <button
                onClick={closeReview}
                className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body: Split View (File vs Form) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto divide-y lg:divide-y-0 lg:divide-x divide-white/10">
              {/* Left Column: Receipt Document Stream View (5 Cols) */}
              <div className="lg:col-span-5 p-5 bg-slate-950/60 flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} /> Original Receipt
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {(selectedReceipt.byteSize / 1024).toFixed(1)} KB · {selectedReceipt.mimeType}
                  </span>
                </div>

                <div className="flex-1 min-h-[300px] max-h-[480px] rounded-2xl border border-white/10 bg-slate-900/80 overflow-hidden flex items-center justify-center relative">
                  {loadingFile ? (
                    <div className="text-center text-gray-400 text-xs">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-blue-400" />
                      Loading protected file...
                    </div>
                  ) : fileBlobUrl ? (
                    selectedReceipt.mimeType === 'application/pdf' ? (
                      <iframe src={fileBlobUrl} title="Receipt PDF" className="w-full h-full min-h-[400px]" />
                    ) : (
                      <img
                        src={fileBlobUrl}
                        alt="Receipt preview"
                        className="w-full h-full object-contain max-h-[460px] p-2"
                      />
                    )
                  ) : (
                    <div className="text-center text-gray-500 text-xs p-4">
                      File stream preview unavailable.
                    </div>
                  )}
                </div>

                {/* Raw Extracted Text Accordion/Snippet */}
                {selectedReceipt.extractedData?.rawText && (
                  <details className="text-xs bg-slate-900/60 p-3 rounded-xl border border-white/5">
                    <summary className="cursor-pointer font-bold text-gray-300 hover:text-white">
                      Raw OCR Text Snippet
                    </summary>
                    <pre className="mt-2 text-[11px] text-gray-400 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
                      {selectedReceipt.extractedData.rawText}
                    </pre>
                  </details>
                )}
              </div>

              {/* Right Column: Interactive Review & Posting Form (7 Cols) */}
              <div className="lg:col-span-7 p-6 space-y-5 overflow-y-auto">
                {/* Duplicate Alert Banner */}
                {selectedReceipt.duplicateCheck?.isDuplicate && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider">
                      <ShieldAlert size={16} /> Suspected Duplicate Detected
                    </div>
                    <p className="text-xs text-rose-300/90 leading-relaxed">
                      This receipt matches an existing transaction or file in the system (Type:{' '}
                      <strong className="underline">{selectedReceipt.duplicateCheck.duplicateType}</strong>).
                    </p>
                    {selectedReceipt.status !== 'POSTED' && (
                      <div>
                        <label className="text-[11px] font-bold text-rose-300 uppercase tracking-wider block mb-1">
                          Accountant Override Reason (Required)
                        </label>
                        <textarea
                          rows={2}
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                          placeholder="State why this receipt is legitimate (e.g. Member re-sent payment confirmation)..."
                          className="w-full px-3 py-2 rounded-xl bg-slate-950/80 border border-rose-500/30 text-white text-xs focus:ring-1 focus:ring-rose-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Review Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Member Selection */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Target Member</span>
                      {selectedReceipt.memberMatch?.confidence ? (
                        <span className="text-[11px] text-emerald-400 font-semibold lowercase">
                          {selectedReceipt.memberMatch.confidence}% match ({selectedReceipt.memberMatch.strategy})
                        </span>
                      ) : null}
                    </label>
                    <select
                      value={reviewMemberId}
                      onChange={(e) => {
                        setReviewMemberId(e.target.value);
                      }}
                      onBlur={handleRecalculatePreview}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Member --</option>
                      {membersList.map((m) => (
                        <option key={m._id} value={m._id}>
                          {m.memberId} - {m.name} ({m.phone})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Custody Account Selection */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Deposit Custody Account
                    </label>
                    <select
                      value={reviewCustodyId}
                      onChange={(e) => {
                        setReviewCustodyId(e.target.value);
                      }}
                      onBlur={handleRecalculatePreview}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Select Custody --</option>
                      {custodyAccounts.map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name} ({c.channel} - ৳{c.cachedBalance.toLocaleString()})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Payment Method */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Payment Method
                    </label>
                    <select
                      value={reviewPaymentMethod}
                      onChange={(e) => setReviewPaymentMethod(e.target.value)}
                      onBlur={handleRecalculatePreview}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="BKASH">bKash</option>
                      <option value="NAGAD">Nagad</option>
                      <option value="BANK_TRANSFER">Bank Deposit / Transfer</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </div>

                  {/* Total Amount */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Total Amount (৳)
                    </label>
                    <input
                      type="number"
                      value={reviewAmount}
                      onChange={(e) => setReviewAmount(e.target.value)}
                      onBlur={handleRecalculatePreview}
                      placeholder="e.g. 2000"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Payment Date */}
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(e) => setReviewDate(e.target.value)}
                      onBlur={handleRecalculatePreview}
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-medium focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Transaction Reference / TrxID */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Transaction Reference / TrxID
                    </label>
                    <input
                      type="text"
                      value={reviewTrxId}
                      onChange={(e) => setReviewTrxId(e.target.value)}
                      placeholder="e.g. 9K72JLA89X"
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Notes */}
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                      Accountant Notes
                    </label>
                    <input
                      type="text"
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Optional notes regarding this deposit..."
                      className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Allocation Preview Card */}
                {allocationPreview && (
                  <div className="bg-slate-950/70 p-4 rounded-2xl border border-blue-500/20 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-400">
                      <span>Authoritative Allocation Breakdown</span>
                      <span>Total: ৳{Number(reviewAmount || 0).toLocaleString()}</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                        <span className="text-[10px] text-gray-400 block uppercase">Principal</span>
                        <strong className="text-emerald-400 text-sm">
                          ৳{allocationPreview.breakdown?.principalAmount || 0}
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                        <span className="text-[10px] text-gray-400 block uppercase">Advance</span>
                        <strong className="text-cyan-400 text-sm">
                          ৳{allocationPreview.breakdown?.advanceAmount || 0}
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                        <span className="text-[10px] text-gray-400 block uppercase">Penalty</span>
                        <strong className="text-amber-400 text-sm">
                          ৳{allocationPreview.breakdown?.penaltyAmount || 0}
                        </strong>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-white/5">
                        <span className="text-[10px] text-gray-400 block uppercase">Fee Paid</span>
                        <strong className="text-purple-400 text-sm">
                          ৳{allocationPreview.breakdown?.cashoutChargePaid || 0}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Error Banner */}
                {actionError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                    <AlertTriangle size={16} />
                    <span>{actionError}</span>
                  </div>
                )}

                {/* Actions Footer */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={closeReview}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>

                  {selectedReceipt.status !== 'POSTED' && (
                    <>
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={handleSaveReview}
                        className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 text-gray-200 hover:bg-slate-700 transition-all disabled:opacity-50"
                      >
                        Save Verification
                      </button>

                      <button
                        type="button"
                        disabled={submitting || !reviewMemberId || !reviewAmount || Number(reviewAmount) <= 0}
                        onClick={handleConfirmAndPost}
                        className="px-6 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                      >
                        {submitting ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Posting to Ledger...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={16} />
                            <span>Confirm &amp; Post Payment</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default ReceiptOcrManager;
