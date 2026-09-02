import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { buildLocalMintPlan, encodeMintSigned, MintParams } from "./src/lib/seadrop";
import { resolveSlug, isSlug } from "./src/lib/slug-resolver";
import { resolveChain } from "./src/lib/chains";
import { warmConnections } from "./src/lib/connection-warmer";
import { blastToAll, waitForReceipt, parseRpcEndpoints, prepareBlast } from "./src/lib/rpc-blast";
import { createRpcProvider } from "./src/lib/rpc-provider";
import { Wallet, verifyMessage } from "ethers";
import crypto from "crypto";

// --- Authentication State ---
const nonces = new Map<string, string>();
// ----------------------------

// --- Job Queue State ---
const scheduledJobs: any[] = [];

async function executeSnipeJob(job: any) {
  try {
    const chainProfile = resolveChain(job.chain);
    if (!chainProfile) throw new Error("Invalid chain");
    
    const rpcEndpoints = [...chainProfile.rpc.public];
    if (job.apiKey) {
      const keyStr = job.apiKey.trim();
      if (keyStr.startsWith('http')) {
        rpcEndpoints.unshift(keyStr);
      } else if (chainProfile.rpc.alchemyHost) {
        rpcEndpoints.unshift(`https://${chainProfile.rpc.alchemyHost}/v2/${keyStr}`);
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

    const txs = await Promise.all(job.wallets.map(async (wallet: any) => {
      return await withRpcFallback(rpcEndpoints, async (url) => {
        const provider = createRpcProvider(url, chainProfile.chainId);
        const walletObj = new Wallet(wallet.privateKey, provider);
        const txReq: any = { to: plan.to, data: plan.data, value: plan.value };
        const gasEstimate = await provider.estimateGas(txReq);
        txReq.gasLimit = gasEstimate;
        
        const signedTx = await walletObj.signTransaction(txReq);
        const broadcastRes = await provider.broadcastTransaction(signedTx);
        return broadcastRes.hash;
      });
    }));
    
    console.log(`Successfully executed job ${job.taskId}. Tx hashes: `, txs);
  } catch (error: any) {
    console.error(`Scheduled Job ${job.taskId} failed:`, error.message);
  }
}

setInterval(async () => {
  const now = new Date();
  for (let i = scheduledJobs.length - 1; i >= 0; i--) {
    const job = scheduledJobs[i];
    if (new Date(job.targetTime) <= now) {
      console.log(`Executing Scheduled Job: ${job.taskId}`);
      scheduledJobs.splice(i, 1);
      
      if (job.wallets && job.wallets.length > 0) {
        // Run in background asynchronously so it doesn't block the interval loop
        executeSnipeJob(job).catch(console.error);
      }
    }
  }
}, 5000);

// -----------------------


function isNodeFailure(err: any): boolean {
  if (!err) return false;
  const msg = (err.message || "").toLowerCase();
  const code = err.code;
  // If it's an EVM revert, insufficient funds, or drop configuration error, it's not a node down error
  if (
    code === "INSUFFICIENT_FUNDS" ||
    msg.includes("insufficient funds") ||
    code === "CALL_EXCEPTION" ||
    msg.includes("execution reverted") ||
    msg.includes("cannot estimate gas") ||
    msg.includes("gas required exceeds allowance") ||
    msg.includes("exceeds max") ||
    msg.includes("not active")
  ) {
    return false;
  }
  return true;
}

// --- RPC Fallback Helper ---
async function withRpcFallback<T>(endpoints: string[], fn: (url: string) => Promise<T>): Promise<T> {
  let lastError: any;
  for (const url of endpoints) {
    try {
      return await fn(url);
    } catch (err: any) {
      lastError = err;
      if (!isNodeFailure(err)) {
        // EVM state / contract logic outcome: no need to query other nodes redundantly
        throw err;
      }
    }
  }
  throw lastError;
}
// ---------------------------

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/auth/nonce", (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) return res.status(400).json({ error: "Address required" });
      const nonce = crypto.randomBytes(16).toString("hex");
      nonces.set(address.toLowerCase(), nonce);
      res.json({ nonce });
    } catch (error: any) {
      console.error("Nonce Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/verify", (req, res) => {
    try {
      const { address, signature } = req.body;
      if (!address || !signature) return res.status(400).json({ error: "Missing address or signature" });

      const lowerAddress = address.toLowerCase();
      const nonce = nonces.get(lowerAddress);
      
      if (!nonce) return res.status(400).json({ error: "Nonce expired or not found. Please request a new one." });

      const message = `Sign this message to authenticate with SeaDrop Sniper.\n\nNonce: ${nonce}`;
      const recoveredAddress = verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() === lowerAddress) {
        nonces.delete(lowerAddress);
        // Simple token for MVP (in production, use JWT with expiration)
        const token = Buffer.from(`${lowerAddress}:${Date.now()}`).toString("base64");
        return res.json({ success: true, token });
      } else {
        return res.status(401).json({ error: "Signature verification failed" });
      }
    } catch (error: any) {
      console.error("Verify Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  
  
  app.post("/api/opensea/drop", async (req, res) => {
    try {
      const { slug, apiKey } = req.body;
      if (!slug) return res.status(400).json({ error: "Missing slug" });
      
      const headers = { accept: "application/json" };
      if (apiKey) headers["x-api-key"] = apiKey;
      
      const response = await fetch(`https://api.opensea.io/api/v2/drops/${slug}`, { headers });
      const data = await response.json();
      
      if (!response.ok) {
        return res.status(response.status).json({ error: data.errors?.[0] || data.detail || "Failed to fetch drop info from OpenSea" });
      }
      
      return res.json(data);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/simulate-mint", async (req, res) => {
    try {
      const { chain, contractAddress: inputContract, quantity, isAllowlist, mintParams, salt, signature, wallets } = req.body;
      
      if (!chain || !inputContract || !quantity) {
        return res.status(400).json({ error: "Missing required fields (chain, contractAddress, quantity)" });
      }

      const walletList = Array.isArray(wallets) && wallets.length > 0 ? wallets : ["0x0000000000000000000000000000000000000001"];

      const chainProfile = resolveChain(chain);
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain or no public RPCs available" });
      }

      let contractAddress = inputContract.trim();
      if (isSlug(contractAddress)) {
        try {
          const resolved = await resolveSlug(contractAddress);
          contractAddress = resolved.contractAddress;
        } catch (err) {
          return res.status(400).json({ error: `Failed to resolve slug: ${err.message}` });
        }
      }

      let plan;
      const rpcEndpoints = chainProfile.rpc.public;

      if (isAllowlist && mintParams && salt && signature) {
        const feeRecipient = "0x0000a26b00c1F0DF003000390027140000fAa719";
        const data = encodeMintSigned(
          contractAddress,
          feeRecipient,
          quantity,
          mintParams,
          salt,
          signature
        );
        plan = {
          to: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",
          data,
          value: BigInt(mintParams.mintPrice) * BigInt(quantity)
        };
      } else if (isAllowlist) {
        // Allowlist stage without signature payload yet
        const notEligible = walletList.map(address => ({
          address,
          reason: "Requires cryptographic SeaDrop signature (issued by OpenSea when allowlist stage goes live)"
        }));
        return res.json({ eligible: [], notEligible, isAllowlistPending: true });
      } else {
        try {
          plan = await withRpcFallback(rpcEndpoints, url => buildLocalMintPlan(url, contractAddress, quantity));
        } catch (err: any) {
          return res.status(400).json({ error: `Public drop check failed: ${err.message || "Contract not active on SeaDrop"}` });
        }
        if (!plan) {
          const notEligible = walletList.map(address => ({
            address,
            reason: "Public drop not configured or not yet live on SeaDrop contract"
          }));
          return res.json({ eligible: [], notEligible });
        }
      }

      const eligible: string[] = [];
      const notEligible: { address: string; reason: string }[] = [];

      // Simulate the call for each wallet using RPC fallback engine
      await Promise.all(walletList.map(async (address) => {
        try {
          await withRpcFallback(rpcEndpoints, async (url) => {
             const provider = createRpcProvider(url, chainProfile.chainId);
             // Verify contract execution bytecode using eth_call
             await provider.call({
                 to: plan.to,
                 data: plan.data,
                 value: plan.value,
                 from: address
             });
          });
          eligible.push(address);
        } catch (err: any) {
          let reasonMsg = err.message || "Simulation reverted";
          const lower = reasonMsg.toLowerCase();
          if (lower.includes("not active") || lower.includes("starttime") || lower.includes("ended")) {
            reasonMsg = "Stage not currently active on-chain";
          } else if (lower.includes("insufficient funds") || lower.includes("balance")) {
            reasonMsg = "Insufficient native balance for mint price + gas";
          } else if (lower.includes("exceeds") || lower.includes("maxmint") || lower.includes("mintable")) {
            reasonMsg = "Exceeds maximum allowable mints per wallet";
          } else if (lower.includes("execution reverted") || lower.includes("call_exception")) {
            reasonMsg = "Execution reverted (Stage inactive or wallet not on allowlist)";
          }
          notEligible.push({ address, reason: reasonMsg });
        }
      }));

      return res.json({ eligible, notEligible });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  
  app.get("/api/gas-price", async (req, res) => {
    try {
      const chain = String(req.query.chain || '');
      if (!chain) return res.status(400).json({ error: "Missing chain" });
      const chainProfile = resolveChain(chain);
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain" });
      }
      
      const rpcUrl = chainProfile.rpc.public[0];
      const provider = createRpcProvider(rpcUrl, chainProfile.chainId);
      const feeData: any = await provider.getFeeData();
      
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

  app.post("/api/schedule-mint", async (req, res) => {
    try {
      const { targetTime, contractAddress, quantity, isAllowlist, mintParams, salt, signature, apiKey, wallets, chain } = req.body;
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
      });
      
      return res.json({ 
        success: true, 
        taskId,
        targetTime,
        walletCount: wallets.length,
        chain: chain || 'ethereum'
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/snipe/seadrop", async (req, res) => {
    try {
      const { chain, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature, apiKey } = req.body;

      if (!chain || !inputContract || !quantity) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const chainProfile = resolveChain(chain);
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain or no public RPCs available" });
      }

      const rpcEndpoints = [...chainProfile.rpc.public];
      
      if (apiKey) {
        const keyStr = apiKey.trim();
        if (keyStr.startsWith('http://') || keyStr.startsWith('https://')) {
          // They provided a full custom RPC URL
          rpcEndpoints.unshift(keyStr);
        } else if (chainProfile.rpc.alchemyHost) {
          // They provided an API key for Alchemy
          rpcEndpoints.unshift(`https://${chainProfile.rpc.alchemyHost}/v2/${keyStr}`);
        }
      }
      
      const rpcUrl = rpcEndpoints[0]; // Primary node

      let contractAddress = inputContract.trim();
      
      if (isSlug(contractAddress)) {
        try {
          const resolved = await resolveSlug(contractAddress);
          contractAddress = resolved.contractAddress;
        } catch (err: any) {
          return res.status(400).json({ error: `Failed to resolve slug: ${err.message}` });
        }
      }

      let plan;

      if (isAllowlist) {
        if (!mintParams || !salt || !signature) {
          return res.status(400).json({ error: "Missing allowlist parameters" });
        }
        // Use OpenSea's standard fee recipient
        const feeRecipient = "0x0000a26b00c1F0DF003000390027140000fAa719";
        
        const data = encodeMintSigned(
          contractAddress,
          feeRecipient,
          quantity,
          mintParams as MintParams,
          salt,
          signature
        );

        plan = {
          to: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5",
          data,
          value: BigInt(mintParams.mintPrice) * BigInt(quantity)
        };
      } else {
        plan = await withRpcFallback(rpcEndpoints, url => buildLocalMintPlan(url, contractAddress, quantity));
        if (!plan) {
          return res.status(400).json({ error: "Failed to build public mint plan (Drop not found or fee restricted)" });
        }
      }

      const planResponse = {
        to: plan.to,
        data: plan.data,
        value: plan.value.toString(),
        resolvedContract: contractAddress
      };

      if (privateKey) {
        try {
          const { nonce, feeData } = await withRpcFallback(rpcEndpoints, async (url) => {
             const provider = createRpcProvider(url, chainProfile.chainId);
             const wallet = new Wallet(privateKey, provider);
             try {
                await provider.estimateGas({
                    to: plan.to,
                    data: plan.data,
                    value: plan.value,
                    from: wallet.address
                });
             } catch (estimateErr: any) {
                // Ignore estimateGas failure if wallet is pending funding
             }
             const nonce = await wallet.getNonce();
             const feeData = await provider.getFeeData();
             return { nonce, feeData };
          });
          
          // Pre-warm the connections before firing
          const parsedEndpoints = parseRpcEndpoints(rpcEndpoints);
          await warmConnections(rpcEndpoints);

          // Create an un-connected wallet to sign
          const wallet = new Wallet(privateKey);
          
          const txRequest = await wallet.populateTransaction({
            to: plan.to,
            data: plan.data,
            value: plan.value,
            nonce,
            maxFeePerGas: feeData.maxFeePerGas,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            gasLimit: 300000 // generous limit for minting
          });

          const rawTx = await wallet.signTransaction(txRequest);
          
          // Blast!
          const { txHash, responsePromise } = blastToAll(rawTx, parsedEndpoints);
          
          // Wait for receipt
          const receipt = await withRpcFallback(rpcEndpoints, url => waitForReceipt(txHash, url, 30000));

          return res.json({ 
            success: true, 
            txHash, 
            receipt,
            plan: planResponse,
            msg: receipt ? `Transaction ${receipt.status} in block ${receipt.block}` : "Transaction broadcasted successfully!"
          });
        } catch (txErr: any) {
          return res.json({ 
            success: false, 
            error: txErr.message, 
            plan: planResponse 
          });
        }
      }

      res.json({ 
        success: true, 
        plan: planResponse, 
        msg: "Mint payload generated successfully. No private key provided for broadcast." 
      });

    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
