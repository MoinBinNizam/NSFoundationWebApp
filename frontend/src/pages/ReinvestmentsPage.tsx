import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, BanknoteArrowDown, CircleDollarSign, Eye, Landmark, RefreshCw, Repeat2, WalletCards, X } from 'lucide-react';

interface Wallet {
  _id: string;
  name: string;
  accountNumber?: string;
  derivedBalance: number;
  totalInflow: number;
  totalOutflow: number;
  totalProceedsReceived: number;
  totalReinvested: number;
  totalLiquidated: number;
}

interface Project {
  _id: string;
  projectId: string;
  name: string;
  status: string;
  externalEntity?: string;
}

interface Account {
  _id: string;
  name: string;
  accountType: string;
  channel: string;
  derivedBalance: number;
}

interface Chain {
  _id: string;
  sourceProjectId: { projectId: string; name: string; status: string };
  destinationProjectId: { projectId: string; name: string; status: string };
  walletAccountId: { name: string; channel: string };
  newAccountantCustodyAccountId?: { name: string; channel: string };
  reinvestedAmount: number;
  newAccountantFunds: number;
  totalCapitalToDestination: number;
  date: string;
  notes?: string;
  approvedBy?: { name: string; email: string };
}

interface Movement {
  _id: string;
  movementType: 'IN' | 'OUT';
  amount: number;
  sourceType: string;
  description?: string;
  date: string;
  performedBy?: { name: string };
}

interface Stats {
  totalWalletHoldings: number;
  totalReinvestedProceeds: number;
  totalLiquidatedToAccountants: number;
  activeReinvestmentChains: number;
  totalWallets: number;
  totalReinvestmentEvents: number;
}

