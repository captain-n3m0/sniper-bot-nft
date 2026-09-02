import { useState, useEffect } from 'react';
import { Calculator, Flame, Settings2, ShieldAlert } from 'lucide-react';
import { defaultGasStrategy, GasEstimatorInputs, GasEstimatorOutputs, GasCalculationStrategy } from '../lib/gas-math';

interface GasEstimatorProps {
  addLog: (type: string, message: string, color: string) => void;
  selectedChain: string;
}

export const GasEstimator = ({ addLog, selectedChain }: GasEstimatorProps) => {
  const [inputs, setInputs] = useState<GasEstimatorInputs>({
    floorPriceEth: 0.1,
    pendingBids: 100,
    supplyLeft: 50,
    currentBaseFeeGwei: 15,
  });

  const [outputs, setOutputs] = useState<GasEstimatorOutputs | null>(null);

  // We can easily swap out the strategy here if the user wants to inject custom math later
  const activeStrategy: GasCalculationStrategy = defaultGasStrategy;

  const [isFetchingFee, setIsFetchingFee] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchFee = async () => {
      setIsFetchingFee(true);
      try {
        const res = await fetch(`/api/gas-price?chain=${selectedChain}`);
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (isMounted && data.baseFeeGwei) {
          setInputs(prev => ({ ...prev, currentBaseFeeGwei: Number(data.baseFeeGwei.toFixed(2)) }));
        }
      } catch (err) {
        console.error("Failed to fetch live base fee:", err);
      } finally {
        if (isMounted) setIsFetchingFee(false);
      }
    };
    fetchFee();
    const interval = setInterval(fetchFee, 12000); // refresh every 12s (approx 1 block)
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [selectedChain]);


  useEffect(() => {
    try {
      const result = activeStrategy(inputs);
      setOutputs(result);
    } catch (err) {
      console.error("Gas calculation failed", err);
    }
  }, [inputs, activeStrategy]);

  const handleChange = (field: keyof GasEstimatorInputs, value: string) => {
    const numValue = parseFloat(value);
    setInputs(prev => ({
      ...prev,
      [field]: isNaN(numValue) ? 0 : numValue
    }));
  };

  const getRiskColor = (risk?: string) => {
    switch (risk) {
      case 'Safe': return 'text-synapse-emerald';
      case 'Aggressive': return 'text-yellow-500';
      case 'Ape': return 'text-red-500';
      default: return 'text-neutral-500';
    }
  };

  const handleApplyGas = () => {
    if (outputs) {
      addLog('SYSTEM', `Applied ${outputs.strategyName} strategy parameters. Max Fee: ${outputs.maxFeeGwei} Gwei, Priority: ${outputs.priorityFeeGwei} Gwei.`, 'text-synapse-cyan');
    }
  };

  return (
    <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-8 backdrop-blur-[16px]">
      <div className="mb-8 flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Calculator size={20} className="text-synapse-cyan" />
          <h2 className="font-serif text-2xl">Gas Estimator</h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs text-neutral-400">
          <Settings2 size={12} />
          Modular Math Engine
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
              Expected Floor Price (ETH)
            </label>
            <input 
              type="number" 
              step="0.01"
              value={inputs.floorPriceEth}
              onChange={(e) => handleChange('floorPriceEth', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
              Supply Remaining
            </label>
            <input 
              type="number" 
              value={inputs.supplyLeft}
              onChange={(e) => handleChange('supplyLeft', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
            />
          </div>

          <div>
            <label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">
              Estimated Pending Bids / Snipers
            </label>
            <input 
              type="number" 
              value={inputs.pendingBids}
              onChange={(e) => handleChange('pendingBids', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-synapse-cyan/50 focus:bg-white/5 transition-colors"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-neutral-500">
              <Flame size={14} className="text-yellow-500" /> Live Network Base Fee (Gwei) {isFetchingFee && <span className="animate-pulse text-synapse-cyan">●</span>}
            </label>
            <input 
              type="number" 
              value={inputs.currentBaseFeeGwei}
              onChange={(e) => handleChange('currentBaseFeeGwei', e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 font-mono text-sm text-neutral-300 outline-none focus:border-yellow-500/50 focus:bg-white/5 transition-colors"
            />
          </div>
        </div>

        {/* Outputs */}
        <div className="flex flex-col justify-between rounded-2xl border border-white/5 bg-[#0a0a0a] p-6">
          <div>
            <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-neutral-500">Algorithm Recommendation</h3>
            
            {outputs ? (
              <div className="space-y-6">
                <div>
                  <div className="text-xs text-neutral-500 uppercase tracking-widest mb-1">Strategy Profile</div>
                  <div className={`font-serif text-xl ${getRiskColor(outputs.riskLevel)}`}>
                    {outputs.strategyName} ({outputs.riskLevel})
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Max Priority Fee</div>
                    <div className="font-mono text-xl text-white">{outputs.priorityFeeGwei} <span className="text-sm text-neutral-500">Gwei</span></div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Max Fee Per Gas</div>
                    <div className="font-mono text-xl text-white">{outputs.maxFeeGwei} <span className="text-sm text-neutral-500">Gwei</span></div>
                  </div>
                </div>

                {outputs.riskLevel === 'Ape' && (
                  <div className="flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4">
                    <ShieldAlert size={16} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-400">
                      High contention detected. Priority fee recommendations are elevated to guarantee inclusion. Ensure your wallet has sufficient balance to cover extreme gas spikes.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-sm text-neutral-500">Calculating...</span>
              </div>
            )}
          </div>

          <button 
            onClick={handleApplyGas}
            disabled={!outputs}
            className="mt-8 w-full rounded-xl bg-synapse-cyan/10 border border-synapse-cyan/20 px-4 py-3 font-mono text-sm font-semibold text-synapse-cyan transition-colors hover:bg-synapse-cyan/20"
          >
            APPLY TO SNIPER
          </button>
        </div>
      </div>
    </div>
  );
};
