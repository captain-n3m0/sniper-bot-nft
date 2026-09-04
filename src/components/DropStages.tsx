import React, { useState, useEffect } from 'react';
import { Layers, AlertCircle, Loader2, Calendar, ShieldCheck, CheckCircle2, XCircle, Clock, Zap, ArrowRight, Check } from 'lucide-react';
import { StoredWallet } from './WalletManager';

interface DropStagesProps {
  wallets: StoredWallet[];
  addLog: (type: string, message: string, color: string) => void;
  selectedChain: string;
  openSeaApiKey?: string;
  onOpenSeaApiKeyChange?: (value: string) => void;
  onDetectedChain?: (chain: string) => void;
  onSelectStageForSniper?: (
    contractAddress: string,
    stage: any,
    context: { chain: string; slug?: string; openseaApiKey?: string },
  ) => void;
  onSelectStageForScheduler?: (
    contractAddress: string,
    targetTime: string,
    context: { chain: string; slug?: string; openseaApiKey?: string; isAllowlist: boolean },
  ) => void;
}

interface StageInfo {
  id: string;
  label: string;
  phase: string;
  startTime: number | null; // unix timestamp in seconds
  endTime: number | null;
  priceEth: string;
  maxMintsPerWallet: string | number;
  status: 'live' | 'upcoming' | 'ended' | 'unknown';
  timeRemainingStr: string;
  raw: any;
}

