export const Ticker = () => {
  const metrics = [
    { label: 'Avg Latency', value: '45ms' },
    { label: 'Supported Networks', value: 'ETH, POLY, BASE' },
    { label: 'RPC Integration', value: 'Alchemy & Blast' },
    { label: 'Mempool', value: 'MONITORED' },
    { label: 'Status', value: 'OPERATIONAL', color: 'text-synapse-emerald' },
    { label: 'Success Rate', value: '99.4%' },
    { label: 'Gas Optimization', value: 'Dynamic' },
  ];

  return (
    <div className="relative flex h-[60px] w-full overflow-hidden border-y border-white/5 bg-black/40 backdrop-blur-md">
      <div className="flex animate-ticker items-center w-max">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-12 px-6 shrink-0">
            {metrics.map((item, j) => (
              <div key={`${i}-${j}`} className="flex items-center gap-3 whitespace-nowrap">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">{item.label}</span>
                <span className={`font-mono text-base font-semibold ${item.color || 'text-white'}`}>{item.value}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
