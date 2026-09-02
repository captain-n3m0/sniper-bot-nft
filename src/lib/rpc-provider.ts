import { JsonRpcProvider, FetchRequest } from "ethers";

export function createRpcProvider(url: string, chainId?: number): JsonRpcProvider {
  const fetchReq = new FetchRequest(url);
  fetchReq.timeout = 7000;
  // Use standard headers to avoid anti-bot blocks on public RPC nodes
  fetchReq.setHeader("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
  fetchReq.setHeader("Accept", "application/json");

  if (chainId) {
    return new JsonRpcProvider(fetchReq, chainId, { staticNetwork: true, batchMaxCount: 1 });
  }
  return new JsonRpcProvider(fetchReq, undefined, { staticNetwork: true, batchMaxCount: 1 });
}
