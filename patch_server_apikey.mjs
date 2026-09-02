import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const oldDestructuring = 'const { chain, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature } = req.body;';
const newDestructuring = 'const { chain, contractAddress: inputContract, quantity, privateKey, isAllowlist, mintParams, salt, signature, apiKey } = req.body;';

code = code.replace(oldDestructuring, newDestructuring);

const oldEndpointsSetup = `      const rpcEndpoints = chainProfile.rpc.public;
      const rpcUrl = rpcEndpoints[0]; // Primary node`;

const newEndpointsSetup = `      const rpcEndpoints = [...chainProfile.rpc.public];
      
      if (apiKey) {
        const keyStr = apiKey.trim();
        if (keyStr.startsWith('http://') || keyStr.startsWith('https://')) {
          // They provided a full custom RPC URL
          rpcEndpoints.unshift(keyStr);
        } else if (chainProfile.rpc.alchemyHost) {
          // They provided an API key for Alchemy
          rpcEndpoints.unshift(\`https://\${chainProfile.rpc.alchemyHost}/v2/\${keyStr}\`);
        }
      }
      
      const rpcUrl = rpcEndpoints[0]; // Primary node`;

code = code.replace(oldEndpointsSetup, newEndpointsSetup);

fs.writeFileSync('server.ts', code);
