import { useEffect, useMemo, useState } from 'react';
import { Activity, Clock3, Cpu, Database, Gauge, Radio, RefreshCw, Users, Zap } from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';

interface MetricsPayload {
  generatedAt: string;
  startedAt: string;
  uptimeSeconds: number;
  requests: { total: number; errors: number; successRate: number; averageLatencyMs: number };
  series: Array<{ timestamp: string; requests: number; errors: number; averageLatencyMs: number; maxLatencyMs: number }>;
  topEndpoints: Array<{ path: string; requests: number; errors: number; averageLatencyMs: number }>;
  rpc: Array<{ key: string; name: string; successes: number; failures: number; successRate: number | null; lastLatencyMs: number | null }>;
  activity: { users: number; broadcasts: number; confirmedTransactions: number; revertedTransactions: number; scheduledJobs: number; completedJobs: number; failedJobs: number };
  runtime: { node: string; rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
}

const duration = (seconds: number) => {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days ? `${days}d ${hours}h ${minutes}m` : hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
};

const bytes = (value: number) => `${(value / 1024 / 1024).toFixed(1)} MB`;

const LineChart = ({ values, color, label }: { values: number[]; color: string; label: string }) => {
  const maximum = Math.max(1, ...values);
  const points = values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 600;
    const y = 165 - (value / maximum) * 145;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const area = `0,180 ${points} 600,180`;
  return (
    <div className="h-48 w-full" role="img" aria-label={label}>
      <svg viewBox="0 0 600 180" className="h-full w-full overflow-visible" preserveAspectRatio="none">
        {[20, 60, 100, 140].map((y) => <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />)}
        <polygon points={area} fill={color} opacity="0.08" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
};

const MetricCard = ({ label, value, detail, icon: Icon, accent = 'text-synapse-cyan' }: { label: string; value: string; detail: string; icon: typeof Activity; accent?: string }) => (
  <div className="rounded-2xl border border-white/5 bg-white/[0.025] p-5">
    <div className="mb-4 flex items-center justify-between">
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">{label}</span>
      <Icon size={16} className={accent} />
    </div>
    <div className="font-mono text-2xl font-semibold text-white">{value}</div>
    <div className="mt-2 text-xs text-neutral-500">{detail}</div>
  </div>
);

export const Metrics = () => {
  const [data, setData] = useState<MetricsPayload | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setRefreshing(true);
      try {
        const response = await fetch('/api/metrics');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Metrics feed unavailable');
        if (active) {
          setData(payload);
          setError('');
        }
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Metrics feed unavailable');
      } finally {
        if (active) setRefreshing(false);
      }
    };
    // Seed the RPC cards with one lightweight block-number probe on page load.
    void fetch('/api/metrics/probe', { method: 'POST' }).finally(() => void load());
    const timer = setInterval(() => void load(), 5_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const requestSeries = useMemo(() => data?.series.map((point) => point.requests) || [], [data]);
  const latencySeries = useMemo(() => data?.series.map((point) => point.averageLatencyMs) || [], [data]);

  return (
    <main className="min-h-screen bg-[#030303] text-white selection:bg-synapse-violet/30">
      <Navigation />
      <section className="mx-auto max-w-7xl px-6 pb-12 pt-36">
        <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-synapse-cyan"><Activity size={14} /> Live telemetry</div>
            <h1 className="font-serif text-5xl md:text-7xl">Platform Metrics</h1>
            <p className="mt-4 max-w-2xl text-neutral-400">Real-time operational telemetry from the current LastLap MintGrid server deployment. Request graphs cover the latest rolling 60 minutes.</p>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-neutral-500">
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-synapse-cyan' : ''} />
            Refreshes every 5 seconds
          </div>
        </div>

        {error && !data ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-6 text-red-300">{error}</div>
        ) : data ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Deployment uptime" value={duration(data.uptimeSeconds)} detail={`Started ${new Date(data.startedAt).toLocaleString()}`} icon={Clock3} accent="text-synapse-emerald" />
              <MetricCard label="API success rate" value={`${data.requests.successRate.toFixed(2)}%`} detail={`${data.requests.errors} errors across ${data.requests.total} requests`} icon={Gauge} accent="text-synapse-emerald" />
              <MetricCard label="Average latency" value={`${data.requests.averageLatencyMs} ms`} detail="All observed API operations" icon={Zap} accent="text-yellow-400" />
              <MetricCard label="Memory footprint" value={bytes(data.runtime.rssBytes)} detail={`${bytes(data.runtime.heapUsedBytes)} heap used • ${data.runtime.node}`} icon={Cpu} accent="text-synapse-violet" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-6">
                <div className="mb-6 flex items-center justify-between"><div><h2 className="font-serif text-2xl">Request Volume</h2><p className="mt-1 text-xs text-neutral-500">Requests per minute</p></div><Radio size={18} className="text-synapse-cyan" /></div>
                <LineChart values={requestSeries} color="#06B6D4" label="API requests during the last 60 minutes" />
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-600"><span>60 minutes ago</span><span>Now</span></div>
              </div>
              <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-6">
                <div className="mb-6 flex items-center justify-between"><div><h2 className="font-serif text-2xl">Response Latency</h2><p className="mt-1 text-xs text-neutral-500">Average milliseconds per minute</p></div><Activity size={18} className="text-synapse-violet" /></div>
                <LineChart values={latencySeries} color="#8B5CF6" label="Average API latency during the last 60 minutes" />
                <div className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-neutral-600"><span>60 minutes ago</span><span>Now</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
              <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-6 lg:col-span-3">
                <div className="mb-5 flex items-center gap-2"><Radio size={16} className="text-synapse-cyan" /><h2 className="font-serif text-2xl">RPC Performance</h2></div>
                <div className="space-y-2">
                  {data.rpc.map((network) => (
                    <div key={network.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-xl border border-white/5 bg-black/30 px-4 py-3">
                      <div><div className="text-sm text-white">{network.name}</div><div className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">{network.successes + network.failures} observed calls</div></div>
                      <div className="text-right font-mono text-xs text-neutral-400">{network.lastLatencyMs === null ? 'No calls yet' : `${network.lastLatencyMs} ms`}</div>
                      <div className={`w-16 text-right font-mono text-xs ${network.successRate === null || network.successRate >= 95 ? 'text-synapse-emerald' : 'text-yellow-400'}`}>{network.successRate === null ? '—' : `${network.successRate}%`}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 lg:col-span-2">
                <MetricCard label="Known users" value={String(data.activity.users)} detail="Unique SIWE login addresses" icon={Users} />
                <MetricCard label="Transaction broadcasts" value={String(data.activity.broadcasts)} detail={`${data.activity.confirmedTransactions} confirmed • ${data.activity.revertedTransactions} reverted`} icon={Zap} accent="text-synapse-emerald" />
                <MetricCard label="Scheduler jobs" value={String(data.activity.scheduledJobs)} detail={`${data.activity.completedJobs} completed • ${data.activity.failedJobs} failed`} icon={Database} accent="text-synapse-violet" />
              </div>
            </div>

            <div className="rounded-[24px] border border-white/5 bg-white/[0.02] p-6">
              <h2 className="mb-5 font-serif text-2xl">Most Active API Operations</h2>
              {data.topEndpoints.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead className="font-mono text-[10px] uppercase tracking-widest text-neutral-600"><tr><th className="pb-3">Operation</th><th className="pb-3">Requests</th><th className="pb-3">Errors</th><th className="pb-3">Average latency</th></tr></thead><tbody>{data.topEndpoints.map((endpoint) => <tr key={endpoint.path} className="border-t border-white/5 font-mono text-xs text-neutral-400"><td className="py-3 text-white">{endpoint.path}</td><td>{endpoint.requests}</td><td>{endpoint.errors}</td><td>{endpoint.averageLatencyMs} ms</td></tr>)}</tbody></table></div> : <p className="text-sm text-neutral-500">No API activity has been recorded since this deployment started.</p>}
            </div>
          </div>
        ) : null}
      </section>
      <Footer />
    </main>
  );
};
