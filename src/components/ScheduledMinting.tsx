
import React, { useEffect, useState } from 'react';
import { Clock, CheckCircle2, Server, CheckSquare, Square, ShieldCheck, Loader2 } from 'lucide-react';
import { StoredWallet } from './WalletManager';
import { LiveTransactionFee } from './LiveTransactionFee';

interface ScheduledMintingProps {
  wallets: StoredWallet[];
  addLog: (type: string, message: string, color: string) => void;
  selectedChain: string;
  authToken: string;
  savedOpenSeaApiKey?: string;
  onOpenSeaApiKeyChange?: (value: string) => void;
  initialDraft?: SchedulerDraft | null;
}

export interface SchedulerDraft {
  contractAddress: string;
  targetTime: string;
  openSeaSlug?: string;
  openSeaApiKey?: string;
  isAllowlist?: boolean;
}

interface SchedulerJobSummary {
  id: string;
  status: 'pending' | 'paused' | 'running' | 'completed' | 'failed' | 'stopped';
  chain: string;
  contractAddress: string;
  targetTime?: string;
  targetBlock?: number;
  walletCount: number;
  source: string;
  error?: string;
  wallets?: Array<{ id: string; name: string; address: string; status: string; txHash?: string; error?: string }>;
  parallelWorkers?: number;
}

