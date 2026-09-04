import { after, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Interface, Wallet } from "ethers";
import { SiweMessage } from "siwe";

const testDirectory = mkdtempSync(join(tmpdir(), "mintgrid-tests-"));
const databasePath = join(testDirectory, "test.sqlite");
process.env.NODE_ENV = "test";
process.env.DATABASE_PATH = databasePath;
process.env.SESSION_SECRET = "test-session-secret-that-is-long-and-stable";
process.env.CONFIG_ENCRYPTION_KEY = "test-config-encryption-key-that-is-long-and-stable";
process.env.OPENSEA_API_KEY = "test-opensea-key";
process.env.SIWE_DOMAIN = "";

const { default: app, clearSchedulerMemoryForTest, decodeMintTransaction, restoreSchedulerJobs, runIsolatedSchedulerTasks, runSchedulerWorkerPool, withRpcFallback } = await import("../server.ts");

let server: Server;
let baseUrl = "";

async function startTestServer() {
  if (server) return;
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}

async function request(pathname: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  await startTestServer();
  const url = new URL(pathname, baseUrl);
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const outgoing = httpRequest(
      url,
      {
        method: options.method || "GET",
        headers: {
          ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}),
          ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          try {
            resolve({ status: response.statusCode || 0, body: text ? JSON.parse(text) : {} });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    outgoing.on("error", reject);
    if (body) outgoing.write(body);
    outgoing.end();
  });
}

async function authenticate(wallet: { address: string; signMessage(message: string): Promise<string> }) {
  await startTestServer();
  const host = new URL(baseUrl).host;
  const nonceResponse = await request(`/api/auth/nonce?address=${wallet.address}`);
  assert.equal(nonceResponse.status, 200);
  const message = new SiweMessage({
    domain: host,
    address: wallet.address,
    statement: "Sign in to LastLap MintGrid tests",
    uri: baseUrl,
    version: "1",
    chainId: 1,
    nonce: nonceResponse.body.nonce,
  });
  const prepared = message.prepareMessage();
  const signature = await wallet.signMessage(prepared);
  const verified = await request("/api/auth/verify", {
    method: "POST",
    body: { message: prepared, signature },
  });
  assert.equal(verified.status, 200);
  return verified.body.token as string;
}

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(testDirectory, { recursive: true, force: true });
});

test("wallet vault persists encrypted wallets and isolates users", async () => {
  const loginA = Wallet.createRandom();
  const loginB = Wallet.createRandom();
  const execution = Wallet.createRandom();
  const tokenA = await authenticate(loginA);
  const tokenB = await authenticate(loginB);

  assert.equal((await request("/api/user/wallets")).status, 401);
  const saved = await request("/api/user/wallets", {
    method: "PUT",
    token: tokenA,
    body: { wallets: [{ id: "wallet-test-1", name: "Fast wallet", address: execution.address, privateKey: execution.privateKey }] },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.wallets[0].address, execution.address);

  const loaded = await request("/api/user/wallets", { token: tokenA });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.wallets[0].privateKey, execution.privateKey);
  const otherUser = await request("/api/user/wallets", { token: tokenB });
  assert.equal(otherUser.status, 200);
  assert.deepEqual(otherUser.body.wallets, []);

  const rawDatabase = readFileSync(databasePath);
  assert.equal(rawDatabase.includes(Buffer.from(execution.privateKey.slice(2))), false);
});

test("OpenSea user configuration is encrypted at rest and restored", async () => {
  const login = Wallet.createRandom();
  const token = await authenticate(login);
  const secret = "opensea-user-secret-123";
  const saved = await request("/api/user/config", {
    method: "PUT",
    token,
    body: { config: { sniper: { openSeaApiKey: secret, quantity: "1" } } },
  });
  assert.equal(saved.status, 200);
  const loaded = await request("/api/user/config", { token });
  assert.equal(loaded.body.config.sniper.openSeaApiKey, secret);
  assert.equal(readFileSync(databasePath, "utf8").includes(secret), false);
});

