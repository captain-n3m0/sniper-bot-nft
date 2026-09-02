import fs from 'fs';

let code = fs.readFileSync('src/pages/Dashboard.tsx', 'utf8');

// 1. Remove rpcUrl from initial state
code = code.replace(
  "const [form, setForm] = useState({\n    rpcUrl: '',",
  "const [form, setForm] = useState({"
);
code = code.replace(
  "const [form, setForm] = useState({\n    contractAddress: '',",
  "const [form, setForm] = useState({\n    contractAddress: '',"
);

// 2. Update handleSnipe
const oldHandleSnipe = `
      addLog('INFO', 'Generating optimized calldata...', 'text-synapse-violet');
      
      const payload = {
        rpcUrl: form.rpcUrl,
        contractAddress: form.contractAddress,
        quantity: Number(form.quantity),
        privateKey: form.privateKey,
        isAllowlist: form.isAllowlist,
        mintParams: mintParamsObj,
        salt: form.salt,
        signature: form.signature
      };

      const res = await fetch('/api/snipe/seadrop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (data.success) {
        addLog('SUCCESS', \`Payload generated! Value: \${data.plan.value} wei\`, 'text-synapse-emerald');
        if (data.txHash) {
          addLog('SUCCESS', \`Transaction broadcasted! Hash: \${data.txHash}\`, 'text-synapse-emerald');
        } else {
          addLog('WARNING', data.msg, 'text-yellow-500');
        }
      } else {
        addLog('ERROR', data.error, 'text-red-500');
      }
`;

const newHandleSnipe = `
      addLog('INFO', 'Generating optimized calldata...', 'text-synapse-violet');
      
      const activeWallets = Array.from(selectedSniperWallets).map(id => wallets.find(w => w.id === id)).filter(Boolean);

      if (activeWallets.length === 0) {
        // Dry run mode
        activeWallets.push(undefined);
      }

      for (const wallet of activeWallets) {
        if (wallet) {
          addLog('INFO', \`Executing for wallet: \${wallet.name}\`, 'text-synapse-cyan');
        }

        const payload = {
          chain: selectedChain,
          contractAddress: form.contractAddress,
          quantity: Number(form.quantity),
          privateKey: wallet ? wallet.privateKey : form.privateKey || '', // Fallback to form.privateKey if they pasted it directly
          isAllowlist: form.isAllowlist,
          mintParams: mintParamsObj,
          salt: form.salt,
          signature: form.signature
        };

        const res = await fetch('/api/snipe/seadrop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.success) {
          addLog('SUCCESS', \`Payload generated! Value: \${data.plan.value} wei\`, 'text-synapse-emerald');
          if (data.txHash) {
            addLog('SUCCESS', \`Transaction broadcasted! Hash: \${data.txHash}\`, 'text-synapse-emerald');
          } else {
            addLog('WARNING', data.msg, 'text-yellow-500');
          }
        } else {
          addLog('ERROR', data.error, 'text-red-500');
        }
      }
`;

code = code.replace(oldHandleSnipe, newHandleSnipe);

fs.writeFileSync('src/pages/Dashboard.tsx', code);
