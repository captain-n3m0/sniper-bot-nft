import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Fuel,
  Gauge,
  KeyRound,
  Layers3,
  Radio,
  Rocket,
  ShieldCheck,
  TerminalSquare,
  TriangleAlert,
  WalletCards,
  Zap,
} from 'lucide-react';
import { Navigation } from '../components/Navigation';
import { Footer } from '../components/Footer';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'quick-start', label: 'Quick start' },
  { id: 'wallets', label: 'Wallet model' },
  { id: 'drop-stages', label: 'Drop stages' },
  { id: 'eligibility', label: 'Eligibility' },
  { id: 'sniper', label: 'Mint sniper' },
  { id: 'gas', label: 'Gas and funding' },
  { id: 'scheduler', label: 'Scheduler' },
  { id: 'networks', label: 'Networks' },
  { id: 'operations', label: 'Metrics and status' },
  { id: 'security', label: 'Security' },
  { id: 'troubleshooting', label: 'Troubleshooting' },
];

const DocSection = ({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) => (
  <section id={id} className="scroll-mt-32 border-b border-white/5 pb-14 last:border-b-0">
    <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.22em] text-synapse-cyan">{eyebrow}</div>
    <h2 className="font-serif text-4xl text-white md:text-5xl">{title}</h2>
    <div className="mt-6 space-y-5 text-sm leading-7 text-neutral-400">{children}</div>
  </section>
);

