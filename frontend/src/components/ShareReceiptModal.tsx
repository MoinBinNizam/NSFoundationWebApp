import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Download,
  Send,
  Image as ImageIcon,
  MessageCircle,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Loader2,
  Phone,
} from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';
import { useLogo } from '../context/LogoContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

export interface SharePaymentData {
  _id: string;
  receiptNumber: string;
  receiptId?: string;
  memberId: {
    _id?: string;
    name: string;
    memberId: string;
    phone: string;
    linkedPhones?: string[];
    address?: string;
  };
  receiverId?: {
    _id?: string;
    name: string;
    email?: string;
    accountantType?: string;
  };
  custodyAccountId?: {
    _id?: string;
    name: string;
    channel?: string;
  };
  paymentDate: string;
  totalAmount: number;
  principalAmount?: number;
  penaltyAmount?: number;
  advanceAmount?: number;
  cashoutCharge?: number;
  paymentMethod: string;
  transactionReference?: string;
  status: string;
  notes?: string;
}

export interface ShareAllocationItem {
  targetMonth: string;
  allocationType: string;
  amount: number;
  description?: string;
}

interface ShareReceiptModalProps {
  payment: SharePaymentData | null;
  allocations?: ShareAllocationItem[];
  onClose: () => void;
}

// Convert phone number to international WhatsApp format (e.g. 88017XXXXXXXX)
export function formatWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('880')) return digits;
  if (digits.startsWith('0')) return '88' + digits;
  if (digits.length === 10) return '880' + digits;
  return digits;
}

