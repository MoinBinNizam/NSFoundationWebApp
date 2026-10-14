import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../services/api';
import { usePreferences } from '../context/PreferencesContext';

type Status = 'VERIFIED' | 'REVIEW_REQUIRED' | 'UNRESOLVED';
interface Batch { _id: string; name: string; sourceYear: number; sourceMonth?: string; sourceSheet?: string; sourceReference: string; totalRows: number; verifiedRows: number; reviewRows: number; unresolvedRows: number; createdAt: string; }
interface RecordRow { _id: string; rowNumber: number; recordType: string; status: Status; sourceReference: string; validationErrors: string[]; reviewReason?: string; normalizedData: Record<string, unknown>; }
interface Reconciliation { recordType: string; stagedCount: number; liveCount: number; countDifference: number; stagedAmount: number; liveAmount: number; amountDifference: number; }
const types = ['MEMBER', 'PAYMENT', 'EXPENSE', 'INVESTMENT_RETURN', 'CUSTODY_MOVEMENT'];

export const MigrationPage: React.FC = () => {
  const { t } = usePreferences();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Batch | null>(null);
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation[]>([]);
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', sourceYear: String(new Date().getFullYear()), sourceMonth: '', sourceSheet: '', sourceReference: '', recordType: 'PAYMENT' });
  const load = useCallback(async () => { try { setBatches((await apiRequest<Batch[]>('/migrations/batches')).data || []); } catch (e) { setError((e as Error).message); } }, []);
  const open = useCallback(async (batch: Batch) => { setSelected(batch); setLoading(true); try { const [rows, report] = await Promise.all([apiRequest<RecordRow[]>(`/migrations/batches/${batch._id}/records`), apiRequest<Reconciliation[]>(`/migrations/batches/${batch._id}/reconciliation`)]); setRecords(rows.data || []); setReconciliation(report.data || []); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const upload = async (event: React.FormEvent) => { event.preventDefault(); setError(null); setNotice(null); setLoading(true); try { const response = await apiRequest<Batch>('/migrations/stage', { method: 'POST', body: JSON.stringify({ ...form, sourceYear: Number(form.sourceYear), csvText }) }); setNotice(response.message || t('Source rows staged safely.')); setCsvText(''); await load(); await open(response.data); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } };
  const review = async (row: RecordRow, status: Status) => { const reason = window.prompt(t('Review reason (required):'), row.reviewReason || ''); if (!reason) return; try { await apiRequest(`/migrations/records/${row._id}/review`, { method: 'POST', body: JSON.stringify({ status, reason }) }); if (selected) await open(selected); } catch (e) { setError((e as Error).message); } };
  const readFile = async (file?: File) => { if (!file) return; if (file.size > 900_000) { setError(t('CSV must be smaller than 900 KB.')); return; } setCsvText(await file.text()); };
  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <div className="flex items-center gap-2 text-blue-400 text-xs font-bold uppercase tracking-wide"><ShieldCheck size={16} /> {t('Historical data control')}</div>
        <h1 className="text-2xl font-extrabold text-white mt-1">{t('Historical Migration & Reconciliation')}</h1>
        <p className="text-sm text-gray-400 mt-1">{t('Stage and review source evidence safely. Uploading never posts or changes live financial records.')}</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}{notice && <div className="alert alert-success">{notice}</div>}
      <form onSubmit={upload} className="glass-card p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold text-white"><FileUp size={18} /> {t('Stage a source CSV')}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <input className="form-input" required placeholder={t('Batch name')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="form-input" required type="number" min="2000" max="2100" placeholder={t('Source year')} value={form.sourceYear} onChange={(e) => setForm({ ...form, sourceYear: e.target.value })} />
          <select className="form-select" value={form.recordType} onChange={(e) => setForm({ ...form, recordType: e.target.value })}>{types.map((type) => <option key={type} value={type}>{t(type)}</option>)}</select>
          <input className="form-input" placeholder={t('Source month (YYYY-MM)')} value={form.sourceMonth} onChange={(e) => setForm({ ...form, sourceMonth: e.target.value })} />
          <input className="form-input" placeholder={t('Source sheet')} value={form.sourceSheet} onChange={(e) => setForm({ ...form, sourceSheet: e.target.value })} />
          <input className="form-input" required placeholder={t('Source reference, e.g. 2024-Jan-Sheet-A')} value={form.sourceReference} onChange={(e) => setForm({ ...form, sourceReference: e.target.value })} />
        </div>
        <input className="form-input" required type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} />
        <p className="text-xs text-gray-500">{t('CSV headers: Members need memberId, name, phone. Financial rows need date, amount; payments also need memberId and optional receiptNumber.')}</p>
        <button className="btn btn-primary" disabled={loading || !csvText}><FileUp size={16} /> {t('Stage source safely')}</button>
      </form>
      <section className="glass-card p-5">
        <div className="flex justify-between items-center gap-3">
          <h2 className="font-bold text-white">{t('Migration batches')}</h2>
          <button className="btn btn-secondary btn-sm" onClick={load}><RefreshCw size={15} /> {t('Refresh')}</button>
        </div>
        <div className="table-container mt-4">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <th>{t('Source')}</th>
                <th>{t('Rows')}</th>
                <th>{t('Verified')}</th>
                <th>{t('Needs review')}</th>
                <th>{t('Unresolved')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {batches.length ? batches.map((batch) => (
                <tr key={batch._id}>
                  <td><strong>{batch.name}</strong><span className="block text-xs text-gray-500">{batch.sourceReference} · {batch.sourceYear}</span></td>
                  <td>{batch.totalRows}</td>
                  <td className="text-emerald-400">{batch.verifiedRows}</td>
                  <td className="text-amber-400">{batch.reviewRows}</td>
                  <td className="text-red-400">{batch.unresolvedRows}</td>
                  <td><button className="btn btn-secondary btn-sm" onClick={() => open(batch)}>{t('Review')}</button></td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">{t('No historical source batches have been staged.')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (
        <section className="space-y-5">
          <div className="glass-card p-5">
            <h2 className="font-bold text-white">{t('Reconciliation:')} {selected.name}</h2>
            <div className="table-container mt-4">
              <table className="data-table min-w-[700px]">
                <thead>
                  <tr>
                    <th>{t('Type')}</th>
                    <th>{t('Staged rows')}</th>
                    <th>{t('Live rows')}</th>
                    <th>{t('Staged amount')}</th>
                    <th>{t('Live amount')}</th>
                    <th>{t('Difference')}</th>
                  </tr>
                </thead>
                <tbody>
                  {reconciliation.map((item) => (
                    <tr key={item.recordType}>
                      <td>{t(item.recordType)}</td>
                      <td>{item.stagedCount}</td>
                      <td>{item.liveCount}</td>
                      <td>৳ {item.stagedAmount.toFixed(2)}</td>
                      <td>৳ {item.liveAmount.toFixed(2)}</td>
                      <td className={item.countDifference || item.amountDifference ? 'text-amber-400' : 'text-emerald-400'}>
                        {item.countDifference} {t('rows')} · ৳ {item.amountDifference.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="glass-card p-5">
            <h2 className="font-bold text-white">{t('Source-row review')}</h2>
            <div className="table-container mt-4">
              <table className="data-table min-w-[900px]">
                <thead>
                  <tr>
                    <th>{t('Row')}</th>
                    <th>{t('Type')}</th>
                    <th>{t('Source reference')}</th>
                    <th>{t('Status')}</th>
                    <th>{t('Validation / reason')}</th>
                    <th>{t('Action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row._id}>
                      <td>{row.rowNumber}</td>
                      <td>{t(row.recordType)}</td>
                      <td className="font-mono text-xs">{row.sourceReference}</td>
                      <td><span className={row.status === 'VERIFIED' ? 'badge badge-active' : 'badge badge-warning'}>{t(row.status)}</span></td>
                      <td className="text-xs text-gray-400">{row.validationErrors.join(' ') || row.reviewReason || t('Ready for review.')}</td>
                      <td className="flex gap-2">
                        <button title={t('Verify')} className="btn btn-secondary btn-sm" onClick={() => review(row, 'VERIFIED')}><CheckCircle2 size={15} /></button>
                        <button title={t('Mark unresolved')} className="btn btn-danger btn-sm" onClick={() => review(row, 'UNRESOLVED')}><AlertTriangle size={15} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
