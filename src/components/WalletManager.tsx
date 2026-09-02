import React, { useRef, useState } from 'react';
import { Wallet as WalletIcon, Plus, Trash2, Key, Shield, FileJson, Loader2, Upload } from 'lucide-react';
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

interface PlainWalletJson {
  name?: unknown;
  privateKey?: unknown;
  private_key?: unknown;
}

function normalizedPrivateKey(value: unknown) {
  const key = typeof value === 'string' ? value.trim() : '';
  return /^[0-9a-fA-F]{64}$/.test(key) ? `0x${key}` : key;
}

function plainWalletEntries(value: unknown): PlainWalletJson[] {
  if (Array.isArray(value)) return value.filter((item): item is PlainWalletJson => Boolean(item) && typeof item === 'object');
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.wallets)) {
    return record.wallets.filter((item): item is PlainWalletJson => Boolean(item) && typeof item === 'object');
  }
  return record.privateKey || record.private_key ? [record] : [];
}

function isEncryptedKeystore(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Number(record.version) === 3 && Boolean(record.crypto || record.Crypto);
}

export const WalletManager = ({ wallets, setWallets, addLog }: WalletManagerProps) => {
  const [name, setName] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [error, setError] = useState('');
  const [jsonFile, setJsonFile] = useState<File | null>(null);
  const [jsonPassword, setJsonPassword] = useState('');
  const [isImportingJson, setIsImportingJson] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddWallet = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !privateKey.trim()) {
      setError('Name and Private Key are required');
      return;
    }

    try {
      const wallet = new Wallet(normalizedPrivateKey(privateKey));
      if (wallets.some((item) => item.address.toLowerCase() === wallet.address.toLowerCase())) {
        setError('This execution wallet is already imported');
        return;
      }
      setWallets([...wallets, {
        id: crypto.randomUUID(),
        name: name.trim(),
        address: wallet.address,
        privateKey: wallet.privateKey
      }]);
      setName('');
      setPrivateKey('');
      addLog('SYSTEM', `Wallet "${name.trim()}" imported successfully. Address: ${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`, 'text-synapse-emerald');
    } catch (err) {
      setError('Invalid Private Key');
      addLog('ERROR', 'Failed to import wallet: Invalid private key', 'text-red-500');
    }
  };

  const handleJsonImport = async () => {
    if (!jsonFile) {
      setError('Choose a wallet JSON file first');
      return;
    }
    if (jsonFile.size > 2 * 1024 * 1024) {
      setError('Wallet JSON must be smaller than 2 MB');
      return;
    }

    setError('');
    setIsImportingJson(true);
    try {
      const contents = await jsonFile.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(contents);
      } catch {
        throw new Error('The selected file is not valid JSON');
      }

      const candidates: Array<{ name: string; wallet: { address: string; privateKey: string } }> = [];
      if (isEncryptedKeystore(parsed)) {
        if (!jsonPassword) throw new Error('Enter the password for this encrypted keystore');
        try {
          const wallet = await Wallet.fromEncryptedJson(contents, jsonPassword);
          candidates.push({
            name: jsonFile.name.replace(/\.json$/i, '') || 'Imported Wallet',
            wallet,
          });
        } catch {
          throw new Error('Unable to decrypt the keystore. Check its password and file contents');
        }
      } else {
        const entries = plainWalletEntries(parsed);
        if (!entries.length) {
          throw new Error('Unsupported JSON. Use an encrypted Ethereum V3 keystore or a wallets array containing name and privateKey');
        }
        if (entries.length > 100) throw new Error('A maximum of 100 wallets can be imported at once');
        entries.forEach((entry, index) => {
          const key = normalizedPrivateKey(entry.privateKey ?? entry.private_key);
          if (!key) throw new Error(`Wallet ${index + 1} is missing privateKey`);
          try {
            candidates.push({
              name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `Wallet ${index + 1}`,
              wallet: new Wallet(key),
            });
          } catch {
            throw new Error(`Wallet ${index + 1} has an invalid EVM private key`);
          }
        });
      }

      const knownAddresses = new Set(wallets.map((wallet) => wallet.address.toLowerCase()));
      const imported: StoredWallet[] = [];
      let skipped = 0;
      for (const candidate of candidates) {
        const addressKey = candidate.wallet.address.toLowerCase();
        if (knownAddresses.has(addressKey)) {
          skipped += 1;
          continue;
        }
        knownAddresses.add(addressKey);
        imported.push({
          id: crypto.randomUUID(),
          name: candidate.name,
          address: candidate.wallet.address,
          privateKey: candidate.wallet.privateKey,
        });
      }
      if (!imported.length) throw new Error('No new wallets were found; every address is already imported');

      setWallets((current) => [...current, ...imported]);
      setJsonFile(null);
      setJsonPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      addLog(
        'SYSTEM',
        `Imported ${imported.length} execution wallet${imported.length === 1 ? '' : 's'} from JSON${skipped ? `; skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''}.`,
        'text-synapse-emerald',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Wallet JSON import failed';
      setError(message);
      addLog('ERROR', `Failed to import wallet JSON: ${message}`, 'text-red-500');
    } finally {
      setIsImportingJson(false);
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

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
          {error}
        </div>
      )}

      <div className="mb-6 rounded-xl border border-synapse-cyan/20 bg-synapse-cyan/5 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileJson size={16} className="text-synapse-cyan" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-synapse-cyan">Import Wallet JSON</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            setError('');
            setJsonFile(event.target.files?.[0] || null);
          }}
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-neutral-300 transition-colors hover:border-synapse-cyan/40 hover:text-white"
          >
            <Upload size={15} />
            {jsonFile ? jsonFile.name : 'Choose JSON File'}
          </button>
          <input
            type="password"
            autoComplete="off"
            value={jsonPassword}
            onChange={(event) => setJsonPassword(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-xs text-neutral-300 outline-none transition-colors focus:border-synapse-violet/50"
            placeholder="Keystore password (if encrypted)"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleJsonImport()}
          disabled={!jsonFile || isImportingJson}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-synapse-cyan/10 px-4 py-3 font-mono text-sm font-semibold text-synapse-cyan transition-colors hover:bg-synapse-cyan/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isImportingJson ? <Loader2 size={16} className="animate-spin" /> : <FileJson size={16} />}
          {isImportingJson ? 'DECRYPTING / IMPORTING...' : 'IMPORT JSON'}
        </button>
        <p className="mt-3 text-xs text-neutral-500">
          Supports encrypted Ethereum V3 keystores and plaintext <span className="font-mono">{'{"wallets":[{"name":"Wallet 1","privateKey":"0x..."}]}'}</span> files. EVM wallets only.
        </p>
      </div>

      <form onSubmit={handleAddWallet} className="mb-8 space-y-4">
        
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
