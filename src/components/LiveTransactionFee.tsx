import { useEffect, useMemo, useState } from 'react';
import { Activity, Fuel, Loader2 } from 'lucide-react';
import { formatEther } from 'ethers';
import { resolveChain } from '../lib/chains';

interface LiveTransactionFeeProps {
  selectedChain: string;
  gasLimit: string;
  valueWei: string | null;
  exactGasLimit: boolean;
  walletCount: number;
}

interface FeeResponse {
  baseFeeGwei: number;
  tiers: {
    fast: {
      maxFeePerGas: string;
      maxFeeGwei: number;
      maxPriorityFeeGwei: number;
    };
  };
}

const nativeAmount = (wei: bigint, decimals = 6) => {
  const [whole, fraction = ''] = formatEther(wei).split('.');
  const trimmed = fraction.slice(0, decimals).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
};

export const LiveTransactionFee = ({
  selectedChain,
  gasLimit,
  valueWei,
  exactGasLimit,
  walletCount,
}: LiveTransactionFeeProps) => {
  const [fees, setFees] = useState<FeeResponse | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const nativeSymbol = resolveChain(selectedChain)?.nativeSymbol || 'ETH';

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      setRefreshing(true);
      try {
        const response = await fetch(`/api/gas-price?chain=${encodeURIComponent(selectedChain)}`);
        const data = await response.json();
        if (!response.ok || !data.tiers?.fast) throw new Error(data.error || 'Gas feed unavailable');
        if (active) {
          setFees(data);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Gas feed unavailable');
      } finally {
        if (active) setRefreshing(false);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 4_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [selectedChain]);

  const estimate = useMemo(() => {
    if (!fees) return null;
    try {
      const transactionGas = BigInt(gasLimit);
      const maxFee = BigInt(fees.tiers.fast.maxFeePerGas);
      const networkFee = transactionGas * maxFee;
      const mintValue = valueWei === null ? null : BigInt(valueWei);
      const count = Math.max(1, walletCount);
      return {
        networkFee,
        mintValue,
        perWallet: mintValue === null ? networkFee : mintValue + networkFee,
        total: (mintValue === null ? networkFee : mintValue + networkFee) * BigInt(count),
        count,
      };
    } catch {
      return null;
    }
  }, [fees, gasLimit, valueWei, walletCount]);

  return (
    <div className="rounded-2xl border border-synapse-cyan/20 bg-synapse-cyan/[0.04] p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Fuel size={16} className="text-synapse-cyan" />
          <span className="font-mono text-xs font-semibold uppercase tracking-widest text-synapse-cyan">Live Transaction Cost</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {refreshing ? <Loader2 size={11} className="animate-spin" /> : <Activity size={11} className="text-synapse-emerald" />}
          4s live feed
        </div>
      </div>

      {error && !fees ? (
        <p className="text-xs text-red-400">{error}</p>
      ) : estimate && fees ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/5 bg-black/30 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Fast Max Fee</div>
              <div className="font-mono text-sm text-white">{Number(fees.tiers.fast.maxFeeGwei).toFixed(3)} Gwei</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/30 p-3">
              <div className="mb-1 text-[10px] uppercase tracking-widest text-neutral-500">Base / Priority</div>
              <div className="font-mono text-sm text-white">{Number(fees.baseFeeGwei).toFixed(3)} / {Number(fees.tiers.fast.maxPriorityFeeGwei).toFixed(3)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-3 text-neutral-400">
              <span>Gas limit {exactGasLimit ? '(prepared)' : '(provisional)'}</span>
              <span className={exactGasLimit ? 'text-synapse-emerald' : 'text-yellow-500'}>{Number(gasLimit).toLocaleString()}</span>
            </div>
            <div className="flex justify-between gap-3 text-neutral-400">
              <span>Max gas / wallet</span>
              <span className="text-white">{nativeAmount(estimate.networkFee)} {nativeSymbol}</span>
            </div>
            <div className="flex justify-between gap-3 text-neutral-400">
              <span>Mint value / wallet</span>
              <span className="text-white">{estimate.mintValue === null ? 'Unknown until prepared' : `${nativeAmount(estimate.mintValue)} ${nativeSymbol}`}</span>
            </div>
            <div className="flex justify-between gap-3 text-neutral-400">
              <span>Required / wallet</span>
              <span className="text-white">{nativeAmount(estimate.perWallet)} {nativeSymbol}</span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/5 pt-3 font-mono">
            <span className="text-xs uppercase tracking-widest text-neutral-500">Maximum for {estimate.count} transaction{estimate.count === 1 ? '' : 's'}</span>
            <span className="text-base font-semibold text-synapse-emerald">{nativeAmount(estimate.total)} {nativeSymbol}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-500">The displayed gas amount is a maximum at the fast EIP-1559 fee cap. The wallet normally pays less. Preparing the mint replaces the provisional gas limit and value with its exact transaction values.</p>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-neutral-500"><Loader2 size={13} className="animate-spin" /> Loading live gas…</div>
      )}
    </div>
  );
};