const Callout = ({ type = 'info', title, children }: { type?: 'info' | 'warning' | 'success'; title: string; children: ReactNode }) => {
  const styles = type === 'warning'
    ? { box: 'border-yellow-500/20 bg-yellow-500/[0.06]', icon: 'text-yellow-400', Icon: TriangleAlert }
    : type === 'success'
      ? { box: 'border-synapse-emerald/20 bg-synapse-emerald/[0.06]', icon: 'text-synapse-emerald', Icon: CheckCircle2 }
      : { box: 'border-synapse-cyan/20 bg-synapse-cyan/[0.06]', icon: 'text-synapse-cyan', Icon: ShieldCheck };
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-5 ${styles.box}`}>
      <styles.Icon size={18} className={`mt-1 shrink-0 ${styles.icon}`} />
      <div><div className={`mb-1 font-mono text-xs font-semibold uppercase tracking-widest ${styles.icon}`}>{title}</div><div className="text-sm leading-6 text-neutral-400">{children}</div></div>
    </div>
  );
};

const Step = ({ number, title, children }: { number: number; title: string; children: ReactNode }) => (
  <div className="flex gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-synapse-violet/30 bg-synapse-violet/10 font-mono text-xs text-synapse-violet">{number}</div>
    <div><h3 className="font-medium text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-neutral-400">{children}</p></div>
  </div>
);

const Feature = ({ icon: Icon, title, children }: { icon: typeof Zap; title: string; children: ReactNode }) => (
  <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5">
    <Icon size={18} className="mb-4 text-synapse-violet" />
    <h3 className="font-medium text-white">{title}</h3>
    <p className="mt-2 text-sm leading-6 text-neutral-500">{children}</p>
  </div>
);

const Field = ({ name, children }: { name: string; children: ReactNode }) => (
  <div className="grid gap-2 border-t border-white/5 py-4 first:border-t-0 md:grid-cols-[180px_1fr]">
    <div className="font-mono text-xs text-white">{name}</div>
    <div>{children}</div>
  </div>
);

export const Documentation = () => {
  useEffect(() => window.scrollTo(0, 0), []);

  return (
    <main className="min-h-screen bg-[#030303] text-white selection:bg-synapse-violet/30">
      <Navigation />

      <header className="relative overflow-hidden border-b border-white/5 px-6 pb-20 pt-40">
        <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-[850px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_top,#8b5cf6_0%,transparent_68%)] opacity-25 blur-[90px]" />
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.22em] text-synapse-cyan"><BookOpen size={15} /> Product documentation</div>
          <h1 className="max-w-4xl font-serif text-6xl leading-none md:text-8xl">Mint with precision.<br /><span className="text-neutral-500">Operate with context.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-neutral-400">Everything you need to configure, verify, fund, schedule, and execute multi-chain NFT mints with LastLap MintGrid.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/dashboard" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-xs font-semibold uppercase tracking-widest text-black transition-transform hover:scale-105"><Rocket size={14} /> Launch dashboard</Link>
            <a href="#quick-start" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-widest text-neutral-300 hover:border-white/20 hover:text-white">Start setup <ExternalLink size={13} /></a>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-6 py-16 lg:grid-cols-[230px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <div className="mb-3 px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-600">On this page</div>
            <nav className="space-y-1">
              {sections.map((section) => <a key={section.id} href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-xs text-neutral-500 transition-colors hover:bg-white/5 hover:text-white">{section.label}</a>)}
            </nav>
          </div>
        </aside>

        <article className="min-w-0 space-y-14">
          <DocSection id="overview" eyebrow="01 / Foundation" title="What MintGrid does">
            <p>LastLap MintGrid prepares SeaDrop mint calldata, simulates it for explicitly imported execution wallets, signs transactions, and broadcasts each signed transaction to multiple RPC endpoints. It supports immediate mints, exact-time schedules, live gas estimation, wallet eligibility checks, and native-token fund dispersal.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Feature icon={Layers3} title="Discover">Load OpenSea drop stages, prices, time windows, supply information, and wallet limits.</Feature>
              <Feature icon={ShieldCheck} title="Verify">Simulate the exact transaction for each execution address and preserve inconclusive results instead of inventing eligibility.</Feature>
              <Feature icon={Zap} title="Execute">Prepare with fast EIP-1559 fees and broadcast through parallel RPC paths and wallet workers.</Feature>
            </div>
            <Callout title="Two separate wallet roles">The wallet used to sign in authenticates your account only. It never becomes a minting wallet automatically. Minting requires an execution wallet imported deliberately in Wallet Manager.</Callout>
          </DocSection>

          <DocSection id="quick-start" eyebrow="02 / Setup" title="Quick start">
            <div className="space-y-3">
              <Step number={1} title="Sign in">Open the Dashboard, choose MetaMask, Phantom, or another detected EVM provider, and approve the SIWE message. This is a gasless login signature—not a transaction.</Step>
              <Step number={2} title="Choose the target chain">Select the network before loading a drop. If OpenSea reports a different deployed chain, MintGrid can switch the target automatically.</Step>
              <Step number={3} title="Import execution wallets">Open Wallet Manager and add a private key or Ethereum V3 keystore JSON. Verify each displayed address before continuing.</Step>
              <Step number={4} title="Load and verify the drop">Use Drop Stages to enter a collection slug or contract, fetch phases, select the intended phase, and check the imported wallets.</Step>
              <Step number={5} title="Fund and execute">Confirm every wallet has the mint value plus the displayed maximum gas allowance. Load the stage into Sniper, select wallets, and execute or schedule it.</Step>
            </div>
            <Callout type="warning" title="Start with one wallet">For a new collection or network, perform a low-value test with one wallet first. Contract calls and native-token transfers are irreversible.</Callout>
          </DocSection>

          <DocSection id="wallets" eyebrow="03 / Identity" title="Login and execution wallets">
            <div className="overflow-hidden rounded-2xl border border-white/5">
              <div className="grid grid-cols-3 bg-white/[0.03] px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-neutral-500"><span>Wallet type</span><span>Purpose</span><span>Stored by server</span></div>
              <div className="grid grid-cols-3 border-t border-white/5 px-4 py-4"><span className="text-white">Login wallet</span><span>SIWE authentication</span><span className="text-synapse-emerald">Address only</span></div>
              <div className="grid grid-cols-3 border-t border-white/5 px-4 py-4"><span className="text-white">Execution wallet</span><span>Minting and funding</span><span className="text-synapse-emerald">Private key excluded</span></div>
            </div>
            <p>Execution wallets are scoped to the SIWE login account and stored in the server database with AES-256-GCM encryption. They are restored after signing back in on another session. The login wallet remains authentication-only and is never added as an execution wallet automatically.</p>
            <div className="rounded-2xl border border-white/5 bg-black/40 p-5 font-mono text-xs leading-6 text-neutral-400"><span className="text-neutral-600">// Plain JSON bulk-import shape</span><br />{`{"wallets":[{"name":"Wallet 1","privateKey":"0x..."}]}`}</div>
            <Callout type="warning" title="Treat plaintext JSON as highly sensitive">Prefer encrypted Ethereum V3 keystores. Never upload wallet files to chat, cloud storage, or unknown websites, and only fund execution wallets with the amount required for the intended mint.</Callout>
          </DocSection>

          <DocSection id="drop-stages" eyebrow="04 / Intelligence" title="Drop stages and OpenSea actions">
            <p>Drop Stages accepts an OpenSea collection slug or deployed contract address. It normalizes phase labels, start and end timestamps, price, supply, and wallet limits, then allows the selected phase to be loaded directly into Sniper.</p>
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5">
              <Field name="Public stage">Uses SeaDrop’s public mint configuration when the contract exposes an active on-chain public drop.</Field>
              <Field name="Signed stage">Requires a wallet-specific voucher and signature. OpenSea creates this action for the minter; it cannot be reconstructed from public chain data.</Field>
              <Field name="OpenSea API key">Optional for ordinary on-chain public stages, but required when the active OpenSea phase returns wallet-specific calldata.</Field>
              <Field name="Contract address">Must exist on the selected chain. A correct address on the wrong chain will look undeployed.</Field>
            </div>
            <Callout title="OpenSea is the source for OpenSea eligibility">For wallet-specific phases, MintGrid requests OpenSea’s exact unsigned mint action and then verifies its target, recipient, value, and execution result. It does not manufacture an allowlist signature.</Callout>
          </DocSection>

          <DocSection id="eligibility" eyebrow="05 / Simulation" title="Understanding eligibility results">
            <p>The checker operates only on wallets explicitly imported in Wallet Manager. Each result belongs to one of three categories:</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Feature icon={CheckCircle2} title="Eligible">The exact call succeeds, or the public-stage configuration and wallet mint statistics prove access before the stage starts.</Feature>
              <Feature icon={TriangleAlert} title="Not eligible">A decoded, definitive contract response proves a condition such as wallet limit, invalid voucher, inactive stage, or incorrect payment.</Feature>
              <Feature icon={Radio} title="Could not verify">RPCs returned generic or conflicting reverts. This is intentionally not converted into a false “not eligible” result.</Feature>
            </div>
            <p>Simulation does not broadcast or spend funds. For unfunded wallets, MintGrid may use a supported RPC balance override to distinguish access failure from insufficient balance; the real wallet must still be funded before execution.</p>
          </DocSection>

          <DocSection id="sniper" eyebrow="06 / Execution" title="Running the mint sniper">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5">
              <Field name="Contract / slug">The NFT contract or OpenSea collection identifier.</Field>
              <Field name="Quantity">Tokens minted by each selected execution wallet.</Field>
              <Field name="Parallel workers">Number of wallets prepared and broadcast concurrently, capped at 24.</Field>
              <Field name="RPC routing">Alchemy is configured securely on the backend and placed ahead of public fallback RPCs.</Field>
              <Field name="OpenSea key">Used server-side to request wallet-specific unsigned mint actions.</Field>
              <Field name="Execution wallets">The exact imported wallets that will sign and broadcast.</Field>
            </div>
            <p>When execution begins, each worker builds the plan, resolves its pending nonce and fast EIP-1559 fees, simulates, signs, and blasts the raw transaction across configured endpoints. One wallet failure does not stop the remaining workers.</p>
            <Callout type="warning" title="Parallel does not mean duplicate">Each selected wallet mints independently. Do not select more wallets or a larger quantity than the intended total allocation.</Callout>
          </DocSection>

          <DocSection id="gas" eyebrow="07 / Capital" title="Live gas and Fund Disperser">
            <p>The Sniper’s Live Transaction Cost panel refreshes every four seconds. Before preparation, it uses a conservative provisional gas limit. After preparation, it uses the transaction’s estimated gas limit and exact mint value.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Feature icon={Fuel} title="Maximum fee">The panel shows the fast EIP-1559 fee cap multiplied by gas limit. The network normally charges less than this cap.</Feature>
              <Feature icon={CircleDollarSign} title="Required balance">Fund each execution wallet for mint value plus maximum gas, leaving a small buffer for fee movement.</Feature>
            </div>
            <h3 className="pt-3 font-serif text-2xl text-white">Using Fund Disperser</h3>
            <p>Choose one imported source wallet, select recipient execution wallets, enter the native-token amount per wallet, and choose Slow, Standard, or Fast. MintGrid fetches the live source balance and calculates transfer total, maximum network fee, and total required before enabling broadcast.</p>
            <p>Dispersal transactions are signed with sequential nonces and broadcast concurrently. If an earlier nonce is not accepted, later transactions from the same source may remain pending until the missing nonce is resolved.</p>
            <Callout type="warning" title="Native token only">Fund Disperser sends ETH on Ethereum-family chains and POL on Polygon. It does not transfer ERC-20 tokens. Verify the selected chain and every recipient address before confirming.</Callout>
          </DocSection>

          <DocSection id="scheduler" eyebrow="08 / Automation" title="Scheduling a mint">
            <p>The scheduler accepts an exact ISO timestamp or target block and prepares every execution wallet independently. The internal loop checks time every 100 milliseconds, warms RPC connections near execution, and signs shortly before the target. A failed OpenSea action for one wallet does not block wallets that are ready.</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Feature icon={CalendarClock} title="Target time">Use the drop’s authoritative start time. Confirm the timezone before saving the job.</Feature>
              <Feature icon={Gauge} title="Target block">Useful when activation is defined by block height rather than a wall-clock timestamp.</Feature>
            </div>
            <Callout title="Durable, account-scoped jobs">Queued and paused jobs are encrypted in SQLite and restored after application restarts or deployments. Jobs that were actively broadcasting during a crash are marked failed instead of replayed, preventing accidental duplicate mints. Use the job panel to pause, resume, stop, or delete your own jobs.</Callout>
          </DocSection>

          <DocSection id="networks" eyebrow="09 / Chains" title="Supported networks">
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-white/[0.03] font-mono text-[10px] uppercase tracking-widest text-neutral-500"><tr><th className="px-4 py-3">Network</th><th className="px-4 py-3">Chain ID</th><th className="px-4 py-3">Gas token</th><th className="px-4 py-3">Explorer</th></tr></thead><tbody>{[
                ['Ethereum', '1', 'ETH', 'Etherscan'], ['Base', '8453', 'ETH', 'Basescan'], ['Polygon', '137', 'POL', 'Polygonscan'], ['Arbitrum One', '42161', 'ETH', 'Arbiscan'], ['Optimism', '10', 'ETH', 'OP Etherscan'], ['Robinhood Chain', '4663', 'ETH', 'Blockscout'], ['Sepolia', '11155111', 'ETH', 'Sepolia Etherscan'],
              ].map((row) => <tr key={row[1]} className="border-t border-white/5 text-neutral-400"><td className="px-4 py-4 text-white">{row[0]}</td><td className="px-4 py-4 font-mono">{row[1]}</td><td className="px-4 py-4 font-mono">{row[2]}</td><td className="px-4 py-4">{row[3]}</td></tr>)}</tbody></table>
            </div>
            <p>RPC failover distinguishes transport failures such as timeouts, rate limits, and 5xx responses from valid EVM execution outcomes. Contract reverts are returned immediately instead of being hidden by unnecessary endpoint retries.</p>
          </DocSection>

          <DocSection id="operations" eyebrow="10 / Observability" title="Metrics and system status">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Feature icon={Activity} title="Metrics">Rolling request volume and latency graphs, API success rate, process uptime, memory usage, RPC observations, broadcasts, scheduler jobs, and user count.</Feature>
              <Feature icon={TerminalSquare} title="Status">Active checks for the web API, database, scheduler, and every supported blockchain RPC network.</Feature>
            </div>
            <div className="flex flex-wrap gap-3"><Link to="/metrics" className="rounded-xl border border-synapse-cyan/25 bg-synapse-cyan/10 px-4 py-2 font-mono text-xs uppercase tracking-widest text-synapse-cyan">Open Metrics</Link><Link to="/status" className="rounded-xl border border-synapse-emerald/25 bg-synapse-emerald/10 px-4 py-2 font-mono text-xs uppercase tracking-widest text-synapse-emerald">Open Status</Link></div>
            <p>All telemetry is scoped to the current server process. Uptime and rolling graphs reset when the application is restarted or redeployed.</p>
          </DocSection>

          <DocSection id="security" eyebrow="11 / Safety" title="Security model">
            <div className="space-y-3">
              <Callout type="success" title="Wallet separation">SIWE login proves account ownership but never authorizes minting. Execution keys must be imported separately.</Callout>
              <Callout type="success" title="Separated encrypted storage">Execution-wallet keys are stored only in the dedicated wallet vault; API keys and scheduler payloads use separate encrypted records. Session tokens are never persisted in the database.</Callout>
              <Callout type="success" title="Encrypted secrets">Execution private keys, OpenSea keys, and durable scheduler payloads are encrypted at rest with AES-256-GCM using the server’s dedicated configuration key.</Callout>
              <Callout type="success" title="Redacted logs">Sensitive request fields are removed from development server error logs.</Callout>
            </div>
            <p>Because execution wallets sign server-prepared transactions, operate MintGrid only over HTTPS and on infrastructure you control. Use dedicated low-balance mint wallets rather than primary treasury wallets.</p>
          </DocSection>

          <DocSection id="troubleshooting" eyebrow="12 / Recovery" title="Troubleshooting">
            <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-5">
              <Field name="Operation aborted">Usually a temporary browser or RPC network interruption. Retry after connectivity returns; the fallback manager will move past endpoints that report transport failures.</Field>
              <Field name="Stage not active">Confirm chain, phase timestamps, timezone, and contract. A future or ended stage should revert during simulation.</Field>
              <Field name="Could not verify">Use an OpenSea API key for wallet-specific phases, confirm the exact slug, and inspect the unsigned transaction panel. Do not interpret an inconclusive RPC revert as ineligibility.</Field>
              <Field name="Insufficient balance">Fund the execution wallet for both mint value and the live maximum gas estimate. Eligibility and funding are separate checks.</Field>
              <Field name="Fee recipient restricted">Use OpenSea’s exact action or a fee recipient allowed by the drop configuration. A guessed recipient will revert.</Field>
              <Field name="Transaction pending">Check the explorer, source wallet nonce, and fee cap. For dispersal, a missing earlier nonce can hold later transfers in the queue.</Field>
              <Field name="Login fails">Select the intended injected wallet explicitly, ensure it is on an EVM network, and sign the SIWE message from the address shown in the login panel.</Field>
            </div>
            <Callout title="Use the execution logs">The right-hand Dashboard terminal records plan generation, network selection, simulation results, worker status, broadcasts, and readable errors. In development, full redacted errors are also printed in the server console.</Callout>
          </DocSection>
        </article>
      </div>

      <Footer />
    </main>
  );
};