export const DropStages = ({
  wallets,
  addLog,
  selectedChain,
  openSeaApiKey,
  onOpenSeaApiKeyChange,
  onDetectedChain,
  onSelectStageForSniper,
  onSelectStageForScheduler
}: DropStagesProps) => {
  const [slug, setSlug] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState('');
  const [dropData, setDropData] = useState<any>(null);
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const [simulatingStage, setSimulatingStage] = useState<string | null>(null);
  const [simulationResults, setSimulationResults] = useState<{
    [stageId: string]: {
      eligible: string[];
      projectedEligible?: string[];
      notEligible: { address: string; reason: string }[];
      unknown?: { address: string; reason: string }[];
      warnings?: { address: string; reason: string }[];
      isAllowlistPending?: boolean;
    };
  }>({});

  const [currentTime, setCurrentTime] = useState<number>(Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (typeof openSeaApiKey === 'string' && openSeaApiKey !== apiKey) setApiKey(openSeaApiKey);
  }, [openSeaApiKey]);

  // Ticker for live countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const parseStages = (data: any): StageInfo[] => {
    const rawStages: any[] = data.stages || data.drop_stages || [];
    
    // If no explicit stages array, check active_stage and next_stage
    if (rawStages.length === 0) {
      if (data.active_stage) rawStages.push({ ...data.active_stage, label: data.active_stage.label || 'Active Stage' });
      if (data.next_stage) rawStages.push({ ...data.next_stage, label: data.next_stage.label || 'Next Stage' });
    }

    return rawStages.map((st, idx) => {
      let startSec: number | null = null;
      let endSec: number | null = null;

      if (st.start_time) {
        startSec = typeof st.start_time === 'number' ? (st.start_time > 1e11 ? Math.floor(st.start_time / 1000) : st.start_time) : Math.floor(new Date(st.start_time).getTime() / 1000);
      } else if (st.startTime) {
        startSec = typeof st.startTime === 'number' ? (st.startTime > 1e11 ? Math.floor(st.startTime / 1000) : st.startTime) : Math.floor(new Date(st.startTime).getTime() / 1000);
      }

      if (st.end_time) {
        endSec = typeof st.end_time === 'number' ? (st.end_time > 1e11 ? Math.floor(st.end_time / 1000) : st.end_time) : Math.floor(new Date(st.end_time).getTime() / 1000);
      } else if (st.endTime) {
        endSec = typeof st.endTime === 'number' ? (st.endTime > 1e11 ? Math.floor(st.endTime / 1000) : st.endTime) : Math.floor(new Date(st.endTime).getTime() / 1000);
      }

      let priceEth = 'Free';
      if (st.price) {
        const val = Number(st.price);
        if (!isNaN(val) && val > 0) {
          priceEth = `${(val / 1e18).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} ETH`;
        }
      }

      let status: 'live' | 'upcoming' | 'ended' | 'unknown' = 'unknown';
      let timeRemainingStr = '';

      const now = Math.floor(Date.now() / 1000);
      if (startSec && endSec) {
        if (now < startSec) {
          status = 'upcoming';
          const diff = startSec - now;
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          const s = diff % 60;
          timeRemainingStr = `Goes live in ${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
        } else if (now >= startSec && now <= endSec) {
          status = 'live';
          const diff = endSec - now;
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          timeRemainingStr = `Ends in ${h > 0 ? `${h}h ` : ''}${m}m`;
        } else {
          status = 'ended';
          timeRemainingStr = 'Ended';
        }
      } else if (startSec) {
        if (now < startSec) {
          status = 'upcoming';
          const diff = startSec - now;
          const h = Math.floor(diff / 3600);
          const m = Math.floor((diff % 3600) / 60);
          const s = diff % 60;
          timeRemainingStr = `Goes live in ${h > 0 ? `${h}h ` : ''}${m}m ${s}s`;
        } else {
          status = 'live';
          timeRemainingStr = 'Active';
        }
      }

      return {
        id: st.id || st.label || `stage-${idx}`,
        label: st.label || st.phase || `Stage ${idx + 1}`,
        phase: st.phase || (st.label?.toLowerCase().includes('allowlist') || st.label?.toLowerCase().includes('presale') ? 'presale' : 'public'),
        startTime: startSec,
        endTime: endSec,
        priceEth,
        maxMintsPerWallet:
          st.max_mints_per_wallet ??
          st.max_per_wallet ??
          st.maxMintsPerWallet ??
          st.maxPerWallet ??
          '∞',
        status,
        timeRemainingStr,
        raw: st
      };
    });
  };

  const handleFetchDrop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug) {
      setError('Please enter an OpenSea collection slug or contract address.');
      return;
    }

    setError('');
    setIsFetching(true);
    setDropData(null);
    setStages([]);
    setSelectedStageId(null);
    setSimulationResults({});

    addLog('SYSTEM', `Fetching drop schedule for ${slug} from OpenSea API...`, 'text-synapse-cyan');

    try {
      const response = await fetch('/api/opensea/drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), chain: selectedChain, apiKey: apiKey.trim() })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch drop schedule from OpenSea.');
      }

      if (data.chain && data.chain !== selectedChain) {
        onDetectedChain?.(data.chain);
        addLog(
          'NETWORK',
          `OpenSea reports this collection on ${data.chain}; target switched from ${selectedChain} to ${data.chain}.`,
          'text-yellow-500',
        );
      }
      setDropData(data);
      const parsed = parseStages(data);
      setStages(parsed);
      if (parsed.length > 0) {
        setSelectedStageId(parsed[0].id);
      }
      addLog('SUCCESS', `Successfully retrieved drop stages for "${data.name || slug}" (${parsed.length} stages found)`, 'text-synapse-emerald');
    } catch (err: any) {
      setError(err.message);
      addLog('ERROR', `Failed to fetch drop stages: ${err.message}`, 'text-red-500');
    } finally {
      setIsFetching(false);
    }
  };

  const handleSimulateStage = async (stage: StageInfo) => {
    const targetWallets = Array.from(
      new Map(
        wallets
          .map((wallet) => wallet.address)
          .map((address) => [address.toLowerCase(), address]),
      ).values(),
    );

    if (targetWallets.length === 0) {
      setError('Import at least one execution wallet in Wallet Manager before checking eligibility. Your login wallet is never checked automatically.');
      return;
    }

    setSimulatingStage(stage.id);
    setError('');

    addLog('SYSTEM', `Checking ${targetWallets.length} explicitly imported execution wallet(s) for stage "${stage.label}"...`, 'text-synapse-cyan');

    try {
      const contractTarget = dropData?.contract_address || dropData?.address || dropData?.contracts?.[0]?.address || slug;
      const stageDescriptor = `${stage.phase} ${stage.label}`.toLowerCase();
      const isPresale = ['presale', 'allowlist', 'private', 'token-gated', 'token gated', 'signed']
        .some((marker) => stageDescriptor.includes(marker));

      const targetChain = dropData?.chain || selectedChain;
      const rawStageIndex = stage.raw?.stage_index ?? stage.raw?.stageIndex ?? stage.raw?.stage_id;
      const payload = {
        chain: targetChain,
        contractAddress: contractTarget,
        quantity: 1,
        isAllowlist: isPresale,
        slug: dropData?.slug || (!slug.startsWith('0x') ? slug : undefined),
        openseaApiKey: apiKey.trim(),
        stageStatus: stage.status,
        ...(Number.isFinite(Number(rawStageIndex)) ? { stageIndex: Number(rawStageIndex) } : {}),
        stageStartTime: stage.startTime,
        stageEndTime: stage.endTime,
        mintParams: null,
        salt: '',
        signature: '',
        wallets: targetWallets
      };

      const response = await fetch('/api/simulate-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Simulation request failed');
      }

      setSimulationResults(prev => ({ ...prev, [stage.id]: data }));

      if (data.eligible && data.eligible.length > 0) {
        if (data.warnings?.length) {
          addLog('SUCCESS', `OpenSea access confirmed for ${data.eligible.length} wallet(s) in "${stage.label}". Review the execution warning before minting.`, 'text-synapse-emerald');
        } else {
          addLog('SUCCESS', `Exact on-chain dry-run passed: ${data.eligible.length} wallet(s) can mint from "${stage.label}".`, 'text-synapse-emerald');
        }
      } else if (data.unknown?.length || data.warnings?.length || data.isAllowlistPending) {
        addLog('INFO', `Eligibility check completed for "${stage.label}".`, 'text-synapse-cyan');
      } else {
        addLog('WARNING', `Simulation confirmed that the checked wallet(s) cannot mint one token from "${stage.label}".`, 'text-yellow-500');
      }
    } catch (err: any) {
      addLog('ERROR', `Eligibility check failed: ${err.message}`, 'text-red-500');
      setSimulationResults(prev => ({
        ...prev,
        [stage.id]: {
          eligible: [],
          notEligible: [],
          unknown: targetWallets.map(addr => ({ address: addr, reason: err.message }))
        }
      }));
    } finally {
      setSimulatingStage(null);
    }
  };

  const selectedStage = stages.find(s => s.id === selectedStageId);

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
      <div className="mb-8 flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-synapse-cyan" />
          <h2 className="font-serif text-2xl">Drop Stages & Live Schedule</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-synapse-cyan/20 bg-synapse-cyan/10 px-3 py-1 font-mono text-xs text-synapse-cyan">
          OpenSea Sync
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-synapse-cyan/20 bg-synapse-cyan/5 p-4 text-xs text-synapse-cyan">
        <p className="leading-relaxed">
          <strong>Execution-wallet checks only:</strong> The checker tests wallets explicitly imported in Wallet Manager—never the wallet used to log in. With an OpenSea API key it builds the exact active mint action; otherwise public stages use a funded on-chain dry run.
        </p>
      </div>

      <form onSubmit={handleFetchDrop} className="mb-8 space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-500">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
              OpenSea Drop Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              placeholder="e.g. cyber-samurai-drop"
              required
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
              OpenSea API Key (Optional)
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                onOpenSeaApiKeyChange?.(e.target.value);
              }}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
              placeholder="Your OpenSea API Key"
            />
            <p className="mt-2 text-[11px] text-neutral-500">
              Leave blank to use a temporary server-side OpenSea key. It is never tied to your login wallet.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={isFetching}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 px-4 py-3 font-mono text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {isFetching ? <Loader2 size={16} className="animate-spin" /> : <Layers size={16} />}
          {isFetching ? 'FETCHING SCHEDULE...' : 'FETCH MINT STAGES'}
        </button>
      </form>

      {dropData && (
        <div className="space-y-6">
          {dropData.chain_mismatch && (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 font-mono text-xs text-yellow-400">
              OpenSea located this drop on {String(dropData.chain_mismatch.detected).toUpperCase()}.
              The previous {String(dropData.chain_mismatch.requested).toUpperCase()} target was replaced to prevent a cross-chain simulation.
            </div>
          )}
          {/* Drop Summary */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-serif text-xl text-white">{dropData.name || slug}</h3>
                {dropData.creator && <p className="text-xs text-neutral-500 mt-1">Created by {dropData.creator}</p>}
              </div>
              {dropData.contract_address || dropData.address ? (
                <div className="font-mono text-xs text-neutral-400">
                  <span className="text-neutral-500 mr-2">Contract:</span>
                  <span className="text-synapse-cyan font-bold">
                    {(dropData.contract_address || dropData.address).slice(0, 8)}...{(dropData.contract_address || dropData.address).slice(-6)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-white/5 pt-4 font-mono text-xs sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500 uppercase">Total Supply</span>
                <span className="text-white font-semibold">{dropData.total_supply || 'TBA'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500 uppercase">Total Minted</span>
                <span className="text-white font-semibold">{dropData.total_minted || '0'}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500 uppercase">Chain</span>
                <span className="text-synapse-violet font-semibold uppercase">{dropData.chain || selectedChain}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-neutral-500 uppercase">Total Stages</span>
                <span className="text-synapse-cyan font-semibold">{stages.length}</span>
              </div>
            </div>
          </div>

          {/* Stages List */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h4 className="font-mono text-xs uppercase tracking-widest text-neutral-500">
                Select Stage to Mint From
              </h4>
              <span className="font-mono text-xs text-neutral-500">
                {stages.length} stage{stages.length === 1 ? '' : 's'} available
              </span>
            </div>

            {stages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-neutral-500">
                No active or upcoming mint stages found for this drop.
              </div>
            ) : (
              <div className="space-y-4">
                {stages.map((stage) => {
                  const isSelected = selectedStageId === stage.id;
                  const isSimulating = simulatingStage === stage.id;
                  const result = simulationResults[stage.id];
                  // Only wallets confirmed by the active-stage check belong in the
                  // Eligible list. The API may keep projected results for internal
                  // scheduling, but those must never be presented as confirmed access.
                  const displayedEligible = result?.eligible || [];

                  const startDateStr = stage.startTime ? new Date(stage.startTime * 1000).toLocaleString() : 'TBA';
                  const endDateStr = stage.endTime ? new Date(stage.endTime * 1000).toLocaleString() : 'TBA';

                  // Live countdown recalculation
                  const now = currentTime;
                  let liveBadge = (
                    <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-neutral-400">
                      TBA
                    </span>
                  );

                  if (stage.startTime && stage.endTime) {
                    if (now < stage.startTime) {
                      const diff = stage.startTime - now;
                      const h = Math.floor(diff / 3600);
                      const m = Math.floor((diff % 3600) / 60);
                      const s = diff % 60;
                      liveBadge = (
                        <span className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-yellow-500">
                          <Clock size={10} />
                          Goes Live in {h > 0 ? `${h}h ` : ''}{m}m {s}s
                        </span>
                      );
                    } else if (now >= stage.startTime && now <= stage.endTime) {
                      liveBadge = (
                        <span className="flex items-center gap-1.5 rounded-full border border-synapse-emerald/30 bg-synapse-emerald/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-synapse-emerald animate-pulse">
                          ● LIVE NOW
                        </span>
                      );
                    } else {
                      liveBadge = (
                        <span className="rounded-full bg-neutral-800 px-2.5 py-0.5 font-mono text-[10px] text-neutral-500">
                          ENDED
                        </span>
                      );
                    }
                  } else if (stage.startTime) {
                    if (now < stage.startTime) {
                      const diff = stage.startTime - now;
                      const h = Math.floor(diff / 3600);
                      const m = Math.floor((diff % 3600) / 60);
                      liveBadge = (
                        <span className="flex items-center gap-1.5 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-yellow-500">
                          <Clock size={10} />
                          Starts in {h > 0 ? `${h}h ` : ''}{m}m
                        </span>
                      );
                    } else {
                      liveBadge = (
                        <span className="flex items-center gap-1.5 rounded-full border border-synapse-emerald/30 bg-synapse-emerald/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-synapse-emerald">
                          ● ACTIVE
                        </span>
                      );
                    }
                  }

                  return (
                    <div
                      key={stage.id}
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`cursor-pointer rounded-2xl border transition-all ${
                        isSelected
                          ? 'border-synapse-cyan/50 bg-synapse-cyan/[0.04] shadow-[0_0_20px_rgba(6,182,212,0.1)]'
                          : 'border-white/5 bg-white/[0.01] hover:border-white/20'
                      }`}
                    >
                      <div className="p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                                isSelected ? 'border-synapse-cyan bg-synapse-cyan text-black' : 'border-neutral-600 bg-transparent'
                              }`}
                            >
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </div>
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <h5 className="font-serif text-lg text-white">{stage.label}</h5>
                                {liveBadge}
                                <span className="rounded-md border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] uppercase text-neutral-400">
                                  {stage.phase}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-4 font-mono text-xs text-neutral-400">
                                <div className="flex items-center gap-1.5">
                                  <Calendar size={13} className="text-synapse-cyan" />
                                  <span>{startDateStr}</span>
                                </div>
                                <span>→</span>
                                <span>{endDateStr}</span>
                              </div>
                            </div>
                          </div>

                          <div className="flex sm:flex-col items-end justify-between sm:justify-center gap-1 font-mono text-xs">
                            <div className="text-white text-sm font-semibold">
                              <span className="text-neutral-500 text-xs mr-1.5">Price:</span>
                              {stage.priceEth}
                            </div>
                            <div className="text-neutral-400">
                              Limit: <span className="text-white">{stage.maxMintsPerWallet}</span> per wallet
                            </div>
                          </div>
                        </div>

                        {/* Stage Controls & Eligibility */}
                        <div className="mt-5 border-t border-white/5 pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSimulateStage(stage);
                              }}
                              disabled={isSimulating}
                              className="flex items-center justify-center gap-2 rounded-xl border border-synapse-cyan/30 bg-synapse-cyan/10 px-4 py-2 font-mono text-xs font-semibold text-synapse-cyan transition-colors hover:bg-synapse-cyan/20 disabled:opacity-50"
                            >
                              {isSimulating ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                              {isSimulating ? 'SIMULATING ON-CHAIN...' : 'CHECK WALLET ELIGIBILITY'}
                            </button>

                            {onSelectStageForSniper && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = dropData?.contract_address || dropData?.address || dropData?.contracts?.[0]?.address || slug;
                                  const targetChain = dropData?.chain || selectedChain;
                                  onDetectedChain?.(targetChain);
                                  onSelectStageForSniper(target, stage, {
                                    chain: targetChain,
                                    slug: dropData?.slug || (!slug.startsWith('0x') ? slug : undefined),
                                    openseaApiKey: apiKey.trim() || undefined,
                                  });
                                }}
                                className="flex items-center justify-center gap-1.5 rounded-xl border border-synapse-violet/30 bg-synapse-violet/10 px-3 py-2 font-mono text-xs text-synapse-violet transition-colors hover:bg-synapse-violet/20"
                              >
                                <Zap size={13} />
                                <span>USE IN SNIPER</span>
                              </button>
                            )}

                            {onSelectStageForScheduler && stage.startTime && stage.startTime > currentTime && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const target = dropData?.contract_address || dropData?.address || dropData?.contracts?.[0]?.address || slug;
                                  const stageDate = new Date(stage.startTime * 1000);
                                  const localDateTime = new Date(stageDate.getTime() - stageDate.getTimezoneOffset() * 60_000)
                                    .toISOString()
                                    .slice(0, 16);
                                  const targetChain = dropData?.chain || selectedChain;
                                  onSelectStageForScheduler(target, localDateTime, {
                                    chain: targetChain,
                                    slug: dropData?.slug || (!slug.startsWith('0x') ? slug : undefined),
                                    openseaApiKey: apiKey.trim() || undefined,
                                    isAllowlist: stage.phase === 'presale' || stage.label.toLowerCase().includes('allowlist'),
                                  });
                                }}
                                className="flex items-center justify-center gap-1.5 rounded-xl border border-synapse-emerald/30 bg-synapse-emerald/10 px-3 py-2 font-mono text-xs text-synapse-emerald transition-colors hover:bg-synapse-emerald/20"
                              >
                                <Clock size={13} />
                                <span>SCHEDULE MINT</span>
                              </button>
                            )}
                          </div>

                          {isSelected && (
                            <div className="font-mono text-xs text-synapse-cyan flex items-center gap-1">
                              <Check size={14} /> Selected Stage
                            </div>
                          )}
                        </div>

                        {/* Simulation Results Drawer */}
                        {result && (
                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-white/5 pt-3">
                            <div className="rounded-xl border border-synapse-emerald/20 bg-synapse-emerald/5 p-3">
                              <div className="flex items-center gap-2 text-synapse-emerald mb-2">
                                <CheckCircle2 size={14} />
                                <span className="font-mono text-xs font-bold uppercase tracking-widest">
                                  Eligible Wallets ({displayedEligible.length})
                                </span>
                              </div>
                              <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                                {displayedEligible.length === 0 ? (
                                  <span className="font-mono text-[11px] text-neutral-500">None</span>
                                ) : (
                                  displayedEligible.map((addr) => (
                                    <div key={addr} className="font-mono text-[11px] text-synapse-emerald/90">
                                      {addr}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                              <div className="flex items-center gap-2 text-red-500 mb-2">
                                <XCircle size={14} />
                                <span className="font-mono text-xs font-bold uppercase tracking-widest">
                                  Not Eligible ({result.notEligible.length})
                                </span>
                              </div>
                              <div className="max-h-24 overflow-y-auto custom-scrollbar space-y-1">
                                {result.notEligible.length === 0 ? (
                                  <span className="font-mono text-[11px] text-neutral-500">None</span>
                                ) : (
                                  result.notEligible.map((item) => (
                                    <div
                                      key={item.address}
                                      className="font-mono text-[10px] text-red-400 truncate"
                                      title={item.reason}
                                    >
                                      {item.address.slice(0, 6)}...{item.address.slice(-4)}: {item.reason}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
