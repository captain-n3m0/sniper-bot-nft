import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, Clock3, Database, Radio, RefreshCw, Server, Timer, TriangleAlert } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';

type ServiceState = 'operational' | 'degraded' | 'outage';

interface StatusPayload {
  generatedAt: string;
  overall: ServiceState;
  uptimeSeconds: number;
  components: {
    api: { status: ServiceState };
    database: { status: ServiceState };
    scheduler: { status: ServiceState; tickIntervalMs: number };
  };
  networks: Array<{ key: string; name: string; chainId: number; status: ServiceState; latencyMs: number | null; blockNumber: number | null }>;
}

const stateStyle = (state: ServiceState) => {
  if (state === 'operational') return { text: 'text-synapse-emerald', border: 'border-synapse-emerald/25', background: 'bg-synapse-emerald/10', label: 'Operational' };
  if (state === 'degraded') return { text: 'text-yellow-400', border: 'border-yellow-400/25', background: 'bg-yellow-400/10', label: 'Degraded' };
  return { text: 'text-red-400', border: 'border-red-400/25', background: 'bg-red-400/10', label: 'Outage' };
};

const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${days ? `${days}d ` : ''}${hours}h ${minutes}m`;
};

const ComponentRow = ({ name, description, state, icon: Icon }: { name: string; description: string; state: ServiceState; icon: typeof Server }) => {
  const style = stateStyle(state);
  return (
    <div className="flex items-center justify-between gap-4 border-t border-white/5 px-5 py-4 first:border-t-0">
      <div className="flex items-center gap-3"><div className="rounded-xl border border-white/5 bg-white/5 p-2"><Icon size={16} className="text-neutral-400" /></div><div><div className="text-sm font-medium text-white">{name}</div><div className="mt-1 text-xs text-neutral-500">{description}</div></div></div>
      <div className={`flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${style.text} ${style.border} ${style.background}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{style.label}</div>
    </div>
  );
};

export const Status = () => {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setRefreshing(true);
      try {
        const response = await fetch('/api/status');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Status feed unavailable');
        if (active) {
          setData(payload);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Status feed unavailable');
      } finally {
        if (active) setRefreshing(false);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const overall = data ? stateStyle(data.overall) : stateStyle('degraded');

  return (
    <main className="min-h-screen bg-[#030303] text-white selection:bg-synapse-violet/30">
      <Navigation />
      <section className="mx-auto max-w-5xl px-6 pb-12 pt-36">
        <div className="mb-12 text-center">
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border ${overall.border} ${overall.background}`}>
            {data?.overall === 'operational' ? <CheckCircle2 size={30} className={overall.text} /> : <TriangleAlert size={30} className={overall.text} />}
          </div>
          <h1 className="font-serif text-5xl md:text-7xl">{data ? (data.overall === 'operational' ? 'All Systems Operational' : data.overall === 'degraded' ? 'Some Systems Degraded' : 'Service Disruption') : 'Checking Systems'}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-neutral-400">Live health checks for LastLap MintGrid infrastructure and every supported blockchain network.</p>
          <div className="mt-5 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-neutral-600"><RefreshCw size={12} className={refreshing ? 'animate-spin text-synapse-cyan' : ''} /> Automatically checked every 15 seconds</div>
        </div>

        {error && !data ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-center text-red-300">{error}</div>
        ) : data ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><Clock3 size={17} className="mb-4 text-synapse-emerald" /><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Deployment uptime</div><div className="mt-2 font-mono text-xl text-white">{duration(data.uptimeSeconds)}</div></div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><Radio size={17} className="mb-4 text-synapse-cyan" /><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Networks online</div><div className="mt-2 font-mono text-xl text-white">{data.networks.filter((network) => network.status === 'operational').length} / {data.networks.length}</div></div>
              <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5"><Activity size={17} className="mb-4 text-synapse-violet" /><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">Last checked</div><div className="mt-2 font-mono text-xl text-white">{new Date(data.generatedAt).toLocaleTimeString()}</div></div>
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.02]">
              <div className="px-5 py-5"><h2 className="font-serif text-2xl">Core Services</h2></div>
              <ComponentRow name="Web API" description="Authentication, mint preparation, simulation, and broadcasting" state={data.components.api.status} icon={Server} />
              <ComponentRow name="User Database" description="Wallet-scoped encrypted configuration storage" state={data.components.database.status} icon={Database} />
              <ComponentRow name="Mint Scheduler" description={`Background execution loop • ${data.components.scheduler.tickIntervalMs}ms precision`} state={data.components.scheduler.status} icon={Timer} />
            </div>

            <div className="overflow-hidden rounded-[24px] border border-white/5 bg-white/[0.02]">
              <div className="px-5 py-5"><h2 className="font-serif text-2xl">Blockchain RPC Networks</h2><p className="mt-1 text-xs text-neutral-500">A network is operational when at least one configured RPC responds with a current block.</p></div>
              {data.networks.map((network) => {
                const style = stateStyle(network.status);
                return (
                  <div key={network.key} className="grid grid-cols-[1fr_auto] items-center gap-4 border-t border-white/5 px-5 py-4 sm:grid-cols-[1fr_auto_auto]">
                    <div><div className="text-sm font-medium text-white">{network.name}</div><div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-neutral-600">Chain ID {network.chainId}</div></div>
                    <div className="hidden text-right font-mono text-xs text-neutral-500 sm:block">{network.blockNumber === null ? 'No block response' : `Block ${network.blockNumber.toLocaleString()}`}<div className="mt-1 text-[10px] text-neutral-600">{network.latencyMs === null ? '—' : `${network.latencyMs} ms`}</div></div>
                    <div className={`flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest ${style.text}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{style.label}</div>
                  </div>
                );
              })}
            </div>

            <p className="text-center text-xs leading-relaxed text-neutral-600">Uptime represents the current server deployment. RPC status is measured directly from configured endpoints and may differ from regional connectivity.</p>
          </div>
        ) : null}
      </section>
      <Footer />
    </main>
  );
};
