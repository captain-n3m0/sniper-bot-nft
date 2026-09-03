export const Footer = () => {
  return (
    <footer className="mt-24 border-t border-white/5 bg-[#050505] px-6 py-16">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
          <div className="col-span-1 md:col-span-1">
            <span className="font-serif text-4xl text-white">LastLap MintGrid</span>
            <p className="mt-4 max-w-xs text-sm text-neutral-500">
              The fastest web platform for sniping OpenSea public mints on Ethereum, Polygon, and Base.
            </p>
          </div>
          <div>
            <h4 className="mb-6 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Platform</h4>
            <ul className="space-y-3 text-sm text-neutral-400">
              <li><a href="#" className="hover:text-white">Dashboard</a></li>
              <li><a href="#" className="hover:text-white">Pro Plan</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-24 flex flex-col items-center justify-between border-t border-white/5 pt-8 md:flex-row">
          <p className="text-sm text-neutral-600">© 2026 LASTLAP DOT LIVE</p>
          <div className="mt-4 flex items-center gap-3 md:mt-0">
            <div className="relative flex h-2 w-2 items-center justify-center">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-synapse-emerald opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-synapse-emerald"></span>
            </div>
            <span className="font-mono text-xs text-neutral-400">ALL SYSTEMS OPERATIONAL</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
