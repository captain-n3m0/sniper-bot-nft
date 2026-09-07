import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, LockKeyhole, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { WalletLogin } from '../components/WalletLogin';

type Capability = 'sniper' | 'scheduler' | 'dropStages' | 'walletManager' | 'fundDisperser' | 'gasEstimator';
type CapabilityMap = Record<Capability, boolean>;
type Grant = { address: string; enabled: boolean; isAdmin: boolean; maxWallets: number; capabilities: CapabilityMap; createdAt: string; updatedAt: string };

const capabilityLabels: Record<Capability, string> = {
  sniper: 'Sniper minting',
  scheduler: 'Scheduled minting',
  dropStages: 'Drop stages & eligibility',
  walletManager: 'Wallet manager',
  fundDisperser: 'Fund disperser',
  gasEstimator: 'Gas estimator',
};

const allCapabilities = (): CapabilityMap => ({
  sniper: true,
  scheduler: true,
  dropStages: true,
  walletManager: true,
  fundDisperser: true,
  gasEstimator: true,
});

const shortAddress = (address: string) => `${address.slice(0, 8)}...${address.slice(-6)}`;

export const Admin = () => {
  const [token, setToken] = useState(() => localStorage.getItem('auth_token') || '');
  const [address, setAddress] = useState(() => localStorage.getItem('auth_address') || '');
  const [isAdmin, setIsAdmin] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selected, setSelected] = useState<Grant | null>(null);
  const [newAddress, setNewAddress] = useState('');
  const [newCapabilities, setNewCapabilities] = useState<CapabilityMap>(allCapabilities());
  const [newEnabled, setNewEnabled] = useState(true);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newMaxWallets, setNewMaxWallets] = useState(100);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { throw new Error(`Server returned ${response.status} instead of JSON`); }
    if (response.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_address');
      setToken('');
      setAddress('');
    }
    if (!response.ok || !body.success) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  };

  const loadGrants = async () => {
    setLoading(true); setError('');
    try {
      const body = await request('/api/admin/access');
      setIsAdmin(true);
      setGrants(Array.isArray(body.grants) ? body.grants : []);
    } catch (err: any) {
      setIsAdmin(false);
      setError(err?.message || 'Administrator access required');
    } finally { setLoading(false); }
  };

  useEffect(() => { if (token) void loadGrants(); }, [token]);

  const login = (nextAddress: string, nextToken: string) => {
    setAddress(nextAddress); setToken(nextToken); setError('');
  };

  const signOut = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_address');
    setToken('');
    setAddress('');
    setIsAdmin(false);
    setGrants([]);
    setError('');
  };

  const saveGrant = async (grantAddress: string, enabled: boolean, isAdmin: boolean, maxWallets: number, capabilities: CapabilityMap) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(grantAddress)) { setError('Enter a valid EVM wallet address'); return; }
    if (isAdmin && !enabled) { setError('Administrator access requires Access enabled'); return; }
    if (!Number.isSafeInteger(maxWallets) || maxWallets < 0 || maxWallets > 100) { setError('Wallet limit must be an integer between 0 and 100'); return; }
    setSaving(true); setError(''); setNotice('');
    try {
      const body = await request(`/api/admin/access/${grantAddress}`, { method: 'PUT', body: JSON.stringify({ enabled, isAdmin, maxWallets, capabilities }) });
      const saved = body.grant as Grant;
      setGrants((current) => [saved, ...current.filter((item) => item.address.toLowerCase() !== saved.address.toLowerCase())]);
      setSelected(null); setNewAddress(''); setNewCapabilities(allCapabilities()); setNewEnabled(true); setNewIsAdmin(false); setNewMaxWallets(100);
      setNotice(`Access updated for ${shortAddress(saved.address)}.`);
    } catch (err: any) { setError(err?.message || 'Could not save access grant'); }
    finally { setSaving(false); }
  };

  const removeGrant = async (grant: Grant) => {
    if (!window.confirm(`Remove access for ${grant.address}?`)) return;
    setSaving(true); setError('');
    try {
      await request(`/api/admin/access/${grant.address}`, { method: 'DELETE' });
      setGrants((current) => current.filter((item) => item.address.toLowerCase() !== grant.address.toLowerCase()));
      setNotice(`Access removed for ${shortAddress(grant.address)}.`);
    } catch (err: any) { setError(err?.message || 'Could not remove access grant'); }
    finally { setSaving(false); }
  };

  const formCapabilities = selected?.capabilities || newCapabilities;
  const setFormCapabilities = (next: CapabilityMap) => selected ? setSelected({ ...selected, capabilities: next }) : setNewCapabilities(next);
  const formAddress = selected?.address || newAddress;
  const formEnabled = selected?.enabled ?? newEnabled;
  const setFormEnabled = (enabled: boolean) => selected ? setSelected({ ...selected, enabled }) : setNewEnabled(enabled);
  const formIsAdmin = selected?.isAdmin ?? newIsAdmin;
  const setFormIsAdmin = (isAdmin: boolean) => {
    if (isAdmin) setFormEnabled(true);
    if (selected) setSelected({ ...selected, isAdmin });
    else setNewIsAdmin(isAdmin);
  };
  const formMaxWallets = selected?.maxWallets ?? newMaxWallets;
  const setFormMaxWallets = (maxWallets: number) => selected ? setSelected({ ...selected, maxWallets }) : setNewMaxWallets(maxWallets);
  const formTitle = useMemo(() => selected ? `Edit ${shortAddress(selected.address)}` : 'Whitelist wallet', [selected]);

  return <>
    {!token && <WalletLogin onLogin={login} />}
    <Navigation />
    <main className={`min-h-screen bg-[#030303] px-6 pb-24 pt-32 text-white ${!token ? 'opacity-0 pointer-events-none' : ''}`}>
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 flex items-end justify-between gap-4">
          <div><p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-synapse-cyan">Control plane</p><h1 className="font-serif text-5xl">Admin Console</h1><p className="mt-3 text-sm text-neutral-500">Manage wallet access and feature permissions without exposing private keys.</p></div>
          <div className="hidden items-center gap-2 rounded-full border border-synapse-emerald/30 bg-synapse-emerald/5 px-4 py-2 font-mono text-xs uppercase tracking-widest text-synapse-emerald md:flex"><ShieldCheck size={15} /> {shortAddress(address)}</div>
        </div>
        {loading && <div className="flex items-center gap-2 text-sm text-neutral-400"><Loader2 size={16} className="animate-spin" /> Checking administrator permissions…</div>}
        {error && <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300"><div className="flex items-start gap-3"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div><button type="button" onClick={signOut} className="shrink-0 rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:border-synapse-cyan/60">Switch wallet</button></div>}
        {notice && <div className="mb-6 rounded-xl border border-synapse-emerald/25 bg-synapse-emerald/10 p-4 text-sm text-synapse-emerald">{notice}</div>}
        {isAdmin && <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[24px] border border-white/10 bg-white/[0.02] p-7">
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-5"><Plus size={19} className="text-synapse-cyan" /><h2 className="font-serif text-2xl">{formTitle}</h2></div>
            <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-neutral-500">Wallet address</label>
            <input value={formAddress} disabled={Boolean(selected)} onChange={(e) => setNewAddress(e.target.value)} placeholder="0x…" className="mb-5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none focus:border-synapse-cyan/60 disabled:opacity-50" />
            <label className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-neutral-500"><span>Access enabled</span><input type="checkbox" checked={formEnabled} onChange={(e) => setFormEnabled(e.target.checked)} className="h-4 w-4 accent-cyan-400" /></label>
            <label className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-synapse-violet"><span>Administrator access</span><input type="checkbox" checked={formIsAdmin} onChange={(e) => setFormIsAdmin(e.target.checked)} className="h-4 w-4 accent-violet-400" /></label>
            <p className="mb-5 text-xs text-neutral-500">Administrators can manage whitelist grants and feature permissions.</p>
            <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-neutral-500">Execution wallet limit</label>
            <input type="number" min="0" max="100" step="1" value={formMaxWallets} onChange={(e) => setFormMaxWallets(Number(e.target.value))} className="mb-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none focus:border-synapse-cyan/60" />
            <p className="mb-5 text-xs text-neutral-500">Maximum imported execution wallets for this user (0–100).</p>
            <p className="mb-3 font-mono text-xs uppercase tracking-widest text-neutral-500">Allowed functions</p>
            <div className="space-y-2">
              {(Object.keys(capabilityLabels) as Capability[]).map((capability) => <label key={capability} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-300"><span>{capabilityLabels[capability]}</span><input type="checkbox" checked={Boolean(formCapabilities[capability])} onChange={(e) => setFormCapabilities({ ...formCapabilities, [capability]: e.target.checked })} className="h-4 w-4 accent-cyan-400" /></label>)}
            </div>
            <div className="mt-6 flex gap-3"><button disabled={saving} onClick={() => void saveGrant(formAddress, formEnabled, formIsAdmin, formMaxWallets, formCapabilities)} className="flex-1 rounded-xl bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50">{saving ? 'Saving…' : selected ? 'Save changes' : 'Grant access'}</button>{selected && <button disabled={saving} onClick={() => setSelected(null)} className="rounded-xl border border-white/15 px-5 py-3 font-mono text-xs uppercase tracking-widest text-neutral-300">Cancel</button>}</div>
          </section>
          <section className="rounded-[24px] border border-white/10 bg-white/[0.02] p-7"><div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-5"><LockKeyhole size={19} className="text-synapse-violet" /><h2 className="font-serif text-2xl">Whitelisted wallets</h2><span className="ml-auto rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-neutral-400">{grants.length}</span></div>{grants.length === 0 ? <p className="py-10 text-center text-sm text-neutral-500">No wallets have been whitelisted yet.</p> : <div className="space-y-3">{grants.map((grant) => <div key={grant.address} className="rounded-xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-4"><div><p className="font-mono text-sm text-white">{shortAddress(grant.address)}</p><p className={`mt-1 font-mono text-[10px] uppercase tracking-widest ${grant.enabled ? 'text-synapse-emerald' : 'text-red-400'}`}>{grant.enabled ? 'Enabled' : 'Disabled'} • {grant.isAdmin ? 'Administrator • ' : ''}{grant.maxWallets} wallet{grant.maxWallets === 1 ? '' : 's'}</p></div><div className="flex gap-2"><button onClick={() => setSelected(grant)} className="rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:border-synapse-cyan/60">Edit</button><button onClick={() => void removeGrant(grant)} className="rounded-lg border border-red-500/20 p-2 text-red-400 hover:bg-red-500/10"><Trash2 size={14} /></button></div></div><div className="mt-3 flex flex-wrap gap-2">{(Object.keys(capabilityLabels) as Capability[]).filter((capability) => grant.capabilities[capability]).map((capability) => <span key={capability} className="rounded-full bg-synapse-cyan/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-synapse-cyan">{capabilityLabels[capability]}</span>)}</div></div>)}</div>}</section>
        </div>}
      </div>
    </main>
  </>;
};
