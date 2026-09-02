const fs = require('fs');
let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// Replace rpcUrl in state
code = code.replace("rpcUrl: '',\n    contractAddress: ''", "contractAddress: ''");

// Replace logging
code = code.replace(
  "addLog('NETWORK', `Connecting to ${form.rpcUrl.split('/')[2]}`, 'text-synapse-cyan');",
  "addLog('NETWORK', `Targeting network: ${selectedChain}`, 'text-synapse-cyan');"
);

// Replace payload
code = code.replace(
  "rpcUrl: form.rpcUrl,\n          contractAddress: form.contractAddress",
  "chain: selectedChain,\n          contractAddress: form.contractAddress"
);

// Remove RPC input block
const rpcInputBlockRegex = /<div>\s*<label className="mb-2 block text-xs font-mono uppercase tracking-widest text-neutral-500">\s*RPC Node URL\s*<\/label>\s*<input[^>]+value=\{form\.rpcUrl\}[^>]+>\s*<\/div>/g;
code = code.replace(rpcInputBlockRegex, '');

fs.writeFileSync('src/pages/Dashboard.tsx', code);
