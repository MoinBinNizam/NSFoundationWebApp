import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Landmark, Plus, Save, Settings2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../services/api';

interface ShareSetting {
  value: number;
  description: string;
  updatedAt: string | null;
  isDefault: boolean;
}

interface PenaltyRule {
  _id: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  ratePerShare: number;
  graceDayOfMonth: number;
  description?: string;
}

interface PenaltyWaiver {
  _id: string;
  month: string;
  isGlobal: boolean;
  reason: string;
  memberId?: { memberId: string; name: string } | null;
}

interface GatewayRate {
  _id: string;
  channel: 'BKASH' | 'NAGAD' | 'BANK' | 'CASH' | string;
  cashoutRatePercentage: number;
  fixedFee: number;
  roundingIncrement: number;
  description?: string;
  isDefault?: boolean;
}

interface StaffMember { _id: string; name: string; email: string; accountantType: 'PRIMARY' | 'ASSISTANT'; linkedGatewayChannels?: string[]; gatewayAccessKeyPrefix?: string; status: string; }

const money = new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT', maximumFractionDigits: 0 });

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const [setting, setSetting] = useState<ShareSetting>({ value: 500, description: '', updatedAt: null, isDefault: true });
  const [shareAmount, setShareAmount] = useState('500');
  const [rules, setRules] = useState<PenaltyRule[]>([]);
  const [waivers, setWaivers] = useState<PenaltyWaiver[]>([]);
  const [gatewayRates, setGatewayRates] = useState<GatewayRate[]>([]);
  const [operationalEndYear, setOperationalEndYear] = useState('2028');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showRule, setShowRule] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);
  const [editingGateway, setEditingGateway] = useState<GatewayRate | null>(null);
  const [showStaff, setShowStaff] = useState(false);
  const [newRoutingKey, setNewRoutingKey] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState({ name: '', email: '', password: '', phone: '', accountantType: 'ASSISTANT', linkedGatewayChannels: [] as string[] });
  const [ruleForm, setRuleForm] = useState({ effectiveFrom: '', effectiveTo: '', ratePerShare: '40', graceDayOfMonth: '15', description: '' });
  const [waiverForm, setWaiverForm] = useState({ month: '', reason: '' });

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [shareRes, ruleRes, waiverRes, gatewayRes, endYearRes, staffRes] = await Promise.all([
        apiRequest<ShareSetting>('/settings/share-amount'),
        apiRequest<PenaltyRule[]>('/settings/penalty-rules'),
        apiRequest<PenaltyWaiver[]>('/settings/penalty-waivers'),
        apiRequest<GatewayRate[]>('/settings/gateway-rates'),
        apiRequest<{ value: number }>('/settings/operational-end-year'),
        apiRequest<StaffMember[]>('/auth/staff'),
      ]);
      const loadedSetting = shareRes.data;
      setSetting(loadedSetting);
      setShareAmount(String(loadedSetting.value));
      setRules(ruleRes.data || []);
      setWaivers(waiverRes.data || []);
      setGatewayRates(gatewayRes.data || []);
      setOperationalEndYear(String(endYearRes.data?.value || 2028));
      setStaff(staffRes.data || []);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const saveShareAmount = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setNotice(null); setSaving(true);
    try {
      await apiRequest('/settings/share-amount', { method: 'POST', body: JSON.stringify({ value: Number(shareAmount) }) });
      setNotice('The organization share amount has been updated. New member and payment previews now use this rule.');
      await loadSettings();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally { setSaving(false); }
  };

  const saveEndYear = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { await apiRequest('/settings/operational-end-year', { method: 'POST', body: JSON.stringify({ value: Number(operationalEndYear) }) }); setNotice('Operational end year saved.'); await loadSettings(); }
    catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  const provisionStaff = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(null);
    try { const response = await apiRequest<{ gatewayAccessKey: string }>('/auth/staff', { method: 'POST', body: JSON.stringify(staffForm) }); setShowStaff(false); setNewRoutingKey(response.data.gatewayAccessKey); setNotice('Staff access provisioned. Save the routing key shown below.'); await loadSettings(); }
    catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  const offboardStaff = async (staffMember: StaffMember) => {
    if (!window.confirm(`Immediately revoke access for ${staffMember.name}?`)) return;
    setSaving(true); setError(null);
    try { await apiRequest(`/auth/staff/${staffMember._id}/offboard`, { method: 'POST' }); setNotice(`${staffMember.name}'s sessions and gateway access were revoked.`); await loadSettings(); }
    catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setSaving(true);
    try {
      await apiRequest('/settings/penalty-rules', { method: 'POST', body: JSON.stringify({ ...ruleForm, ratePerShare: Number(ruleForm.ratePerShare), graceDayOfMonth: Number(ruleForm.graceDayOfMonth) }) });
      setShowRule(false); setNotice('Penalty rule saved.'); await loadSettings();
    } catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  const saveWaiver = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null); setSaving(true);
    try {
      await apiRequest('/settings/penalty-waivers', { method: 'POST', body: JSON.stringify({ ...waiverForm, isGlobal: true }) });
      setShowWaiver(false); setNotice('Monthly penalty waiver granted.'); await loadSettings();
    } catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  const saveGatewayRate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingGateway) return;
    setError(null); setSaving(true);
    try {
      await apiRequest('/settings/gateway-rates', {
        method: 'POST',
        body: JSON.stringify({
          channel: editingGateway.channel,
          cashoutRatePercentage: Number(editingGateway.cashoutRatePercentage),
          fixedFee: Number(editingGateway.fixedFee),
          roundingIncrement: Number(editingGateway.roundingIncrement ?? 0),
          description: editingGateway.description || '',
        }),
      });
      setEditingGateway(null); setNotice(`${editingGateway.channel} cash-out rule saved.`); await loadSettings();
    } catch (requestError) { setError((requestError as Error).message); } finally { setSaving(false); }
  };

  if (!isAdmin) {
    return <div className="glass-card max-w-2xl mx-auto p-6 sm:p-8 text-center"><ShieldCheck className="mx-auto text-blue-400 mb-3" size={34} /><h1 className="text-xl font-bold text-white">Organization Settings</h1><p className="text-sm text-gray-400 mt-2">Only organization administrators can view and change society rules.</p></div>;
  }

  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto pb-10">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><div className="flex items-center gap-2 text-blue-400"><Settings2 size={18} /><span className="text-xs font-bold uppercase tracking-wider">Administration · Rulebook</span></div><h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-white">Organization Settings</h1><p className="mt-1 text-sm text-gray-400">Set the live financial rules used across NS Foundation.</p></div>
        <span className="badge badge-active self-start sm:self-auto"><ShieldCheck size={13} /> Admin only</span>
      </header>

      {error && <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 flex gap-2"><AlertTriangle size={17} className="shrink-0 mt-0.5" />{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex gap-2"><CheckCircle2 size={17} className="shrink-0 mt-0.5" />{notice}</div>}

      <section className="glass-card p-5 sm:p-6">
        <div className="flex items-start gap-3"><div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-2.5 text-blue-300"><Landmark size={20} /></div><div><h2 className="font-bold text-white">Monthly share amount</h2><p className="text-sm text-gray-400 mt-1">The amount payable each month for one organization share.</p></div></div>
        <form onSubmit={saveShareAmount} className="mt-5 grid grid-cols-1 sm:grid-cols-[minmax(0,260px)_1fr_auto] gap-3 sm:items-end">
          <div className="form-group mb-0"><label className="form-label">Amount per share (BDT)</label><input className="form-input" type="number" min="1" max="1000000" step="1" required value={shareAmount} onChange={(e) => setShareAmount(e.target.value)} /></div>
          <div className="rounded-xl bg-slate-900/65 border border-white/10 px-4 py-3 text-sm"><span className="text-gray-400">Preview:</span><strong className="text-emerald-300 ml-2">1 share = {money.format(Number(shareAmount) || 0)} / month</strong></div>
          <button className="btn btn-primary min-h-11" disabled={saving || loading} type="submit"><Save size={16} />{saving ? 'Saving...' : 'Save amount'}</button>
        </form>
        <p className="text-xs text-gray-500 mt-3">Recorded ledger entries remain unchanged; this live rule is used by new member and payment calculations. {setting.updatedAt ? `Last updated ${new Date(setting.updatedAt).toLocaleString()}.` : 'Using the default BDT 500 until saved.'}</p>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <h2 className="font-bold text-white">Final Disbursement Window</h2><p className="text-sm text-gray-400 mt-1">Final payouts always start from 2024 and use the January 2025 final share position. Extend this end year only after member consensus.</p>
        <form onSubmit={saveEndYear} className="flex flex-col sm:flex-row gap-3 sm:items-end mt-4"><div className="form-group mb-0 max-w-xs"><label className="form-label">Approved operational end year</label><input className="form-input" type="number" min="2028" max="2100" value={operationalEndYear} onChange={(e) => setOperationalEndYear(e.target.value)} /></div><button className="btn btn-primary" disabled={saving}>Save end year</button></form>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-bold text-white">Accountant Access</h2><p className="text-sm text-gray-400 mt-1">Provision accountant staff, link permitted gateways, and revoke operational access immediately when needed.</p></div><button className="btn btn-secondary self-start" onClick={() => { setStaffForm({ name: '', email: '', password: '', phone: '', accountantType: 'ASSISTANT', linkedGatewayChannels: [] }); setShowStaff(true); }}> <Plus size={16} />Provision staff</button></div>
        <div className="table-container mt-5"><table className="data-table min-w-[760px]"><thead><tr><th>Staff member</th><th>Type</th><th>Linked gateways</th><th>Routing key</th><th>Access</th></tr></thead><tbody>{staff.length ? staff.map((member) => <tr key={member._id}><td><strong>{member.name}</strong><span className="block text-xs text-gray-400">{member.email}</span></td><td>{member.accountantType === 'PRIMARY' ? 'Accountant' : 'Assistant Accountant'}</td><td>{member.linkedGatewayChannels?.join(', ') || 'None'}</td><td className="font-mono text-xs">{member.gatewayAccessKeyPrefix || '—'}•••</td><td><button className="btn btn-danger btn-sm" disabled={saving} onClick={() => offboardStaff(member)}>Revoke</button></td></tr>) : <tr><td colSpan={5} className="text-center text-gray-500 py-7">No provisioned accountant staff.</td></tr>}</tbody></table></div>
        {newRoutingKey && <div className="mt-4 rounded-xl border border-amber-400/35 bg-amber-500/10 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-amber-100">Save this routing key now</p><code className="block mt-2 break-all text-amber-200">{newRoutingKey}</code><p className="text-xs text-amber-100/70 mt-2">For security, it cannot be viewed again after this page is closed.</p></div><button className="text-amber-100" onClick={() => setNewRoutingKey(null)}><X size={18} /></button></div></div>}
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div><h2 className="font-bold text-white">Gateway Cash-out Rules</h2><p className="text-sm text-gray-400 mt-1">Configure the charge applied when a member pays into each receiving channel. The payment screen rounds the calculated charge upward using this rule.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
          {gatewayRates.map((rate) => <article key={rate.channel} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wider font-bold text-blue-300">{rate.channel === 'BKASH' ? 'bKash' : rate.channel === 'NAGAD' ? 'Nagad' : rate.channel === 'BANK' ? 'Bank / CellFin' : 'Physical Cash'}</p><p className="text-xl font-extrabold text-white mt-1">{rate.cashoutRatePercentage}%</p><p className="text-xs text-gray-400 mt-1">+ {money.format(rate.fixedFee)} fixed · {rate.roundingIncrement > 0 ? `round up to BDT ${rate.roundingIncrement}` : 'no rounding'}</p></div><button className="btn btn-secondary btn-sm" onClick={() => setEditingGateway({ ...rate })}>Edit</button></div><p className="text-xs leading-relaxed text-gray-400 mt-4 border-t border-white/5 pt-3">{rate.description || 'No description provided.'}</p></article>)}
        </div>
        <p className="text-xs text-gray-500 mt-4">Default rules: bKash 1.85%, Nagad app 1.49%, and free incoming Islami Bank / CellFin or cash. A rounding value of 0 keeps the exact calculated fee. Choose 1.70% in the Nagad rule when the member uses USSD.</p>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-bold text-white">Penalty Rules</h2><p className="text-sm text-gray-400 mt-1">Set the late-payment rate and grace deadline by effective month.</p></div><button onClick={() => { setRuleForm({ effectiveFrom: '', effectiveTo: '', ratePerShare: '40', graceDayOfMonth: '15', description: '' }); setShowRule(true); }} className="btn btn-secondary self-start sm:self-auto"><Plus size={16} />Add penalty rule</button></div>
        <div className="table-container mt-5"><table className="data-table min-w-[720px]"><thead><tr><th>Effective from</th><th>Effective to</th><th>Rate</th><th>Grace deadline</th><th>Description</th></tr></thead><tbody>{rules.length ? rules.map((rule) => <tr key={rule._id}><td className="font-mono text-blue-300">{rule.effectiveFrom}</td><td>{rule.effectiveTo || 'Ongoing'}</td><td className="font-semibold text-rose-300">{money.format(rule.ratePerShare)} / share</td><td>{rule.graceDayOfMonth}th of month</td><td>{rule.description || '—'}</td></tr>) : <tr><td colSpan={5} className="text-center text-gray-500 py-8">No custom penalty rules saved yet.</td></tr>}</tbody></table></div>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="font-bold text-white">Penalty Waivers</h2><p className="text-sm text-gray-400 mt-1">Document organization-wide months in which penalties are waived.</p></div><button onClick={() => { setWaiverForm({ month: '', reason: '' }); setShowWaiver(true); }} className="btn btn-secondary self-start sm:self-auto"><Plus size={16} />Grant waiver</button></div>
        <div className="table-container mt-5"><table className="data-table min-w-[620px]"><thead><tr><th>Waived month</th><th>Scope</th><th>Reason</th></tr></thead><tbody>{waivers.length ? waivers.map((waiver) => <tr key={waiver._id}><td className="font-mono text-emerald-300">{waiver.month}</td><td><span className="badge badge-active">{waiver.isGlobal ? 'All members' : waiver.memberId?.memberId || 'Specific member'}</span></td><td>{waiver.reason}</td></tr>) : <tr><td colSpan={3} className="text-center text-gray-500 py-8">No waivers recorded.</td></tr>}</tbody></table></div>
      </section>

      {showRule && <div className="modal-overlay"><div className="modal-content max-w-md"><div className="p-5 border-b border-white/10 flex items-center justify-between"><h3 className="font-bold text-white">Add penalty rule</h3><button onClick={() => setShowRule(false)} className="text-gray-400 hover:text-white p-1"><X size={19} /></button></div><form onSubmit={saveRule} className="p-5 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="form-group mb-0"><label className="form-label">Effective from</label><input type="month" className="form-input" required value={ruleForm.effectiveFrom} onChange={(e) => setRuleForm({ ...ruleForm, effectiveFrom: e.target.value })} /></div><div className="form-group mb-0"><label className="form-label">Effective to</label><input type="month" className="form-input" value={ruleForm.effectiveTo} onChange={(e) => setRuleForm({ ...ruleForm, effectiveTo: e.target.value })} /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="form-group mb-0"><label className="form-label">Rate per share</label><input type="number" min="0" className="form-input" required value={ruleForm.ratePerShare} onChange={(e) => setRuleForm({ ...ruleForm, ratePerShare: e.target.value })} /></div><div className="form-group mb-0"><label className="form-label">Grace day</label><input type="number" min="1" max="31" className="form-input" required value={ruleForm.graceDayOfMonth} onChange={(e) => setRuleForm({ ...ruleForm, graceDayOfMonth: e.target.value })} /></div></div><div className="form-group mb-0"><label className="form-label">Description</label><input className="form-input" value={ruleForm.description} onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value })} placeholder="Optional rule note" /></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-secondary" onClick={() => setShowRule(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>Save rule</button></div></form></div></div>}
      {showWaiver && <div className="modal-overlay"><div className="modal-content max-w-md"><div className="p-5 border-b border-white/10 flex items-center justify-between"><h3 className="font-bold text-white">Grant penalty waiver</h3><button onClick={() => setShowWaiver(false)} className="text-gray-400 hover:text-white p-1"><X size={19} /></button></div><form onSubmit={saveWaiver} className="p-5 space-y-4"><div className="form-group mb-0"><label className="form-label">Month to waive</label><input type="month" className="form-input" required value={waiverForm.month} onChange={(e) => setWaiverForm({ ...waiverForm, month: e.target.value })} /></div><div className="form-group mb-0"><label className="form-label">Reason</label><textarea className="form-textarea" rows={3} required value={waiverForm.reason} onChange={(e) => setWaiverForm({ ...waiverForm, reason: e.target.value })} placeholder="Approved organization decision or rationale" /></div><p className="text-xs text-gray-500">This waiver applies to every member for the selected month.</p><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-secondary" onClick={() => setShowWaiver(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>Grant waiver</button></div></form></div></div>}
      {editingGateway && <div className="modal-overlay"><div className="modal-content max-w-md"><div className="p-5 border-b border-white/10 flex items-center justify-between"><div><h3 className="font-bold text-white">Edit {editingGateway.channel} fee rule</h3><p className="text-xs text-gray-400 mt-0.5">Used automatically by payment previews and receipts.</p></div><button onClick={() => setEditingGateway(null)} className="text-gray-400 hover:text-white p-1"><X size={19} /></button></div><form onSubmit={saveGatewayRate} className="p-5 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="form-group mb-0"><label className="form-label">Rate percentage</label><input type="number" step="0.01" min="0" max="100" required className="form-input" value={editingGateway.cashoutRatePercentage} onChange={(e) => setEditingGateway({ ...editingGateway, cashoutRatePercentage: Number(e.target.value) })} /></div><div className="form-group mb-0"><label className="form-label">Fixed fee (BDT)</label><input type="number" step="0.01" min="0" required className="form-input" value={editingGateway.fixedFee} onChange={(e) => setEditingGateway({ ...editingGateway, fixedFee: Number(e.target.value) })} /></div></div><div className="form-group mb-0"><label className="form-label">Round charge up to (BDT)</label><input type="number" min="0" max="1000" step="1" required className="form-input" value={editingGateway.roundingIncrement} onChange={(e) => setEditingGateway({ ...editingGateway, roundingIncrement: Number(e.target.value) })} /><p className="text-[11px] text-gray-500 mt-1">Set 0 for no rounding. For example, BDT 10 turns a bKash fee of BDT 9.25 into BDT 10.</p></div><div className="form-group mb-0"><label className="form-label">Rule description</label><textarea className="form-textarea" rows={3} value={editingGateway.description || ''} onChange={(e) => setEditingGateway({ ...editingGateway, description: e.target.value })} /></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-secondary" onClick={() => setEditingGateway(null)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>Save rule</button></div></form></div></div>}
      {showStaff && <div className="modal-overlay"><div className="modal-content max-w-lg"><div className="p-5 border-b border-white/10 flex justify-between"><div><h3 className="font-bold text-white">Provision accountant access</h3><p className="text-xs text-gray-400 mt-0.5">Creates a secure staff profile and one-time routing key.</p></div><button onClick={() => setShowStaff(false)} className="text-gray-400"><X size={19} /></button></div><form onSubmit={provisionStaff} className="p-5 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="form-group mb-0"><label className="form-label">Full name</label><input className="form-input" required value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} /></div><div className="form-group mb-0"><label className="form-label">Staff type</label><select className="form-select" value={staffForm.accountantType} onChange={(e) => setStaffForm({ ...staffForm, accountantType: e.target.value })}><option value="PRIMARY">Accountant</option><option value="ASSISTANT">Assistant Accountant</option></select></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div className="form-group mb-0"><label className="form-label">Email</label><input type="email" className="form-input" required value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} /></div><div className="form-group mb-0"><label className="form-label">International phone</label><input className="form-input" placeholder="+8801712345678" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} /></div></div><div className="form-group mb-0"><label className="form-label">Temporary password (10+ characters)</label><input type="password" minLength={10} className="form-input" required value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} /></div><div><p className="form-label mb-2">Linked receiving gateways</p><div className="flex flex-wrap gap-3">{['BKASH','NAGAD','BANK','CASH'].map((channel) => <label key={channel} className="text-sm text-gray-300 inline-flex gap-2 items-center"><input type="checkbox" checked={staffForm.linkedGatewayChannels.includes(channel)} onChange={(e) => setStaffForm({ ...staffForm, linkedGatewayChannels: e.target.checked ? [...staffForm.linkedGatewayChannels, channel] : staffForm.linkedGatewayChannels.filter((item) => item !== channel) })} />{channel}</label>)}</div></div><div className="flex justify-end gap-2 pt-2"><button type="button" className="btn btn-secondary" onClick={() => setShowStaff(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}>Provision staff</button></div></form></div></div>}
    </div>
  );
};
