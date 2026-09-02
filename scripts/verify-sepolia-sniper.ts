import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Contract, FetchRequest, JsonRpcProvider, Wallet, getAddress } from "ethers";

const apiBase = (process.env.TESTNET_API_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const walletRecord = JSON.parse(readFileSync(resolve(".sepolia-test-deployer.json"), "utf8")) as {
  address: string;
  privateKey: string;
};
const deployment = JSON.parse(readFileSync(resolve("testnet/sepolia-deployment.json"), "utf8")) as {
  contractAddress: string;
  explorer: string;
};
const wallet = new Wallet(walletRecord.privateKey);

if (wallet.address !== getAddress(walletRecord.address)) {
  throw new Error("The stored Sepolia deployer address does not match its private key");
}

async function post(pathname: string, body: unknown) {
  const response = await fetch(`${apiBase}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as Record<string, any>;
  if (!response.ok || data.success === false) {
    throw new Error(String(data.error || `${pathname} returned HTTP ${response.status}`));
  }
  return data;
}

async function main() {
  console.log(`Preparing mint through ${apiBase}...`);
  const prepared = await post("/api/prepare-mint", {
    chain: "sepolia",
    contractAddress: deployment.contractAddress,
    quantity: 1,
    privateKey: wallet.privateKey,
    isAllowlist: false,
  });
  if (!prepared.simulation?.ok) {
    throw new Error(`Preflight simulation failed: ${prepared.simulation?.reason || "unknown reason"}`);
  }
  if (getAddress(prepared.plan?.nftContract || prepared.plan?.contractAddress) !== getAddress(deployment.contractAddress)) {
    throw new Error("Prepared transaction targets the wrong NFT contract");
  }

  console.log("Simulation passed; broadcasting one free public mint...");
  const broadcast = await post("/api/blast-mint", {
    chain: "sepolia",
    transaction: prepared.transaction,
    privateKey: wallet.privateKey,
  });
  if (!broadcast.txHash || !broadcast.statusUrl) {
    throw new Error("Broadcast response did not include a transaction hash and status URL");
  }

  const statusResponse = await fetch(`${apiBase}${broadcast.statusUrl}`, {
    signal: AbortSignal.timeout(180_000),
  });
  if (!statusResponse.ok) throw new Error(`Status stream returned HTTP ${statusResponse.status}`);
  const statusEvents = await statusResponse.text();
  if (statusEvents.includes("event: reverted")) throw new Error(`Mint reverted: ${broadcast.txHash}`);
  if (!statusEvents.includes("event: confirmed")) {
    throw new Error(`Mint did not reach confirmed state: ${statusEvents.slice(-500)}`);
  }

  const request = new FetchRequest("https://ethereum-sepolia-rpc.publicnode.com");
  request.setHeader("User-Agent", "SeaDrop-Sniper-Testnet-Verification/1.0");
  const provider = new JsonRpcProvider(
    request,
    { chainId: 11_155_111, name: "sepolia" },
    { staticNetwork: true },
  );
  const nft = new Contract(
    deployment.contractAddress,
    [
      "function balanceOf(address) view returns (uint256)",
      "function totalSupply() view returns (uint256)",
      "function getMintStats(address) view returns (uint256,uint256,uint256)",
    ],
    provider,
  );
  const [balance, totalSupply, stats] = await Promise.all([
    nft.balanceOf(wallet.address),
    nft.totalSupply(),
    nft.getMintStats(wallet.address),
  ]);
  provider.destroy();

  if (balance < 1n || totalSupply < 1n || stats[0] < 1n) {
    throw new Error("The transaction confirmed, but NFT mint state did not update as expected");
  }
  console.log("\nSNIPER TEST PASSED");
  console.log(`Transaction: ${broadcast.txHash}`);
  console.log(`Explorer: https://sepolia.etherscan.io/tx/${broadcast.txHash}`);
  console.log(`Wallet NFT balance: ${balance.toString()}`);
  console.log(`Collection total supply: ${totalSupply.toString()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