test("scheduler jobs are owner-scoped, durable, and controllable", async () => {
  const login = Wallet.createRandom();
  const stranger = Wallet.createRandom();
  const execution = Wallet.createRandom();
  const token = await authenticate(login);
  const strangerToken = await authenticate(stranger);
  const contractAddress = Wallet.createRandom().address;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("https://api.opensea.io/api/v2/")) {
      return new Response(
        JSON.stringify({ contracts: [{ address: contractAddress, chain: "ethereum" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return originalFetch(input);
  };
  try {
    const created = await request("/api/scheduler/create", {
      method: "POST",
      token,
      body: {
        targetTime: new Date(Date.now() + 60_000).toISOString(),
        contractAddress,
        quantity: 1,
        chain: "ethereum",
        slug: "test-drop",
        openseaApiKey: "test-key",
        wallets: [{ id: "scheduled-wallet", name: "Scheduled wallet", address: execution.address, privateKey: execution.privateKey }],
      },
    });
    assert.equal(created.status, 201);
    const id = created.body.id as string;
    assert.equal((await request("/api/scheduler/jobs", { token: strangerToken })).body.count, 0);
    assert.equal((await request(`/api/scheduler/jobs/${id}/pause`, { method: "POST", token: strangerToken })).status, 404);
    assert.equal((await request(`/api/scheduler/jobs/${id}/pause`, { method: "POST", token })).body.job.status, "paused");
    clearSchedulerMemoryForTest();
    restoreSchedulerJobs();
    const restored = await request("/api/scheduler/jobs", { token });
    assert.equal(restored.body.jobs[0].id, id);
    assert.equal(restored.body.jobs[0].status, "paused");
    assert.equal((await request(`/api/scheduler/jobs/${id}/resume`, { method: "POST", token })).body.job.status, "pending");
    assert.equal((await request(`/api/scheduler/jobs/${id}/stop`, { method: "POST", token })).body.job.status, "stopped");

    const db = new DatabaseSync(databasePath);
    const persisted = db.prepare("SELECT status, payload_cipher FROM scheduler_jobs WHERE id = ?").get(id) as { status: string; payload_cipher: string };
    assert.equal(persisted.status, "stopped");
    assert.equal(persisted.payload_cipher.includes(execution.privateKey), false);
    db.close();

    assert.equal((await request(`/api/scheduler/jobs/${id}`, { method: "DELETE", token })).status, 200);
    assert.equal((await request("/api/scheduler/jobs", { token })).body.count, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("transaction decoder validates standard SeaDrop public calldata", () => {
  const abi = new Interface([
    "function mintPublic(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity)",
  ]);
  const nft = Wallet.createRandom().address;
  const fee = Wallet.createRandom().address;
  const data = abi.encodeFunctionData("mintPublic", [nft, fee, "0x0000000000000000000000000000000000000000", 2]);
  const decoded = decodeMintTransaction(
    { to: "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5", data, value: 0n },
    Wallet.createRandom().address,
  );
  assert.equal(decoded.method, "mintPublic");
  assert.equal(decoded.nftContract, nft);
  assert.equal(decoded.quantity, "2");
});

test("scheduler wallet work is isolated when one wallet fails", async () => {
  const results = await runIsolatedSchedulerTasks(["ready", "broken", "also-ready"], async (value) => {
    if (value === "broken") throw new Error("wallet-specific OpenSea action failed");
    return `${value}:signed`;
  });
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[2].status, "fulfilled");
});

test("scheduler worker pool respects the configured concurrency", async () => {
  let active = 0;
  let peak = 0;
  const results = await runSchedulerWorkerPool([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results.map((result) => result.status === "fulfilled" ? result.value : null), [2, 4, 6, 8, 10]);
});

test("RPC fallback retries transport failures but returns EVM outcomes immediately", async () => {
  const calls: string[] = [];
  const value = await withRpcFallback(["https://one.invalid", "https://two.invalid"], async (url) => {
    calls.push(url);
    if (url.includes("one")) throw Object.assign(new Error("service unavailable"), { status: 503 });
    return "ok";
  });
  assert.equal(value, "ok");
  assert.deepEqual(calls, ["https://one.invalid", "https://two.invalid"]);

  let evmCalls = 0;
  await assert.rejects(
    withRpcFallback(["https://evm-one.invalid", "https://evm-two.invalid"], async () => {
      evmCalls += 1;
      throw Object.assign(new Error("execution reverted"), { code: "CALL_EXCEPTION" });
    }),
  );
  assert.equal(evmCalls, 1);
});
