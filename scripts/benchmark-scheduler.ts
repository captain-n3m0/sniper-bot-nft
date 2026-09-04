import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Wallet } from "ethers";
import { SiweMessage } from "siwe";

const apiBase = (process.env.BENCHMARK_API_URL || "https://mintgrid.lastlap.live").replace(/\/$/, "");
const walletRecord = JSON.parse(readFileSync(resolve(".sepolia-test-deployer.json"), "utf8")) as {
  address: string;
  privateKey: string;
};
const deployment = JSON.parse(
  readFileSync(resolve(process.env.BENCHMARK_DEPLOYMENT_PATH || "testnet/sepolia-deployment.json"), "utf8"),
) as {
  contractAddress: string;
  stage: { startsAt: string };
};
const wallet = new Wallet(walletRecord.privateKey);

async function jsonRequest(pathname: string, options: RequestInit = {}) {
  const response = await fetch(`${apiBase}${pathname}`, options);
  const data = (await response.json()) as Record<string, any>;
  if (!response.ok) throw new Error(String(data.error || `${pathname} returned HTTP ${response.status}`));
  return data;
}

async function authenticate() {
  const url = new URL(apiBase);
  const nonce = await jsonRequest(`/api/auth/nonce?address=${wallet.address}`);
  const message = new SiweMessage({
    domain: url.host,
    address: wallet.address,
    statement: "Authorize the LastLap MintGrid Sepolia scheduler benchmark",
    uri: url.origin,
    version: "1",
    chainId: 1,
    nonce: nonce.nonce,
  });
  const prepared = message.prepareMessage();
  const signature = await wallet.signMessage(prepared);
  const verified = await jsonRequest("/api/auth/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: prepared, signature }),
  });
  return verified.token as string;
}

async function main() {
  const targetTime = Date.parse(deployment.stage.startsAt);
  if (!Number.isFinite(targetTime) || targetTime < Date.now() + 20_000) {
    throw new Error("The Sepolia fixture must start at least 20 seconds in the future");
  }
  const token = await authenticate();
  const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
  const created = await jsonRequest("/api/scheduler/create", {
    method: "POST",
    headers,
    body: JSON.stringify({
      targetTime: new Date(targetTime).toISOString(),
      contractAddress: deployment.contractAddress,
      quantity: 1,
      chain: "sepolia",
      isAllowlist: false,
      wallets: [{ id: "sepolia-benchmark", name: "Sepolia benchmark", address: wallet.address, privateKey: wallet.privateKey }],
    }),
  });
  console.log(`Scheduled benchmark job ${created.id} for ${created.targetTime}`);

  const deadline = targetTime + 180_000;
  while (Date.now() < deadline) {
    const listing = await jsonRequest("/api/scheduler/jobs", { headers: { authorization: `Bearer ${token}` } });
    const job = (listing.jobs as any[]).find((item) => item.id === created.id);
    if (!job) throw new Error("Benchmark job disappeared from the owner-scoped job list");
    if (["completed", "failed", "stopped"].includes(job.status)) {
      const walletResult = job.wallets?.[0] || {};
      console.log(
        JSON.stringify(
          {
            status: job.status,
            transactionHash: walletResult.txHash,
            acceptedBy: walletResult.acceptedBy,
            submissionLatencyMs: walletResult.submissionLatencyMs,
            targetOffsetMs: walletResult.targetOffsetMs,
            error: job.error || walletResult.error,
          },
          null,
          2,
        ),
      );
      if (job.status !== "completed") process.exitCode = 1;
      return;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error("Benchmark job did not reach a terminal state within three minutes of its target");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
