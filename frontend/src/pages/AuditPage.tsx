import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw, Search } from 'lucide-react';
import { apiRequest } from '../services/api';

type AuditItem = { _id: string; action: string; entityName: string; reason?: string; createdAt: string; performedBy?: { name?: string; email?: string; role?: string }; beforeState?: unknown; afterState?: unknown; ipAddress?: string; userAgent?: string };
type Integrity = { passed: boolean; checkedAt: string; custody: { checked: number; variances: unknown[] }; payments: { checked: number; variances: unknown[] }; memberYearAccounts: { checked: number; variances: unknown[] } };

export const AuditPage: React.FC = () => {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [integrity, setIntegrity] = useState<Integrity | null>(null);
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { const response = await apiRequest<{ items: AuditItem[] }>('/audit?limit=100'); setItems(response.data.items); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load the audit log.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const verify = async () => {
    setRunning(true); setError('');
    try { const response = await apiRequest<Integrity>('/audit/verify-integrity', { method: 'POST' }); setIntegrity(response.data); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Integrity check failed.'); }
    finally { setRunning(false); }
  };
  const visible = items.filter((item) => `${item.action} ${item.entityName} ${item.reason || ''} ${item.performedBy?.name || ''}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-6 max-w-7xl">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-blue-400 text-xs font-bold uppercase tracking-wide">Administrator workspace</div><h1 className="text-2xl font-extrabold text-white mt-1">Audit & Security Log</h1><p className="text-sm text-gray-400 mt-1">Append-only operational evidence and read-only financial integrity checks.</p></div><button className="btn btn-primary" onClick={verify} disabled={running}><ShieldCheck size={16}/>{running ? 'Running integrity check…' : 'Run System Integrity Audit'}</button></header>
    {error && <div className="alert alert-error">{error}</div>}
    {integrity && <section className={`glass-card p-5 border ${integrity.passed ? 'border-emerald-500/30' : 'border-amber-500/40'}`}><div className="flex gap-3"><ShieldCheck className={integrity.passed ? 'text-emerald-400' : 'text-amber-400'}/><div><h2 className="font-bold text-white">{integrity.passed ? 'Integrity checks passed' : 'Integrity variances found'}</h2><p className="text-sm text-gray-400">Checked {new Date(integrity.checkedAt).toLocaleString()}. Custody: {integrity.custody.variances.length}/{integrity.custody.checked}; allocations: {integrity.payments.variances.length}/{integrity.payments.checked}; share finalization: {integrity.memberYearAccounts.variances.length}/{integrity.memberYearAccounts.checked} variances.</p></div></div>{!integrity.passed && <pre className="mt-4 overflow-auto rounded-lg bg-black/20 p-3 text-xs text-amber-200">{JSON.stringify(integrity, null, 2)}</pre>}</section>}
    <section className="glass-card overflow-hidden"><div className="p-4 border-b border-white/10 flex flex-col gap-3 sm:flex-row sm:justify-between"><div className="relative max-w-md w-full"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"/><input className="form-input pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search action, entity, reason, or actor"/></div><button className="btn btn-secondary" onClick={load} disabled={loading}><RefreshCw size={16}/> Refresh</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-white/5 text-xs uppercase text-gray-400"><tr><th className="p-4">When</th><th className="p-4">Actor</th><th className="p-4">Action</th><th className="p-4">Entity</th><th className="p-4">Reason</th><th className="p-4"></th></tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-8 text-center text-gray-400">Loading audit events…</td></tr> : visible.length ? visible.map((item) => <tr key={item._id} className="border-t border-white/5 hover:bg-white/[0.02]"><td className="p-4 whitespace-nowrap text-gray-400">{new Date(item.createdAt).toLocaleString()}</td><td className="p-4">{item.performedBy?.name || 'System'}</td><td className="p-4 font-semibold text-blue-300">{item.action}</td><td className="p-4">{item.entityName}</td><td className="p-4 text-gray-400 max-w-sm truncate">{item.reason || '—'}</td><td className="p-4"><button className="text-xs text-blue-300 hover:text-white" onClick={() => setSelected(item)}>Details</button></td></tr>) : <tr><td colSpan={6} className="p-8 text-center text-gray-400">No matching audit events.</td></tr>}</tbody></table></div></section>
    {selected && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setSelected(null)}><section className="glass-card max-w-3xl w-full max-h-[85vh] overflow-auto p-6" onClick={(event) => event.stopPropagation()}><div className="flex justify-between gap-4"><div><h2 className="text-lg font-bold text-white">{selected.action}</h2><p className="text-sm text-gray-400">{selected.entityName} · {new Date(selected.createdAt).toLocaleString()}</p></div><button className="text-gray-400 hover:text-white" onClick={() => setSelected(null)}>Close</button></div><p className="mt-4 text-sm text-gray-300">{selected.reason || 'No reason provided.'}</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs text-gray-300">Before\n{JSON.stringify(selected.beforeState, null, 2)}</pre><pre className="overflow-auto rounded-lg bg-black/30 p-3 text-xs text-gray-300">After\n{JSON.stringify(selected.afterState, null, 2)}</pre></div><p className="mt-4 text-xs text-gray-500">IP: {selected.ipAddress || 'not captured'} · User agent: {selected.userAgent || 'not captured'}</p></section></div>}
  </div>;
};
