import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Clock3,
  Gauge,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { Navigation } from "../components/Navigation";
import { WalletLogin } from "../components/WalletLogin";

type Capability =
  | "sniper"
  | "scheduler"
  | "dropStages"
  | "walletManager"
  | "fundDisperser"
  | "gasEstimator";
type CapabilityMap = Record<Capability, boolean>;
type Grant = {
  address: string;
  enabled: boolean;
  isAdmin: boolean;
  maxWallets: number;
  capabilities: CapabilityMap;
  createdAt: string;
  updatedAt: string;
};
type MintLog = {
  id: string;
  address_key: string;
  wallet_address: string | null;
  chain_key: string;
  status: "success" | "failed";
  quantity: number;
  tx_hash: string | null;
  error: string | null;
  source: string;
  job_id: string | null;
  created_at: string;
};
type AdminMetrics = {
  generatedAt: string;
  uptimeSeconds: number;
  users: {
    active: number;
    observed: number;
    known: number;
    accessGrants: number;
    storedWallets: number;
    records: Array<{
      address: string;
      lastSeenAt: string;
      active: boolean;
      requests: number;
      errors: number;
      averageLatencyMs: number;
      topEndpoints: Array<{
        path: string;
        requests: number;
        errors: number;
        averageLatencyMs: number;
      }>;
    }>;
  };
  requests: {
    total: number;
    errors: number;
    successRate: number;
    averageLatencyMs: number;
  };
  series: Array<{
    timestamp: string;
    requests: number;
    errors: number;
    averageLatencyMs: number;
    maxLatencyMs: number;
  }>;
  topEndpoints: Array<{
    path: string;
    requests: number;
    errors: number;
    averageLatencyMs: number;
  }>;
  rpc: Array<{
    key: string;
    name: string;
    successes: number;
    failures: number;
    successRate: number | null;
    lastLatencyMs: number | null;
  }>;
  activity: {
    broadcasts: number;
    confirmedTransactions: number;
    revertedTransactions: number;
    runningJobs: number;
    queuedJobs: number;
    completedJobs: number;
    failedJobs: number;
  };
  runtime: { node: string; rssBytes: number; heapUsedBytes: number };
};

const capabilityLabels: Record<Capability, string> = {
  sniper: "Sniper minting",
  scheduler: "Scheduled minting",
  dropStages: "Drop stages & eligibility",
  walletManager: "Wallet manager",
  fundDisperser: "Fund disperser",
  gasEstimator: "Gas estimator",
};
const allCapabilities = (): CapabilityMap => ({
  sniper: true,
  scheduler: true,
  dropStages: true,
  walletManager: true,
  fundDisperser: true,
  gasEstimator: true,
});
const shortAddress = (address: string) =>
  `${address.slice(0, 8)}...${address.slice(-6)}`;
const formatTime = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "medium",
  });
const formatDuration = (seconds: number) =>
  seconds < 60
    ? `${seconds}s`
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
      : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const points = values
    .map(
      (value, index) =>
        `${values.length > 1 ? (index / (values.length - 1)) * 100 : 50},${100 - (value / max) * 88 - 6}`,
    )
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-28 w-full"
    >
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  accent = "text-synapse-cyan",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          {label}
        </span>
        <Icon size={17} className={accent} />
      </div>
      <div className="text-3xl font-semibold text-white">{value}</div>
      <p className="mt-2 text-xs text-neutral-500">{detail}</p>
    </div>
  );
}

