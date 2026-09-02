import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const fallbackFunc = `
// --- RPC Fallback Helper ---
async function withRpcFallback(endpoints, fn) {
  let lastError;
  for (const url of endpoints) {
    try {
      return await fn(url);
    } catch (err) {
      console.warn(\`RPC \${url} failed, trying next...\`, err.message);
      lastError = err;
    }
  }
  throw lastError;
}
// ---------------------------
`;

if (!code.includes('withRpcFallback')) {
  code = code.replace('async function startServer() {', fallbackFunc + '\nasync function startServer() {');
}

// Ensure resolveChain is imported
if (!code.includes('resolveChain')) {
  code = code.replace(
    'import { resolveSlug, isSlug } from "./src/lib/slug-resolver";',
    'import { resolveSlug, isSlug } from "./src/lib/slug-resolver";\nimport { resolveChain } from "./src/lib/chains";'
  );
}

const reqBodyMatch = 'const { rpcUrl, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature } = req.body;';
const reqBodyReplacement = `      const { chain, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature } = req.body;
      const chainProfile = resolveChain(chain || 'ethereum');
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain or no public RPCs available" });
      }
      const rpcEndpoints = chainProfile.rpc.public;
      const rpcUrl = rpcEndpoints[0]; // Legacy variable to avoid refactoring the entire file if not needed`;

code = code.replace(reqBodyMatch, reqBodyReplacement);

const reqValidationMatch = 'if (!rpcUrl || !inputContract || !quantity) {';
const reqValidationReplacement = 'if (!inputContract || !quantity) {';
code = code.replace(reqValidationMatch, reqValidationReplacement);

// Replace buildLocalMintPlan
const buildLocalMatch = 'plan = await buildLocalMintPlan(rpcUrl, contractAddress, quantity);';
const buildLocalReplacement = 'plan = await withRpcFallback(rpcEndpoints, url => buildLocalMintPlan(url, contractAddress, quantity));';
code = code.replace(buildLocalMatch, buildLocalReplacement);

// Replace JsonRpcProvider
const providerMatch = `          const provider = new JsonRpcProvider(rpcUrl);
          const wallet = new Wallet(privateKey, provider);
          
          try {
             await provider.estimateGas({
                 to: plan.to,
                 data: plan.data,
                 value: plan.value,
                 from: wallet.address
             });
          } catch (estimateErr: any) {
             console.warn("Gas estimation failed, the transaction might revert:", estimateErr.message);
          }

          // Pre-warm the connections before firing
          const rpcEndpointsParsed = parseRpcEndpoints([rpcUrl]);
          await warmConnections([rpcUrl]);

          // Get nonce and fee data directly
          const nonce = await wallet.getNonce();
          const feeData = await provider.getFeeData();`;

const providerReplacement = `          const { nonce, feeData } = await withRpcFallback(rpcEndpoints, async (url) => {
             const provider = new JsonRpcProvider(url);
             const wallet = new Wallet(privateKey, provider);
             try {
                await provider.estimateGas({
                    to: plan.to,
                    data: plan.data,
                    value: plan.value,
                    from: wallet.address
                });
             } catch (estimateErr: any) {
                console.warn("Gas estimation failed, the transaction might revert:", estimateErr.message);
             }
             const nonce = await wallet.getNonce();
             const feeData = await provider.getFeeData();
             return { nonce, feeData };
          });
          
          // Pre-warm the connections before firing
          const rpcEndpointsParsed = parseRpcEndpoints(rpcEndpoints);
          await warmConnections(rpcEndpoints);

          // Create an un-connected wallet to sign
          const wallet = new Wallet(privateKey);`;

// Wait, the regex replace might be tricky with multiline string. Let's use simpler replaces.

fs.writeFileSync('server.ts', code);
