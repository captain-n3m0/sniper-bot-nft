import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Terminal, Shield, Zap, Play, CheckCircle2, XCircle, ArrowLeft, ShieldCheck } from 'lucide-react';
import { ShinyButton } from '../components/ShinyButton';
import { WalletManager, StoredWallet } from '../components/WalletManager';
import { ChainSelector } from '../components/ChainSelector';
import { DropStages } from '../components/DropStages';
import { ScheduledMinting } from '../components/ScheduledMinting';
import { GasEstimator } from '../components/GasEstimator';
import { WalletLogin } from '../components/WalletLogin';
import { resolveChain } from '../lib/chains';

const MAX_SNIPER_WORKERS = 24;
const CONFIG_SAVE_DELAY_MS = 700;

type DashboardTab = 'sniper' | 'wallets' | 'stages' | 'scheduler' | 'gas';

interface SniperFormState {
  apiKey: string;
  contractAddress: string;
  quantity: string;
  isAllowlist: boolean;
  mintParams: string;
  salt: string;
  signature: string;
  openSeaSlug: string;
  openSeaApiKey: string;
  parallelWorkers: string;
}

const DEFAULT_SNIPER_FORM: SniperFormState = {
  apiKey: '',
  contractAddress: '',
  quantity: '1',
  isAllowlist: false,
  mintParams: '',
  salt: '',
  signature: '',
  openSeaSlug: '',
  openSeaApiKey: '',
  parallelWorkers: '8'
};

const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const sniperWorkerCount = (value: string, walletCount: number) => {
  const requested = Math.floor(Number(value));
  if (!Number.isFinite(requested) || requested < 1) return 1;
  return Math.max(1, Math.min(requested, walletCount, MAX_SNIPER_WORKERS));
};

const textConfig = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
const chainConfig = (value: unknown) => resolveChain(textConfig(value))?.key || 'ethereum';
const tabConfig = (value: unknown): DashboardTab =>
  ['sniper', 'wallets', 'stages', 'scheduler', 'gas'].includes(String(value))
    ? (value as DashboardTab)
    : 'sniper';

const persistedConfig = (selectedChain: string, form: SniperFormState, activeTab: DashboardTab) => ({
  version: 1,
  activeTab,
  selectedChain,
  sniper: {
    apiKey: form.apiKey,
    contractAddress: form.contractAddress,
    quantity: form.quantity,
    isAllowlist: form.isAllowlist,
    openSeaSlug: form.openSeaSlug,
    openSeaApiKey: form.openSeaApiKey,
    parallelWorkers: form.parallelWorkers
  }
});