export const Admin = () => {
  const [token, setToken] = useState(
    () => localStorage.getItem("auth_token") || "",
  );
  const [address, setAddress] = useState(
    () => localStorage.getItem("auth_address") || "",
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [mintLogs, setMintLogs] = useState<MintLog[]>([]);
  const [selected, setSelected] = useState<Grant | null>(null);
  const [newAddress, setNewAddress] = useState("");
  const [newCapabilities, setNewCapabilities] =
    useState<CapabilityMap>(allCapabilities());
  const [newEnabled, setNewEnabled] = useState(true);
  const [newIsAdmin, setNewIsAdmin] = useState(false);
  const [newMaxWallets, setNewMaxWallets] = useState(100);
  const [loading, setLoading] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [metricsError, setMetricsError] = useState("");
  const [notice, setNotice] = useState("");

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    const text = await response.text();
    let body: any = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`Server returned ${response.status} instead of JSON`);
    }
    if (response.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_address");
      setToken("");
      setAddress("");
    }
    if (!response.ok || !body.success)
      throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  };

  const loadGrants = async () => {
    setLoading(true);
    setError("");
    try {
      const body = await request("/api/admin/access");
      setIsAdmin(true);
      setGrants(Array.isArray(body.grants) ? body.grants : []);
    } catch (err: any) {
      setIsAdmin(false);
      setError(err?.message || "Administrator access required");
    } finally {
      setLoading(false);
    }
  };
  const loadMetrics = async () => {
    setLoadingMetrics(true);
    setMetricsError("");
    try {
      setMetrics((await request("/api/admin/metrics")) as AdminMetrics);
    } catch (err: any) {
      setMetricsError(err?.message || "Could not load admin metrics");
    } finally {
      setLoadingMetrics(false);
    }
  };
  const loadMintLogs = async () => {
    try {
      const body = await request("/api/admin/logs?limit=2000");
      setMintLogs(Array.isArray(body.logs) ? body.logs : []);
    } catch (err: any) {
      setMetricsError(err?.message || "Could not load mint logs");
    }
  };

  useEffect(() => {
    if (token) void loadGrants();
  }, [token]);
  useEffect(() => {
    if (!isAdmin) return;
    void loadMetrics();
    void loadMintLogs();
    const interval = window.setInterval(() => {
      void loadMetrics();
      void loadMintLogs();
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [isAdmin, token]);

  const login = (nextAddress: string, nextToken: string) => {
    setAddress(nextAddress);
    setToken(nextToken);
    setError("");
  };
  const signOut = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_address");
    setToken("");
    setAddress("");
    setIsAdmin(false);
    setGrants([]);
    setMetrics(null);
    setError("");
  };
  const saveGrant = async (
    grantAddress: string,
    enabled: boolean,
    isAdminGrant: boolean,
    maxWallets: number,
    capabilities: CapabilityMap,
  ) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(grantAddress)) {
      setError("Enter a valid EVM wallet address");
      return;
    }
    if (isAdminGrant && !enabled) {
      setError("Administrator access requires Access enabled");
      return;
    }
    if (
      !Number.isSafeInteger(maxWallets) ||
      maxWallets < 0 ||
      maxWallets > 100
    ) {
      setError("Wallet limit must be an integer between 0 and 100");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const body = await request(`/api/admin/access/${grantAddress}`, {
        method: "PUT",
        body: JSON.stringify({
          enabled,
          isAdmin: isAdminGrant,
          maxWallets,
          capabilities,
        }),
      });
      const saved = body.grant as Grant;
      setGrants((current) => [
        saved,
        ...current.filter(
          (item) => item.address.toLowerCase() !== saved.address.toLowerCase(),
        ),
      ]);
      setSelected(null);
      setNewAddress("");
      setNewCapabilities(allCapabilities());
      setNewEnabled(true);
      setNewIsAdmin(false);
      setNewMaxWallets(100);
      setNotice(`Access updated for ${shortAddress(saved.address)}.`);
      void loadMetrics();
    } catch (err: any) {
      setError(err?.message || "Could not save access grant");
    } finally {
      setSaving(false);
    }
  };
  const removeGrant = async (grant: Grant) => {
    if (!window.confirm(`Remove access for ${grant.address}?`)) return;
    setSaving(true);
    setError("");
    try {
      await request(`/api/admin/access/${grant.address}`, { method: "DELETE" });
      setGrants((current) =>
        current.filter(
          (item) => item.address.toLowerCase() !== grant.address.toLowerCase(),
        ),
      );
      setNotice(`Access removed for ${shortAddress(grant.address)}.`);
      void loadMetrics();
    } catch (err: any) {
      setError(err?.message || "Could not remove access grant");
    } finally {
      setSaving(false);
    }
  };
  const deleteMintLogs = async () => {
    if (!mintLogs.length || !window.confirm(`Delete all ${mintLogs.length} retained mint logs? This cannot be undone.`)) return;
    setSaving(true);
    setError("");
    try {
      const body = await request("/api/admin/logs", { method: "DELETE" });
      setMintLogs([]);
      setNotice(`Deleted ${Number(body.deleted || 0)} retained mint log(s).`);
    } catch (err: any) {
      setError(err?.message || "Could not delete mint logs");
    } finally {
      setSaving(false);
    }
  };

  const formCapabilities = selected?.capabilities || newCapabilities;
  const setFormCapabilities = (next: CapabilityMap) =>
    selected
      ? setSelected({ ...selected, capabilities: next })
      : setNewCapabilities(next);
  const formAddress = selected?.address || newAddress;
  const formEnabled = selected?.enabled ?? newEnabled;
  const setFormEnabled = (enabled: boolean) =>
    selected ? setSelected({ ...selected, enabled }) : setNewEnabled(enabled);
  const formIsAdmin = selected?.isAdmin ?? newIsAdmin;
  const setFormIsAdmin = (isAdminGrant: boolean) => {
    if (isAdminGrant) setFormEnabled(true);
    if (selected) setSelected({ ...selected, isAdmin: isAdminGrant });
    else setNewIsAdmin(isAdminGrant);
  };
  const formMaxWallets = selected?.maxWallets ?? newMaxWallets;
  const setFormMaxWallets = (maxWallets: number) =>
    selected
      ? setSelected({ ...selected, maxWallets })
      : setNewMaxWallets(maxWallets);
  const maxEndpointRequests = useMemo(
    () =>
      Math.max(
        ...(metrics?.topEndpoints.map((endpoint) => endpoint.requests) || [1]),
        1,
      ),
    [metrics],
  );
  const editUserPermissions = (userAddress: string) => {
    const grant = grants.find(
      (item) => item.address.toLowerCase() === userAddress.toLowerCase(),
    );
    if (grant) {
      setSelected(grant);
    } else {
      setSelected(null);
      setNewAddress(userAddress);
      setNewCapabilities(allCapabilities());
      setNewEnabled(false);
      setNewIsAdmin(false);
      setNewMaxWallets(100);
    }
    window.setTimeout(
      () =>
        document
          .getElementById("access-editor")
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      0,
    );
  };

  return (
    <>
      {!token && <WalletLogin onLogin={login} />}
      <Navigation />
      <main
        className={`min-h-screen bg-[#030303] px-6 pb-24 pt-32 text-white ${!token ? "pointer-events-none opacity-0" : ""}`}
      >
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-synapse-cyan">
                Control plane
              </p>
              <h1 className="font-serif text-5xl">Admin Console</h1>
              <p className="mt-3 text-sm text-neutral-500">
                Manage access, observe usage, and monitor the MintGrid runtime.
              </p>
            </div>
            {address && (
              <div className="hidden items-center gap-2 rounded-full border border-synapse-emerald/30 bg-synapse-emerald/5 px-4 py-2 font-mono text-xs uppercase tracking-widest text-synapse-emerald md:flex">
                <ShieldCheck size={15} /> {shortAddress(address)}
              </div>
            )}
          </div>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 size={16} className="animate-spin" /> Checking
              administrator permissions…
            </div>
          )}
          {error && (
            <div className="mb-6 flex items-start justify-between gap-3 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-300">
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="shrink-0 rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:border-synapse-cyan/60"
              >
                Switch wallet
              </button>
            </div>
          )}
          {notice && (
            <div className="mb-6 rounded-xl border border-synapse-emerald/25 bg-synapse-emerald/10 p-4 text-sm text-synapse-emerald">
              {notice}
            </div>
          )}
          {isAdmin && (
            <>
              <section className="mb-8">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-synapse-cyan">
                      Live overview
                    </p>
                    <h2 className="mt-1 font-serif text-3xl">
                      System telemetry
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadMetrics()}
                    disabled={loadingMetrics}
                    className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-400 hover:text-white disabled:opacity-50"
                  >
                    <RefreshCw
                      size={13}
                      className={loadingMetrics ? "animate-spin" : ""}
                    />{" "}
                    Refresh
                  </button>
                </div>
                {metricsError && (
                  <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-300">
                    {metricsError}
                  </div>
                )}
                {metrics && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
                      <StatCard
                        label="Active users"
                        value={metrics.users.active}
                        detail="Seen in the last 15 minutes"
                        icon={Users}
                        accent="text-synapse-emerald"
                      />
                      <StatCard
                        label="Known users"
                        value={metrics.users.known}
                        detail={`${metrics.users.accessGrants} enabled grants`}
                        icon={ShieldCheck}
                      />
                      <StatCard
                        label="API requests"
                        value={metrics.requests.total}
                        detail={`${metrics.requests.errors} errors`}
                        icon={Activity}
                      />
                      <StatCard
                        label="Success rate"
                        value={`${metrics.requests.successRate}%`}
                        detail={`${metrics.requests.averageLatencyMs} ms average`}
                        icon={Gauge}
                        accent="text-synapse-violet"
                      />
                      <StatCard
                        label="Running jobs"
                        value={metrics.activity.runningJobs}
                        detail={`${metrics.activity.queuedJobs} queued or paused`}
                        icon={Clock3}
                        accent="text-yellow-400"
                      />
                      <StatCard
                        label="Uptime"
                        value={formatDuration(metrics.uptimeSeconds)}
                        detail={`${formatBytes(metrics.runtime.rssBytes)} resident memory`}
                        icon={Server}
                        accent="text-synapse-cyan"
                      />
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div>
                            <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                              Request volume
                            </p>
                            <p className="mt-1 text-sm text-neutral-300">
                              Rolling 60-minute activity
                            </p>
                          </div>
                          <div className="flex gap-4 font-mono text-[10px] uppercase tracking-widest">
                            <span className="text-synapse-cyan">
                              ● requests
                            </span>
                            <span className="text-red-400">● errors</span>
                          </div>
                        </div>
                        <Sparkline
                          values={metrics.series.map((point) => point.requests)}
                          color="#06b6d4"
                        />
                        <div className="-mt-8 opacity-80">
                          <Sparkline
                            values={metrics.series.map((point) => point.errors)}
                            color="#f87171"
                          />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="mb-4 flex items-center gap-2">
                          <BarChart3
                            size={16}
                            className="text-synapse-violet"
                          />
                          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            Most used APIs
                          </p>
                        </div>
                        <div className="space-y-3">
                          {metrics.topEndpoints.slice(0, 6).map((endpoint) => (
                            <div key={endpoint.path}>
                              <div className="mb-1 flex justify-between gap-3 font-mono text-[10px]">
                                <span className="truncate text-neutral-400">
                                  {endpoint.path}
                                </span>
                                <span className="text-white">
                                  {endpoint.requests}
                                </span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/5">
                                <div
                                  className="h-full rounded-full bg-synapse-violet"
                                  style={{
                                    width: `${Math.max(3, (endpoint.requests / maxEndpointRequests) * 100)}%`,
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="mb-4 flex items-center gap-2">
                          <Users size={16} className="text-synapse-emerald" />
                          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            Active and recent users
                          </p>
                        </div>
                        {metrics.users.records.length === 0 ? (
                          <p className="py-8 text-center text-sm text-neutral-500">
                            No authenticated API activity observed since the
                            last restart.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-left">
                              <thead className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
                                <tr>
                                  <th className="pb-3">Wallet</th>
                                  <th className="pb-3">Last seen</th>
                                  <th className="pb-3">Requests</th>
                                  <th className="pb-3">Errors</th>
                                  <th className="pb-3">Avg latency</th>
                                  <th className="pb-3">API activity</th>
                                  <th className="pb-3 text-right">Permissions</th>
                                </tr>
                              </thead>
                              <tbody className="text-xs">
                                {metrics.users.records
                                  .slice(0, 30)
                                  .map((user) => (
                                    <tr
                                      key={user.address}
                                      className="border-t border-white/5 align-top"
                                    >
                                      <td className="py-3 font-mono text-white">
                                        <span
                                          className={`mr-2 inline-block h-2 w-2 rounded-full ${user.active ? "bg-synapse-emerald" : "bg-neutral-700"}`}
                                        />
                                        {shortAddress(user.address)}
                                      </td>
                                      <td className="py-3 text-neutral-500">
                                        {formatTime(user.lastSeenAt)}
                                      </td>
                                      <td className="py-3 text-neutral-300">
                                        {user.requests}
                                      </td>
                                      <td className="py-3 text-red-300">
                                        {user.errors}
                                      </td>
                                      <td className="py-3 text-neutral-300">
                                        {user.averageLatencyMs} ms
                                      </td>
                                      <td className="py-3 font-mono text-[10px] text-neutral-500">
                                        {user.topEndpoints.length ? (
                                          <div className="space-y-1">
                                            {user.topEndpoints
                                              .slice(0, 4)
                                              .map((endpoint) => (
                                                <div
                                                  key={endpoint.path}
                                                  className="flex max-w-[260px] items-center justify-between gap-3"
                                                >
                                                  <span
                                                    className="truncate"
                                                    title={endpoint.path}
                                                  >
                                                    {endpoint.path}
                                                  </span>
                                                  <span className="shrink-0 text-neutral-300">
                                                    {endpoint.requests}×
                                                  </span>
                                                </div>
                                              ))}
                                          </div>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                      <td className="py-3 text-right">
                                        <button
                                          type="button"
                                          onClick={() => editUserPermissions(user.address)}
                                          className="whitespace-nowrap rounded-lg border border-synapse-cyan/30 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-widest text-synapse-cyan hover:bg-synapse-cyan/10"
                                        >
                                          {grants.some(
                                            (grant) =>
                                              grant.address.toLowerCase() ===
                                              user.address.toLowerCase(),
                                          )
                                            ? "Edit"
                                            : "Whitelist"}
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                        <div className="mb-4 flex items-center gap-2">
                          <Server size={16} className="text-synapse-cyan" />
                          <p className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
                            RPC health
                          </p>
                        </div>
                        <div className="space-y-3">
                          {metrics.rpc.map((rpc) => (
                            <div
                              key={rpc.key}
                              className="flex items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0 last:pb-0"
                            >
                              <div>
                                <p className="text-sm text-white">{rpc.name}</p>
                                <p className="font-mono text-[10px] text-neutral-600">
                                  {rpc.successes} ok • {rpc.failures} failed
                                </p>
                              </div>
                              <div className="text-right">
                                <p
                                  className={
                                    rpc.successRate === null ||
                                    rpc.successRate >= 99
                                      ? "text-synapse-emerald"
                                      : "text-yellow-400"
                                  }
                                >
                                  {rpc.successRate === null
                                    ? "—"
                                    : `${rpc.successRate}%`}
                                </p>
                                <p className="font-mono text-[10px] text-neutral-600">
                                  {rpc.lastLatencyMs === null
                                    ? "Awaiting data"
                                    : `${rpc.lastLatencyMs} ms`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <StatCard
                        label="Stored wallets"
                        value={metrics.users.storedWallets}
                        detail="Across all user vaults"
                        icon={LockKeyhole}
                      />
                      <StatCard
                        label="Broadcasts"
                        value={metrics.activity.broadcasts}
                        detail={`${metrics.activity.confirmedTransactions} confirmed`}
                        icon={Activity}
                      />
                      <StatCard
                        label="Scheduler history"
                        value={metrics.activity.completedJobs}
                        detail={`${metrics.activity.failedJobs} failed jobs`}
                        icon={Clock3}
                      />
                      <StatCard
                        label="Heap used"
                        value={formatBytes(metrics.runtime.heapUsedBytes)}
                        detail={`Node ${metrics.runtime.node}`}
                        icon={Gauge}
                        accent="text-synapse-violet"
                      />
                    </div>
                  </>
                )}
              </section>
              <section className="mb-8 rounded-[24px] border border-white/10 bg-white/[0.02] p-7">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-synapse-cyan">Immutable user history</p>
                    <h2 className="mt-1 font-serif text-2xl">Mint execution logs</h2>
                    <p className="mt-2 text-xs text-neutral-500">Successful and failed wallet attempts are retained for users and administrators. Only administrators can delete them.</p>
                  </div>
                  <button type="button" onClick={() => void deleteMintLogs()} disabled={!mintLogs.length || saving} className="rounded-xl border border-red-500/25 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40">Delete all logs</button>
                </div>
                {mintLogs.length === 0 ? <p className="py-8 text-center text-sm text-neutral-500">No retained mint attempts.</p> : <div className="max-h-[460px] overflow-y-auto"><table className="w-full min-w-[760px] text-left"><thead className="font-mono text-[10px] uppercase tracking-widest text-neutral-600"><tr><th className="pb-3">Time</th><th className="pb-3">User</th><th className="pb-3">Execution wallet</th><th className="pb-3">Network</th><th className="pb-3">Result</th><th className="pb-3">Details</th></tr></thead><tbody className="text-xs">{mintLogs.map((log) => <tr key={log.id} className="border-t border-white/5 align-top"><td className="py-3 text-neutral-500">{formatTime(log.created_at)}</td><td className="py-3 font-mono text-white">{shortAddress(log.address_key)}</td><td className="py-3 font-mono text-neutral-400">{log.wallet_address ? shortAddress(log.wallet_address) : "—"}</td><td className="py-3 text-neutral-400">{log.chain_key}</td><td className={`py-3 font-mono uppercase tracking-widest ${log.status === "success" ? "text-synapse-emerald" : "text-red-400"}`}>{log.status}</td><td className="max-w-[300px] py-3 text-neutral-500"><span className="font-mono text-[10px]">{log.source} • qty {log.quantity}</span>{log.tx_hash && <div className="truncate font-mono text-[10px] text-synapse-cyan" title={log.tx_hash}>{log.tx_hash}</div>}{log.error && <div className="line-clamp-2" title={log.error}>{log.error}</div>}</td></tr>)}</tbody></table></div>}
              </section>
              <section id="access-editor" className="mb-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-7">
                  <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-5">
                    <Plus size={19} className="text-synapse-cyan" />
                    <h2 className="font-serif text-2xl">
                      {selected
                        ? `Edit ${shortAddress(selected.address)}`
                        : "Whitelist wallet"}
                    </h2>
                  </div>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-neutral-500">
                    Wallet address
                  </label>
                  <input
                    value={formAddress}
                    disabled={Boolean(selected)}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="0x…"
                    className="mb-5 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none focus:border-synapse-cyan/60 disabled:opacity-50"
                  />
                  <label className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-neutral-500">
                    <span>Access enabled</span>
                    <input
                      type="checkbox"
                      checked={formEnabled}
                      onChange={(e) => setFormEnabled(e.target.checked)}
                      className="h-4 w-4 accent-cyan-400"
                    />
                  </label>
                  <label className="mb-2 flex items-center justify-between font-mono text-xs uppercase tracking-widest text-synapse-violet">
                    <span>Administrator access</span>
                    <input
                      type="checkbox"
                      checked={formIsAdmin}
                      onChange={(e) => setFormIsAdmin(e.target.checked)}
                      className="h-4 w-4 accent-violet-400"
                    />
                  </label>
                  <p className="mb-5 text-xs text-neutral-500">
                    Administrators can manage whitelist grants and feature
                    permissions.
                  </p>
                  <label className="mb-2 block font-mono text-xs uppercase tracking-widest text-neutral-500">
                    Execution wallet limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={formMaxWallets}
                    onChange={(e) => setFormMaxWallets(Number(e.target.value))}
                    className="mb-1 w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white outline-none focus:border-synapse-cyan/60"
                  />
                  <p className="mb-5 text-xs text-neutral-500">
                    Maximum imported execution wallets for this user (0–100).
                  </p>
                  <p className="mb-3 font-mono text-xs uppercase tracking-widest text-neutral-500">
                    Allowed functions
                  </p>
                  <div className="space-y-2">
                    {(Object.keys(capabilityLabels) as Capability[]).map(
                      (capability) => (
                        <label
                          key={capability}
                          className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm text-neutral-300"
                        >
                          <span>{capabilityLabels[capability]}</span>
                          <input
                            type="checkbox"
                            checked={Boolean(formCapabilities[capability])}
                            onChange={(e) =>
                              setFormCapabilities({
                                ...formCapabilities,
                                [capability]: e.target.checked,
                              })
                            }
                            className="h-4 w-4 accent-cyan-400"
                          />
                        </label>
                      ),
                    )}
                  </div>
                  <div className="mt-6 flex gap-3">
                    <button
                      disabled={saving}
                      onClick={() =>
                        void saveGrant(
                          formAddress,
                          formEnabled,
                          formIsAdmin,
                          formMaxWallets,
                          formCapabilities,
                        )
                      }
                      className="flex-1 rounded-xl bg-white px-5 py-3 font-mono text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50"
                    >
                      {saving
                        ? "Saving…"
                        : selected
                          ? "Save changes"
                          : "Grant access"}
                    </button>
                    {selected && (
                      <button
                        disabled={saving}
                        onClick={() => setSelected(null)}
                        className="rounded-xl border border-white/15 px-5 py-3 font-mono text-xs uppercase tracking-widest text-neutral-300"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
                <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-7">
                  <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-5">
                    <LockKeyhole size={19} className="text-synapse-violet" />
                    <h2 className="font-serif text-2xl">Access grants</h2>
                    <span className="ml-auto rounded-full bg-white/5 px-3 py-1 font-mono text-xs text-neutral-400">
                      {grants.length}
                    </span>
                  </div>
                  {grants.length === 0 ? (
                    <p className="py-10 text-center text-sm text-neutral-500">
                      No wallets have been whitelisted yet.
                    </p>
                  ) : (
                    <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                      {grants.map((grant) => (
                        <div
                          key={grant.address}
                          className="rounded-xl border border-white/10 bg-black/20 p-4"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-mono text-sm text-white">
                                {shortAddress(grant.address)}
                              </p>
                              <p
                                className={`mt-1 font-mono text-[10px] uppercase tracking-widest ${grant.enabled ? "text-synapse-emerald" : "text-red-400"}`}
                              >
                                {grant.enabled ? "Enabled" : "Disabled"} •{" "}
                                {grant.isAdmin ? "Administrator • " : ""}
                                {grant.maxWallets} wallet
                                {grant.maxWallets === 1 ? "" : "s"}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setSelected(grant)}
                                className="rounded-lg border border-white/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-neutral-300 hover:border-synapse-cyan/60"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => void removeGrant(grant)}
                                className="rounded-lg border border-red-500/20 p-2 text-red-400 hover:bg-red-500/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {(Object.keys(capabilityLabels) as Capability[])
                              .filter(
                                (capability) => grant.capabilities[capability],
                              )
                              .map((capability) => (
                                <span
                                  key={capability}
                                  className="rounded-full bg-synapse-cyan/10 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-synapse-cyan"
                                >
                                  {capabilityLabels[capability]}
                                </span>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </>
  );
};