export const ScheduledMinting = ({ wallets, addLog, selectedChain, authToken, savedOpenSeaApiKey, onOpenSeaApiKeyChange, initialDraft }: ScheduledMintingProps) => {
  const [targetTime, setTargetTime] = useState('');
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());
  
  const [form, setForm] = useState({
    contractAddress: '',
    quantity: '1',
    openSeaSlug: '',
    openSeaApiKey: '',
    isAllowlist: false,
    mintParams: '',
    salt: '',
    signature: ''
  });

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledJob, setScheduledJob] = useState<{taskId: string, targetTime: string, walletCount: number, chain: string, source?: string, openSeaSlug?: string} | null>(null);
  const [error, setError] = useState('');
  const [jobs, setJobs] = useState<SchedulerJobSummary[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobAction, setJobAction] = useState('');
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const loadJobs = async (quiet = false) => {
    if (!authToken) return;
    if (!quiet) setJobsLoading(true);
    try {
      const response = await fetch('/api/scheduler/jobs', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load scheduler jobs');
      setJobs(Array.isArray(data.jobs) ? data.jobs : []);
    } catch (loadError) {
      if (!quiet) setError(loadError instanceof Error ? loadError.message : 'Could not load scheduler jobs');
    } finally {
      if (!quiet) setJobsLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
    const timer = setInterval(() => void loadJobs(true), 2_000);
    return () => clearInterval(timer);
  }, [authToken]);

  useEffect(() => {
    if (savedOpenSeaApiKey && !form.openSeaApiKey) {
      setForm((current) => ({ ...current, openSeaApiKey: savedOpenSeaApiKey }));
    }
  }, [savedOpenSeaApiKey]);

  useEffect(() => {
    if (!initialDraft) return;
    setTargetTime(initialDraft.targetTime);
    setForm((current) => ({
      ...current,
      contractAddress: initialDraft.contractAddress,
      openSeaSlug: initialDraft.openSeaSlug || '',
      openSeaApiKey: initialDraft.openSeaApiKey || '',
      isAllowlist: Boolean(initialDraft.isAllowlist),
    }));
  }, [initialDraft]);

  const toggleWallet = (id: string) => {
    const next = new Set(selectedWalletIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedWalletIds(next);
  };

  const selectAll = () => setSelectedWalletIds(new Set(wallets.map(w => w.id)));
  const deselectAll = () => setSelectedWalletIds(new Set());

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractAddress || !targetTime) {
      setError('Contract address and target time are required.');
      return;
    }
    if (selectedWalletIds.size === 0) {
      setError('Select at least one execution wallet.');
      return;
    }

    const scheduledDate = new Date(targetTime);
    if (scheduledDate <= new Date()) {
      setError('Target time must be in the future.');
      return;
    }

    setError('');
    setIsScheduling(true);
    addLog('SYSTEM', `Dispatching scheduled task to background workers...`, 'text-synapse-violet');

    try {
      let mintParamsObj;
      if (form.isAllowlist && !form.openSeaSlug.trim()) {
        if (!form.mintParams || !form.salt || !form.signature) {
          throw new Error("Missing Allowlist signature payload");
        }
        try {
          mintParamsObj = JSON.parse(form.mintParams);
        } catch (err) {
          throw new Error("Invalid MintParams JSON format");
        }
      }

      const payload = {
        targetTime: scheduledDate.toISOString(),
        contractAddress: form.contractAddress,
        quantity: Number(form.quantity),
        isAllowlist: form.isAllowlist,
        mintParams: mintParamsObj,
        salt: form.salt,
        signature: form.signature,
        slug: form.openSeaSlug.trim() || undefined,
        openseaApiKey: form.openSeaApiKey.trim() || undefined,
        feeTier: 'fast',
        wallets: Array.from(selectedWalletIds).map(id => wallets.find(w => w.id === id)),
        chain: selectedChain
      };

      const response = await fetch(editingJobId ? `/api/scheduler/jobs/${editingJobId}` : '/api/scheduler/create', {
        method: editingJobId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify(editingJobId ? { targetTime: payload.targetTime, quantity: payload.quantity } : payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to schedule mint.');
      }

      setEditingJobId(null);
      setScheduledJob(editingJobId ? null : data);
      void loadJobs(true);
      addLog('SUCCESS', editingJobId ? `Scheduled job updated for ${scheduledDate.toLocaleString()}` : `Task [${data.taskId}] scheduled for ${scheduledDate.toLocaleString()}`, 'text-synapse-emerald');
      
      // Reset form (keep wallets selected for convenience)
      setForm({
        contractAddress: '',
        quantity: '1',
        openSeaSlug: '',
        openSeaApiKey: savedOpenSeaApiKey || '',
        isAllowlist: false,
        mintParams: '',
        salt: '',
        signature: ''
      });
      setTargetTime('');
    } catch (err: any) {
      setError(err.message);
      addLog('ERROR', `Scheduling failed: ${err.message}`, 'text-red-500');
    } finally {
      setIsScheduling(false);
    }
  };

  const beginEdit = (job: SchedulerJobSummary) => {
    if (!job.targetTime) return;
    const date = new Date(job.targetTime);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    setEditingJobId(job.id);
    setScheduledJob(null);
    setTargetTime(local);
    setForm((current) => ({ ...current, contractAddress: job.contractAddress }));
    setSelectedWalletIds(new Set((job.wallets || []).map((wallet) => wallet.id)));
    setError('');
  };

  const controlJob = async (job: SchedulerJobSummary, action: 'pause' | 'resume' | 'stop' | 'delete') => {
    setJobAction(`${job.id}:${action}`);
    setError('');
    try {
      const response = await fetch(
        action === 'delete' ? `/api/scheduler/jobs/${job.id}` : `/api/scheduler/jobs/${job.id}/${action}`,
        { method: action === 'delete' ? 'DELETE' : 'POST', headers: { Authorization: `Bearer ${authToken}` } },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not ${action} job`);
      addLog('SYSTEM', `Scheduler job ${job.id.slice(0, 8)} ${action === 'delete' ? 'deleted' : `${action} request accepted`}.`, 'text-synapse-emerald');
      await loadJobs(true);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : `Could not ${action} job`;
      setError(message);
      addLog('ERROR', `Scheduler control failed: ${message}`, 'text-red-500');
    } finally {
      setJobAction('');
    }
  };

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
      <div className="mb-8 flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Clock size={20} className="text-synapse-violet" />
          <h2 className="font-serif text-2xl">Scheduled Minting</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-synapse-emerald/20 bg-synapse-emerald/10 px-3 py-1 font-mono text-xs text-synapse-emerald">
          <Server size={12} />
          Server-Side Execution
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-synapse-violet/20 bg-synapse-violet/5 p-4 text-xs text-synapse-violet">
        <p><strong>Real Execution:</strong> OpenSea schedules fetch and validate an exact wallet-specific mint action for every selected wallet shortly before execution. Standard on-chain schedules use the configured SeaDrop stage directly. You may safely close the browser.</p>
      </div>

      <div className="mb-8 rounded-xl border border-white/5 bg-black/30 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">Your Scheduler Jobs</h3>
          <button type="button" onClick={() => void loadJobs()} className="text-xs text-synapse-cyan hover:underline">{jobsLoading ? 'Refreshing…' : 'Refresh'}</button>
        </div>
        {jobs.length === 0 ? (
          <p className="text-xs text-neutral-500">No queued, running, or historical jobs yet.</p>
        ) : (
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1 custom-scrollbar">
            {jobs.map((job) => (
              <div key={job.id} className="rounded-lg border border-white/5 bg-black/40 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-mono text-xs text-white">{job.contractAddress.slice(0, 8)}…{job.contractAddress.slice(-6)}</div>
                    <div className="mt-1 text-[11px] text-neutral-500">{job.chain} · {job.targetTime ? new Date(job.targetTime).toLocaleString() : `block ${job.targetBlock}`} · {job.walletCount} wallet(s) · {job.parallelWorkers || 1} automatic worker(s)</div>
                  </div>
                  <span className={`rounded-full border px-2 py-1 font-mono text-[10px] uppercase ${job.status === 'completed' ? 'border-emerald-500/30 text-emerald-400' : job.status === 'failed' ? 'border-red-500/30 text-red-400' : job.status === 'paused' ? 'border-yellow-500/30 text-yellow-400' : 'border-cyan-500/30 text-cyan-400'}`}>{job.status === 'pending' ? 'queued' : job.status}</span>
                </div>
                {job.error && <p className="mt-2 text-[11px] text-red-400">{job.error}</p>}
                {Boolean(job.wallets?.length) && (
                  <div className="mt-3 space-y-1 border-t border-white/5 pt-2">
                    {job.wallets!.map((wallet) => (
                      <div key={wallet.id} className="flex items-center justify-between gap-3 text-[10px]">
                        <span className="truncate text-neutral-400">{wallet.name} · {wallet.address.slice(0, 6)}…{wallet.address.slice(-4)}</span>
                        <span className={wallet.status === 'completed' ? 'text-emerald-400' : wallet.status === 'failed' ? 'text-red-400' : 'text-neutral-500'}>{wallet.status}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.status === 'pending' && <button type="button" disabled={Boolean(jobAction)} onClick={() => void controlJob(job, 'pause')} className="rounded border border-yellow-500/30 px-2 py-1 text-[10px] text-yellow-400">Pause</button>}
                  {job.status === 'paused' && <button type="button" disabled={Boolean(jobAction)} onClick={() => void controlJob(job, 'resume')} className="rounded border border-emerald-500/30 px-2 py-1 text-[10px] text-emerald-400">Resume</button>}
                  {['pending', 'paused', 'running'].includes(job.status) && <button type="button" disabled={Boolean(jobAction)} onClick={() => void controlJob(job, 'stop')} className="rounded border border-red-500/30 px-2 py-1 text-[10px] text-red-400">Stop</button>}
                  {['pending', 'paused'].includes(job.status) && <button type="button" disabled={Boolean(jobAction)} onClick={() => beginEdit(job)} className="rounded border border-synapse-violet/30 px-2 py-1 text-[10px] text-synapse-violet">Edit</button>}
                  {job.status !== 'running' && <button type="button" disabled={Boolean(jobAction)} onClick={() => void controlJob(job, 'delete')} className="rounded border border-white/10 px-2 py-1 text-[10px] text-neutral-400">Delete</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {scheduledJob ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-synapse-emerald/20 bg-synapse-emerald/5 py-12 text-center">
          <CheckCircle2 size={48} className="mb-4 text-synapse-emerald" />
          <h3 className="mb-2 font-serif text-xl text-white">Mint Scheduled Successfully</h3>
          <p className="mb-6 max-w-md text-sm text-neutral-400">
            Task <span className="font-mono text-synapse-emerald">{scheduledJob.taskId}</span> has been dispatched to the background workers.
          </p>
          <div className="mb-8 rounded-lg border border-white/5 bg-black/50 p-4 text-left font-mono text-xs text-neutral-300">
            <p className="mb-2"><span className="text-neutral-500">Target:</span> {new Date(scheduledJob.targetTime).toLocaleString()}</p>
            <p className="mb-2"><span className="text-neutral-500">Wallets:</span> {scheduledJob.walletCount} connected</p>
            <p><span className="text-neutral-500">Chain:</span> {scheduledJob.chain}</p>
            <p className="mt-2"><span className="text-neutral-500">Action:</span> {scheduledJob.source === 'opensea-mint-action' ? `OpenSea exact action (${scheduledJob.openSeaSlug})` : 'On-chain SeaDrop plan'}</p>
          </div>
          <button
            onClick={() => setScheduledJob(null)}
            className="rounded-xl border border-white/10 bg-white/5 px-6 py-2 font-mono text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Schedule Another Mint
          </button>
        </div>
      ) : (
        <form onSubmit={handleSchedule} className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
              {error}
            </div>
          )}
          
          <div>
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
                Contract Address
              </label>
              <input 
                type="text" 
                value={form.contractAddress}
                onChange={(e) => setForm({...form, contractAddress: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
                Target Drop Time (Local)
              </label>
              <input 
                type="datetime-local" 
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Quantity</label>
              <input 
                type="number" 
                min="1"
                value={form.quantity}
                onChange={(e) => setForm({...form, quantity: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-emerald/50 focus:bg-white/5 transition-colors"
                required
              />
            </div>
          </div>

          <p className="text-xs text-neutral-500">Worker count is automatic: one concurrent worker per selected wallet, up to 50 wallets.</p>

          <div className="rounded-xl border border-synapse-cyan/20 bg-synapse-cyan/[0.04] p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck size={15} className="text-synapse-cyan" />
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-synapse-cyan">OpenSea Scheduled Action</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Collection Slug</label>
                <input
                  type="text"
                  value={form.openSeaSlug}
                  onChange={(e) => setForm({...form, openSeaSlug: e.target.value})}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none transition-colors focus:border-synapse-cyan/50"
                  placeholder="collection-slug"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">OpenSea API Key</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.openSeaApiKey}
                  onChange={(e) => {
                    setForm({...form, openSeaApiKey: e.target.value});
                    onOpenSeaApiKeyChange?.(e.target.value);
                  }}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none transition-colors focus:border-synapse-cyan/50"
                  placeholder="Required for wallet-specific stages"
                />
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">When a slug is provided, the server validates it now and requests fresh per-wallet calldata during the 30-second pre-arm window. The job and key are encrypted at rest and sensitive execution data is cleared after completion or stopping.</p>
          </div>

          <div className="pt-4 border-t border-white/5">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input 
                type="checkbox" 
                checked={form.isAllowlist}
                onChange={(e) => setForm({...form, isAllowlist: e.target.checked})}
                className="accent-synapse-violet w-4 h-4 rounded"
              />
              <span className="text-sm font-medium text-neutral-300">Allowlist / Signed Phase</span>
            </label>
            <p className="text-xs text-neutral-500">With an OpenSea slug, signatures are fetched automatically per wallet. Without a slug, you must provide the manual voucher below.</p>
          </div>

          <LiveTransactionFee
            selectedChain={selectedChain}
            gasLimit="350000"
            valueWei={null}
            exactGasLimit={false}
            walletCount={selectedWalletIds.size}
          />

          {form.isAllowlist && !form.openSeaSlug.trim() && (
            <div className="space-y-4 rounded-xl border border-white/5 bg-black/30 p-4">
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Mint Params JSON</label>
                <textarea 
                  value={form.mintParams}
                  onChange={(e) => setForm({...form, mintParams: e.target.value})}
                  className="w-full h-20 rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-xs text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Salt</label>
                <input 
                  type="text" 
                  value={form.salt}
                  onChange={(e) => setForm({...form, salt: e.target.value})}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Signature</label>
                <input 
                  type="text" 
                  value={form.signature}
                  onChange={(e) => setForm({...form, signature: e.target.value})}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <div className="mb-3 flex items-center justify-between">
              <label className="block text-xs font-mono uppercase tracking-widest text-neutral-500">
                Execution Wallets ({selectedWalletIds.size}/{wallets.length})
              </label>
              <div className="flex gap-3">
                <button type="button" onClick={selectAll} className="text-xs text-synapse-cyan hover:underline">Select All</button>
                <button type="button" onClick={deselectAll} className="text-xs text-neutral-500 hover:underline">Clear</button>
              </div>
            </div>

            {wallets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 py-8 text-center opacity-50">
                <p className="text-sm text-neutral-400">No wallets available.</p>
                <p className="mt-1 text-xs text-neutral-500">Import wallets in the Wallet Manager first.</p>
              </div>
            ) : (
              <div className="max-h-[200px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {wallets.map(wallet => {
                  const isSelected = selectedWalletIds.has(wallet.id);
                  return (
                    <div 
                      key={wallet.id} 
                      onClick={() => toggleWallet(wallet.id)}
                      className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                        isSelected 
                          ? 'border-synapse-violet/50 bg-synapse-violet/10' 
                          : 'border-white/5 bg-black/30 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {isSelected ? <CheckSquare size={16} className="text-synapse-violet" /> : <Square size={16} className="text-neutral-500" />}
                        <span className="font-semibold text-white text-sm">{wallet.name}</span>
                      </div>
                      <span className="font-mono text-xs text-neutral-500">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button 
            type="submit"
            disabled={isScheduling || wallets.length === 0}
            className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-4 py-4 font-mono text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-100 disabled:opacity-50 disabled:hover:scale-100"
          >
            {isScheduling ? <Loader2 size={16} className="animate-spin" /> : <Clock size={16} />} 
            {isScheduling ? 'DISPATCHING...' : editingJobId ? 'SAVE SCHEDULE CHANGES' : 'SCHEDULE MINT TASK'}
          </button>
        </form>
      )}
    </div>
  );
};