// Helper to format English amount to Bengali words/taka phrase
function formatTaka(amount: number): string {
  return `৳ ${Number(amount || 0).toLocaleString('en-BD', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export const ShareReceiptModal: React.FC<ShareReceiptModalProps> = ({
  payment,
  allocations: initialAllocations,
  onClose,
}) => {
  const { t } = usePreferences();
  const { logo } = useLogo();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [allocations, setAllocations] = useState<ShareAllocationItem[]>(initialAllocations || []);
  const [loadingAllocations, setLoadingAllocations] = useState<boolean>(false);
  const [copiedText, setCopiedText] = useState<boolean>(false);
  const [copiedImage, setCopiedImage] = useState<boolean>(false);
  const [generatingImage, setGeneratingImage] = useState<boolean>(false);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string>('');

  // Initialize selected phone and load allocations if needed
  useEffect(() => {
    if (!payment) return;

    // Default to member primary phone
    setSelectedPhone(payment.memberId?.phone || '');

    // Fetch full allocations if not provided
    if (!initialAllocations || initialAllocations.length === 0) {
      setLoadingAllocations(true);
      apiRequest<{ payment: SharePaymentData; allocations: ShareAllocationItem[] }>(
        `/payments/${payment._id}`
      )
        .then((res) => {
          if (res.data?.allocations) {
            setAllocations(res.data.allocations);
          }
        })
        .catch((err) => console.warn('Could not load allocations for share modal:', err))
        .finally(() => setLoadingAllocations(false));
    } else {
      setAllocations(initialAllocations);
    }
  }, [payment, initialAllocations]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (imageBlobUrl) {
        URL.revokeObjectURL(imageBlobUrl);
      }
    };
  }, [imageBlobUrl]);

  // Load real rendered image blob for preview when image tab is opened
  useEffect(() => {
    let active = true;
    if (activeTab === 'image' && !imageBlobUrl) {
      void generateReceiptImage().then((blob) => {
        if (active && blob) {
          const url = URL.createObjectURL(blob);
          setImageBlobUrl(url);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [activeTab, imageBlobUrl, payment, allocations, logo]);

  if (!payment) return null;

  // Build list of phone options (primary + linkedPhones)
  const phoneOptions: string[] = [];
  if (payment.memberId?.phone) {
    phoneOptions.push(payment.memberId.phone);
  }
  if (payment.memberId?.linkedPhones && payment.memberId.linkedPhones.length > 0) {
    payment.memberId.linkedPhones.forEach((lp) => {
      if (lp && !phoneOptions.includes(lp)) {
        phoneOptions.push(lp);
      }
    });
  }

  // Construct formatted Bengali text confirmation notice
  const buildConfirmationMessage = (): string => {
    const memberName = payment.memberId?.name || 'সম্মানিত সদস্য';
    const memberId = payment.memberId?.memberId || '';
    const receiptNo = payment.receiptNumber || 'N/A';
    const payDate = payment.paymentDate
      ? new Date(payment.paymentDate).toLocaleDateString('bn-BD', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })
      : '';
    const amountStr = formatTaka(payment.totalAmount);

    // Period / Months
    let monthsStr = '';
    if (allocations && allocations.length > 0) {
      const months = Array.from(new Set(allocations.map((a) => a.targetMonth).filter(Boolean)));
      if (months.length > 0) {
        monthsStr = months.join(', ');
      }
    }

    const method = payment.paymentMethod || 'BKASH';
    const methodLabel =
      method === 'BKASH'
        ? 'বিকাশ (bKash)'
        : method === 'NAGAD'
        ? 'নগদ (Nagad)'
        : method === 'BANK_TRANSFER'
        ? 'ব্যাংক ট্রান্সফার'
        : 'নগদ ক্যাশ';

    const lines = [
      `📋 *এন এস ফাউন্ডেশন সমবায় সমিতি*`,
      `*পেমেন্ট প্রাপ্তি স্বীকার ও কনফার্মেশন রসিদ*`,
      `---------------------------------------`,
      `সম্মানিত সদস্য,`,
      `আপনার পেমেন্টটি সফলভাবে গৃহীত ও যাচাইপূর্বক লেজারে রেকর্ড করা হয়েছে।`,
      ``,
      `👤 *নাম:* ${memberName}`,
      `🆔 *সদস্য আইডি:* ${memberId}`,
      `🧾 *রসিদ নং:* ${receiptNo}`,
      `📅 *পরিশোধের তারিখ:* ${payDate}`,
      `💰 *আদায়কৃত টাকা:* ${amountStr}`,
    ];

    if (monthsStr) {
      lines.push(`🗓️ *পরিশোধিত মাস/কিস্তি:* ${monthsStr}`);
    }

    let methodLine = `💳 *পরিশোধের মাধ্যম:* ${methodLabel}`;
    if (payment.transactionReference) {
      methodLine += ` (TrxID: ${payment.transactionReference})`;
    }
    lines.push(methodLine);

    if (payment.receiverId?.name) {
      lines.push(`✍️ *আদায়কারী হিসাবরক্ষক:* ${payment.receiverId.name}`);
    }

    if (allocations && allocations.length > 0) {
      lines.push(``);
      lines.push(`*বরাদ্দের বিবরণ:*`);
      allocations.slice(0, 5).forEach((al) => {
        lines.push(
          ` • ${al.targetMonth || ''} [${al.allocationType || 'মাসিক চাঁদা'}]: ৳ ${Number(
            al.amount || 0
          ).toLocaleString('en-BD')}`
        );
      });
      if (allocations.length > 5) {
        lines.push(` • এবং আরও ${allocations.length - 5}টি বরাদ্দ...`);
      }
    }

    lines.push(`---------------------------------------`);
    lines.push(`সমিতির কার্যক্রমে সক্রিয় অংশগ্রহণের জন্য আপনাকে আন্তরিক ধন্যবাদ।`);
    lines.push(`— এন এস ফাউন্ডেশন`);

    return lines.join('\n');
  };

  const confirmationMessage = buildConfirmationMessage();

  // Action: 1-Click WhatsApp Direct
  const handleSendWhatsApp = () => {
    const cleanPhone = formatWhatsAppPhone(selectedPhone || payment.memberId?.phone || '');
    const encoded = encodeURIComponent(confirmationMessage);
    if (cleanPhone) {
      window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encoded}`, '_blank');
    } else {
      window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    }
  };

  // Action: Copy Text to Clipboard
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(confirmationMessage);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 3000);
    } catch (e) {
      console.error('Failed to copy text:', e);
    }
  };

  // Generate Image Voucher on Canvas
  const generateReceiptImage = async (): Promise<Blob | null> => {
    setGeneratingImage(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 760; // Crisp landscape card
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 1. Background gradient (Deep modern executive theme)
      const bgGradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bgGradient.addColorStop(0, '#0f172a');
      bgGradient.addColorStop(0.5, '#1e293b');
      bgGradient.addColorStop(1, '#0f172a');
      ctx.fillStyle = bgGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Card border
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

      // Inner accent frame
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 2;
      ctx.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);

      // Top Header bar background
      ctx.fillStyle = 'rgba(37, 99, 235, 0.15)';
      ctx.fillRect(34, 34, canvas.width - 68, 110);
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.35)';
      ctx.beginPath();
      ctx.moveTo(34, 144);
      ctx.lineTo(canvas.width - 34, 144);
      ctx.stroke();

      // Brand Logo
      let textStartX = 60;
      if (logo) {
        try {
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = logo;
          });
          if (img.complete && img.naturalWidth > 0) {
            const scale = Math.min(80 / img.naturalWidth, 80 / img.naturalHeight);
            const w = img.naturalWidth * scale;
            const h = img.naturalHeight * scale;
            ctx.drawImage(img, 60, 48 + (80 - h) / 2, w, h);
            textStartX = 160;
          }
        } catch {
          // ignore logo load error
        }
      }

      // Title & Subtitle
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px Arial';
      ctx.fillText('NS FOUNDATION COOPERATIVE SOCIETY', textStartX, 82);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px Arial';
      ctx.fillText('OFFICIAL MEMBER CONTRIBUTION & PAYMENT RECEIPT', textStartX, 112);

      // Receipt Number Badge (Top Right)
      ctx.fillStyle = 'rgba(59, 130, 246, 0.25)';
      ctx.beginPath();
      ctx.roundRect(canvas.width - 320, 52, 260, 46, 10);
      ctx.fill();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(payment.receiptNumber, canvas.width - 190, 82);
      ctx.textAlign = 'left';

      // 2-Column Details Layout
      // Left Box: Member Info
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.roundRect(60, 170, 520, 240, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('MEMBER INFORMATION', 85, 202);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px Arial';
      ctx.fillText(payment.memberId?.name || 'Unknown', 85, 240);

      ctx.fillStyle = '#60a5fa';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`ID: ${payment.memberId?.memberId || 'N/A'}`, 85, 272);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '15px Arial';
      ctx.fillText(`Phone: ${payment.memberId?.phone || 'N/A'}`, 85, 302);

      const periodStr =
        allocations && allocations.length > 0
          ? Array.from(new Set(allocations.map((a) => a.targetMonth).filter(Boolean))).join(', ')
          : 'Monthly Installment';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 15px Arial';
      ctx.fillText(`Period: ${periodStr}`, 85, 336);

      // Right Box: Transaction & Payment Info
      ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.beginPath();
      ctx.roundRect(620, 170, 520, 240, 14);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('TRANSACTION DETAILS', 645, 202);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px Arial';
      ctx.fillText(
        `Date: ${new Date(payment.paymentDate).toLocaleDateString('en-GB')}`,
        645,
        240
      );

      ctx.fillStyle = '#cbd5e1';
      ctx.font = '16px Arial';
      ctx.fillText(`Method: ${payment.paymentMethod || 'CASH'}`, 645, 272);

      if (payment.transactionReference) {
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 15px monospace';
        ctx.fillText(`TrxID: ${payment.transactionReference}`, 645, 302);
      } else {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px Arial';
        ctx.fillText(`Receiver: ${payment.receiverId?.name || 'Accountant'}`, 645, 302);
      }

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px Arial';
      ctx.fillText(`Custody: ${payment.custodyAccountId?.name || 'Society Treasury'}`, 645, 336);

      // Bottom Banner: Total Amount Received (Full Width)
      const amtGrad = ctx.createLinearGradient(60, 430, canvas.width - 60, 540);
      amtGrad.addColorStop(0, 'rgba(16, 185, 129, 0.18)');
      amtGrad.addColorStop(1, 'rgba(5, 150, 105, 0.28)');
      ctx.fillStyle = amtGrad;
      ctx.beginPath();
      ctx.roundRect(60, 430, canvas.width - 120, 140, 16);
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 14px Arial';
      ctx.fillText('TOTAL AMOUNT CONFIRMED & RECEIVED', 90, 468);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 46px Arial';
      ctx.fillText(formatTaka(payment.totalAmount), 90, 526);

      // Verification Badge (Right side of amount banner)
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(canvas.width - 160, 500, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('✓', canvas.width - 160, 510);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#a7f3d0';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('VERIFIED DEPOSIT', canvas.width - 160, 546);
      ctx.textAlign = 'left';

      // Footer
      ctx.fillStyle = '#64748b';
      ctx.font = '13px Arial';
      ctx.fillText(
        'Generated via NS Foundation Web App • Authoritative Financial Ledger Confirmation',
        60,
        640
      );

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(
        `Authorized Accountant: ${payment.receiverId?.name || user?.name || 'Society Treasury'}`,
        canvas.width - 60,
        640
      );
      ctx.textAlign = 'left';

      return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
    } catch (e) {
      console.error('Failed to generate receipt image:', e);
      return null;
    } finally {
      setGeneratingImage(false);
    }
  };

  // Action: Copy Image to Clipboard (Ctrl+V into Messenger or WhatsApp)
  const handleCopyImage = async () => {
    try {
      const blob = await generateReceiptImage();
      if (!blob) return;

      if (navigator.clipboard && window.ClipboardItem) {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 3000);
      } else {
        // Fallback: download if clipboard item not supported
        handleDownloadImage();
      }
    } catch (err) {
      console.error('Could not copy image to clipboard:', err);
      // Fallback to download
      handleDownloadImage();
    }
  };

  // Action: Download Image
  const handleDownloadImage = async () => {
    const blob = await generateReceiptImage();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt-${payment.receiptNumber}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  // Action: Native Share (Mobile / Tablet / Share Sheet)
  const handleNativeShare = async () => {
    try {
      const blob = await generateReceiptImage();
      if (!blob) return;

      const file = new File([blob], `receipt-${payment.receiptNumber}.png`, {
        type: 'image/png',
      });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `NS Foundation Receipt ${payment.receiptNumber}`,
          text: confirmationMessage,
          files: [file],
        });
      } else if (navigator.share) {
        await navigator.share({
          title: `NS Foundation Receipt ${payment.receiptNumber}`,
          text: confirmationMessage,
        });
      } else {
        handleCopyImage();
      }
    } catch (e) {
      console.warn('Native share cancelled or failed:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="glass-card w-full max-w-2xl flex flex-col rounded-3xl border border-white/15 shadow-2xl overflow-hidden bg-slate-900">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0">
              <Share2 size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{t('পেমেন্ট কনফার্মেশন রসিদ শেয়ার')}</span>
              </h3>
              <p className="text-xs text-gray-400 truncate">
                {t('রসিদ নং')}: <strong className="text-blue-300 font-mono">{payment.receiptNumber}</strong> •{' '}
                {payment.memberId?.name} ({payment.memberId?.memberId})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
            title={t('Close')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Selection (Text vs Image) */}
        <div className="px-5 pt-3 pb-2 bg-slate-950/60 border-b border-white/5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'text'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageCircle size={14} />
            <span>{t('টেক্সট কনফার্মেশন (WhatsApp / Messenger)')}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
              activeTab === 'image'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <ImageIcon size={14} />
            <span>{t('ছবির রসিদ ভাউচার (Image Card)')}</span>
          </button>
        </div>

        {/* Tab 1: Text Confirmation */}
        {activeTab === 'text' && (
          <div className="p-5 space-y-4">
            {/* Phone Selection (if member has multiple numbers) */}
            {phoneOptions.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-300 flex items-center gap-1">
                  <Phone size={12} className="text-emerald-400" />
                  <span>{t('প্রেরক / সদস্যের নম্বর নির্বাচন করুন')}:</span>
                </label>
                <select
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-mono"
                >
                  {phoneOptions.map((p, idx) => (
                    <option key={idx} value={p}>
                      {p} {idx === 0 ? `(${t('মূল নম্বর')})` : `(${t('সংযুক্ত নম্বর')})`}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Chat Bubble Message Preview */}
            <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4 space-y-2 relative">
              <div className="flex items-center justify-between text-[11px] text-gray-400 border-b border-white/5 pb-2">
                <span className="font-semibold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>{t('কনফার্মেশন মেসেজ প্রিভিউ')}</span>
                  {loadingAllocations && (
                    <span className="text-[10px] text-blue-400 flex items-center gap-1 font-normal ml-2">
                      <Loader2 size={10} className="animate-spin" />
                      <span>{t('বরাদ্দ লোড হচ্ছে...')}</span>
                    </span>
                  )}
                </span>
                <span className="font-mono text-gray-400">
                  {selectedPhone ? `To: ${selectedPhone}` : t('No phone')}
                </span>
              </div>
              <pre className="text-xs font-sans text-gray-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                {confirmationMessage}
              </pre>
            </div>

            {/* 1-Click Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="btn btn-primary text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20"
                >
                  <Send size={14} />
                  <span>{t('সরাসরি WhatsApp-এ পাঠান')}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyText}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                >
                  {copiedText ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedText ? t('মেসেজ কপি হয়েছে!') : t('মেসেঞ্জারের জন্য কপি করুন')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('image')}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 underline-offset-2 hover:underline ml-auto"
              >
                <ImageIcon size={13} />
                <span>{t('রসিদটি ছবি আকারে পাঠান')} →</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Image Voucher Card */}
        {activeTab === 'image' && (
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    {t('Digital Voucher Card Preview')}
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {t('HD Image Ready')}
                </span>
              </div>

              {/* Rendered Canvas Image Preview */}
              {imageBlobUrl ? (
                <div className="w-full flex items-center justify-center p-2 bg-slate-950/80 rounded-xl border border-white/10 overflow-hidden">
                  <img
                    src={imageBlobUrl}
                    alt="Receipt Voucher"
                    className="max-h-72 w-auto object-contain rounded-lg shadow-2xl"
                  />
                </div>
              ) : (
                /* Visual Card Mock during generation */
                <div className="p-4 rounded-xl bg-slate-900/90 border border-blue-500/30 text-white space-y-3 shadow-xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <div>
                      <h4 className="text-xs font-extrabold text-blue-300">
                        NS FOUNDATION COOPERATIVE SOCIETY
                      </h4>
                      <p className="text-[10px] text-gray-400">Official Member Payment Voucher</p>
                    </div>
                    <span className="font-mono text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {payment.receiptNumber}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-gray-400 block">{t('Member Name')}</span>
                      <strong className="text-white text-sm">{payment.memberId?.name}</strong>
                      <p className="text-[11px] text-blue-300 font-mono">ID: {payment.memberId?.memberId}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-gray-400 block">{t('Payment Date')}</span>
                      <strong className="text-gray-200">
                        {new Date(payment.paymentDate).toLocaleDateString()}
                      </strong>
                      <p className="text-[11px] text-gray-400">{payment.paymentMethod}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-emerald-300 uppercase font-bold block">
                        {t('Total Received')}
                      </span>
                      <span className="text-lg font-black text-emerald-400">
                        {formatTaka(payment.totalAmount)}
                      </span>
                    </div>
                    <div className="text-right flex items-center gap-1.5 text-xs text-emerald-300 font-bold">
                      <ShieldCheck size={16} />
                      <span>{t('Verified')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 1-Click Action Buttons for Image */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={generatingImage}
                  onClick={handleCopyImage}
                  className="btn btn-primary text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20"
                  title="মেসেঞ্জার বা হোয়াটসঅ্যাপে সরাসরি পেস্ট (Ctrl+V) করার জন্য ছবি কপি করুন"
                >
                  {generatingImage ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : copiedImage ? (
                    <Check size={14} className="text-emerald-300" />
                  ) : (
                    <Copy size={14} />
                  )}
                  <span>{copiedImage ? t('ছবি কপি হয়েছে! (Ctrl+V দিন)') : t('ছবি কপি করুন (Messenger/WhatsApp)')}</span>
                </button>

                <button
                  type="button"
                  disabled={generatingImage}
                  onClick={handleDownloadImage}
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                  title="রসিদের ছবি ডাউনলোড করুন"
                >
                  <Download size={14} />
                  <span>{t('ছবি ডাউনলোড')}</span>
                </button>

                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                  <button
                    type="button"
                    disabled={generatingImage}
                    onClick={handleNativeShare}
                    className="btn btn-secondary text-xs flex items-center gap-1.5 text-purple-300 border-purple-500/30 hover:bg-purple-500/15"
                  >
                    <Share2 size={14} />
                    <span>{t('শেয়ার')}</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary text-xs ml-auto"
              >
                {t('Close')}
              </button>
            </div>
          </div>
        )}

        {/* Footer Advice */}
        <div className="px-5 py-3 border-t border-white/10 bg-slate-900/90 text-xs text-gray-400 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">
            {activeTab === 'text'
              ? t('WhatsApp বোতামে চাপ দিলে সরাসরি সদস্যের নম্বরে মেসেজসহ হোয়াটসঅ্যাপ চালু হবে।')
              : t('ছবি কপি করে Facebook Messenger বা WhatsApp চ্যাটে সরাসরি Ctrl+V দিয়ে পেস্ট করতে পারবেন।')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm text-xs"
          >
            {t('Done')}
          </button>
        </div>
      </div>
    </div>
  );
};