export const Dashboard = () => {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('auth_token') || '');
  const [authAddress, setAuthAddress] = useState(() => localStorage.getItem('auth_address') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('auth_token') && localStorage.getItem('auth_address')));

  const [activeTab, setActiveTab] = useState<DashboardTab>('sniper');
  const [wallets, setWallets] = useState<StoredWallet[]>([]);
  const [selectedChain, setSelectedChain] = useState<string>('ethereum');
  const [selectedSniperWallets, setSelectedSniperWallets] = useState<Set<string>>(new Set());

  const [form, setForm] = useState<SniperFormState>(DEFAULT_SNIPER_FORM);
  const [configLoaded, setConfigLoaded] = useState(false);
  const lastSavedConfig = useRef('');
  const configSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const configSaveErrorLogged = useRef(false);

  const [logs, setLogs] = useState<{ time: string; type: string; message: string; color: string }[]>([
    { time: new Date().toLocaleTimeString(), type: 'SYSTEM', message: 'Terminal initialized. Ready for instructions.', color: 'text-neutral-500' }
  ]);
  const [isSniping, setIsSniping] = useState(false);

  const addLog = (type: string, message: string, color: string) => {
    setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), type, message, color }]);
  };

  const clearAuth = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_address');
    setAuthToken('');
    setAuthAddress('');
    setConfigLoaded(false);
    setIsAuthenticated(false);
  };

  useEffect(() => {
    if (!isAuthenticated || !authToken) {
      setConfigLoaded(false);
      return;
    }

    let cancelled = false;
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/user/config', {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        const data = await response.json();
        if (!response.ok || !data.success) {
          if (response.status === 401) clearAuth();
          throw new Error(data.error || 'Could not load saved config');
        }
        if (cancelled) return;

        const remoteConfig = data.config && typeof data.config === 'object' ? data.config : {};
        const remoteSniper = remoteConfig.sniper && typeof remoteConfig.sniper === 'object' ? remoteConfig.sniper : {};
        const nextForm: SniperFormState = {
          ...DEFAULT_SNIPER_FORM,
          apiKey: textConfig(remoteSniper.apiKey),
          contractAddress: textConfig(remoteSniper.contractAddress),
          quantity: textConfig(remoteSniper.quantity, DEFAULT_SNIPER_FORM.quantity),
          isAllowlist: typeof remoteSniper.isAllowlist === 'boolean' ? remoteSniper.isAllowlist : false,
          openSeaSlug: textConfig(remoteSniper.openSeaSlug),
          openSeaApiKey: textConfig(remoteSniper.openSeaApiKey),
          parallelWorkers: textConfig(remoteSniper.parallelWorkers, DEFAULT_SNIPER_FORM.parallelWorkers)
        };
        const nextChain = chainConfig(remoteConfig.selectedChain);
        const nextTab = tabConfig(remoteConfig.activeTab);

        setSelectedChain(nextChain);
        setActiveTab(nextTab);
        setForm(nextForm);
        lastSavedConfig.current = JSON.stringify(persistedConfig(nextChain, nextForm, nextTab));
        setConfigLoaded(true);
        addLog(
          'SYSTEM',
          data.updatedAt ? `Loaded saved config for ${data.address}.` : `No saved config yet for ${data.address}; auto-save is ready.`,
          'text-synapse-emerald'
        );
      } catch (err: any) {
        if (cancelled) return;
        setConfigLoaded(true);
        addLog('ERROR', `Saved config sync failed: ${err.message || 'Unknown error'}`, 'text-red-500');
      }
    };

    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, authToken]);

  useEffect(() => {
    if (!isAuthenticated || !authToken || !configLoaded) return;
    const nextConfig = persistedConfig(selectedChain, form, activeTab);
    const serialized = JSON.stringify(nextConfig);
    if (serialized === lastSavedConfig.current) return;

    if (configSaveTimer.current) clearTimeout(configSaveTimer.current);
    configSaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch('/api/user/config', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${authToken}`
            },
            body: JSON.stringify({ config: nextConfig })
          });
          const data = await response.json();
          if (!response.ok || !data.success) {
            if (response.status === 401) clearAuth();
            throw new Error(data.error || 'Could not save config');
          }
          lastSavedConfig.current = serialized;
          configSaveErrorLogged.current = false;
        } catch (err: any) {
          if (!configSaveErrorLogged.current) {
            configSaveErrorLogged.current = true;
            addLog('ERROR', `Could not save config: ${err.message || 'Unknown error'}`, 'text-red-500');
          }
        }
      })();
    }, CONFIG_SAVE_DELAY_MS);

    return () => {
      if (configSaveTimer.current) clearTimeout(configSaveTimer.current);
    };
  }, [isAuthenticated, authToken, configLoaded, selectedChain, form, activeTab]);

  const handleSnipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contractAddress) {
      addLog('ERROR', 'Contract address is required', 'text-red-500');
      return;
    }
    
    setIsSniping(true);
    addLog('INFO', `Preparing to snipe ${form.quantity} token(s) from ${form.contractAddress.substring(0, 6)}...${form.contractAddress.substring(38)}`, 'text-synapse-violet');
    addLog('NETWORK', `Targeting network: ${selectedChain}`, 'text-synapse-cyan');

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

      addLog('INFO', 'Generating optimized calldata...', 'text-synapse-violet');
      
      const activeWallets = Array.from(selectedSniperWallets)
        .map(id => wallets.find(w => w.id === id))
        .filter((wallet): wallet is StoredWallet => Boolean(wallet));

      const prepareAndBlast = async (wallet: StoredWallet | undefined, workerId = 1) => {
        const walletLabel = wallet ? `${wallet.name} (${shortAddress(wallet.address)})` : 'dry-run wallet';
        if (wallet) {
          addLog('INFO', `[worker ${workerId}] Preparing ${walletLabel}`, 'text-synapse-cyan');
        }
        const payload = {
          chain: selectedChain,
          apiKey: form.apiKey,
          contractAddress: form.contractAddress,
          quantity: Number(form.quantity),
          privateKey: wallet ? wallet.privateKey : '',
          isAllowlist: form.isAllowlist,
          mintParams: mintParamsObj,
          salt: form.salt,
          signature: form.signature,
          slug: form.openSeaSlug || undefined,
          openseaApiKey: form.openSeaApiKey || undefined
        };

        const prepareRes = await fetch('/api/prepare-mint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const prepared = await prepareRes.json();
        if (!prepareRes.ok || !prepared.success) {
          throw new Error(prepared.error || 'Failed to prepare mint transaction');
        }

        addLog('SUCCESS', `[worker ${workerId}] Payload ready for ${walletLabel}. Value: ${prepared.plan.value} wei`, 'text-synapse-emerald');
        if (prepared.plan.source === 'opensea-mint-action') {
          addLog(
            'NETWORK',
            `[worker ${workerId}] Using OpenSea's exact ${prepared.plan.decoded?.method || 'mint'} action for ${walletLabel}.`,
            'text-synapse-cyan',
          );
        }
        if (!wallet) {
          addLog('WARNING', 'Dry run complete. Select a wallet to broadcast.', 'text-yellow-500');
          return { ok: true, dryRun: true };
        }
        if (prepared.simulation && !prepared.simulation.ok) {
          throw new Error(`Simulation failed: ${prepared.simulation.reason}`);
        }

        const blastRes = await fetch('/api/blast-mint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chain: selectedChain,
            apiKey: form.apiKey,
            transaction: prepared.transaction,
            privateKey: wallet.privateKey
          })
        });
        const blasted = await blastRes.json();
        if (!blastRes.ok || !blasted.success) {
          throw new Error(blasted.error || 'Failed to broadcast mint transaction');
        }
        addLog('SUCCESS', `[worker ${workerId}] ${wallet.name} broadcasted. Hash: ${blasted.txHash}`, 'text-synapse-emerald');
        return { ok: true, wallet, txHash: blasted.txHash };
      };

      if (activeWallets.length === 0) {
        await prepareAndBlast(undefined);
        return;
      }

      const workerCount = sniperWorkerCount(form.parallelWorkers, activeWallets.length);
      addLog(
        'SYSTEM',
        `Spawning ${workerCount} parallel mint worker${workerCount === 1 ? '' : 's'} for ${activeWallets.length} execution wallet${activeWallets.length === 1 ? '' : 's'}.`,
        'text-synapse-emerald',
      );

      let nextWalletIndex = 0;
      const results: Array<{ ok: boolean; wallet: StoredWallet; txHash?: string; error?: string }> = [];
      const workers = Array.from({ length: workerCount }, async (_, index) => {
        const workerId = index + 1;
        while (nextWalletIndex < activeWallets.length) {
          const wallet = activeWallets[nextWalletIndex];
          nextWalletIndex += 1;
          try {
            const result = await prepareAndBlast(wallet, workerId);
            if (result.wallet) results.push({ ok: true, wallet: result.wallet, txHash: result.txHash });
          } catch (err: any) {
            const message = err.message || 'Mint worker failed';
            results.push({ ok: false, wallet, error: message });
            addLog('ERROR', `[worker ${workerId}] ${wallet.name} failed: ${message}`, 'text-red-500');
          }
        }
      });

      await Promise.all(workers);

      const successful = results.filter(result => result.ok).length;
      const failed = results.length - successful;
      if (successful > 0) {
        addLog('SUCCESS', `Parallel mint complete: ${successful}/${activeWallets.length} wallet(s) broadcasted.`, 'text-synapse-emerald');
      }
      if (failed > 0) {
        addLog('WARNING', `Parallel mint finished with ${failed} wallet error(s). Check the worker logs above.`, 'text-yellow-500');
      }
      if (successful === 0 && failed > 0) {
        throw new Error('No selected execution wallet was able to broadcast.');
      }
    } catch (err: any) {
      addLog('ERROR', err.message, 'text-red-500');
    } finally {
      setIsSniping(false);
    }
  };

  return (
    <>
      {!isAuthenticated && (
        <WalletLogin onLogin={(address, token) => {
          setAuthAddress(address);
          setAuthToken(token);
          setConfigLoaded(false);
          setIsAuthenticated(true);
          addLog('SYSTEM', `Authenticated as ${address}. This wallet is login-only and is not an execution wallet. Saved config sync is enabled.`, 'text-synapse-emerald');
        }} />
      )}
      <main className={`min-h-screen bg-[#030303] text-white selection:bg-synapse-violet/30 pb-24 ${!isAuthenticated ? 'opacity-0 pointer-events-none' : 'opacity-100 transition-opacity duration-1000'}`}>
        {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-white/5 bg-[#030303]/80 px-6 py-4 backdrop-blur-md">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 transition-opacity hover:opacity-80">
            <div className="h-2 w-2 rounded-full bg-gradient-to-r from-synapse-violet to-synapse-cyan"></div>
            <span className="font-serif text-xl tracking-tight text-white">LastLap MintGrid</span>
          </Link>
          <div className="h-4 w-px bg-white/10 hidden md:block"></div>
          <span className="text-xs font-mono uppercase tracking-widest text-neutral-500 hidden md:block">Cloud Terminal</span>
        </div>
        <div className="flex items-center gap-6">
          <ChainSelector selectedChain={selectedChain} setSelectedChain={setSelectedChain} />
          <Link to="/" className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-neutral-400 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Exit
          </Link>
        </div>
      </nav>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-6 pt-32">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Main Left Column */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            {/* Tabs */}
            <div className="flex space-x-2 border-b border-white/5 pb-2">
              <button
                onClick={() => setActiveTab('sniper')}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${activeTab === 'sniper' ? 'border-b-2 border-synapse-violet text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Sniper
              </button>
              <button
                onClick={() => setActiveTab('wallets')}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${activeTab === 'wallets' ? 'border-b-2 border-synapse-cyan text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Wallet Manager
              </button>
              <button
                onClick={() => setActiveTab('stages')}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${activeTab === 'stages' ? 'border-b-2 border-synapse-cyan text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Drop Stages
              </button>
              <button
                onClick={() => setActiveTab('scheduler')}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${activeTab === 'scheduler' ? 'border-b-2 border-synapse-violet text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Schedule Mint
              </button>
              <button
                onClick={() => setActiveTab('gas')}
                className={`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors ${activeTab === 'gas' ? 'border-b-2 border-synapse-cyan text-white' : 'text-neutral-500 hover:text-neutral-300'}`}
              >
                Gas Estimator
              </button>
            </div>

            {activeTab === 'sniper' && (
            <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
              <div className="mb-8 flex items-center gap-3 border-b border-white/5 pb-4">
                <Zap size={20} className="text-synapse-cyan" />
                <h2 className="font-serif text-2xl">Configuration</h2>
              </div>

              <form onSubmit={handleSnipe} className="space-y-6">                
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Contract Address or Slug</label>
                  <input 
                    type="text" 
                    value={form.contractAddress}
                    onChange={(e) => setForm({
                      ...form,
                      contractAddress: e.target.value,
                      openSeaSlug: ''
                    })}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-violet/50 focus:bg-white/5 transition-colors"
                    placeholder="0x... or opensea-slug"
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

                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">Parallel Workers</label>
                  <input
                    type="number"
                    min="1"
                    max={MAX_SNIPER_WORKERS}
                    value={form.parallelWorkers}
                    onChange={(e) => setForm({...form, parallelWorkers: e.target.value})}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
                    required
                  />
                  <p className="mt-2 text-xs text-neutral-500">Selected execution wallets are prepared and broadcast concurrently. Max {MAX_SNIPER_WORKERS} workers.</p>
                </div>

                
                
                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">RPC API Key or Full Custom Node URL (Optional)</label>
                  <input 
                    type="text" 
                    value={form.apiKey}
                    onChange={(e) => setForm({...form, apiKey: e.target.value})}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
                    placeholder="Alchemy API Key or https://..."
                  />
                  <p className="mt-2 text-xs text-neutral-500">Bypasses public rate-limits. Strongly recommended for high-competition mints.</p>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">OpenSea API Key</label>
                  <input
                    type="password"
                    autoComplete="off"
                    value={form.openSeaApiKey}
                    onChange={(e) => setForm({...form, openSeaApiKey: e.target.value})}
                    className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
                    placeholder="Required for OpenSea-signed mint phases"
                  />
                  <p className="mt-2 text-xs text-neutral-500">Used only by this backend to obtain the exact wallet-specific mint transaction.</p>
                </div>

                <div className="pt-4 border-t border-white/5">

                  <div className="mb-2 flex items-center justify-between text-xs font-mono uppercase tracking-widest text-neutral-500">
                    <label className="flex items-center gap-2">
                      <Shield size={14} className="text-yellow-500" />
                      Execution Wallets
                    </label>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setSelectedSniperWallets(new Set(wallets.map(w => w.id)))} className="text-synapse-cyan hover:underline">All</button>
                      <button type="button" onClick={() => setSelectedSniperWallets(new Set())} className="hover:underline">Clear</button>
                    </div>
                  </div>
                  
                  {wallets.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 py-6 text-center opacity-50">
                      <p className="text-xs text-neutral-400">No wallets imported. Sniper will run in dry-run mode (calldata only).</p>
                    </div>
                  ) : (
                    <div className="max-h-[160px] space-y-2 overflow-y-auto pr-2 custom-scrollbar">
                      {wallets.map(wallet => {
                        const isSelected = selectedSniperWallets.has(wallet.id);
                        return (
                          <div 
                            key={wallet.id} 
                            onClick={() => {
                              const newSet = new Set(selectedSniperWallets);
                              if (newSet.has(wallet.id)) newSet.delete(wallet.id);
                              else newSet.add(wallet.id);
                              setSelectedSniperWallets(newSet);
                            }}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 transition-colors ${
                              isSelected ? 'border-yellow-500/50 bg-yellow-500/10' : 'border-white/5 bg-black/30 hover:border-white/20'
                            }`}
                          >
                            <div className="flex flex-col">
                              <span className="font-semibold text-white text-sm">{wallet.name}</span>
                              <span className="font-mono text-xs text-neutral-500">{wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}</span>
                            </div>
                            {isSelected && <CheckCircle2 size={16} className="text-yellow-500" />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-neutral-500">If no wallets are selected, the sniper will only generate and return the calldata.</p>
                </div>

                <div className="pt-6">
                  <button 
                    type="submit"
                    disabled={isSniping}
                    className="relative w-full inline-flex overflow-hidden rounded-xl p-[1px] group disabled:opacity-50"
                  >
                    <span className="absolute inset-[-1000%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,transparent_0%,#8B5CF6_40%,#06B6D4_50%,transparent_60%)]" />
                    <span className="relative flex h-full w-full items-center justify-center gap-2 rounded-xl bg-[#0a0a0a] px-10 py-4 font-semibold text-white backdrop-blur-[16px] transition-colors duration-500 group-hover:bg-[#111]">
                      {isSniping ? (
                        <>
                          <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin"></div>
                          EXECUTING...
                        </>
                      ) : (
                        <>
                          <Play size={16} />
                          SNIPE MINT
                        </>
                      )}
                    </span>
                  </button>
                </div>
              </form>
            </div>
            )}

            {activeTab === 'wallets' && (
              <WalletManager wallets={wallets} setWallets={setWallets} addLog={addLog} />
            )}

            {activeTab === 'stages' && (
              <DropStages 
                wallets={wallets} 
                addLog={addLog} 
                selectedChain={selectedChain}
                onDetectedChain={setSelectedChain}
                onSelectStageForSniper={(contractAddress, stage, context) => {
                  setSelectedChain(context.chain);
                  setForm(prev => ({
                    ...prev,
                    contractAddress,
                    quantity: '1',
                    isAllowlist: stage.phase === 'presale' || stage.label.toLowerCase().includes('allowlist'),
                    openSeaSlug: context.slug || '',
                    openSeaApiKey: context.openseaApiKey || ''
                  }));
                  setActiveTab('sniper');
                  addLog('INFO', `Stage "${stage.label}" loaded on ${context.chain}; OpenSea mint-action verification enabled.`, 'text-synapse-violet');
                }}
                onSelectStageForScheduler={(contractAddress, targetTime) => {
                  setActiveTab('scheduler');
                  addLog('INFO', `Drop stage scheduled time (${targetTime}) ready for setup.`, 'text-synapse-emerald');
                }}
              />
            )}

            {activeTab === 'scheduler' && (
              <ScheduledMinting wallets={wallets} selectedChain={selectedChain} addLog={addLog} />
            )}

            {activeTab === 'gas' && (
              <GasEstimator addLog={addLog} selectedChain={selectedChain} />
            )}
          </div>

          {/* Terminal Section */}
          <div className="lg:col-span-7 h-[600px] lg:h-auto overflow-hidden rounded-[24px] border border-white/10 bg-[#080808]/90 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-6 py-4">
              <div className="flex items-center gap-3">
                <Terminal size={16} className="text-neutral-400" />
                <span className="font-mono text-xs font-semibold uppercase tracking-widest text-neutral-400">Execution Logs</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-red-500/80" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
                <div className="h-3 w-3 rounded-full bg-green-500/80" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-loose text-neutral-300 md:text-sm">
              {logs.map((log, index) => (
                <div key={index} className="mb-2 flex items-start gap-4">
                  <span className="text-neutral-600 shrink-0">[{log.time}]</span>
                  <span className={`shrink-0 w-16 font-semibold ${log.color}`}>{log.type}</span>
                  <span className="break-all">{log.message}</span>
                </div>
              ))}
              {isSniping && (
                <div className="mb-2 flex items-start gap-4 animate-pulse">
                  <span className="text-neutral-600">[{new Date().toLocaleTimeString()}]</span>
                  <span className="w-16 font-semibold text-synapse-cyan">WAIT</span>
                  <span>Awaiting network response...</span>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
    </>
  );
};
