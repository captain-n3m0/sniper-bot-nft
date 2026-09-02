import fs from 'fs';

let code = fs.readFileSync('server.ts', 'utf8');

// 1. Add import
if (!code.includes('resolveChain')) {
  code = code.replace(
    'import { resolveSlug, isSlug } from "./src/lib/slug-resolver";',
    'import { resolveSlug, isSlug } from "./src/lib/slug-resolver";\nimport { resolveChain } from "./src/lib/chains";'
  );
}

// 2. Change /api/snipe/seadrop to use chain instead of rpcUrl
const oldSnipeHead = `
  app.post("/api/snipe/seadrop", async (req, res) => {
    try {
      const { rpcUrl, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature } = req.body;

      if (!rpcUrl || !inputContract || !quantity) {
        return res.status(400).json({ error: "Missing required fields" });
      }
`;

const newSnipeHead = `
  app.post("/api/snipe/seadrop", async (req, res) => {
    try {
      const { chain, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature } = req.body;

      if (!chain || !inputContract || !quantity) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const chainProfile = resolveChain(chain);
      if (!chainProfile || !chainProfile.rpc.public.length) {
        return res.status(400).json({ error: "Unsupported chain or no public RPCs available" });
      }

      const rpcEndpoints = chainProfile.rpc.public;
      const rpcUrl = rpcEndpoints[0]; // Primary node
`;

code = code.replace(oldSnipeHead, newSnipeHead);

// Replace parseRpcEndpoints([rpcUrl]) with parseRpcEndpoints(rpcEndpoints)
code = code.replace(
  'const rpcEndpoints = parseRpcEndpoints([rpcUrl]);',
  'const parsedEndpoints = parseRpcEndpoints(rpcEndpoints);'
);

code = code.replace(
  'const { txHash, responsePromise } = blastToAll(rawTx, rpcEndpoints);',
  'const { txHash, responsePromise } = blastToAll(rawTx, parsedEndpoints);'
);

code = code.replace(
  'await warmConnections([rpcUrl]);',
  'await warmConnections(rpcEndpoints);'
);

fs.writeFileSync('server.ts', code);
