import fs from 'fs';

let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Replace import
code = code.replace(
  "import { WhitelistChecker } from '../components/WhitelistChecker';",
  "import { DropStages } from '../components/DropStages';"
);

// Replace activeTab type
code = code.replace(
  "const [activeTab, setActiveTab] = useState<'sniper' | 'wallets' | 'whitelist' | 'scheduler' | 'gas'>('sniper');",
  "const [activeTab, setActiveTab] = useState<'sniper' | 'wallets' | 'stages' | 'scheduler' | 'gas'>('sniper');"
);

// Replace tab navigation
const oldTabBtn = `              <button 
                onClick={() => setActiveTab('whitelist')}
                className={\`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors \${activeTab === 'whitelist' ? 'border-b-2 border-synapse-emerald text-white' : 'text-neutral-500 hover:text-neutral-300'}\`}
              >
                Eligibility Simulator
              </button>`;

const newTabBtn = `              <button 
                onClick={() => setActiveTab('stages')}
                className={\`px-4 py-2 text-xs font-mono uppercase tracking-widest transition-colors \${activeTab === 'stages' ? 'border-b-2 border-synapse-emerald text-white' : 'text-neutral-500 hover:text-neutral-300'}\`}
              >
                Drop Stages
              </button>`;

code = code.replace(oldTabBtn, newTabBtn);

// Replace the actual rendered component
const oldRender = `            {activeTab === 'whitelist' && (
              <WhitelistChecker wallets={wallets} addLog={addLog} selectedChain={selectedChain} />
            )}`;

const newRender = `            {activeTab === 'stages' && (
              <DropStages wallets={wallets} addLog={addLog} selectedChain={selectedChain} />
            )}`;

code = code.replace(oldRender, newRender);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
