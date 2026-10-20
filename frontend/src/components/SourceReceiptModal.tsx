import React, { useState, useEffect } from 'react';
import { X, Download, FileText, Loader2, AlertCircle, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';
import { usePreferences } from '../context/PreferencesContext';

interface SourceReceiptModalProps {
  receiptId: string | null;
  onClose: () => void;
  receiptNumber?: string;
  memberName?: string;
}

export const SourceReceiptModal: React.FC<SourceReceiptModalProps> = ({
  receiptId,
  onClose,
  receiptNumber,
  memberName,
}) => {
  const { t } = usePreferences();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);

  useEffect(() => {
    if (!receiptId) return;

    let isMounted = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setZoom(1);
    setRotation(0);

    const fetchReceiptFile = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/payments/receipts/${receiptId}/file`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!response.ok) {
          throw new Error(`Failed to load receipt file (Status: ${response.status})`);
        }

        const type = response.headers.get('content-type') || '';
        const blob = await response.blob();
        createdUrl = URL.createObjectURL(blob);

        if (isMounted) {
          setMimeType(type || blob.type);
          setBlobUrl(createdUrl);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Error loading source receipt:', err);
          setError(err.message || 'Failed to load source receipt file.');
          setLoading(false);
        }
      }
    };

    fetchReceiptFile();

    return () => {
      isMounted = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [receiptId]);

  if (!receiptId) return null;

  const isPdf = mimeType.includes('pdf') || mimeType.includes('application/pdf');

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    const ext = isPdf ? 'pdf' : 'jpg';
    a.download = `receipt-${receiptNumber || receiptId}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md">
      <div className="glass-card w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-white/15 shadow-2xl overflow-hidden bg-slate-900">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3 bg-slate-900/95">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-blue-500/20 text-blue-400 shrink-0">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{t('Original Uploaded Receipt (Audit Cross-Check)')}</span>
              </h3>
              <p className="text-xs text-gray-400 truncate">
                {receiptNumber ? `${t('Receipt')}: ${receiptNumber}` : ''}
                {memberName ? ` • ${memberName}` : ''}
                <span className="font-mono text-gray-500 ml-1">({receiptId.slice(-10)})</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {blobUrl && (
              <>
                {!isPdf && (
                  <div className="hidden sm:flex items-center gap-1 bg-slate-800/80 rounded-xl p-1 border border-white/10">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      title={t('Zoom Out')}
                    >
                      <ZoomOut size={15} />
                    </button>
                    <span className="text-[11px] font-mono px-1 text-gray-300">{Math.round(zoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      title={t('Zoom In')}
                    >
                      <ZoomIn size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setRotation((r) => (r + 90) % 360)}
                      className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      title={t('Rotate')}
                    >
                      <RotateCw size={15} />
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn btn-secondary btn-sm flex items-center gap-1 text-xs"
                  title={t('Download Original File')}
                >
                  <Download size={14} />
                  <span className="hidden sm:inline">{t('Download')}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-all shrink-0"
              title={t('Close')}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 bg-slate-950 flex items-center justify-center min-h-[350px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 text-gray-400 py-16">
              <Loader2 size={36} className="animate-spin text-blue-500" />
              <p className="text-xs">{t('Loading encrypted source document...')}</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 max-w-md text-center space-y-2">
              <AlertCircle size={32} className="mx-auto text-rose-400" />
              <p className="text-sm font-semibold">{t('Could not load receipt file')}</p>
              <p className="text-xs text-rose-400/80">{error}</p>
            </div>
          ) : blobUrl && isPdf ? (
            <div className="w-full h-[65vh] rounded-2xl overflow-hidden border border-white/10 bg-slate-900 flex flex-col">
              <iframe
                src={blobUrl}
                title="Source Receipt PDF"
                className="w-full h-full border-none"
              />
            </div>
          ) : blobUrl ? (
            <div className="w-full flex items-center justify-center overflow-auto p-2">
              <img
                src={blobUrl}
                alt="Source Receipt"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-in-out',
                }}
                className="max-h-[68vh] max-w-full object-contain rounded-xl shadow-2xl border border-white/10"
              />
            </div>
          ) : (
            <div className="text-gray-500 text-xs">{t('No source receipt file associated with this payment.')}</div>
          )}
        </div>

        {/* Footer info strip */}
        <div className="px-5 py-3 border-t border-white/10 bg-slate-900/90 text-xs text-gray-400 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-gray-400">
            {t('Cross-check member submission against the financial ledger record.')}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm text-xs ml-auto"
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
};
