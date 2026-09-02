import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const mockBlockStart = 'app.post("/api/check-whitelist", async (req, res) => {';
const mockBlockEnd = '  app.post("/api/schedule-mint", async (req, res) => {';

const newEndpoint = `
  app.post("/api/simulate-mint", async (req, res) => {
    try {
      const { chain, contractAddress: inputContract, quantity, isAllowlist, mintParams, salt, signature, wallets } = req.body;
      
      if (!chain || !inputContract || !quantity || !wallets || !Array.isArray(wallets)) {
        return res.status(400).json({ error: "Missing required fields or wallets array" });
      }

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
          return res.status(400).json({ error: \`Failed to resolve slug: \${err.message}\` });
        }
      }

      let plan;
      const rpcEndpoints = chainProfile.rpc.public;

      if (isAllowlist) {
        if (!mintParams || !salt || !signature) {
          return res.status(400).json({ error: "Missing allowlist parameters" });
        }
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
      } else {
        plan = await withRpcFallback(rpcEndpoints, url => buildLocalMintPlan(url, contractAddress, quantity));
        if (!plan) {
          return res.status(400).json({ error: "Failed to build public mint plan (Drop not found or fee restricted)" });
        }
      }

      const eligible = [];
      const notEligible = [];

      // Simulate the call for each wallet using RPC fallback engine
      await Promise.all(wallets.map(async (address) => {
        try {
          await withRpcFallback(rpcEndpoints, async (url) => {
             const provider = new JsonRpcProvider(url);
             await provider.estimateGas({
                 to: plan.to,
                 data: plan.data,
                 value: plan.value,
                 from: address
             });
          });
          eligible.push(address);
        } catch (err) {
          notEligible.push({ address, reason: err.message || "Transaction reverted" });
        }
      }));

      return res.json({ eligible, notEligible });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  });

`;

const startIdx = code.indexOf(mockBlockStart);
const endIdx = code.indexOf(mockBlockEnd);

if (startIdx !== -1 && endIdx !== -1) {
  code = code.substring(0, startIdx) + newEndpoint + code.substring(endIdx);
  fs.writeFileSync('server.ts', code);
}