const money = (amount: number) => `৳${Number(amount || 0).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);

export const ReinvestmentsPage: React.FC = () => {
  const { user } = useAuth();
  const canOperate = user?.role === 'ADMIN' || user?.role === 'ACCOUNTANT';
  const [tab, setTab] = useState<'wallets' | 'chains' | 'audit'>('wallets');
  const [stats, setStats] = useState<Stats | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reinvestWallet, setReinvestWallet] = useState<Wallet | null>(null);
  const [liquidateWallet, setLiquidateWallet] = useState<Wallet | null>(null);
  const [ledgerWallet, setLedgerWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<Movement[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [reinvestForm, setReinvestForm] = useState({ sourceProjectId: '', destinationProjectId: '', amount: '', freshAmount: '', accountantAccountId: '', date: today(), notes: '' });
  const [liquidateForm, setLiquidateForm] = useState({ accountId: '', amount: '', date: today(), notes: '' });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsResult, walletsResult, projectsResult, accountsResult, chainsResult] = await Promise.all([
        apiRequest<Stats>('/reinvestments/stats'),
        apiRequest<Wallet[]>('/reinvestments/wallets'),
        apiRequest<Project[]>('/investments/projects'),
        apiRequest<Account[]>('/custody/accounts?isActive=true'),
        apiRequest<Chain[]>('/reinvestments/chains'),
      ]);
      setStats(statsResult.data);
      setWallets(walletsResult.data);
      setProjects(projectsResult.data);
      setAccounts(accountsResult.data);
      setChains(chainsResult.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load project wallet data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!notice && !error) return;
    const timer = window.setTimeout(() => { setNotice(null); setError(null); }, 6000);
    return () => window.clearTimeout(timer);
  }, [notice, error]);

  const openReinvest = (wallet: Wallet) => {
    setReinvestWallet(wallet);
    setReinvestForm({ sourceProjectId: '', destinationProjectId: '', amount: String(wallet.derivedBalance || ''), freshAmount: '', accountantAccountId: '', date: today(), notes: '' });
  };

  const openLiquidate = (wallet: Wallet) => {
    setLiquidateWallet(wallet);
    setLiquidateForm({ accountId: '', amount: String(wallet.derivedBalance || ''), date: today(), notes: '' });
  };

  const openLedger = async (wallet: Wallet) => {
    setLedgerWallet(wallet);
    setLedger([]);
    try {
      setLedgerLoading(true);
      const result = await apiRequest<Movement[]>(`/reinvestments/wallets/${wallet._id}/ledger?limit=100`);
      setLedger(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load wallet ledger.');
    } finally {
      setLedgerLoading(false);
    }
  };

  const submitReinvestment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reinvestWallet || !reinvestForm.sourceProjectId || !reinvestForm.destinationProjectId || !Number(reinvestForm.amount)) {
      setError('Select the source and destination projects, then enter a wallet amount.');
      return;
    }
    if (Number(reinvestForm.freshAmount) > 0 && !reinvestForm.accountantAccountId) {
      setError('Select an accountant custody account for the fresh top-up.');
      return;
    }
    try {
      setSaving(true);
      const result = await apiRequest('/reinvestments/execute', {
        method: 'POST',
        body: JSON.stringify({
          sourceProjectId: reinvestForm.sourceProjectId,
          destinationProjectId: reinvestForm.destinationProjectId,
          walletAccountId: reinvestWallet._id,
          reinvestedAmount: Number(reinvestForm.amount),
          newAccountantFunds: Number(reinvestForm.freshAmount) || 0,
          newAccountantCustodyAccountId: reinvestForm.accountantAccountId || undefined,
          date: reinvestForm.date,
          notes: reinvestForm.notes,
        }),
      });
      setNotice(result.message || 'Reinvestment recorded successfully.');
      setReinvestWallet(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to execute reinvestment.');
    } finally { setSaving(false); }
  };

  const submitLiquidation = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!liquidateWallet || !liquidateForm.accountId || !Number(liquidateForm.amount)) {
      setError('Select a destination accountant account and enter an amount.');
      return;
    }
    try {
      setSaving(true);
      const result = await apiRequest('/reinvestments/liquidate', {
        method: 'POST',
        body: JSON.stringify({ walletAccountId: liquidateWallet._id, destinationAccountId: liquidateForm.accountId, amount: Number(liquidateForm.amount), date: liquidateForm.date, notes: liquidateForm.notes }),
      });
      setNotice(result.message || 'Wallet liquidation completed.');
      setLiquidateWallet(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to liquidate wallet funds.');
    } finally { setSaving(false); }
  };

  const accountantAccounts = accounts.filter((account) => account.accountType === 'ACCOUNTANT_CUSTODY');
  const activeProjects = projects.filter((project) => !['CLOSED', 'DEFAULTED'].includes(project.status));
  const statCards: Array<{ label: string; value: number | undefined; icon: React.ElementType; color: string; count?: boolean }> = [
    { label: 'In organization wallets', value: stats?.totalWalletHoldings, icon: WalletCards, color: 'text-violet-300' },
    { label: 'Reinvested proceeds', value: stats?.totalReinvestedProceeds, icon: Repeat2, color: 'text-blue-300' },
    { label: 'Liquidated to accountants', value: stats?.totalLiquidatedToAccountants, icon: Landmark, color: 'text-amber-300' },
    { label: 'Active capital chains', value: stats?.activeReinvestmentChains, icon: CircleDollarSign, color: 'text-emerald-300', count: true },
  ];

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-emerald-400"><Repeat2 size={20} /><span className="text-xs font-bold uppercase tracking-wider">Issue #9</span></div>
        <h2 className="mt-1 text-2xl font-bold text-white">Project Wallets & Reinvestment</h2>
        <p className="mt-1 text-sm text-gray-400">Keep external partner proceeds separate, trace their lineage, and reinvest or liquidate them with a complete ledger trail.</p>
      </div>
      <button onClick={load} disabled={loading} className="btn-secondary inline-flex items-center justify-center gap-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</button>
    </div>

    {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
    {notice && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {statCards.map(({ label, value, icon: Icon, color, count }) => <div key={label} className="rounded-2xl border border-white/10 bg-[#111827] p-5 shadow-lg">
        <div className="flex items-start justify-between"><p className="text-xs font-medium text-gray-400">{label}</p><Icon size={20} className={color} /></div>
        <p className="mt-3 text-2xl font-bold text-white">{count ? (value ?? 0) : money(Number(value))}</p>
      </div>)}
    </div>

    <div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
      {([['wallets', 'Organization Wallets'], ['chains', 'Reinvestment Chains'], ['audit', 'Reinvestment Audit']] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === key ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>{label}</button>)}
    </div>

    {tab === 'wallets' && <div className="grid gap-4 lg:grid-cols-2">
      {loading ? <div className="col-span-full py-12 text-center text-sm text-gray-400">Loading wallets…</div> : wallets.length === 0 ? <div className="col-span-full rounded-xl border border-dashed border-white/15 p-10 text-center text-sm text-gray-400">No external wallet accounts exist yet. Record a project return to an external wallet, or create one from Accountant Custody.</div> : wallets.map((wallet) => <div key={wallet._id} className="rounded-2xl border border-white/10 bg-[#111827] p-5">
        <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{wallet.name}</p><p className="mt-1 text-xs text-gray-500">{wallet.accountNumber || 'External partner wallet'} · segregated custody</p></div><div className="rounded-lg bg-violet-500/10 p-2 text-violet-300"><WalletCards size={20} /></div></div>
        <p className="mt-5 text-3xl font-bold text-white">{money(wallet.derivedBalance)}</p><p className="mt-1 text-xs text-gray-500">Live balance: ledger inflows less outflows</p>
        <div className="mt-5 grid grid-cols-3 gap-2 border-y border-white/10 py-4 text-center"><div><p className="text-[10px] uppercase text-gray-500">Proceeds</p><p className="mt-1 text-sm font-semibold text-emerald-300">{money(wallet.totalProceedsReceived)}</p></div><div><p className="text-[10px] uppercase text-gray-500">Reinvested</p><p className="mt-1 text-sm font-semibold text-blue-300">{money(wallet.totalReinvested)}</p></div><div><p className="text-[10px] uppercase text-gray-500">Liquidated</p><p className="mt-1 text-sm font-semibold text-amber-300">{money(wallet.totalLiquidated)}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2.5 pt-1">
          <button onClick={() => openLedger(wallet)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-600/70 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 shadow-sm transition-colors hover:border-slate-500 hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400/40"><Eye size={14} />Ledger</button>
          {canOperate && <>
            <button onClick={() => openReinvest(wallet)} disabled={wallet.derivedBalance <= 0} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 shadow-sm transition-colors hover:bg-emerald-500/25 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 disabled:cursor-not-allowed disabled:opacity-45"><Repeat2 size={14} />Reinvest</button>
            <button onClick={() => openLiquidate(wallet)} disabled={wallet.derivedBalance <= 0} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 shadow-sm transition-colors hover:bg-amber-500/25 focus:outline-none focus:ring-2 focus:ring-amber-400/40 disabled:cursor-not-allowed disabled:opacity-45"><BanknoteArrowDown size={14} />Liquidate</button>
          </>}
        </div>
      </div>)}
    </div>}

    {(tab === 'chains' || tab === 'audit') && <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111827]">
      <div className="border-b border-white/10 px-5 py-4"><h3 className="font-semibold text-white">{tab === 'chains' ? 'Capital lineage' : 'Immutable reinvestment events'}</h3><p className="mt-1 text-xs text-gray-500">{chains.length} recorded event{chains.length === 1 ? '' : 's'}</p></div>
      <div className="divide-y divide-white/10">{loading ? <p className="p-8 text-center text-sm text-gray-400">Loading…</p> : chains.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">No wallet reinvestment has been recorded yet.</p> : chains.map((chain) => <div key={chain._id} className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap items-center gap-2 text-sm"><span className="rounded bg-gray-800 px-2.5 py-1.5 font-medium text-gray-200">{chain.sourceProjectId?.projectId} · {chain.sourceProjectId?.name}</span><ArrowRight size={16} className="text-gray-500" /><span className="rounded bg-violet-500/10 px-2.5 py-1.5 text-violet-200">{chain.walletAccountId?.name}</span><ArrowRight size={16} className="text-gray-500" /><span className="rounded bg-emerald-500/10 px-2.5 py-1.5 font-medium text-emerald-200">{chain.destinationProjectId?.projectId} · {chain.destinationProjectId?.name}</span></div><div className="text-left lg:text-right"><p className="font-bold text-white">{money(chain.totalCapitalToDestination)}</p><p className="text-xs text-gray-500">{new Date(chain.date).toLocaleDateString()}</p></div></div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-400"><span>Wallet proceeds: <b className="text-white">{money(chain.reinvestedAmount)}</b></span>{chain.newAccountantFunds > 0 && <span>Fresh top-up: <b className="text-white">{money(chain.newAccountantFunds)}</b> from {chain.newAccountantCustodyAccountId?.name}</span>}<span>Approved by: {chain.approvedBy?.name || '—'}</span></div>{chain.notes && <p className="mt-2 text-xs text-gray-500">{chain.notes}</p>}
      </div>)}</div>
    </div>}

    {reinvestWallet && <Modal title={`Reinvest from ${reinvestWallet.name}`} onClose={() => setReinvestWallet(null)}><form onSubmit={submitReinvestment} className="space-y-4"><p className="rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">Available external-wallet balance: <b>{money(reinvestWallet.derivedBalance)}</b>. Only the wallet portion is deducted from this wallet.</p><Select label="Source matured project" value={reinvestForm.sourceProjectId} onChange={(value) => setReinvestForm({ ...reinvestForm, sourceProjectId: value })} options={projects.map((project) => [project._id, `${project.projectId} — ${project.name}`])} /><Select label="Destination project" value={reinvestForm.destinationProjectId} onChange={(value) => setReinvestForm({ ...reinvestForm, destinationProjectId: value })} options={activeProjects.map((project) => [project._id, `${project.projectId} — ${project.name}`])} /><div className="grid gap-4 sm:grid-cols-2"><Input label="Wallet amount" type="number" min="0.01" max={reinvestWallet.derivedBalance} value={reinvestForm.amount} onChange={(value) => setReinvestForm({ ...reinvestForm, amount: value })} /><Input label="Fresh accountant top-up (optional)" type="number" min="0" value={reinvestForm.freshAmount} onChange={(value) => setReinvestForm({ ...reinvestForm, freshAmount: value })} /></div>{Number(reinvestForm.freshAmount) > 0 && <Select label="Top-up custody account" value={reinvestForm.accountantAccountId} onChange={(value) => setReinvestForm({ ...reinvestForm, accountantAccountId: value })} options={accountantAccounts.map((account) => [account._id, `${account.name} (${money(account.derivedBalance)})`])} />}<Input label="Date" type="date" value={reinvestForm.date} onChange={(value) => setReinvestForm({ ...reinvestForm, date: value })} /><TextArea label="Notes" value={reinvestForm.notes} onChange={(value) => setReinvestForm({ ...reinvestForm, notes: value })} /><Submit saving={saving} label="Record reinvestment" /></form></Modal>}
    {liquidateWallet && <Modal title={`Liquidate ${liquidateWallet.name}`} onClose={() => setLiquidateWallet(null)}><form onSubmit={submitLiquidation} className="space-y-4"><p className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">This creates a linked OUT movement from the external wallet and IN movement to accountant custody. It is not income.</p><Select label="Destination accountant custody" value={liquidateForm.accountId} onChange={(value) => setLiquidateForm({ ...liquidateForm, accountId: value })} options={accountantAccounts.map((account) => [account._id, `${account.name} (${money(account.derivedBalance)})`])} /><div className="grid gap-4 sm:grid-cols-2"><Input label="Amount" type="number" min="0.01" max={liquidateWallet.derivedBalance} value={liquidateForm.amount} onChange={(value) => setLiquidateForm({ ...liquidateForm, amount: value })} /><Input label="Date" type="date" value={liquidateForm.date} onChange={(value) => setLiquidateForm({ ...liquidateForm, date: value })} /></div><TextArea label="Purpose / notes" value={liquidateForm.notes} onChange={(value) => setLiquidateForm({ ...liquidateForm, notes: value })} /><Submit saving={saving} label="Liquidate to accountant custody" /></form></Modal>}
    {ledgerWallet && <Modal title={`${ledgerWallet.name} ledger`} onClose={() => setLedgerWallet(null)} wide><div className="mb-4 rounded-lg bg-gray-900/70 p-3 text-sm text-gray-300">Current balance: <b className="text-white">{money(ledgerWallet.derivedBalance)}</b></div><div className="max-h-[55vh] overflow-auto">{ledgerLoading ? <p className="p-6 text-center text-sm text-gray-400">Loading ledger…</p> : ledger.length === 0 ? <p className="p-6 text-center text-sm text-gray-400">No movements recorded.</p> : <table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-[#111827] text-gray-500"><tr><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Amount</th><th className="p-3">Source</th><th className="p-3">Description</th></tr></thead><tbody className="divide-y divide-white/10">{ledger.map((movement) => <tr key={movement._id}><td className="p-3 text-gray-400">{new Date(movement.date).toLocaleDateString()}</td><td className={`p-3 font-semibold ${movement.movementType === 'IN' ? 'text-emerald-300' : 'text-red-300'}`}>{movement.movementType}</td><td className="p-3 font-semibold text-white">{money(movement.amount)}</td><td className="p-3 text-gray-400">{movement.sourceType.replace(/_/g, ' ')}</td><td className="p-3 text-gray-400">{movement.description || '—'}</td></tr>)}</tbody></table>}</div></Modal>}
  </div>;
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/10 bg-[#111827] shadow-2xl ${wide ? 'max-w-5xl' : 'max-w-xl'}`}><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><h3 className="font-semibold text-white">{title}</h3><button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Close"><X size={19} /></button></div><div className="p-5">{children}</div></div></div>;
const Select: React.FC<{ label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }> = ({ label, value, onChange, options }) => <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-300">{label}</span><select required value={value} onChange={(event) => onChange(event.target.value)} className="input-field w-full"><option value="">Select…</option>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
const Input: React.FC<{ label: string; type: string; value: string; onChange: (value: string) => void; min?: string | number; max?: string | number }> = ({ label, type, value, onChange, min, max }) => <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-300">{label}</span><input required={type !== 'number' || min !== 0} type={type} min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} className="input-field w-full" /></label>;
const TextArea: React.FC<{ label: string; value: string; onChange: (value: string) => void }> = ({ label, value, onChange }) => <label className="block"><span className="mb-1.5 block text-xs font-medium text-gray-300">{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} rows={3} className="input-field w-full resize-y" /></label>;
const Submit: React.FC<{ saving: boolean; label: string }> = ({ saving, label }) => <button disabled={saving} type="submit" className="btn-primary flex w-full items-center justify-center gap-2">{saving && <RefreshCw size={16} className="animate-spin" />}{saving ? 'Saving…' : label}</button>;
