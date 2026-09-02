import fs from 'fs';
let code = fs.readFileSync('server.ts', 'utf8');

const matchBlock = `          const provider = new JsonRpcProvider(rpcUrl);
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
          const parsedEndpoints = parseRpcEndpoints(rpcEndpoints);
          await warmConnections(rpcEndpoints);

          // Get nonce and fee data directly
          const nonce = await wallet.getNonce();
          const feeData = await provider.getFeeData();`;

const replaceBlock = `          const { nonce, feeData } = await withRpcFallback(rpcEndpoints, async (url) => {
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
                console.warn("Gas estimation failed on", url, ":", estimateErr.message);
             }
             const nonce = await wallet.getNonce();
             const feeData = await provider.getFeeData();
             return { nonce, feeData };
          });
          
          // Pre-warm the connections before firing
          const parsedEndpoints = parseRpcEndpoints(rpcEndpoints);
          await warmConnections(rpcEndpoints);

          // Create an un-connected wallet to sign
          const wallet = new Wallet(privateKey);`;

code = code.replace(matchBlock, replaceBlock);

// Replace waitForReceipt to use withRpcFallback
const waitMatch = `const receipt = await waitForReceipt(txHash, rpcUrl, 30000);`;
const waitReplace = `const receipt = await withRpcFallback(rpcEndpoints, url => waitForReceipt(txHash, url, 30000));`;
code = code.replace(waitMatch, waitReplace);

fs.writeFileSync('server.ts', code);
