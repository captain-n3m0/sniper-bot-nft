import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add /api/gas-price
const gasPriceEndpoint = `
  app.get("/api/gas-price", async (req, res) => {
    try {
      const chain = req.query.chain;
      if (!chain) return res.status(400).json({ error: "Missing chain" });
      const chainProfile = resolveChain(chain);
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain" });
      }
      
      const rpcUrl = chainProfile.rpc.public[0];
      const provider = new JsonRpcProvider(rpcUrl);
      const feeData = await provider.getFeeData();
      
      let baseFeeGwei = 15; // default fallback
      if (feeData.lastBaseFeePerGas) {
        baseFeeGwei = Number(feeData.lastBaseFeePerGas) / 1e9;
      } else if (feeData.gasPrice) {
        baseFeeGwei = Number(feeData.gasPrice) / 1e9;
      }
      
      return res.json({ baseFeeGwei });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });
`;

code = code.replace(
  'app.post("/api/schedule-mint",',
  gasPriceEndpoint + '\n  app.post("/api/schedule-mint",'
);

// 2. Refactor Scheduled Minting Mock
// We need to replace the setInterval console.log with real execution logic.
const setIntervalMock = `setInterval(async () => {
  const now = new Date();
  for (let i = scheduledJobs.length - 1; i >= 0; i--) {
    const job = scheduledJobs[i];
    if (new Date(job.targetTime) <= now) {
      console.log(\`Executing Scheduled Job: \${job.taskId}\`);
      scheduledJobs.splice(i, 1);
      
      // Execute mint for all wallets in job
      if (job.wallets && job.wallets.length > 0) {
        console.log(\`Minting for \${job.wallets.length} wallets on \${job.launchpadUrl}\`);
      }
    }
  }
}, 5000);`;

const setIntervalReal = `
async function executeSnipeJob(job) {
  try {
    const chainProfile = resolveChain(job.chain);
    if (!chainProfile) throw new Error("Invalid chain");
    
    const rpcEndpoints = [...chainProfile.rpc.public];
    if (job.apiKey) {
      const keyStr = job.apiKey.trim();
      if (keyStr.startsWith('http')) {
        rpcEndpoints.unshift(keyStr);
      } else if (chainProfile.rpc.alchemyHost) {
        rpcEndpoints.unshift(\`https://\${chainProfile.rpc.alchemyHost}/v2/\${keyStr}\`);
      }
    }
    
    let contractAddress = job.contractAddress;
    if (isSlug(contractAddress)) {
      const resolved = await resolveSlug(contractAddress);
      contractAddress = resolved.contractAddress;
    }
    
    let plan;
    if (job.isAllowlist) {
      const feeRecipient = "0x0000a26b00c1F0DF003000390027140000fAa719";
      const data = encodeMintSigned(contractAddress, feeRecipient, job.quantity, job.mintParams, job.salt, job.signature);
      plan = {
        to: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",
        data,
        value: BigInt(job.mintParams.mintPrice) * BigInt(job.quantity)
      };
    } else {
      plan = await withRpcFallback(rpcEndpoints, url => buildLocalMintPlan(url, contractAddress, job.quantity));
      if (!plan) throw new Error("Drop not found or fee restricted");
    }

    const txs = await Promise.all(job.wallets.map(async (wallet) => {
      return await withRpcFallback(rpcEndpoints, async (url) => {
        const provider = new JsonRpcProvider(url);
        const walletObj = new Wallet(wallet.privateKey, provider);
        const txReq = { to: plan.to, data: plan.data, value: plan.value };
        const gasEstimate = await provider.estimateGas(txReq);
        txReq.gasLimit = gasEstimate;
        
        const signedTx = await walletObj.signTransaction(txReq);
        const broadcastRes = await provider.broadcastTransaction(signedTx);
        return broadcastRes.hash;
      });
    }));
    
    console.log(\`Successfully executed job \${job.taskId}. Tx hashes: \`, txs);
  } catch (error) {
    console.error(\`Scheduled Job \${job.taskId} failed:\`, error.message);
  }
}

setInterval(async () => {
  const now = new Date();
  for (let i = scheduledJobs.length - 1; i >= 0; i--) {
    const job = scheduledJobs[i];
    if (new Date(job.targetTime) <= now) {
      console.log(\`Executing Scheduled Job: \${job.taskId}\`);
      scheduledJobs.splice(i, 1);
      
      if (job.wallets && job.wallets.length > 0) {
        // Run in background asynchronously so it doesn't block the interval loop
        executeSnipeJob(job).catch(console.error);
      }
    }
  }
}, 5000);
`;

code = code.replace(setIntervalMock, setIntervalReal);

// Update /api/schedule-mint to accept the full payload
const oldScheduleRoute = `      const { launchpadUrl, targetTime, wallets, chain } = req.body;
      if (!launchpadUrl || !targetTime || !wallets || !wallets.length) {
        return res.status(400).json({ error: "Missing required scheduling parameters." });
      }

      // Generate a deterministic or random mock job ID for the UI to display
      const taskId = \`job_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`;
      
      // In a production app, you would push this payload to a Redis queue, 
      // BullMQ, or save to a database table to be picked up by a cron/worker.
      // For this preview/MVP, we queue it in memory.
      scheduledJobs.push({ taskId, targetTime, launchpadUrl, wallets, chain });`;

const newScheduleRoute = `      const { targetTime, contractAddress, quantity, isAllowlist, mintParams, salt, signature, apiKey, wallets, chain } = req.body;
      if (!contractAddress || !targetTime || !wallets || !wallets.length || !quantity) {
        return res.status(400).json({ error: "Missing required scheduling parameters." });
      }

      // Use crypto module for real UUIDs instead of Math.random
      const crypto = require('crypto');
      const taskId = crypto.randomUUID();
      
      // Push the FULL real execution payload to the memory queue
      scheduledJobs.push({ 
        taskId, 
        targetTime, 
        contractAddress, 
        quantity, 
        isAllowlist, 
        mintParams, 
        salt, 
        signature, 
        apiKey, 
        wallets, 
        chain 
      });`;

code = code.replace(oldScheduleRoute, newScheduleRoute);

fs.writeFileSync('server.ts', code);
