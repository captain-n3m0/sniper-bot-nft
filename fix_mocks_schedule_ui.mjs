import fs from 'fs';
const code = `
import { useState } from 'react';
import { Clock, CheckCircle2, Server, CheckSquare, Square, ShieldCheck, Loader2 } from 'lucide-react';
import { StoredWallet } from './WalletManager';

interface ScheduledMintingProps {
  wallets: StoredWallet[];
  addLog: (type: string, message: string, color: string) => void;
  selectedChain: string;
}

export const ScheduledMinting = ({ wallets, addLog, selectedChain }: ScheduledMintingProps) => {
  const [targetTime, setTargetTime] = useState('');
  const [selectedWalletIds, setSelectedWalletIds] = useState<Set<string>>(new Set());
  
  const [form, setForm] = useState({
    contractAddress: '',
    quantity: '1',
    apiKey: '',
    isAllowlist: false,
    mintParams: '',
    salt: '',
    signature: ''
  });

  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduledJob, setScheduledJob] = useState<{taskId: string, targetTime: string, walletCount: number, chain: string} | null>(null);
  const [error, setError] = useState('');

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
    addLog('SYSTEM', \`Dispatching scheduled task to background workers...\`, 'text-synapse-violet');

    try {
      let mintParamsObj;
      if (form.isAllowlist) {
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
        apiKey: form.apiKey,
        wallets: Array.from(selectedWalletIds).map(id => wallets.find(w => w.id === id)),
        chain: selectedChain
      };

      const response = await fetch('/api/schedule-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to schedule mint.');
      }

      setScheduledJob(data);
      addLog('SUCCESS', \`Task [\${data.taskId}] scheduled for \${scheduledDate.toLocaleString()}\`, 'text-synapse-emerald');
      
      // Reset form (keep wallets selected for convenience)
      setForm({
        contractAddress: '',
        quantity: '1',
        apiKey: '',
        isAllowlist: false,
        mintParams: '',
        salt: '',
        signature: ''
      });
      setTargetTime('');
    } catch (err: any) {
      setError(err.message);
      addLog('ERROR', \`Scheduling failed: \${err.message}\`, 'text-red-500');
    } finally {
      setIsScheduling(false);
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
        <p><strong>Real Execution:</strong> The backend cron worker builds real mint payloads, estimates real gas limits, and broadcasts signed transactions asynchronously at the target time. You may safely close the browser.</p>
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
          
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
                Contract Address / Slug
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
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">RPC API Key (Optional)</label>
              <input 
                type="text" 
                value={form.apiKey}
                onChange={(e) => setForm({...form, apiKey: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-white/5">
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <input 
                type="checkbox" 
                checked={form.isAllowlist}
                onChange={(e) => setForm({...form, isAllowlist: e.target.checked})}
                className="accent-synapse-violet w-4 h-4 rounded"
              />
              <span className="text-sm font-medium text-neutral-300">Allowlist Phase (Requires Signatures)</span>
            </label>
          </div>

          {form.isAllowlist && (
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
                      className={\`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors \${
                        isSelected 
                          ? 'border-synapse-violet/50 bg-synapse-violet/10' 
                          : 'border-white/5 bg-black/30 hover:border-white/20'
                      }\`}
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
            {isScheduling ? 'DISPATCHING...' : 'SCHEDULE MINT TASK'}
          </button>
        </form>
      )}
    </div>
  );
};
`;

fs.writeFileSync('src/components/ScheduledMinting.tsx', code);
