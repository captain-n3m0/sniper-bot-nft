import React, { useState } from 'react';
import { Wallet as WalletIcon, Plus, Trash2, Key, Shield } from 'lucide-react';
import { Wallet } from 'ethers';

declare global {
  interface Window {
    ethereum?: any;
  }
}

export interface StoredWallet {
  id: string;
  name: string;
  address: string;
  privateKey: string;
}

interface WalletManagerProps {
  wallets: StoredWallet[];
  setWallets: React.Dispatch<React.SetStateAction<StoredWallet[]>>;
  addLog: (type: string, message: string, color: string) => void;
}

export const WalletManager = ({ wallets, setWallets, addLog }: WalletManagerProps) => {
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');

  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !privateKey.trim()) {
      setError('Name and Private Key are required');
      return;
    }

    try {
      const wallet = new Wallet(privateKey.trim());
      setWallets([...wallets, {
        id: crypto.randomUUID(),
        name: name.trim(),
        address: wallet.address,
        privateKey: privateKey.trim()
      }]);
      setName('');
      setPrivateKey('');
      addLog('SYSTEM', `Wallet "${name.trim()}" imported successfully. Address: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`, 'text-synapse-emerald');
    } catch (err) {
      setError('Invalid Private Key');
      addLog('ERROR', 'Failed to import wallet: Invalid private key', 'text-red-500');
    }
  };

  const handleRemoveWallet = (id: string) => {
    const wallet = wallets.find(w => w.id === id);
    if (wallet) {
      setWallets(wallets.filter(w => w.id !== id));
      addLog('SYSTEM', `Wallet "${wallet.name}" removed.`, 'text-yellow-500');
    }
  };

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
      <div className="mb-8 flex items-center gap-3 border-b border-white/5 pb-4">
        <WalletIcon size={20} className="text-synapse-cyan" />
        <h2 className="font-serif text-2xl">Wallet Manager</h2>
      </div>

      <form onSubmit={handleAddWallet} className="mb-8 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Wallet Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              placeholder="e.g. Primary Minter"
            />
          </div>
          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-500">
              <Key size={14} className="text-synapse-violet" /> Private Key
            </label>
            <input 
              type="password" 
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
              placeholder="0x..."
            />
          </div>
        </div>
        <button 
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 font-mono text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          <Plus size={16} /> Import Wallet
        </button>
      </form>

      <div>
        <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-neutral-500">Stored Execution Wallets ({wallets.length})</h3>
        
        {wallets.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-12 text-center opacity-50">
            <Shield size={32} className="mb-4 text-neutral-500" />
            <p className="text-sm text-neutral-400">No wallets imported.</p>
            <p className="mt-1 text-xs text-neutral-500">Keys are stored securely in local memory.</p>
          </div>
        ) : (
          <div className="max-h-[300px] space-y-3 overflow-y-auto pr-2 custom-scrollbar">
            {wallets.map(wallet => (
              <div key={wallet.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/30 p-4 transition-colors hover:border-white/10">
                <div className="flex flex-col">
                  <span className="font-semibold text-white">{wallet.name}</span>
                  <span className="font-mono text-xs text-neutral-500">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                </div>
                <button 
                  onClick={() => handleRemoveWallet(wallet.id)}
                  className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-red-500/20 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
