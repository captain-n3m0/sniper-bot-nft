import fs from 'fs';

const checkerCode = `
import { useState } from 'react';
import { ShieldCheck, Activity, AlertCircle, Loader2 } from 'lucide-react';
import { StoredWallet } from './WalletManager';

interface WhitelistCheckerProps {
  wallets: StoredWallet[];
  addLog: (type: string, message: string, color: string) => void;
  selectedChain: string;
}

export const WhitelistChecker = ({ wallets, addLog, selectedChain }: WhitelistCheckerProps) => {
  const [form, setForm] = useState({
    contractAddress: '',
    quantity: '1',
    isAllowlist: false,
    mintParams: '',
    salt: '',
    signature: ''
  });

  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<{ eligible: string[]; notEligible: {address: string, reason: string}[] } | null>(null);
  const [error, setError] = useState('');

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractAddress) {
      setError('Please enter a Contract Address');
      return;
    }
    if (wallets.length === 0) {
      setError('No execution wallets imported.');
      return;
    }

    setError('');
    setIsChecking(true);
    setResults(null);

    addLog('SYSTEM', \`Initiating on-chain RPC simulation for \${wallets.length} wallets on \${selectedChain}...\`, 'text-synapse-cyan');

    try {
      let mintParamsObj;
      if (form.isAllowlist) {
        if (!form.mintParams || !form.salt || !form.signature) {
          throw new Error("Missing Allowlist signature payload");
        }
        try {
          mintParamsObj = JSON.parse(form.mintParams);
        } catch (e) {
          throw new Error("Invalid MintParams JSON format");
        }
      }

      const payload = {
        chain: selectedChain,
        contractAddress: form.contractAddress,
        quantity: Number(form.quantity),
        isAllowlist: form.isAllowlist,
        mintParams: mintParamsObj,
        salt: form.salt,
        signature: form.signature,
        wallets: wallets.map(w => w.address)
      };

      const response = await fetch('/api/simulate-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to simulate');
      }

      setResults(data);
      addLog('SUCCESS', \`Simulation complete! \${data.eligible.length} eligible.\`, 'text-synapse-emerald');

    } catch (err: any) {
      setError(err.message);
      addLog('ERROR', \`Simulation failed: \${err.message}\`, 'text-red-500');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
      <div className="mb-8 flex items-center gap-3 border-b border-white/5 pb-4">
        <Activity size={20} className="text-synapse-cyan" />
        <h2 className="font-serif text-2xl">On-Chain Eligibility Simulator</h2>
      </div>

      <div className="mb-6 rounded-xl border border-synapse-cyan/20 bg-synapse-cyan/5 p-4 text-xs text-synapse-cyan">
        <p><strong>Strict Mode:</strong> This tool performs a real <code className="bg-black/30 px-1 rounded">eth_call</code> via the RPC nodes to simulate the exact mint transaction for every wallet. It checks for whitelist signatures, supply caps, and sufficient ETH balance. No mocks.</p>
      </div>

      <form onSubmit={handleSimulate} className="mb-8 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        
        <div>
          <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Contract Address or Slug</label>
          <input 
            type="text" 
            value={form.contractAddress}
            onChange={(e) => setForm({...form, contractAddress: e.target.value})}
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
            required
          />
        </div>

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

        <div className="pt-4 border-t border-white/5">
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input 
              type="checkbox" 
              checked={form.isAllowlist}
              onChange={(e) => setForm({...form, isAllowlist: e.target.checked})}
              className="accent-synapse-cyan w-4 h-4 rounded"
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
                className="w-full h-20 rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-xs text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Salt</label>
              <input 
                type="text" 
                value={form.salt}
                onChange={(e) => setForm({...form, salt: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              />
            </div>
            <div>
              <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Signature</label>
              <input 
                type="text" 
                value={form.signature}
                onChange={(e) => setForm({...form, signature: e.target.value})}
                className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              />
            </div>
          </div>
        )}

        <button 
          type="submit"
          disabled={isChecking || wallets.length === 0}
          className="flex w-full mt-4 items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 font-mono text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {isChecking ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />} 
          {isChecking ? 'Simulating TXs...' : \`Simulate for \${wallets.length} Wallets\`}
        </button>
      </form>

      {results && (
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-synapse-emerald">
              <div className="h-2 w-2 rounded-full bg-synapse-emerald shadow-[0_0_8px_rgba(52,211,153,0.5)]"></div>
              Eligible ({results.eligible.length})
            </h3>
            {results.eligible.length === 0 ? (
              <p className="text-sm text-neutral-500 italic">No eligible wallets found.</p>
            ) : (
              <div className="max-h-[200px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {results.eligible.map((addr, i) => (
                  <div key={i} className="rounded-lg border border-synapse-emerald/20 bg-synapse-emerald/5 px-3 py-2 font-mono text-xs text-synapse-emerald">
                    {addr}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-red-500">
              <div className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              Reverted / Not Eligible ({results.notEligible.length})
            </h3>
            {results.notEligible.length === 0 ? (
              <p className="text-sm text-neutral-500 italic">All wallets are eligible!</p>
            ) : (
              <div className="max-h-[200px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                {results.notEligible.map((item, i) => (
                  <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 flex flex-col gap-1">
                    <span className="font-mono text-xs text-red-400">{item.address}</span>
                    <span className="font-mono text-[10px] text-red-500/70 truncate">{item.reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
`;

fs.writeFileSync('src/components/WhitelistChecker.tsx', checkerCode);
