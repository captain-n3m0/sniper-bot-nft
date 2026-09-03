import "dotenv/config";

import crypto from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import type { Server as HttpServer } from "node:http";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import express, { type NextFunction, type Request, type Response } from "express";
import {
  FetchRequest,
  Interface,
  JsonRpcProvider,
  Transaction,
  Wallet,
  ZeroAddress,
  formatUnits,
  getAddress,
  isAddress,
  keccak256,
  parseUnits,
  toQuantity,
} from "ethers";
import { generateNonce, SiweMessage } from "siwe";

const HOST = "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const PROCESS_STARTED_AT = Date.now();
const RPC_TIMEOUT_MS = 7_000;
const MAX_WALLETS = 100;
const SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";
const OPENSEA_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719";
const OPENSEA_KEY_CACHE_PATH = path.resolve(
  process.cwd(),
  process.env.OPENSEA_KEY_CACHE_PATH || ".opensea-key-cache.json",
);
// Used only to ask OpenSea for unsigned public-mint calldata when the checked
// wallet is unfunded. The returned calldata is rewritten and simulated for the
// actual execution wallet; this address never signs or broadcasts anything.
const DEFAULT_OPENSEA_QUOTE_MINTER = "0xF977814e90dA44bFA03b6295A0616a897441aceC";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36 SeaDropSniper/1.0";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEVELOPMENT = !IS_PRODUCTION && process.env.NODE_ENV !== "test";
const DATABASE_PATH = path.resolve(
  process.env.DATABASE_PATH || (IS_PRODUCTION ? "/var/lib/lastlap-mintgrid/app.sqlite" : ".lastlap-mintgrid.sqlite"),
);
const MAX_USER_CONFIG_BYTES = 64 * 1024;

interface ChainConfig {
  key: string;
  aliases: string[];
  chainId: number;
  name: string;
  nativeSymbol: string;
  explorer: string;
  alchemyHost?: string;
  rpcUrls: string[];
  broadcastUrls?: string[];
}

const CHAINS: ChainConfig[] = [
  {
    key: "ethereum",
    aliases: ["eth", "mainnet"],
    chainId: 1,
    name: "Ethereum",
    nativeSymbol: "ETH",
    explorer: "https://etherscan.io",
    alchemyHost: "eth-mainnet.g.alchemy.com",
    rpcUrls: [
      "https://eth.llamarpc.com",
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.ankr.com/eth",
      "https://cloudflare-eth.com",
      "https://1rpc.io/eth",
    ],
  },
  {
    key: "base",
    aliases: ["base-mainnet"],
    chainId: 8453,
    name: "Base",
    nativeSymbol: "ETH",
    explorer: "https://basescan.org",
    alchemyHost: "base-mainnet.g.alchemy.com",
    rpcUrls: [
      "https://base.llamarpc.com",
      "https://base-rpc.publicnode.com",
      "https://mainnet.base.org",
      "https://rpc.ankr.com/base",
      "https://1rpc.io/base",
    ],
  },
  {
    key: "polygon",
    aliases: ["matic", "polygon-mainnet"],
    chainId: 137,
    name: "Polygon",
    nativeSymbol: "POL",
    explorer: "https://polygonscan.com",
    alchemyHost: "polygon-mainnet.g.alchemy.com",
    rpcUrls: [
      "https://polygon.llamarpc.com",
      "https://polygon-bor-rpc.publicnode.com",
      "https://polygon-rpc.com",
      "https://rpc.ankr.com/polygon",
      "https://1rpc.io/matic",
    ],
  },
  {
    key: "arbitrum",
    aliases: ["arb", "arbitrum-one"],
    chainId: 42161,
    name: "Arbitrum One",
    nativeSymbol: "ETH",
    explorer: "https://arbiscan.io",
    alchemyHost: "arb-mainnet.g.alchemy.com",
    rpcUrls: [
      "https://arbitrum.llamarpc.com",
      "https://arbitrum-one-rpc.publicnode.com",
      "https://arb1.arbitrum.io/rpc",
      "https://rpc.ankr.com/arbitrum",
      "https://1rpc.io/arb",
    ],
  },
  {
    key: "optimism",
    aliases: ["op", "optimistic-ethereum"],
    chainId: 10,
    name: "Optimism",
    nativeSymbol: "ETH",
    explorer: "https://optimistic.etherscan.io",
    alchemyHost: "opt-mainnet.g.alchemy.com",
    rpcUrls: [
      "https://optimism.llamarpc.com",
      "https://optimism-rpc.publicnode.com",
      "https://mainnet.optimism.io",
      "https://rpc.ankr.com/optimism",
      "https://1rpc.io/op",
    ],
  },
  {
    key: "robinhood",
    aliases: ["robinhood-chain", "robinhood-mainnet", "rh"],
    chainId: 4663,
    name: "Robinhood Chain",
    nativeSymbol: "ETH",
    explorer: "https://robinhoodchain.blockscout.com",
    alchemyHost: "robinhood-mainnet.g.alchemy.com",
    rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
    // Robinhood's sequencer endpoint is optimized for submission but does not
    // expose the full read API, so it is used only during transaction blasts.
    broadcastUrls: ["https://sequencer.mainnet.chain.robinhood.com"],
  },
  {
    key: "sepolia",
    aliases: ["ethereum-sepolia", "eth-sepolia", "testnet"],
    chainId: 11155111,
    name: "Sepolia",
    nativeSymbol: "ETH",
    explorer: "https://sepolia.etherscan.io",
    alchemyHost: "eth-sepolia.g.alchemy.com",
    rpcUrls: [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc.sepolia.org",
      "https://ethereum-sepolia.blockpi.network/v1/rpc/public",
      "https://rpc2.sepolia.org",
      "https://1rpc.io/sepolia",
    ],
  },
];

export function resolveChain(value: unknown): ChainConfig | undefined {
  if (typeof value === "number" || typeof value === "bigint") {
    return CHAINS.find((chain) => chain.chainId === Number(value));
  }
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (/^\d+$/.test(normalized)) {
    return CHAINS.find((chain) => chain.chainId === Number(normalized));
  }
  return CHAINS.find(
    (chain) => chain.key === normalized || chain.aliases.includes(normalized),
  );
}

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const SENSITIVE_LOG_KEY = /private.?key|api.?key|authorization|cookie|signature|signed.?tx|token|secret|password/i;

function redactForLog(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string") return value.length > 1_000 ? `${value.slice(0, 1_000)}…` : value;
  if (typeof value !== "object") return String(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: (value as Error & { code?: unknown }).code,
    };
  }
  if (seen.has(value)) return "[Circular]";
  if (depth >= 5) return "[Max depth]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactForLog(item, depth + 1, seen));
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    output[key] = SENSITIVE_LOG_KEY.test(key) ? "[REDACTED]" : redactForLog(item, depth + 1, seen);
  }
  return output;
}

function logServerError(scope: string, error: unknown, context?: Record<string, unknown>) {
  const message = errorMessage(error);
  if (!IS_DEVELOPMENT) {
    console.error(`[${scope}] ${message}`);
    return;
  }
  console.error(
    `[dev:error:${scope}]`,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        message,
        error: redactForLog(error),
        context: redactForLog(context),
      },
      null,
      2,
    ),
  );
}

let processLoggingInstalled = false;
function installProcessErrorLogging() {
  if (processLoggingInstalled || process.env.NODE_ENV === "test") return;
  processLoggingInstalled = true;
  process.on("unhandledRejection", (reason) => {
    logServerError("unhandled-rejection", reason);
  });
  process.on("uncaughtExceptionMonitor", (error, origin) => {
    logServerError("uncaught-exception", error, { origin });
  });
  process.on("warning", (warning) => {
    if (IS_DEVELOPMENT) logServerError("process-warning", warning);
  });
}

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<unknown> | unknown) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };

function errorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return String(error || "Unknown error");
  const candidate = error as Record<string, any>;
  return String(
    candidate.reason ||
      candidate.info?.error?.message ||
      candidate.error?.message ||
      candidate.shortMessage ||
      candidate.message ||
      "Unknown error",
  );
}

function errorCode(error: unknown): string | number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, any>;
  return candidate.code ?? candidate.info?.error?.code ?? candidate.error?.code;
}

function errorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, any>;
  return candidate.status ?? candidate.statusCode ?? candidate.info?.responseStatus;
}

function isEvmOutcome(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  if (
    typeof code === "string" &&
    [
      "CALL_EXCEPTION",
      "INSUFFICIENT_FUNDS",
      "NONCE_EXPIRED",
      "REPLACEMENT_UNDERPRICED",
      "UNPREDICTABLE_GAS_LIMIT",
    ].includes(code)
  ) {
    return true;
  }
  return [
    "execution reverted",
    "reverted with",
    "insufficient funds",
    "insufficient balance",
    "intrinsic gas too low",
    "nonce too low",
    "already known",
    "replacement transaction underpriced",
    "max fee per gas less than block base fee",
    "gas required exceeds",
    "mint is not active",
    "stage not active",
    "exceeds max",
    "invalid signature",
  ].some((fragment) => message.includes(fragment));
}

function isRetryableRpcFailure(error: unknown): boolean {
  if (isEvmOutcome(error)) return false;
  const status = errorStatus(error);
  const code = errorCode(error);
  const message = errorMessage(error).toLowerCase();
  if (status === 403 || status === 408 || status === 429 || (status && status >= 500)) return true;
  if (
    typeof code === "string" &&
    ["NETWORK_ERROR", "SERVER_ERROR", "TIMEOUT", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(code)
  ) {
    return true;
  }
  if (code === -32005 || code === -32016) return true;
  return [
    "timeout",
    "timed out",
    "aborted",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "failed to fetch",
    "fetch failed",
    "socket hang up",
    "connection reset",
    "rate limit",
    "too many requests",
    "forbidden",
    "http 403",
    "http 429",
    "http 500",
    "http 502",
    "http 503",
    "http 504",
  ].some((fragment) => message.includes(fragment));
}

interface RpcHealth {
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastLatencyMs?: number;
  lastError?: string;
  coolUntil: number;
}

const rpcHealth = new Map<string, RpcHealth>();
const providerCache = new Map<string, JsonRpcProvider>();

function healthFor(url: string): RpcHealth {
  const health = rpcHealth.get(url) || {
    successes: 0,
    failures: 0,
    consecutiveFailures: 0,
    coolUntil: 0,
  };
  rpcHealth.set(url, health);
  return health;
}

function orderedRpcUrls(urls: string[]): string[] {
  const now = Date.now();
  return [...urls].sort(
    (left, right) =>
      Number(healthFor(left).coolUntil > now) - Number(healthFor(right).coolUntil > now),
  );
}

export async function withRpcFallback<T>(
  endpoints: string[],
  operation: (url: string) => Promise<T>,
): Promise<T> {
  if (endpoints.length === 0) throw new ApiError(400, "No RPC endpoints are configured");
  let lastError: unknown;
  for (const url of orderedRpcUrls(endpoints)) {
    const startedAt = Date.now();
    const health = healthFor(url);
    try {
      const result = await operation(url);
      health.successes += 1;
      health.consecutiveFailures = 0;
      health.coolUntil = 0;
      health.lastLatencyMs = Date.now() - startedAt;
      health.lastError = undefined;
      return result;
    } catch (error) {
      lastError = error;
      health.lastLatencyMs = Date.now() - startedAt;
      if (IS_DEVELOPMENT) {
        logServerError("rpc", error, {
          rpc: maskRpcUrl(url),
          latencyMs: health.lastLatencyMs,
          evmOutcome: isEvmOutcome(error),
          retryable: isRetryableRpcFailure(error),
        });
      }
      if (isEvmOutcome(error)) {
        health.successes += 1;
        health.consecutiveFailures = 0;
        throw error;
      }
      if (!isRetryableRpcFailure(error)) throw error;
      health.failures += 1;
      health.consecutiveFailures += 1;
      health.lastError = errorMessage(error).slice(0, 240);
      if (health.consecutiveFailures >= 2) health.coolUntil = Date.now() + 30_000;
    }
  }
  throw lastError || new Error("All RPC endpoints failed");
}

function parseUrlList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return values
    .map((item) => String(item).trim())
    .filter(Boolean)
    .filter((item) => {
      try {
        const parsed = new URL(item);
        return ["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
      } catch {
        return false;
      }
    });
}

function rpcUrlsFor(chain: ChainConfig, body?: Record<string, any>): string[] {
  const explicit = parseUrlList(body?.rpcUrls || body?.rpcUrl);
  const fromEnvironment = parseUrlList(
    process.env[`RPC_URL_${chain.key.toUpperCase()}`] ||
      process.env[`RPC_URLS_${chain.key.toUpperCase()}`],
  );
  const keyOrUrl = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
  if (/^https?:\/\//i.test(keyOrUrl)) explicit.unshift(...parseUrlList(keyOrUrl));
  else if (keyOrUrl && chain.alchemyHost && /^[A-Za-z0-9_-]{8,}$/.test(keyOrUrl)) {
    explicit.unshift(`https://${chain.alchemyHost}/v2/${keyOrUrl}`);
  }
  return [...new Set([...explicit, ...fromEnvironment, ...chain.rpcUrls])].slice(0, 20);
}

function maskRpcUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "custom-rpc";
  }
}

function providerFor(url: string, chain: ChainConfig): JsonRpcProvider {
  const cacheKey = `${chain.chainId}:${url}`;
  const cached = providerCache.get(cacheKey);
  if (cached) return cached;
  const request = new FetchRequest(url);
  request.timeout = RPC_TIMEOUT_MS;
  request.setHeader("User-Agent", USER_AGENT);
  request.setHeader("Accept", "application/json");
  request.setHeader("Content-Type", "application/json");
  const provider = new JsonRpcProvider(request, chain.chainId, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  providerCache.set(cacheKey, provider);
  return provider;
}

function requireChain(value: unknown): ChainConfig {
  const chain = resolveChain(value);
  if (!chain) {
    throw new ApiError(
      400,
      `Unsupported chain. Choose one of: ${CHAINS.map((item) => item.key).join(", ")}`,
    );
  }
  return chain;
}

function requireAddress(value: unknown, field = "contractAddress"): string {
  if (typeof value !== "string" || !isAddress(value.trim())) {
    throw new ApiError(400, `${field} must be a valid EVM address`);
  }
  return getAddress(value.trim());
}

function requireQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100) {
    throw new ApiError(400, "quantity must be an integer between 1 and 100");
  }
  return quantity;
}

function bigintValue(value: unknown, field: string, maximum?: bigint): bigint {
  try {
    const parsed = BigInt(value as string | number | bigint);
    if (parsed < 0n || (maximum !== undefined && parsed > maximum)) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(400, `${field} must be a valid non-negative integer`);
  }
}

function nativeAmount(value: unknown, field: string): bigint {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  if (!text || !/^\d+(?:\.\d{1,18})?$/.test(text)) {
    throw new ApiError(400, `${field} must be a positive native-token amount with up to 18 decimals`);
  }
  try {
    const amount = parseUnits(text, 18);
    if (amount <= 0n) throw new Error();
    return amount;
  } catch {
    throw new ApiError(400, `${field} must be a positive native-token amount with up to 18 decimals`);
  }
}

function recipientAddresses(value: unknown, sourceAddress: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(400, "At least one recipient address is required");
  }
  if (value.length > MAX_WALLETS) {
    throw new ApiError(400, `A maximum of ${MAX_WALLETS} recipients is allowed`);
  }
  const sourceKey = sourceAddress.toLowerCase();
  const recipients = new Map<string, string>();
  for (const item of value) {
    const address = requireAddress(
      typeof item === "string" ? item : (item as Record<string, unknown>)?.address,
      "recipient",
    );
    if (address.toLowerCase() !== sourceKey) recipients.set(address.toLowerCase(), address);
  }
  if (!recipients.size) throw new ApiError(400, "Recipients cannot contain only the source wallet");
  return [...recipients.values()];
}

function modeFrom(body: Record<string, any>): "public" | "allowlist" {
  const mode = String(body.mode || body.dropMode || (body.isAllowlist ? "allowlist" : "public"))
    .trim()
    .toLowerCase();
  if (["allowlist", "presale", "signed"].includes(mode)) return "allowlist";
  if (mode === "public") return "public";
  throw new ApiError(400, "mode must be either public or allowlist");
}

const SEADROP_ABI = [
  "function mintPublic(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity) payable",
  "function mintSigned(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity,(uint256 mintPrice,uint256 maxTotalMintableByWallet,uint256 startTime,uint256 endTime,uint256 dropStageIndex,uint256 maxTokenSupplyForStage,uint256 feeBps,bool restrictFeeRecipients) mintParams,uint256 salt,bytes signature) payable",
  "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
  "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
  "function getFeeRecipient(address nftContract) view returns (address)",
  "error InvalidSignature(address signer)",
  "error SignatureAlreadyUsed()",
  "error InvalidProof()",
  "error NotActive(uint256 currentTimestamp,uint256 startTime,uint256 endTime)",
  "error PublicDropNotActive(uint256 currentTimestamp,uint256 startTime,uint256 endTime)",
  "error MintQuantityExceedsMaxMintedPerWallet(uint256 total,uint256 allowed)",
  "error MintQuantityExceedsMaxSupply(uint256 total,uint256 maxSupply)",
  "error MintQuantityExceedsMaxTokenSupplyForStage(uint256 total,uint256 maxSupplyForStage)",
  "error MintQuantityCannotBeZero()",
  "error InsufficientEtherSupplied()",
  "error PayerNotAllowed()",
  "error FeeRecipientCannotBeZeroAddress()",
  "error FeeRecipientNotAllowed()",
  "error SignedMintsMustRestrictFeeRecipients()",
  "error InvalidSignedMintPrice(uint256 signedMintPrice,uint256 minimumMintPrice)",
  "error InvalidSignedMaxTotalMintableByWallet(uint256 signedMaxTotalMintableByWallet,uint256 maximumMaxTotalMintableByWallet)",
  "error InvalidSignedStartTime(uint256 signedStartTime,uint256 minimumStartTime)",
  "error InvalidSignedEndTime(uint256 signedEndTime,uint256 maximumEndTime)",
  "error InvalidSignedMaxTokenSupplyForStage(uint256 signedMaxTokenSupplyForStage,uint256 maximumMaxTokenSupplyForStage)",
  "error InvalidSignedFeeBps(uint256 signedFeeBps,uint256 requiredFeeBps)",
];
const NFT_FEE_ABI = ["function getFeeRecipient() view returns (address)"];
const NFT_MINT_STATS_ABI = [
  "function getMintStats(address minter) view returns (uint256 minterNumMinted,uint256 currentTotalSupply,uint256 maxSupply)",
];
const seadropInterface = new Interface(SEADROP_ABI);
const nftFeeInterface = new Interface(NFT_FEE_ABI);
const nftMintStatsInterface = new Interface(NFT_MINT_STATS_ABI);

interface MintParams {
  mintPrice: bigint;
  startTime: number;
  endTime: number;
  maxTotalMintableByWallet: number;
  feeBps: number;
  restrictFeeRecipients: boolean;
  dropStageIndex?: bigint;
  maxTokenSupplyForStage?: bigint;
}

interface MintPlan {
  to: string;
  data: string;
  value: bigint;
  contractAddress: string;
  feeRecipient: string;
  feeRecipientSource: string;
  mode: "public" | "allowlist";
  drop: MintParams;
}

function parseMintParams(value: unknown): MintParams {
  if (!value || typeof value !== "object") {
    throw new ApiError(400, "allowlist mode requires voucher.mintParams");
  }
  const input = value as Record<string, unknown>;
  const maximumSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
  const startTime = Number(bigintValue(input.startTime, "mintParams.startTime", maximumSafeInteger));
  const endTime = Number(bigintValue(input.endTime, "mintParams.endTime", maximumSafeInteger));
  if (endTime !== 0 && endTime <= startTime) {
    throw new ApiError(400, "mintParams.endTime must be greater than startTime");
  }
  return {
    mintPrice: bigintValue(input.mintPrice, "mintParams.mintPrice"),
    startTime,
    endTime,
    maxTotalMintableByWallet: Number(
      bigintValue(input.maxTotalMintableByWallet, "mintParams.maxTotalMintableByWallet", maximumSafeInteger),
    ),
    feeBps: Number(bigintValue(input.feeBps, "mintParams.feeBps", 10_000n)),
    restrictFeeRecipients: Boolean(input.restrictFeeRecipients),
    dropStageIndex: bigintValue(input.dropStageIndex ?? 0, "mintParams.dropStageIndex"),
    maxTokenSupplyForStage: bigintValue(
      input.maxTokenSupplyForStage ?? (1n << 256n) - 1n,
      "mintParams.maxTokenSupplyForStage",
    ),
  };
}

async function readPublicDrop(
  chain: ChainConfig,
  endpoints: string[],
  contractAddress: string,
): Promise<MintParams | null> {
  return withRpcFallback(endpoints, async (url) => {
    const provider = providerFor(url, chain);
    const data = seadropInterface.encodeFunctionData("getPublicDrop", [contractAddress]);
    const raw = await provider.call({ to: SEADROP_ADDRESS, data });
    const decoded = seadropInterface.decodeFunctionResult("getPublicDrop", raw)[0];
    const drop: MintParams = {
      mintPrice: BigInt(decoded.mintPrice),
      startTime: Number(decoded.startTime),
      endTime: Number(decoded.endTime),
      maxTotalMintableByWallet: Number(decoded.maxTotalMintableByWallet),
      feeBps: Number(decoded.feeBps),
      restrictFeeRecipients: Boolean(decoded.restrictFeeRecipients),
    };
    if (drop.startTime === 0 && drop.endTime === 0 && drop.maxTotalMintableByWallet === 0) return null;
    return drop;
  });
}

async function readMintStats(
  chain: ChainConfig,
  endpoints: string[],
  contractAddress: string,
  minter: string,
): Promise<{ minterNumMinted: bigint; currentTotalSupply: bigint; maxSupply: bigint }> {
  return withRpcFallback(endpoints, async (url) => {
    const provider = providerFor(url, chain);
    const data = nftMintStatsInterface.encodeFunctionData("getMintStats", [minter]);
    const raw = await provider.call({ to: contractAddress, data });
    const decoded = nftMintStatsInterface.decodeFunctionResult("getMintStats", raw);
    return {
      minterNumMinted: BigInt(decoded[0]),
      currentTotalSupply: BigInt(decoded[1]),
      maxSupply: BigInt(decoded[2]),
    };
  });
}

async function discoverFeeRecipient(
  chain: ChainConfig,
  endpoints: string[],
  contractAddress: string,
  restricted: boolean,
  requested?: unknown,
): Promise<{ address: string; source: string }> {
  if (requested) return { address: requireAddress(requested, "feeRecipient"), source: "request" };
  const discovered = await withRpcFallback(endpoints, async (url) => {
    const provider = providerFor(url, chain);
    try {
      const data = seadropInterface.encodeFunctionData("getAllowedFeeRecipients", [contractAddress]);
      const raw = await provider.call({ to: SEADROP_ADDRESS, data });
      const allowed = seadropInterface.decodeFunctionResult("getAllowedFeeRecipients", raw)[0] as string[];
      if (allowed.length) return { address: getAddress(allowed[0]), source: "SeaDrop allowed recipient" };
    } catch {
      // Continue with compatible fee-recipient getters.
    }
    try {
      const data = nftFeeInterface.encodeFunctionData("getFeeRecipient");
      const raw = await provider.call({ to: contractAddress, data });
      const address = nftFeeInterface.decodeFunctionResult("getFeeRecipient", raw)[0] as string;
      if (address !== ZeroAddress) return { address: getAddress(address), source: "NFT getFeeRecipient" };
    } catch {
      // Continue with the legacy SeaDrop getter.
    }
    try {
      const data = seadropInterface.encodeFunctionData("getFeeRecipient", [contractAddress]);
      const raw = await provider.call({ to: SEADROP_ADDRESS, data });
      const address = seadropInterface.decodeFunctionResult("getFeeRecipient", raw)[0] as string;
      if (address !== ZeroAddress) return { address: getAddress(address), source: "SeaDrop getFeeRecipient" };
    } catch {
      // Canonical SeaDrop versions need not expose this legacy getter.
    }
    return null;
  });
  if (discovered) return discovered;
  if (restricted) {
    throw new ApiError(400, "Drop restricts fee recipients, but no allowed recipient was found");
  }
  const defaults = String(process.env.SEADROP_FEE_RECIPIENTS || OPENSEA_FEE_RECIPIENT)
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isAddress(value));
  return {
    address: getAddress(defaults[0] || OPENSEA_FEE_RECIPIENT),
    source: "configured SeaDrop default",
  };
}

async function buildMintPlan(body: Record<string, any>): Promise<{
  chain: ChainConfig;
  endpoints: string[];
  plan: MintPlan;
}> {
  const chain = requireChain(body.chain);
  const endpoints = rpcUrlsFor(chain, body);
  const contractAddress = requireAddress(body.contractAddress || body.nftContract);
  const quantity = requireQuantity(body.quantity);
  const mode = modeFrom(body);
  const minter = body.minterIfNotPayer
    ? requireAddress(body.minterIfNotPayer, "minterIfNotPayer")
    : ZeroAddress;

  if (mode === "public") {
    const drop = await readPublicDrop(chain, endpoints, contractAddress);
    if (!drop) throw new ApiError(400, "No SeaDrop public stage is configured for this contract");
    const fee = await discoverFeeRecipient(
      chain,
      endpoints,
      contractAddress,
      drop.restrictFeeRecipients,
      body.feeRecipient,
    );
    return {
      chain,
      endpoints,
      plan: {
        to: SEADROP_ADDRESS,
        data: seadropInterface.encodeFunctionData("mintPublic", [
          contractAddress,
          fee.address,
          minter,
          quantity,
        ]),
        value: drop.mintPrice * BigInt(quantity),
        contractAddress,
        feeRecipient: fee.address,
        feeRecipientSource: fee.source,
        mode,
        drop,
      },
    };
  }

  const voucher = body.voucher && typeof body.voucher === "object" ? body.voucher : body;
  const drop = parseMintParams(voucher.mintParams);
  const salt = bigintValue(voucher.salt, "voucher.salt");
  const signature = String(voucher.signature || "");
  if (!/^0x[0-9a-fA-F]+$/.test(signature) || signature.length < 132 || signature.length % 2 !== 0) {
    throw new ApiError(400, "voucher.signature must be a valid hex signature");
  }
  const fee = await discoverFeeRecipient(
    chain,
    endpoints,
    contractAddress,
    drop.restrictFeeRecipients,
    body.feeRecipient || voucher.feeRecipient,
  );
  return {
    chain,
    endpoints,
    plan: {
      to: SEADROP_ADDRESS,
      data: seadropInterface.encodeFunctionData("mintSigned", [
        contractAddress,
        fee.address,
        minter,
        quantity,
        [
          drop.mintPrice,
          drop.maxTotalMintableByWallet,
          drop.startTime,
          drop.endTime,
          drop.dropStageIndex,
          drop.maxTokenSupplyForStage,
          drop.feeBps,
          drop.restrictFeeRecipients,
        ],
        salt,
        signature,
      ]),
      value: drop.mintPrice * BigInt(quantity),
      contractAddress,
      feeRecipient: fee.address,
      feeRecipientSource: fee.source,
      mode,
      drop,
    },
  };
}

function publicPlan(plan: MintPlan) {
  return {
    to: plan.to,
    data: plan.data,
    value: plan.value.toString(),
    contractAddress: plan.contractAddress,
    mode: plan.mode,
    feeRecipient: plan.feeRecipient,
    feeRecipientSource: plan.feeRecipientSource,
    drop: {
      mintPrice: plan.drop.mintPrice.toString(),
      startTime: plan.drop.startTime,
      endTime: plan.drop.endTime,
      maxTotalMintableByWallet: plan.drop.maxTotalMintableByWallet,
      dropStageIndex: plan.drop.dropStageIndex?.toString(),
      maxTokenSupplyForStage: plan.drop.maxTokenSupplyForStage?.toString(),
      feeBps: plan.drop.feeBps,
      restrictFeeRecipients: plan.drop.restrictFeeRecipients,
    },
  };
}

interface FeeSnapshot {
  baseFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
}

async function getFeeSnapshot(provider: JsonRpcProvider): Promise<FeeSnapshot> {
  const [block, feeData] = await Promise.all([provider.getBlock("latest"), provider.getFeeData()]);
  const baseFeePerGas = block?.baseFeePerGas || feeData.gasPrice || 0n;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || 1_000_000_000n;
  const calculatedMax = baseFeePerGas * 2n + maxPriorityFeePerGas;
  const maxFeePerGas =
    feeData.maxFeePerGas && feeData.maxFeePerGas > calculatedMax
      ? feeData.maxFeePerGas
      : calculatedMax;
  return { baseFeePerGas, maxPriorityFeePerGas, maxFeePerGas };
}

function applyFeeTier(fees: FeeSnapshot, tier: unknown): FeeSnapshot {
  const normalized = String(tier || "standard").toLowerCase();
  if (normalized === "slow") {
    const priority = (fees.maxPriorityFeePerGas * 75n) / 100n;
    return {
      ...fees,
      maxPriorityFeePerGas: priority,
      maxFeePerGas: fees.baseFeePerGas + fees.baseFeePerGas / 2n + priority,
    };
  }
  if (normalized === "fast") {
    const priority = fees.maxPriorityFeePerGas * 2n;
    return {
      ...fees,
      maxPriorityFeePerGas: priority,
      maxFeePerGas: fees.baseFeePerGas * 3n + priority,
    };
  }
  return fees;
}

function revertData(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as Record<string, any>;
  return [
    candidate.data,
    candidate.info?.error?.data,
    candidate.info?.error?.data?.data,
    candidate.error?.data,
    candidate.error?.data?.data,
    candidate.revert?.data,
  ].find((value) => typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value));
}

function simulationReason(error: unknown): string {
  let message = errorMessage(error);
  const data = revertData(error);
  if (data) {
    try {
      const parsed = seadropInterface.parseError(data);
      if (parsed) {
        message = parsed.name;
        if (["NotActive", "PublicDropNotActive"].includes(parsed.name)) {
          const currentTime = Number(parsed.args[0]);
          const startTime = Number(parsed.args[1]);
          const endTime = Number(parsed.args[2]);
          if (Number.isFinite(currentTime) && Number.isFinite(startTime) && currentTime < startTime) {
            return `Stage is not active yet; the on-chain window starts at ${new Date(startTime * 1_000).toISOString()}`;
          }
          if (Number.isFinite(currentTime) && Number.isFinite(endTime) && currentTime > endTime) {
            return `Stage ended at ${new Date(endTime * 1_000).toISOString()}`;
          }
        }
      }
    } catch {
      // Fall back to the JSON-RPC reason.
    }
  }
  const lower = message.toLowerCase();
  if (/notactive|not active|starttime|start time|has not started|ended/.test(lower)) {
    return "Stage not yet active or has ended";
  }
  if (/insufficient funds|insufficient balance|funds for gas/.test(lower)) {
    return "Insufficient balance for mint value and gas";
  }
  if (/signature|allowlist|proof/.test(lower)) {
    return "Allowlist signature required or invalid for this wallet";
  }
  if (/maxsupply|max supply|max token supply|sold out|supply/.test(lower)) {
    return "Drop supply is exhausted";
  }
  if (/maxmint|max minted|wallet limit|max total mintable/.test(lower)) {
    return "Exceeds wallet mint limit";
  }
  if (/feerecipient|fee recipient/.test(lower)) return "Fee recipient is not allowed";
  if (/payernotallowed|payer not allowed/.test(lower)) return "Transaction payer is not allowed";
  if (/insufficientethersupplied|incorrect payment|incorrect value/.test(lower)) {
    return "Transaction value does not match the mint price";
  }
  if (lower.includes("revert") || lower.includes("require(false)")) {
    return data && data !== "0x"
      ? "Execution reverted by SeaDrop"
      : "RPC returned an execution revert without error data";
  }
  return message.slice(0, 240);
}

function isInsufficientBalanceReason(value: unknown): boolean {
  const message = typeof value === "string" ? value : errorMessage(value);
  return /insufficient funds|insufficient balance|funds for gas/i.test(message);
}

function isDefinitiveEligibilityReason(reason: string): boolean {
  return [
    "Allowlist signature required or invalid for this wallet",
    "Exceeds wallet mint limit",
    "Drop supply is exhausted",
  ].includes(reason);
}

type SimulationResult = {
  ok: boolean;
  eligibilityVerified?: boolean;
  inconclusive?: boolean;
  reason?: string;
  warning?: string;
};

async function simulateWithBalanceOverride(
  chain: ChainConfig,
  endpoints: string[],
  transaction: { to: string; data: string; value: bigint },
  from: string,
): Promise<SimulationResult> {
  const fundedBalance = transaction.value + 100n * 10n ** 18n;
  const rpcTransaction = {
    to: transaction.to,
    data: transaction.data,
    value: toQuantity(transaction.value),
    from,
  };
  let lastError: unknown;

  for (const url of orderedRpcUrls(endpoints)) {
    try {
      await providerFor(url, chain).send("eth_call", [
        rpcTransaction,
        "latest",
        { [from]: { balance: toQuantity(fundedBalance) } },
      ]);
      return {
        ok: true,
        warning: "Contract eligibility passed, but this wallet needs more native balance for the mint value and gas",
      };
    } catch (error) {
      lastError = error;
      if (isEvmOutcome(error)) {
        const reason = simulationReason(error);
        if (isDefinitiveEligibilityReason(reason)) return { ok: false, reason };
      }
      // Nodes often omit custom-error data or reject state overrides. Only a
      // definitive eligibility result should stop this cross-RPC verification.
    }
  }

  return {
    ok: false,
    inconclusive: true,
    reason: `Wallet balance is below the transaction value, and no RPC could run a funded eligibility simulation${
      lastError ? `: ${errorMessage(lastError).slice(0, 120)}` : ""
    }`,
  };
}

async function simulateTransaction(
  chain: ChainConfig,
  endpoints: string[],
  transaction: { to: string; data: string; value: bigint },
  from: string,
  mode?: "public" | "allowlist",
): Promise<SimulationResult> {
  let lastError: unknown;
  let lastEvmReason: string | undefined;

  for (const url of orderedRpcUrls(endpoints)) {
    const startedAt = Date.now();
    const health = healthFor(url);
    try {
      await providerFor(url, chain).call({ ...transaction, from });
      health.successes += 1;
      health.consecutiveFailures = 0;
      health.coolUntil = 0;
      health.lastLatencyMs = Date.now() - startedAt;
      health.lastError = undefined;
      return { ok: true };
    } catch (error) {
      lastError = error;
      health.lastLatencyMs = Date.now() - startedAt;
      if (IS_DEVELOPMENT) {
        logServerError("rpc-simulation", error, {
          rpc: maskRpcUrl(url),
          latencyMs: health.lastLatencyMs,
          evmOutcome: isEvmOutcome(error),
          retryable: isRetryableRpcFailure(error),
        });
      }
      if (isEvmOutcome(error)) {
        health.successes += 1;
        health.consecutiveFailures = 0;
        const reason = simulationReason(error);
        lastEvmReason = reason;
        if (
          isInsufficientBalanceReason(error) ||
          reason === "Insufficient balance for mint value and gas"
        ) {
          return simulateWithBalanceOverride(chain, endpoints, transaction, from);
        }
        if (isDefinitiveEligibilityReason(reason)) return { ok: false, reason };
        // A generic or data-less revert is not reliable enough to decide wallet
        // eligibility. Ask the remaining RPCs for either success or a decoded error.
        continue;
      }
      health.failures += 1;
      health.consecutiveFailures += 1;
      health.lastError = errorMessage(error).slice(0, 240);
      if (health.consecutiveFailures >= 2) health.coolUntil = Date.now() + 30_000;
    }
  }

  if (lastEvmReason) {
    return {
      ok: false,
      inconclusive: true,
      reason: `Simulation reverted across the available RPCs, but did not prove ${mode || "mint"} eligibility: ${lastEvmReason}`,
    };
  }
  return {
    ok: false,
    inconclusive: true,
    reason: `RPC simulation unavailable: ${errorMessage(lastError).slice(0, 180)}`,
  };
}

async function prepareForWallet(
  chain: ChainConfig,
  endpoints: string[],
  base: { to: string; data: string; value: bigint },
  wallet: Wallet,
  feeTier?: unknown,
) {
  const setup = await withRpcFallback(endpoints, async (url) => {
    const provider = providerFor(url, chain);
    const [nonce, fees] = await Promise.all([
      provider.getTransactionCount(wallet.address, "pending"),
      getFeeSnapshot(provider),
    ]);
    return { nonce, fees: applyFeeTier(fees, feeTier) };
  });
  const simulation = await simulateTransaction(chain, endpoints, base, wallet.address);
  let gasLimit = 350_000n;
  if (simulation.ok) {
    try {
      const estimate = await withRpcFallback(endpoints, (url) =>
        providerFor(url, chain).estimateGas({ ...base, from: wallet.address }),
      );
      gasLimit = (estimate * 120n) / 100n;
    } catch {
      // Retain the conservative fallback if a node cannot estimate.
    }
  }
  return {
    from: wallet.address,
    to: base.to,
    data: base.data,
    value: base.value.toString(),
    chainId: chain.chainId,
    type: 2,
    nonce: setup.nonce,
    gasLimit: gasLimit.toString(),
    maxFeePerGas: setup.fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: setup.fees.maxPriorityFeePerGas.toString(),
    simulation,
  };
}

function walletFromPrivateKey(value: unknown): Wallet {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "privateKey is required");
  try {
    return new Wallet(value.trim());
  } catch {
    throw new ApiError(400, "privateKey is invalid");
  }
}

function transactionInput(value: unknown, chain: ChainConfig): Record<string, any> {
  if (!value || typeof value !== "object") throw new ApiError(400, "transaction payload is required");
  const input = value as Record<string, any>;
  if (input.chainId !== undefined && Number(input.chainId) !== chain.chainId) {
    throw new ApiError(400, "transaction.chainId does not match chain");
  }
  const data = String(input.data || "0x");
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) throw new ApiError(400, "transaction.data is invalid");
  if (input.nonce !== undefined && (!Number.isSafeInteger(Number(input.nonce)) || Number(input.nonce) < 0)) {
    throw new ApiError(400, "transaction.nonce is invalid");
  }
  return {
    to: requireAddress(input.to, "transaction.to"),
    data,
    value: bigintValue(input.value || 0, "transaction.value"),
    chainId: chain.chainId,
    nonce: input.nonce === undefined ? undefined : Number(input.nonce),
    gasLimit: input.gasLimit === undefined ? undefined : bigintValue(input.gasLimit, "transaction.gasLimit"),
    maxFeePerGas:
      input.maxFeePerGas === undefined
        ? undefined
        : bigintValue(input.maxFeePerGas, "transaction.maxFeePerGas"),
    maxPriorityFeePerGas:
      input.maxPriorityFeePerGas === undefined
        ? undefined
        : bigintValue(input.maxPriorityFeePerGas, "transaction.maxPriorityFeePerGas"),
  };
}

async function signTransactionPayload(
  inputValue: unknown,
  privateKey: unknown,
  chain: ChainConfig,
  endpoints: string[],
): Promise<string> {
  const wallet = walletFromPrivateKey(privateKey);
  const input = transactionInput(inputValue, chain);
  const incomplete =
    input.nonce === undefined ||
    input.gasLimit === undefined ||
    input.maxFeePerGas === undefined ||
    input.maxPriorityFeePerGas === undefined;
  if (incomplete) {
    const hydrated = await prepareForWallet(
      chain,
      endpoints,
      { to: input.to, data: input.data, value: input.value },
      wallet,
      "fast",
    );
    input.nonce ??= hydrated.nonce;
    input.gasLimit ??= BigInt(hydrated.gasLimit);
    input.maxFeePerGas ??= BigInt(hydrated.maxFeePerGas);
    input.maxPriorityFeePerGas ??= BigInt(hydrated.maxPriorityFeePerGas);
  }
  return wallet.signTransaction({
    to: input.to,
    data: input.data,
    value: input.value,
    chainId: chain.chainId,
    type: 2,
    nonce: input.nonce,
    gasLimit: input.gasLimit,
    maxFeePerGas: input.maxFeePerGas,
    maxPriorityFeePerGas: input.maxPriorityFeePerGas,
  });
}

interface BroadcastRecord {
  txHash: string;
  chain: ChainConfig;
  endpoints: string[];
  submittedAt: string;
  state: "submitted" | "confirmed" | "reverted";
  blockNumber?: number;
  attempts?: Array<{ rpc: string; accepted: boolean; error?: string }>;
}

const broadcasts = new Map<string, BroadcastRecord>();

async function sendRawTransaction(url: string, signedTx: string, expectedHash: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": USER_AGENT,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendRawTransaction",
        params: [signedTx],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const error = new Error(`RPC HTTP ${response.status}`) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    const result = (await response.json()) as {
      result?: string;
      error?: { code?: number; message?: string };
    };
    if (result.result) return { txHash: result.result, rpc: maskRpcUrl(url) };
    const rpcMessage = result.error?.message || "RPC rejected transaction";
    if (/already known|known transaction|already imported/i.test(rpcMessage)) {
      return { txHash: expectedHash, rpc: maskRpcUrl(url) };
    }
    const error = new Error(rpcMessage) as Error & { code?: number };
    error.code = result.error?.code;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function broadcastSignedTransaction(
  signedTx: string,
  chain: ChainConfig,
  endpoints: string[],
) {
  let parsed: Transaction;
  try {
    parsed = Transaction.from(signedTx);
  } catch {
    throw new ApiError(400, "signedTx is not a valid serialized Ethereum transaction");
  }
  if (!parsed.signature) throw new ApiError(400, "signedTx must include a signature");
  if (parsed.chainId !== 0n && Number(parsed.chainId) !== chain.chainId) {
    throw new ApiError(400, "signedTx chainId does not match the requested chain");
  }
  const txHash = parsed.hash || keccak256(signedTx);
  const submissionEndpoints = [...new Set([...endpoints, ...(chain.broadcastUrls || [])])];
  const attempts = submissionEndpoints.map((url) =>
    sendRawTransaction(url, signedTx, txHash).then(
      (result) => ({ ...result, accepted: true, url }),
      (error) => Promise.reject({ error, url }),
    ),
  );
  let first: { txHash: string; rpc: string; accepted: boolean; url: string };
  try {
    first = await Promise.any(attempts);
  } catch (aggregate) {
    const errors =
      aggregate instanceof AggregateError
        ? aggregate.errors.map((item: any) => ({
            rpc: maskRpcUrl(item.url || ""),
            error: errorMessage(item.error || item).slice(0, 180),
          }))
        : [];
    throw new ApiError(502, "Every RPC endpoint rejected the transaction", errors);
  }
  const record: BroadcastRecord = {
    txHash,
    chain,
    endpoints,
    submittedAt: new Date().toISOString(),
    state: "submitted",
  };
  broadcasts.set(txHash.toLowerCase(), record);
  void Promise.allSettled(attempts).then((settled) => {
    if (IS_DEVELOPMENT) {
      settled.forEach((item, index) => {
        if (item.status === "rejected") {
          logServerError("rpc-broadcast", (item.reason as any)?.error || item.reason, {
            rpc: maskRpcUrl(submissionEndpoints[index]),
            txHash,
          });
        }
      });
    }
    record.attempts = settled.map((item, index) =>
      item.status === "fulfilled"
        ? { rpc: maskRpcUrl(submissionEndpoints[index]), accepted: true }
        : {
            rpc: maskRpcUrl(submissionEndpoints[index]),
            accepted: false,
            error: errorMessage((item.reason as any)?.error || item.reason).slice(0, 180),
          },
    );
  });
  return {
    txHash,
    acceptedBy: first.rpc,
    statusUrl: `/api/blast-mint/status/${txHash}`,
  };
}

function gwei(value: bigint): number {
  return Number(formatUnits(value, "gwei"));
}

function unixSeconds(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? Math.floor(numeric / 1000) : Math.floor(numeric);
  const timestamp = Date.parse(String(value));
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}

async function openSeaRequest(
  pathname: string,
  apiKey?: string,
  options: { method?: "GET" | "POST"; body?: unknown } = {},
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const headers: Record<string, string> = { accept: "application/json", "user-agent": USER_AGENT };
    if (apiKey) headers["x-api-key"] = apiKey;
    if (options.body !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`https://api.opensea.io/api/v2${pathname}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { detail: text.slice(0, 300) };
    }
    if (!response.ok) {
      const rawMessage =
        data.detail || data.error || data.errors?.[0] || `OpenSea returned HTTP ${response.status}`;
      const message = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage);
      throw new ApiError(response.status, message, data);
    }
    return data;
  } catch (error) {
    if (IS_DEVELOPMENT) {
      logServerError("opensea", error, {
        method: options.method || "GET",
        pathname,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

interface OpenSeaKeyRecord {
  key: string;
  source: "request" | "environment" | "instant";
  expiresAt?: number;
}

let cachedOpenSeaKey: OpenSeaKeyRecord | undefined;
let pendingOpenSeaKey: Promise<OpenSeaKeyRecord> | undefined;
let openSeaKeyCacheLoaded = false;
let instantKeyBlockedUntil = 0;
let instantKeyBlockedReason = "";
const openSeaSlugCache = new Map<string, { slug: string; expiresAt: number }>();

async function loadPersistedOpenSeaKey() {
  if (openSeaKeyCacheLoaded) return;
  openSeaKeyCacheLoaded = true;
  try {
    const parsed = JSON.parse(await readFile(OPENSEA_KEY_CACHE_PATH, "utf8")) as {
      key?: unknown;
      expiresAt?: unknown;
    };
    const key = typeof parsed.key === "string" ? parsed.key.trim() : "";
    const expiresAt = Number(parsed.expiresAt);
    if (key && Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000) {
      cachedOpenSeaKey = { key, source: "instant", expiresAt };
    }
  } catch (error: any) {
    if (error?.code !== "ENOENT" && IS_DEVELOPMENT) {
      logServerError("opensea-key-cache-read", error);
    }
  }
}

async function persistOpenSeaKey(record: OpenSeaKeyRecord) {
  if (!record.expiresAt || record.source !== "instant") return;
  const temporaryPath = `${OPENSEA_KEY_CACHE_PATH}.${process.pid}.tmp`;
  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify({ key: record.key, expiresAt: record.expiresAt })}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    await rename(temporaryPath, OPENSEA_KEY_CACHE_PATH);
    await chmod(OPENSEA_KEY_CACHE_PATH, 0o600);
  } catch (error) {
    if (IS_DEVELOPMENT) logServerError("opensea-key-cache-write", error);
  }
}

function openSeaContractCacheKey(chain: ChainConfig, contractAddress: string) {
  return `${chain.chainId}:${contractAddress.toLowerCase()}`;
}

function rememberOpenSeaSlug(chain: ChainConfig, contractAddress: string, slug: string) {
  const normalized = slug.trim();
  if (!normalized) return;
  openSeaSlugCache.set(openSeaContractCacheKey(chain, contractAddress), {
    slug: normalized,
    expiresAt: Date.now() + 60 * 60_000,
  });
}

function collectionSlugFromOpenSea(data: any): string | undefined {
  const candidate = deepValue(data, ["collection_slug", "slug", "collection"]);
  if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  if (candidate && typeof candidate === "object") {
    const nested = candidate.slug ?? candidate.collection_slug;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return undefined;
}

async function resolveOpenSeaSlugForContract(
  chain: ChainConfig,
  contractAddress: string,
  apiKey: string,
): Promise<string | undefined> {
  const cacheKey = openSeaContractCacheKey(chain, contractAddress);
  const cached = openSeaSlugCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.slug;
  if (cached) openSeaSlugCache.delete(cacheKey);

  const contractData = await openSeaRequest(
    `/chain/${encodeURIComponent(chain.key)}/contract/${contractAddress}`,
    apiKey,
  );
  const slug = collectionSlugFromOpenSea(contractData);
  if (slug) rememberOpenSeaSlug(chain, contractAddress, slug);
  return slug;
}

async function resolveOpenSeaApiKey(requested?: unknown): Promise<OpenSeaKeyRecord> {
  const supplied = typeof requested === "string" ? requested.trim() : "";
  if (supplied) return { key: supplied, source: "request" };
  const configured = String(process.env.OPENSEA_API_KEY || "").trim();
  if (configured) return { key: configured, source: "environment" };
  await loadPersistedOpenSeaKey();
  if (cachedOpenSeaKey && (!cachedOpenSeaKey.expiresAt || cachedOpenSeaKey.expiresAt > Date.now() + 60_000)) {
    return cachedOpenSeaKey;
  }
  if (instantKeyBlockedUntil > Date.now()) {
    throw new ApiError(
      429,
      `OpenSea instant-key creation is temporarily unavailable: ${instantKeyBlockedReason}. Enter an existing OpenSea API key instead`,
    );
  }
  if (!pendingOpenSeaKey) {
    pendingOpenSeaKey = (async () => {
      try {
        const response = await openSeaRequest("/auth/keys", undefined, { method: "POST" });
        const key = String(response.api_key || response.apiKey || "").trim();
        if (!key) throw new ApiError(502, "OpenSea did not return a temporary API key");
        const parsedExpiry = Date.parse(String(response.expires_at || response.expiresAt || ""));
        cachedOpenSeaKey = {
          key,
          source: "instant",
          expiresAt: Number.isNaN(parsedExpiry) ? Date.now() + 6 * 24 * 60 * 60_000 : parsedExpiry,
        };
        await persistOpenSeaKey(cachedOpenSeaKey);
        return cachedOpenSeaKey;
      } catch (error) {
        const message = errorMessage(error);
        if (error instanceof ApiError && error.status === 429) {
          instantKeyBlockedUntil = Date.now() + 6 * 60 * 60_000;
          instantKeyBlockedReason = message;
          throw new ApiError(
            429,
            `OpenSea instant-key creation is rate-limited: ${message}. Enter an existing OpenSea API key instead`,
          );
        }
        throw error;
      }
    })().finally(() => {
      pendingOpenSeaKey = undefined;
    });
  }
  return pendingOpenSeaKey;
}

interface MintTransactionPreview {
  to: string;
  data: string;
  value: string;
  chain: string;
  chainId: number;
  source: "opensea-mint-action" | "local-seadrop-plan";
  decoded: {
    method: string;
    nftContract?: string;
    feeRecipient?: string;
    minter?: string;
    quantity?: string;
    recipientMatches?: boolean;
    expectedValue?: string;
    valueMatches?: boolean;
  };
  verification: SimulationResult;
}

function normalizeOpenSeaMintTransaction(response: any): { to: string; data: string; value: bigint } {
  const candidate = response?.transaction || response?.transactions?.[0] || response;
  const to = candidate?.target || candidate?.to;
  const data = candidate?.calldata || candidate?.data;
  const rawValue = candidate?.value_hex ?? candidate?.value ?? 0;
  if (typeof to !== "string" || !isAddress(to)) {
    throw new ApiError(502, "OpenSea mint action did not contain a valid target address");
  }
  if (typeof data !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(data)) {
    throw new ApiError(502, "OpenSea mint action did not contain valid calldata");
  }
  let value: bigint;
  try {
    value = BigInt(rawValue);
    if (value < 0n) throw new Error();
  } catch {
    throw new ApiError(502, "OpenSea mint action did not contain a valid transaction value");
  }
  return { to: getAddress(to), data, value };
}

export function decodeMintTransaction(
  transaction: { to: string; data: string; value: bigint },
  executionAddress: string,
): MintTransactionPreview["decoded"] {
  let parsed;
  try {
    parsed = seadropInterface.parseTransaction({ data: transaction.data, value: transaction.value });
  } catch {
    return { method: "Unknown contract call" };
  }
  if (!parsed) return { method: "Unknown contract call" };
  if (!["mintPublic", "mintSigned"].includes(parsed.name)) return { method: parsed.name };
  const nftContract = getAddress(String(parsed.args[0]));
  const feeRecipient = getAddress(String(parsed.args[1]));
  const specifiedMinter = getAddress(String(parsed.args[2]));
  const minter = specifiedMinter === ZeroAddress ? executionAddress : specifiedMinter;
  const quantity = BigInt(parsed.args[3]);
  const decoded: MintTransactionPreview["decoded"] = {
    method: parsed.name,
    nftContract,
    feeRecipient,
    minter: getAddress(minter),
    quantity: quantity.toString(),
    recipientMatches: minter.toLowerCase() === executionAddress.toLowerCase(),
  };
  if (parsed.name === "mintSigned") {
    const mintPrice = BigInt(parsed.args[4].mintPrice ?? parsed.args[4][0]);
    const expectedValue = mintPrice * quantity;
    decoded.expectedValue = expectedValue.toString();
    decoded.valueMatches = expectedValue === transaction.value;
  }
  return decoded;
}

async function mintContractDeploymentWarning(
  chain: ChainConfig,
  endpoints: string[],
  nftContract?: string,
): Promise<string | undefined> {
  if (!nftContract) return undefined;
  try {
    const code = await withRpcFallback(endpoints, (url) =>
      providerFor(url, chain).getCode(nftContract),
    );
    if (code === "0x") {
      return `NFT contract ${nftContract} is not deployed on ${chain.name}. The OpenSea action proves stage access, but it cannot execute on this network until the collection contract is deployed`;
    }
  } catch {
    // The transaction simulation below will surface RPC availability problems.
  }
  return undefined;
}

function openSeaQuoteMinter(): string {
  const configured = String(process.env.OPENSEA_QUOTE_MINTER || "").trim();
  return getAddress(isAddress(configured) ? configured : DEFAULT_OPENSEA_QUOTE_MINTER);
}

async function buildFundedPublicMintPreview(
  slug: string,
  apiKey: string,
  executionAddress: string,
  chain: ChainConfig,
  endpoints: string[],
): Promise<MintTransactionPreview> {
  const action = await openSeaRequest(`/drops/${encodeURIComponent(slug)}/mint`, apiKey, {
    method: "POST",
    body: { minter: openSeaQuoteMinter(), quantity: 1 },
  });
  const quoted = normalizeOpenSeaMintTransaction(action);
  const parsed = seadropInterface.parseTransaction({ data: quoted.data, value: quoted.value });
  if (!parsed || parsed.name !== "mintPublic") {
    throw new ApiError(502, "OpenSea quote did not return a standard public SeaDrop mint");
  }

  // A public mint has no wallet signature. Preserve OpenSea's NFT contract,
  // fee recipient, quantity, target, and value while making msg.sender the minter.
  const transaction = {
    to: quoted.to,
    data: seadropInterface.encodeFunctionData("mintPublic", [
      getAddress(String(parsed.args[0])),
      getAddress(String(parsed.args[1])),
      ZeroAddress,
      BigInt(parsed.args[3]),
    ]),
    value: quoted.value,
  };
  const decoded = decodeMintTransaction(transaction, executionAddress);
  const verification = await simulateTransaction(
    chain,
    endpoints,
    transaction,
    executionAddress,
    "public",
  );
  return {
    ...transaction,
    value: transaction.value.toString(),
    chain: chain.key,
    chainId: chain.chainId,
    source: "opensea-mint-action",
    decoded,
    verification,
  };
}

async function checkOpenSeaMintEligibility(
  slug: string,
  apiKey: string,
  addresses: string[],
  chain: ChainConfig,
  endpoints: string[],
  mode: "public" | "allowlist" = "allowlist",
) {
  return Promise.all(
    addresses.map(async (address) => {
      try {
        const action = await openSeaRequest(`/drops/${encodeURIComponent(slug)}/mint`, apiKey, {
          method: "POST",
          body: { minter: address, quantity: 1 },
        });
        const transaction = normalizeOpenSeaMintTransaction(action);
        const decoded = decodeMintTransaction(transaction, address);
        if (decoded.recipientMatches === false) {
          const reason = "OpenSea returned a transaction whose mint recipient does not match the imported execution wallet";
          return {
            address,
            status: "unknown" as const,
            reason,
            transaction: {
              ...transaction,
              value: transaction.value.toString(),
              chain: chain.key,
              chainId: chain.chainId,
              source: "opensea-mint-action" as const,
              decoded,
              verification: { ok: false, inconclusive: true, reason },
            },
          };
        }
        const deploymentWarning = await mintContractDeploymentWarning(
          chain,
          endpoints,
          decoded.nftContract,
        );
        const verification = deploymentWarning
          ? { ok: false, inconclusive: true, reason: deploymentWarning }
          : await simulateTransaction(chain, endpoints, transaction, address, mode);
        const preview: MintTransactionPreview = {
          ...transaction,
          value: transaction.value.toString(),
          chain: chain.key,
          chainId: chain.chainId,
          source: "opensea-mint-action",
          decoded,
          verification,
        };
        if (verification.ok) {
          return {
            address,
            status: "eligible" as const,
            reason: verification.warning,
            transaction: preview,
          };
        }
        const openSeaConfirmedAccess =
          transaction.to.toLowerCase() === SEADROP_ADDRESS.toLowerCase() &&
          decoded.recipientMatches === true &&
          decoded.valueMatches !== false &&
          (decoded.method === "mintSigned" ||
            (mode === "public" && decoded.method === "mintPublic"));
        if (verification.inconclusive && openSeaConfirmedAccess) {
          const reason = `OpenSea issued the exact ${
            decoded.method === "mintSigned" ? "wallet-specific signed" : "public"
          } mint action, so stage access is confirmed. On-chain execution is not ready: ${
            verification.reason || "the RPC dry-run was inconclusive"
          }`;
          verification.eligibilityVerified = true;
          verification.warning = reason;
          return {
            address,
            status: "eligible" as const,
            reason,
            transaction: preview,
          };
        }
        return {
          address,
          status: verification.inconclusive ? "unknown" as const : "notEligible" as const,
          reason: verification.reason || "Exact transaction verification failed",
          transaction: preview,
        };
      } catch (error) {
        const errorContext = `${errorMessage(error)} ${
          error instanceof ApiError ? JSON.stringify(error.details || {}) : ""
        }`;
        if (mode === "public" && isInsufficientBalanceReason(errorContext)) {
          const fundingReason =
            "Public-stage access is confirmed, but this wallet needs enough ETH for the mint price and gas";
          try {
            const transaction = await buildFundedPublicMintPreview(
              slug,
              apiKey,
              address,
              chain,
              endpoints,
            );
            if (!transaction.verification.ok && !transaction.verification.inconclusive) {
              return {
                address,
                status: "notEligible" as const,
                reason: transaction.verification.reason || "Funded public-mint simulation failed",
                transaction,
              };
            }
            transaction.verification.eligibilityVerified = true;
            transaction.verification.warning = fundingReason;
            return {
              address,
              status: "eligible" as const,
              reason: fundingReason,
              transaction,
            };
          } catch (quoteError) {
            if (IS_DEVELOPMENT) {
              logServerError("opensea-public-quote", quoteError, { slug, chain: chain.key, address });
            }
            return {
              address,
              status: "eligible" as const,
              reason: `${fundingReason}. Exact transaction preview is available after funding the wallet`,
            };
          }
        }
        if (error instanceof ApiError && [409, 422].includes(error.status)) {
          if (error.status === 409) {
            return {
              address,
              status: "unknown" as const,
              reason: "No mint transaction is active yet; this does not mean the wallet is ineligible for the selected stage",
            };
          }
          if (isInsufficientBalanceReason(errorContext)) {
            return {
              address,
              status: "unknown" as const,
              reason: "OpenSea did not reject allowlist eligibility, but the wallet needs more native balance to build the signed mint transaction",
            };
          }
          if (!/not (?:on|in) (?:the )?allowlist|not eligible|allowlist.*(?:missing|invalid)|mint limit|max.*wallet|sold out|supply exhausted/i.test(errorContext)) {
            return {
              address,
              status: "unknown" as const,
              reason: `OpenSea could not build the currently active mint transaction, but did not prove wallet ineligibility: ${error.message}`,
            };
          }
          return {
            address,
            status: "notEligible" as const,
            reason: error.message,
          };
        }
        return {
          address,
          status: "unknown" as const,
          reason:
            error instanceof ApiError && [401, 403].includes(error.status)
              ? "OpenSea API key is missing or unauthorized"
              : `OpenSea eligibility check unavailable: ${errorMessage(error).slice(0, 180)}`,
        };
      }
    }),
  );
}

function deepValue(root: any, keys: string[]): any {
  if (!root || typeof root !== "object") return undefined;
  for (const key of keys) {
    if (root[key] !== undefined && root[key] !== null) return root[key];
  }
  for (const value of Object.values(root)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const found = deepValue(value, keys);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function extractContracts(data: any): any[] {
  const contracts = deepValue(data, ["contracts"]);
  if (Array.isArray(contracts)) return contracts;
  const contract = deepValue(data, ["contract"]);
  return contract && typeof contract === "object" ? [contract] : [];
}

function resolveOpenSeaChain(value: any): ChainConfig | undefined {
  if (value && typeof value === "object") {
    return resolveChain(
      value.identifier ?? value.chain_identifier ?? value.chainIdentifier ?? value.slug ?? value.name,
    );
  }
  return resolveChain(value);
}

function resolveContractChain(contract: any): ChainConfig | undefined {
  return resolveOpenSeaChain(
    contract?.chain ??
      contract?.chain_identifier ??
      contract?.chainIdentifier ??
      contract?.network,
  );
}

export async function detectDeployedContractChain(
  contractAddress: string,
  preferred?: ChainConfig,
): Promise<ChainConfig | undefined> {
  const hasCode = async (chain: ChainConfig) => {
    try {
      const code = await withRpcFallback(rpcUrlsFor(chain), (url) =>
        providerFor(url, chain).getCode(contractAddress),
      );
      return code !== "0x";
    } catch {
      return false;
    }
  };

  if (preferred && (await hasCode(preferred))) return preferred;
  const candidates = CHAINS.filter((chain) => chain.chainId !== preferred?.chainId);
  const matches = (
    await Promise.all(
      candidates.map(async (chain) => ({ chain, deployed: await hasCode(chain) })),
    )
  ).filter((item) => item.deployed);
  return matches.length === 1 ? matches[0].chain : undefined;
}

function extractStages(data: any): any[] {
  const stages = deepValue(data, ["stages", "drop_stages", "mint_stages"]);
  if (Array.isArray(stages)) return stages;
  return [deepValue(data, ["active_stage"]), deepValue(data, ["next_stage"])].filter(Boolean);
}

function normalizeStage(stage: any, index: number) {
  const startTime = unixSeconds(stage.start_time ?? stage.startTime ?? stage.start_date);
  const endTime = unixSeconds(stage.end_time ?? stage.endTime ?? stage.end_date);
  const rawPrice =
    stage.price?.current?.value ??
    stage.price?.value ??
    stage.price_wei ??
    stage.mint_price ??
    stage.price ??
    0;
  const price = typeof rawPrice === "object" ? rawPrice.amount ?? rawPrice.quantity ?? 0 : rawPrice;
  return {
    id: String(stage.id || stage.stage_id || `stage-${index + 1}`),
    label: String(stage.label || stage.name || stage.phase || `Stage ${index + 1}`),
    phase: String(stage.phase || stage.type || "public").toLowerCase(),
    start_time: startTime,
    end_time: endTime,
    startTime,
    endTime,
    price: String(price || "0"),
    max_mints_per_wallet:
      stage.max_mints_per_wallet ??
      stage.max_per_wallet ??
      stage.maxMintsPerWallet ??
      stage.maxPerWallet ??
      stage.max_total_mintable_by_wallet ??
      null,
    mint_limit: stage.mint_limit ?? stage.max_supply ?? null,
    raw: stage,
  };
}

interface SchedulerJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  updatedAt: string;
  targetTime?: number;
  targetBlock?: number;
  chain: ChainConfig;
  endpoints: string[];
  plan?: MintPlan;
  contractAddress: string;
  mode: "public" | "allowlist";
  quantity: number;
  openSea?: {
    slug: string;
    apiKey: string;
    keySource: OpenSeaKeyRecord["source"];
  };
  privateKeys: string[];
  walletCount: number;
  signedTransactions?: string[];
  arming?: Promise<void>;
  nextArmAttemptAt: number;
  armAttempts: number;
  warmed: boolean;
  lastBlockPollAt: number;
  result?: unknown;
  error?: string;
}

const schedulerJobs = new Map<string, SchedulerJob>();

function parseTargetTime(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new ApiError(400, "targetTime is invalid");
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const timestamp = Date.parse(String(value));
  if (Number.isNaN(timestamp)) throw new ApiError(400, "targetTime must be ISO-8601 or UNIX epoch");
  return timestamp;
}

function privateKeysFrom(body: Record<string, any>): string[] {
  const candidates: unknown[] = [];
  if (body.privateKey) candidates.push(body.privateKey);
  if (Array.isArray(body.privateKeys)) candidates.push(...body.privateKeys);
  if (Array.isArray(body.wallets)) {
    for (const wallet of body.wallets) {
      candidates.push(typeof wallet === "string" ? wallet : wallet?.privateKey);
    }
  }
  const keys = candidates.filter((value): value is string => typeof value === "string" && Boolean(value));
  if (!keys.length) throw new ApiError(400, "At least one execution private key is required");
  if (keys.length > MAX_WALLETS) throw new ApiError(400, `A maximum of ${MAX_WALLETS} wallets is allowed`);
  const byAddress = new Map<string, string>();
  for (const key of keys) {
    const wallet = walletFromPrivateKey(key);
    byAddress.set(wallet.address.toLowerCase(), key);
  }
  return [...byAddress.values()];
}

function schedulerPublic(job: SchedulerJob) {
  return {
    id: job.id,
    taskId: job.id,
    status: job.status,
    chain: job.chain.key,
    contractAddress: job.contractAddress,
    mode: job.mode,
    source: job.openSea ? "opensea-mint-action" : "local-seadrop-plan",
    openSeaSlug: job.openSea?.slug,
    openSeaKeySource: job.openSea?.keySource,
    armAttempts: job.armAttempts,
    walletCount: job.walletCount,
    targetTime: job.targetTime ? new Date(job.targetTime).toISOString() : undefined,
    targetBlock: job.targetBlock,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error,
  };
}

async function validateScheduledOpenSeaSource(
  slug: string,
  apiKey: string,
  contractAddress: string,
  chain: ChainConfig,
) {
  const [dropResult, collectionResult] = await Promise.allSettled([
    openSeaRequest(`/drops/${encodeURIComponent(slug)}`, apiKey),
    openSeaRequest(`/collections/${encodeURIComponent(slug)}`, apiKey),
  ]);
  if (dropResult.status === "rejected" && collectionResult.status === "rejected") {
    throw new ApiError(
      400,
      `OpenSea slug or API key validation failed: ${errorMessage(dropResult.reason)}`,
    );
  }
  const contracts = [
    ...(dropResult.status === "fulfilled" ? extractContracts(dropResult.value) : []),
    ...(collectionResult.status === "fulfilled" ? extractContracts(collectionResult.value) : []),
  ];
  if (contracts.length) {
    const matchingContract = contracts.find(
      (item) =>
        typeof item?.address === "string" &&
        item.address.toLowerCase() === contractAddress.toLowerCase() &&
        (!resolveContractChain(item) || resolveContractChain(item)?.chainId === chain.chainId),
    );
    if (!matchingContract) {
      throw new ApiError(400, "The OpenSea slug does not match the scheduled contract and chain");
    }
  }
}

async function scheduledOpenSeaTransaction(job: SchedulerJob, privateKey: string) {
  if (!job.openSea?.apiKey) throw new Error("The scheduled OpenSea API key is unavailable");
  const wallet = walletFromPrivateKey(privateKey);
  const action = await openSeaRequest(`/drops/${encodeURIComponent(job.openSea.slug)}/mint`, job.openSea.apiKey, {
    method: "POST",
    body: { minter: wallet.address, quantity: job.quantity },
  });
  const transaction = normalizeOpenSeaMintTransaction(action);
  const decoded = decodeMintTransaction(transaction, wallet.address);
  if (!["mintPublic", "mintSigned"].includes(decoded.method)) {
    throw new Error(`OpenSea returned unsupported scheduled action: ${decoded.method}`);
  }
  if (decoded.nftContract?.toLowerCase() !== job.contractAddress.toLowerCase()) {
    throw new Error("OpenSea scheduled action targets a different NFT contract");
  }
  if (decoded.recipientMatches === false) {
    throw new Error("OpenSea scheduled action targets a different execution wallet");
  }
  if (decoded.quantity !== String(job.quantity)) {
    throw new Error("OpenSea scheduled action quantity does not match the scheduled quantity");
  }
  if (decoded.valueMatches === false) {
    throw new Error("OpenSea scheduled action value does not match its signed mint price");
  }
  const deploymentWarning = await mintContractDeploymentWarning(
    job.chain,
    job.endpoints,
    decoded.nftContract,
  );
  if (deploymentWarning) throw new Error(deploymentWarning);
  const prepared = await prepareForWallet(
    job.chain,
    job.endpoints,
    transaction,
    wallet,
    "fast",
  );
  if (
    !prepared.simulation.ok &&
    (isInsufficientBalanceReason(prepared.simulation.reason) ||
      isDefinitiveEligibilityReason(String(prepared.simulation.reason || "")))
  ) {
    throw new Error(prepared.simulation.reason || "Scheduled OpenSea action simulation failed");
  }
  const { simulation: _simulation, ...signable } = prepared;
  return signTransactionPayload(signable, privateKey, job.chain, job.endpoints);
}

async function armSchedulerJob(job: SchedulerJob, force = false): Promise<void> {
  if (job.signedTransactions || job.arming || !["pending", "running"].includes(job.status)) return;
  if (!force && job.nextArmAttemptAt > Date.now()) return;
  job.armAttempts += 1;
  job.arming = (async () => {
    const signedTransactions = job.openSea
      ? await Promise.all(job.privateKeys.map((key) => scheduledOpenSeaTransaction(job, key)))
      : await Promise.all(
          job.privateKeys.map((key) => {
            if (!job.plan) throw new Error("Scheduled on-chain mint plan is unavailable");
            return signTransactionPayload(
              {
                to: job.plan.to,
                data: job.plan.data,
                value: job.plan.value.toString(),
                chainId: job.chain.chainId,
              },
              key,
              job.chain,
              job.endpoints,
            );
          }),
        );
    if (["pending", "running"].includes(job.status)) {
      job.signedTransactions = signedTransactions;
      job.error = undefined;
      job.nextArmAttemptAt = 0;
    }
  })();
  try {
    await job.arming;
  } catch (error) {
    job.error = `Pre-sign failed; will retry at execution: ${errorMessage(error).slice(0, 200)}`;
    job.nextArmAttemptAt = Date.now() + (job.openSea ? 1_000 : 500);
    logServerError("scheduler-pre-sign", error, {
      jobId: job.id,
      chain: job.chain.key,
      walletCount: job.walletCount,
    });
  } finally {
    job.arming = undefined;
  }
}

async function executeSchedulerJob(job: SchedulerJob): Promise<void> {
  if (job.status !== "pending") return;
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  try {
    if (job.arming) {
      const activeArming = job.arming;
      try {
        await activeArming;
      } catch {
        // armSchedulerJob records the error and the forced attempt below retries.
      }
      if (job.arming === activeArming) job.arming = undefined;
    }
    if (!job.signedTransactions) await armSchedulerJob(job, true);
    if (!job.signedTransactions) throw new Error(job.error || "Unable to sign scheduled transactions");
    const results = await Promise.all(
      job.signedTransactions.map((signedTx) =>
        broadcastSignedTransaction(signedTx, job.chain, job.endpoints),
      ),
    );
    job.result = { transactions: results, txHashes: results.map((result) => result.txHash) };
    job.error = undefined;
    job.status = "completed";
  } catch (error) {
    job.error = errorMessage(error).slice(0, 500);
    job.status = "failed";
    logServerError("scheduler-execution", error, {
      jobId: job.id,
      chain: job.chain.key,
      walletCount: job.walletCount,
    });
  } finally {
    job.privateKeys = [];
    job.signedTransactions = undefined;
    if (job.openSea) job.openSea.apiKey = "";
    job.updatedAt = new Date().toISOString();
  }
}

async function warmRpcEndpoints(job: SchedulerJob) {
  if (job.warmed) return;
  job.warmed = true;
  await Promise.allSettled(
    job.endpoints.map((url) => providerFor(url, job.chain).send("eth_chainId", [])),
  );
}

let schedulerTickRunning = false;
async function schedulerTick() {
  if (schedulerTickRunning) return;
  schedulerTickRunning = true;
  try {
    const now = Date.now();
    for (const job of schedulerJobs.values()) {
      if (job.status !== "pending") continue;
      if (job.targetTime !== undefined) {
        const remaining = job.targetTime - now;
        if (remaining <= 15_000) void warmRpcEndpoints(job);
        const armWindow = job.openSea ? 10_000 : 3_000;
        if (remaining <= armWindow && remaining > 0) void armSchedulerJob(job);
        if (remaining <= 0) void executeSchedulerJob(job);
        continue;
      }
      if (job.targetBlock !== undefined && now - job.lastBlockPollAt >= 500) {
        job.lastBlockPollAt = now;
        try {
          const currentBlock = await withRpcFallback(job.endpoints, (url) =>
            providerFor(url, job.chain).getBlockNumber(),
          );
          if (currentBlock >= job.targetBlock - 1) {
            void warmRpcEndpoints(job);
            void armSchedulerJob(job);
          }
          if (currentBlock >= job.targetBlock) void executeSchedulerJob(job);
        } catch (error) {
          if (IS_DEVELOPMENT) {
            logServerError("scheduler-block-poll", error, {
              jobId: job.id,
              chain: job.chain.key,
              targetBlock: job.targetBlock,
            });
          }
          // Retry transient block-poll failures on the next tick.
        }
      }
    }
  } finally {
    schedulerTickRunning = false;
  }
}

const schedulerInterval = setInterval(() => void schedulerTick(), 100);
schedulerInterval.unref();

interface NonceRecord {
  address?: string;
  expiresAt: number;
}

const authNonces = new Map<string, NonceRecord>();
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");

interface AuthenticatedSession {
  address: string;
  addressKey: string;
  chainId: number;
  jti: string;
}

function issueSessionToken(address: string, chainId: number) {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ sub: address, chainId, iat: now, exp: now + 86_400, jti: crypto.randomUUID() }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresAt: new Date((now + 86_400) * 1000).toISOString() };
}

function verifySessionToken(token: unknown): AuthenticatedSession {
  if (typeof token !== "string" || !token.trim()) throw new ApiError(401, "Authentication token is required");
  const [payload, signature, extra] = token.trim().split(".");
  if (!payload || !signature || extra !== undefined) throw new ApiError(401, "Authentication token is invalid");
  const expected = crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (supplied.length !== expectedBuffer.length || !crypto.timingSafeEqual(supplied, expectedBuffer)) {
    throw new ApiError(401, "Authentication token is invalid");
  }
  let claims: any;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new ApiError(401, "Authentication token payload is invalid");
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp) <= now) {
    throw new ApiError(401, "Authentication token has expired");
  }
  const address = requireAddress(claims.sub, "session.sub");
  const chainId = Number(claims.chainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new ApiError(401, "Authentication token chain is invalid");
  return {
    address,
    addressKey: address.toLowerCase(),
    chainId,
    jti: typeof claims.jti === "string" ? claims.jti : "",
  };
}

function requireSession(req: Request): AuthenticatedSession {
  const authorization = req.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return verifySessionToken(bearer || req.get("x-session-token"));
}

type JsonConfig = null | boolean | number | string | JsonConfig[] | { [key: string]: JsonConfig };

const BLOCKED_CONFIG_KEY =
  /^(?:privateKey|privateKeys|wallet|wallets|mnemonic|seed|seedPhrase|signedTx|signedTransaction|signature|salt|authToken|token|session|password|secret)$/i;
const ENCRYPTED_CONFIG_KEY = /api.?key/i;

let userDatabase: DatabaseSync | undefined;
let missingConfigEncryptionWarningShown = false;

function configEncryptionKey(): Buffer | undefined {
  const secret = String(process.env.CONFIG_ENCRYPTION_KEY || process.env.SESSION_SECRET || "").trim();
  return secret ? crypto.createHash("sha256").update(secret).digest() : undefined;
}

function encryptConfigSecret(value: string): JsonConfig {
  if (!value) return "";
  const key = configEncryptionKey();
  if (!key) {
    if (IS_DEVELOPMENT && !missingConfigEncryptionWarningShown) {
      missingConfigEncryptionWarningShown = true;
      logServerError(
        "config-encryption",
        new Error("CONFIG_ENCRYPTION_KEY or SESSION_SECRET is required to persist API-key config fields"),
      );
    }
    return "";
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    __lastlapEncrypted: "v1",
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
    data: encrypted.toString("base64url"),
  };
}

function decryptConfigSecret(value: Record<string, JsonConfig>): string {
  const key = configEncryptionKey();
  if (!key) return "";
  try {
    const iv = Buffer.from(String(value.iv || ""), "base64url");
    const tag = Buffer.from(String(value.tag || ""), "base64url");
    const data = Buffer.from(String(value.data || ""), "base64url");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch (error) {
    if (IS_DEVELOPMENT) logServerError("config-decrypt", error);
    return "";
  }
}

function sanitizeConfigValue(value: unknown, key = "", depth = 0): JsonConfig | undefined {
  if (BLOCKED_CONFIG_KEY.test(key)) return undefined;
  if (ENCRYPTED_CONFIG_KEY.test(key)) {
    return typeof value === "string" ? encryptConfigSecret(value.slice(0, 4096)) : "";
  }
  if (value === null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") return value.slice(0, 4096);
  if (Array.isArray(value)) {
    if (depth >= 6) return [];
    return value.slice(0, 100).map((item) => sanitizeConfigValue(item, "", depth + 1) ?? null);
  }
  if (value && typeof value === "object") {
    if (depth >= 6) return {};
    const output: Record<string, JsonConfig> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      const cleaned = sanitizeConfigValue(childValue, childKey, depth + 1);
      if (cleaned !== undefined) output[childKey] = cleaned;
    }
    return output;
  }
  return undefined;
}

function decryptConfigValue(value: JsonConfig): JsonConfig {
  if (Array.isArray(value)) return value.map(decryptConfigValue);
  if (value && typeof value === "object") {
    const record = value as Record<string, JsonConfig>;
    if (record.__lastlapEncrypted === "v1") return decryptConfigSecret(record);
    const output: Record<string, JsonConfig> = {};
    for (const [key, item] of Object.entries(record)) output[key] = decryptConfigValue(item);
    return output;
  }
  return value;
}

function database(): DatabaseSync {
  if (userDatabase) return userDatabase;
  mkdirSync(path.dirname(DATABASE_PATH), { recursive: true, mode: 0o700 });
  userDatabase = new DatabaseSync(DATABASE_PATH);
  userDatabase.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      address_key TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      last_chain_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_configs (
      address_key TEXT PRIMARY KEY REFERENCES users(address_key) ON DELETE CASCADE,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  try {
    chmodSync(DATABASE_PATH, 0o600);
  } catch {
    // chmod can fail on filesystems that do not support POSIX modes.
  }
  return userDatabase;
}

function upsertUser(address: string, chainId: number) {
  const normalized = requireAddress(address, "address");
  const now = new Date().toISOString();
  database()
    .prepare(
      `
      INSERT INTO users (address_key, wallet_address, last_chain_id, created_at, updated_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(address_key) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        last_chain_id = excluded.last_chain_id,
        updated_at = excluded.updated_at,
        last_login_at = excluded.last_login_at
    `,
    )
    .run(normalized.toLowerCase(), normalized, chainId, now, now, now);
}

function readUserConfig(session: AuthenticatedSession) {
  upsertUser(session.address, session.chainId);
  const row = database()
    .prepare("SELECT config_json, updated_at FROM user_configs WHERE address_key = ?")
    .get(session.addressKey) as { config_json?: string; updated_at?: string } | undefined;
  if (!row?.config_json) return { config: {}, updatedAt: null };
  try {
    return {
      config: decryptConfigValue(JSON.parse(row.config_json) as JsonConfig),
      updatedAt: row.updated_at || null,
    };
  } catch (error) {
    logServerError("config-read", error, { address: session.address });
    return { config: {}, updatedAt: null };
  }
}

function writeUserConfig(session: AuthenticatedSession, input: unknown) {
  upsertUser(session.address, session.chainId);
  const sanitized = sanitizeConfigValue(input);
  const config = sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized : {};
  const serialized = JSON.stringify(config);
  if (Buffer.byteLength(serialized, "utf8") > MAX_USER_CONFIG_BYTES) {
    throw new ApiError(413, "User config is too large");
  }
  const now = new Date().toISOString();
  database()
    .prepare(
      `
      INSERT INTO user_configs (address_key, config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(address_key) DO UPDATE SET
        config_json = excluded.config_json,
        updated_at = excluded.updated_at
    `,
    )
    .run(session.addressKey, serialized, now, now);
  return { config: decryptConfigValue(config), updatedAt: now };
}

const NATIVE_TRANSFER_GAS_LIMIT = 21_000n;

async function buildFundingQuote(body: Record<string, any>, sourceAddress: string) {
  const chain = requireChain(body.chain);
  const endpoints = rpcUrlsFor(chain, body);
  const recipients = recipientAddresses(body.recipients, sourceAddress);
  const amountEach = nativeAmount(body.amountEach, "amountEach");
  const snapshot = await withRpcFallback(endpoints, async (url) => {
    const provider = providerFor(url, chain);
    const [balance, nonce, rawFees] = await Promise.all([
      provider.getBalance(sourceAddress, "pending"),
      provider.getTransactionCount(sourceAddress, "pending"),
      getFeeSnapshot(provider),
    ]);
    return { balance, nonce, fees: applyFeeTier(rawFees, body.feeTier || "standard") };
  });
  const transferTotal = amountEach * BigInt(recipients.length);
  const maximumNetworkFee =
    NATIVE_TRANSFER_GAS_LIMIT * snapshot.fees.maxFeePerGas * BigInt(recipients.length);
  const requiredTotal = transferTotal + maximumNetworkFee;
  return {
    chain,
    endpoints,
    sourceAddress,
    recipients,
    amountEach,
    balance: snapshot.balance,
    nonce: snapshot.nonce,
    fees: snapshot.fees,
    transferTotal,
    maximumNetworkFee,
    requiredTotal,
    sufficientBalance: snapshot.balance >= requiredTotal,
  };
}

function publicFundingQuote(quote: Awaited<ReturnType<typeof buildFundingQuote>>) {
  return {
    chain: {
      key: quote.chain.key,
      chainId: quote.chain.chainId,
      name: quote.chain.name,
      nativeSymbol: quote.chain.nativeSymbol,
    },
    sourceAddress: quote.sourceAddress,
    recipientCount: quote.recipients.length,
    recipients: quote.recipients,
    amountEachWei: quote.amountEach.toString(),
    transferTotalWei: quote.transferTotal.toString(),
    gasLimitPerTransfer: NATIVE_TRANSFER_GAS_LIMIT.toString(),
    maxFeePerGas: quote.fees.maxFeePerGas.toString(),
    maxPriorityFeePerGas: quote.fees.maxPriorityFeePerGas.toString(),
    maxFeeGwei: gwei(quote.fees.maxFeePerGas),
    maxPriorityFeeGwei: gwei(quote.fees.maxPriorityFeePerGas),
    maximumNetworkFeeWei: quote.maximumNetworkFee.toString(),
    requiredTotalWei: quote.requiredTotal.toString(),
    balanceWei: quote.balance.toString(),
    sufficientBalance: quote.sufficientBalance,
  };
}

const authCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [nonce, record] of authNonces) {
    if (record.expiresAt <= now) authNonces.delete(nonce);
  }
}, 60_000);
authCleanupInterval.unref();

interface RequestMetricBucket {
  minute: number;
  requests: number;
  errors: number;
  durationMs: number;
  maxLatencyMs: number;
}

const requestMetricBuckets = new Map<number, RequestMetricBucket>();
const endpointMetrics = new Map<string, { requests: number; errors: number; durationMs: number }>();
let totalApiRequests = 0;
let totalApiErrors = 0;
let totalApiDurationMs = 0;

function normalizedMetricPath(req: Request) {
  const routePath = typeof req.route?.path === "string" ? req.route.path : req.path;
  return `${req.method} ${routePath}`
    .replace(/0x[0-9a-f]{64}/gi, ":txHash")
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
}

function recordRequestMetric(req: Request, status: number, durationMs: number) {
  if (!req.path.startsWith("/api/") || ["/api/metrics", "/api/status", "/api/health"].includes(req.path)) return;
  totalApiRequests += 1;
  totalApiDurationMs += durationMs;
  if (status >= 400) totalApiErrors += 1;
  const minute = Math.floor(Date.now() / 60_000) * 60_000;
  const bucket = requestMetricBuckets.get(minute) || {
    minute,
    requests: 0,
    errors: 0,
    durationMs: 0,
    maxLatencyMs: 0,
  };
  bucket.requests += 1;
  bucket.durationMs += durationMs;
  bucket.maxLatencyMs = Math.max(bucket.maxLatencyMs, durationMs);
  if (status >= 400) bucket.errors += 1;
  requestMetricBuckets.set(minute, bucket);
  for (const key of requestMetricBuckets.keys()) {
    if (key < minute - 119 * 60_000) requestMetricBuckets.delete(key);
  }

  const path = normalizedMetricPath(req);
  const endpoint = endpointMetrics.get(path) || { requests: 0, errors: 0, durationMs: 0 };
  endpoint.requests += 1;
  endpoint.durationMs += durationMs;
  if (status >= 400) endpoint.errors += 1;
  endpointMetrics.set(path, endpoint);
}

function metricSeries(minutes = 60) {
  const currentMinute = Math.floor(Date.now() / 60_000) * 60_000;
  return Array.from({ length: minutes }, (_, index) => {
    const minute = currentMinute - (minutes - index - 1) * 60_000;
    const bucket = requestMetricBuckets.get(minute);
    return {
      timestamp: new Date(minute).toISOString(),
      requests: bucket?.requests || 0,
      errors: bucket?.errors || 0,
      averageLatencyMs: bucket?.requests ? Math.round(bucket.durationMs / bucket.requests) : 0,
      maxLatencyMs: bucket?.maxLatencyMs || 0,
    };
  });
}

function databaseOperational() {
  try {
    database().prepare("SELECT 1 AS ok").get();
    return true;
  } catch (error) {
    logServerError("status-database", error);
    return false;
  }
}

interface NetworkStatus {
  key: string;
  name: string;
  chainId: number;
  status: "operational" | "degraded";
  latencyMs: number | null;
  blockNumber: number | null;
}

let statusCache: { expiresAt: number; value?: any; pending?: Promise<any> } = { expiresAt: 0 };

async function operationalStatus() {
  if (statusCache.value && statusCache.expiresAt > Date.now()) return statusCache.value;
  if (statusCache.pending) return statusCache.pending;
  statusCache.pending = (async () => {
    const networks: NetworkStatus[] = await Promise.all(
      CHAINS.map(async (chain) => {
        const startedAt = Date.now();
        try {
          const endpoints = rpcUrlsFor(chain).slice(0, 4);
          const blockNumber = await Promise.any(
            endpoints.map((url) => providerFor(url, chain).getBlockNumber()),
          );
          return {
            key: chain.key,
            name: chain.name,
            chainId: chain.chainId,
            status: "operational" as const,
            latencyMs: Date.now() - startedAt,
            blockNumber,
          };
        } catch {
          return {
            key: chain.key,
            name: chain.name,
            chainId: chain.chainId,
            status: "degraded" as const,
            latencyMs: null,
            blockNumber: null,
          };
        }
      }),
    );
    const databaseOk = databaseOperational();
    const degradedNetworks = networks.filter((network) => network.status !== "operational").length;
    const overall = !databaseOk ? "outage" : degradedNetworks ? "degraded" : "operational";
    const value = {
      generatedAt: new Date().toISOString(),
      overall,
      uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1_000),
      components: {
        api: { status: "operational" },
        database: { status: databaseOk ? "operational" : "outage" },
        scheduler: { status: "operational", tickIntervalMs: 100 },
      },
      networks,
    };
    statusCache = { value, expiresAt: Date.now() + 15_000 };
    return value;
  })();
  try {
    return await statusCache.pending;
  } finally {
    statusCache.pending = undefined;
  }
}

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => recordRequestMetric(req, res.statusCode, Date.now() - startedAt));
  next();
});

if (IS_DEVELOPMENT) {
  app.use((req, res, next) => {
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    res.locals.requestId = requestId;
    res.on("finish", () => {
      if (res.statusCode >= 400 && !res.locals.errorLogged) {
        logServerError("http-response", new Error(`HTTP ${res.statusCode}`), {
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - startedAt,
          query: req.query,
          body: req.body,
        });
      }
    });
    next();
  });

  app.post("/api/dev/client-error", (req, res) => {
    const report = req.body && typeof req.body === "object" ? req.body : {};
    const message = String(report.message || report.kind || "Browser error").slice(0, 500);
    logServerError("browser", new Error(message), {
      requestId: res.locals.requestId,
      report,
    });
    res.sendStatus(204);
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1_000),
    chains: CHAINS.map(({ key, chainId }) => ({ key, chainId })),
  });
});

app.get(
  "/api/status",
  asyncRoute(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(await operationalStatus());
  }),
);

app.get("/api/metrics", (_req, res) => {
  let users = 0;
  try {
    const row = database().prepare("SELECT COUNT(*) AS count FROM users").get() as { count?: number };
    users = Number(row?.count || 0);
  } catch (error) {
    logServerError("metrics-database", error);
  }
  const memory = process.memoryUsage();
  const jobs = [...schedulerJobs.values()];
  const transactions = [...broadcasts.values()];
  const rpc = CHAINS.map((chain) => {
    const health = rpcUrlsFor(chain).map((url) => rpcHealth.get(url)).filter(Boolean) as RpcHealth[];
    const successes = health.reduce((sum, item) => sum + item.successes, 0);
    const failures = health.reduce((sum, item) => sum + item.failures, 0);
    const latencies = health
      .map((item) => item.lastLatencyMs)
      .filter((value): value is number => typeof value === "number");
    return {
      key: chain.key,
      name: chain.name,
      successes,
      failures,
      successRate: successes + failures ? Number(((successes / (successes + failures)) * 100).toFixed(2)) : null,
      lastLatencyMs: latencies.length ? Math.min(...latencies) : null,
    };
  });
  const topEndpoints = [...endpointMetrics.entries()]
    .map(([path, metric]) => ({
      path,
      requests: metric.requests,
      errors: metric.errors,
      averageLatencyMs: metric.requests ? Math.round(metric.durationMs / metric.requests) : 0,
    }))
    .sort((left, right) => right.requests - left.requests)
    .slice(0, 8);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    generatedAt: new Date().toISOString(),
    startedAt: new Date(PROCESS_STARTED_AT).toISOString(),
    uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1_000),
    requests: {
      total: totalApiRequests,
      errors: totalApiErrors,
      successRate: totalApiRequests
        ? Number((((totalApiRequests - totalApiErrors) / totalApiRequests) * 100).toFixed(2))
        : 100,
      averageLatencyMs: totalApiRequests ? Math.round(totalApiDurationMs / totalApiRequests) : 0,
    },
    series: metricSeries(60),
    topEndpoints,
    rpc,
    activity: {
      users,
      broadcasts: transactions.length,
      confirmedTransactions: transactions.filter((transaction) => transaction.state === "confirmed").length,
      revertedTransactions: transactions.filter((transaction) => transaction.state === "reverted").length,
      scheduledJobs: jobs.length,
      completedJobs: jobs.filter((job) => job.status === "completed").length,
      failedJobs: jobs.filter((job) => job.status === "failed").length,
    },
    runtime: {
      node: process.version,
      rssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
    },
  });
});

app.get("/api/auth/nonce", (req, res) => {
  const address = req.query.address ? requireAddress(req.query.address, "address") : undefined;
  const nonce = generateNonce();
  authNonces.set(nonce, { address, expiresAt: Date.now() + 5 * 60_000 });
  res.setHeader("Cache-Control", "no-store");
  res.json({ nonce, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() });
});

app.post(
  "/api/auth/verify",
  asyncRoute(async (req, res) => {
    const messageText = String(req.body?.message || "");
    const signature = String(req.body?.signature || "");
    if (!messageText || !signature) throw new ApiError(400, "message and signature are required");
    let message: SiweMessage;
    try {
      message = new SiweMessage(messageText);
    } catch {
      throw new ApiError(400, "message is not a valid EIP-4361 SIWE message");
    }
    const nonceRecord = authNonces.get(message.nonce);
    if (!nonceRecord || nonceRecord.expiresAt <= Date.now()) {
      authNonces.delete(message.nonce);
      throw new ApiError(400, "Nonce is invalid or expired");
    }
    if (nonceRecord.address && nonceRecord.address.toLowerCase() !== message.address.toLowerCase()) {
      throw new ApiError(401, "SIWE address does not match the nonce request");
    }
    const expectedDomain = process.env.SIWE_DOMAIN || req.get("host") || undefined;
    const verification = await message.verify(
      { signature, nonce: message.nonce, domain: expectedDomain, time: new Date().toISOString() },
      { suppressExceptions: true },
    );
    if (!verification.success) {
      throw new ApiError(401, verification.error?.type || "SIWE signature verification failed");
    }
    authNonces.delete(message.nonce);
    const verifiedAddress = getAddress(message.address);
    upsertUser(verifiedAddress, message.chainId);
    const session = issueSessionToken(verifiedAddress, message.chainId);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, address: verifiedAddress, ...session });
  }),
);

app.get(
  "/api/user/config",
  asyncRoute(async (req, res) => {
    const session = requireSession(req);
    const config = readUserConfig(session);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, address: session.address, ...config });
  }),
);

app.put(
  "/api/user/config",
  asyncRoute(async (req, res) => {
    const session = requireSession(req);
    const config = writeUserConfig(session, req.body?.config ?? {});
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, address: session.address, ...config });
  }),
);

app.post(
  "/api/funds/estimate",
  asyncRoute(async (req, res) => {
    requireSession(req);
    const body = (req.body || {}) as Record<string, any>;
    const sourceAddress = requireAddress(body.sourceAddress, "sourceAddress");
    const quote = await buildFundingQuote(body, sourceAddress);
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, ...publicFundingQuote(quote) });
  }),
);

app.post(
  "/api/funds/disperse",
  asyncRoute(async (req, res) => {
    requireSession(req);
    const body = (req.body || {}) as Record<string, any>;
    const sourceWallet = walletFromPrivateKey(body.sourcePrivateKey);
    const quote = await buildFundingQuote(body, sourceWallet.address);
    if (!quote.sufficientBalance) {
      throw new ApiError(400, "Source wallet balance is below the transfer total plus maximum network fees", {
        balanceWei: quote.balance.toString(),
        requiredTotalWei: quote.requiredTotal.toString(),
      });
    }

    const signedTransactions = await Promise.all(
      quote.recipients.map((to, index) =>
        sourceWallet.signTransaction({
          to,
          value: quote.amountEach,
          chainId: quote.chain.chainId,
          type: 2,
          nonce: quote.nonce + index,
          gasLimit: NATIVE_TRANSFER_GAS_LIMIT,
          maxFeePerGas: quote.fees.maxFeePerGas,
          maxPriorityFeePerGas: quote.fees.maxPriorityFeePerGas,
        }),
      ),
    );
    const settled = await Promise.allSettled(
      signedTransactions.map((signedTx) =>
        broadcastSignedTransaction(signedTx, quote.chain, quote.endpoints),
      ),
    );
    const transactions = settled.map((result, index) =>
      result.status === "fulfilled"
        ? {
            recipient: quote.recipients[index],
            accepted: true,
            txHash: result.value.txHash,
            statusUrl: result.value.statusUrl,
          }
        : {
            recipient: quote.recipients[index],
            accepted: false,
            error: errorMessage(result.reason),
          },
    );
    const accepted = transactions.filter((item) => item.accepted).length;
    res.status(accepted ? 200 : 502).json({
      success: accepted > 0,
      accepted,
      failed: transactions.length - accepted,
      ...publicFundingQuote(quote),
      transactions,
    });
  }),
);

app.post(
  "/api/prepare-mint",
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, any>;
    const requestedMode = modeFrom(body);
    let requestedSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    const hasVoucher = Boolean(body.voucher?.signature || body.signature);
    const actionWallet = body.privateKey
      ? walletFromPrivateKey(body.privateKey)
      : undefined;
    const actionFrom = actionWallet?.address || (body.from ? requireAddress(body.from, "from") : undefined);
    const requestedContract = requireAddress(body.contractAddress || body.nftContract);
    let actionKeyRecord: OpenSeaKeyRecord | undefined;
    let openSeaResolutionError: unknown;

    // OpenSea sometimes labels a wallet-specific signed phase as "public" even
    // though SeaDrop's raw public window is a different (often later) stage.
    // Resolve contract-only entries to their collection slug so the sniper uses
    // OpenSea's exact currently active action instead of guessing mintPublic().
    if (
      requestedMode === "public" &&
      actionFrom &&
      !hasVoucher &&
      !requestedSlug &&
      body.preferOpenSea !== false
    ) {
      try {
        const chain = requireChain(body.chain);
        actionKeyRecord = await resolveOpenSeaApiKey(body.openseaApiKey);
        requestedSlug =
          (await resolveOpenSeaSlugForContract(chain, requestedContract, actionKeyRecord.key)) || "";
        if (!requestedSlug) throw new Error("OpenSea did not return a collection slug for this contract");
      } catch (error) {
        openSeaResolutionError = error;
        if (IS_DEVELOPMENT) {
          logServerError("opensea-contract-resolution", error, {
            chain: body.chain,
            contractAddress: requestedContract,
          });
        }
        // A standard on-chain public drop remains usable without OpenSea.
      }
    }

    if (!requestedSlug && openSeaResolutionError) {
      const chain = requireChain(body.chain);
      const endpoints = rpcUrlsFor(chain, body);
      let activeOnChainPublicDrop = false;
      try {
        const drop = await readPublicDrop(chain, endpoints, requestedContract);
        const now = Math.floor(Date.now() / 1_000);
        activeOnChainPublicDrop = Boolean(
          drop && drop.startTime <= now && (drop.endTime === 0 || now <= drop.endTime),
        );
      } catch {
        // The normal plan builder will report an RPC error when OpenSea is not required.
      }
      if (!activeOnChainPublicDrop) {
        throw new ApiError(
          503,
          `The active OpenSea phase needs an exact wallet-specific mint action, but no OpenSea API key is available. Enter an existing key in the Sniper's OpenSea API Key field. OpenSea said: ${errorMessage(openSeaResolutionError)}`,
        );
      }
    }

    if (requestedSlug && actionFrom && !hasVoucher) {
      const chain = requireChain(body.chain);
      const endpoints = rpcUrlsFor(chain, body);
      const keyRecord = actionKeyRecord || (await resolveOpenSeaApiKey(body.openseaApiKey));
      rememberOpenSeaSlug(chain, requestedContract, requestedSlug);
      const action = await openSeaRequest(`/drops/${encodeURIComponent(requestedSlug)}/mint`, keyRecord.key, {
        method: "POST",
        body: { minter: actionFrom, quantity: requireQuantity(body.quantity) },
      });
      const actionTransaction = normalizeOpenSeaMintTransaction(action);
      const decoded = decodeMintTransaction(actionTransaction, actionFrom);
      if (decoded.nftContract && decoded.nftContract.toLowerCase() !== requestedContract.toLowerCase()) {
        throw new ApiError(502, "OpenSea mint action targets a different NFT contract than the selected drop");
      }
      if (decoded.recipientMatches === false) {
        throw new ApiError(502, "OpenSea mint action targets a different recipient than the execution wallet");
      }

      let transaction: Record<string, any> = {
        to: actionTransaction.to,
        data: actionTransaction.data,
        value: actionTransaction.value.toString(),
        chainId: chain.chainId,
        type: 2,
      };
      let simulation: SimulationResult;
      const deploymentWarning = await mintContractDeploymentWarning(
        chain,
        endpoints,
        decoded.nftContract,
      );
      if (deploymentWarning) {
        simulation = { ok: false, inconclusive: true, reason: deploymentWarning };
      } else if (actionWallet) {
        const prepared = await prepareForWallet(
          chain,
          endpoints,
          actionTransaction,
          actionWallet,
          body.feeTier,
        );
        simulation = prepared.simulation;
        const { simulation: _simulation, ...preparedTransaction } = prepared;
        transaction = preparedTransaction;
      } else {
        simulation = await simulateTransaction(
          chain,
          endpoints,
          actionTransaction,
          actionFrom,
          requestedMode,
        );
      }

      return res.json({
        success: true,
        chain: { key: chain.key, chainId: chain.chainId, name: chain.name },
        rpc: endpoints.map(maskRpcUrl),
        plan: {
          to: actionTransaction.to,
          data: actionTransaction.data,
          value: actionTransaction.value.toString(),
          contractAddress: requestedContract,
          mode: requestedMode,
          source: "opensea-mint-action",
          apiKeySource: keyRecord.source,
          decoded,
        },
        transaction,
        simulation,
      });
    }

    const { chain, endpoints, plan } = await buildMintPlan(body);
    let transaction: Record<string, any> = {
      to: plan.to,
      data: plan.data,
      value: plan.value.toString(),
      chainId: chain.chainId,
      type: 2,
    };
    let simulation: { ok: boolean; reason?: string } | undefined;
    if (body.privateKey) {
      const prepared = await prepareForWallet(
        chain,
        endpoints,
        { to: plan.to, data: plan.data, value: plan.value },
        walletFromPrivateKey(body.privateKey),
        body.feeTier,
      );
      simulation = prepared.simulation;
      const { simulation: _simulation, ...preparedTransaction } = prepared;
      transaction = preparedTransaction;
    } else if (body.from) {
      simulation = await simulateTransaction(
        chain,
        endpoints,
        { to: plan.to, data: plan.data, value: plan.value },
        requireAddress(body.from, "from"),
        plan.mode,
      );
    }
    res.json({
      success: true,
      chain: { key: chain.key, chainId: chain.chainId, name: chain.name },
      rpc: endpoints.map(maskRpcUrl),
      plan: publicPlan(plan),
      transaction,
      simulation,
    });
  }),
);

app.post(
  "/api/blast-mint",
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, any>;
    const chain = requireChain(body.chain);
    const endpoints = rpcUrlsFor(chain, body);
    if (body.signedTx) {
      const result = await broadcastSignedTransaction(String(body.signedTx), chain, endpoints);
      return res.json({ success: true, ...result });
    }
    const keys = privateKeysFrom(body);
    const transaction = body.transaction || body.tx;
    const signedTransactions = await Promise.all(
      keys.map((key) =>
        signTransactionPayload(
          keys.length > 1 && transaction && typeof transaction === "object"
            ? { ...transaction, nonce: undefined }
            : transaction,
          key,
          chain,
          endpoints,
        ),
      ),
    );
    const results = await Promise.all(
      signedTransactions.map((signedTx) => broadcastSignedTransaction(signedTx, chain, endpoints)),
    );
    return res.json({
      success: true,
      txHash: results.length === 1 ? results[0].txHash : undefined,
      statusUrl: results.length === 1 ? results[0].statusUrl : undefined,
      transactions: results,
    });
  }),
);

app.get(
  "/api/blast-mint/status/:txHash",
  asyncRoute(async (req, res) => {
    const txHash = String(req.params.txHash).toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) throw new ApiError(400, "Invalid transaction hash");
    const record = broadcasts.get(txHash);
    if (!record) throw new ApiError(404, "No broadcast record found for this transaction");
    if (req.query.stream === "false") {
      return res.json({
        txHash: record.txHash,
        state: record.state,
        blockNumber: record.blockNumber,
        submittedAt: record.submittedAt,
        attempts: record.attempts,
      });
    }
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    let closed = false;
    let polling = false;
    let lastHeartbeat = 0;
    const startedAt = Date.now();
    const send = (event: string, data: unknown) => {
      if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("broadcast", { txHash: record.txHash, state: record.state, submittedAt: record.submittedAt });
    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const receipt = await withRpcFallback(record.endpoints, (url) =>
          providerFor(url, record.chain).getTransactionReceipt(record.txHash),
        );
        if (receipt) {
          record.blockNumber = receipt.blockNumber;
          record.state = receipt.status === 1 ? "confirmed" : "reverted";
          send(record.state, {
            txHash: record.txHash,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
            gasUsed: receipt.gasUsed.toString(),
            status: receipt.status,
          });
          clearInterval(interval);
          closed = true;
          res.end();
          return;
        }
        if (Date.now() - lastHeartbeat >= 10_000) {
          lastHeartbeat = Date.now();
          send("pending", { txHash: record.txHash, elapsedMs: Date.now() - startedAt });
        }
        if (Date.now() - startedAt >= 5 * 60_000) {
          send("timeout", { txHash: record.txHash });
          clearInterval(interval);
          closed = true;
          res.end();
        }
      } catch (error) {
        send("rpc-error", { message: errorMessage(error).slice(0, 180) });
      } finally {
        polling = false;
      }
    };
    const interval = setInterval(() => void poll(), 1_000);
    void poll();
    req.on("close", () => {
      closed = true;
      clearInterval(interval);
    });
  }),
);

app.post(
  "/api/opensea/drop",
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, any>;
    const identifier = String(body.slug || body.contractAddress || body.address || "").trim();
    if (!identifier) throw new ApiError(400, "slug or contractAddress is required");
    const keyRecord = await resolveOpenSeaApiKey(body.apiKey);
    const apiKey = keyRecord.key;
    const requestedChain = resolveChain(body.chain);
    let chain = requestedChain;
    let chainMismatch: { requested: string; detected: string } | undefined;
    let slug = !isAddress(identifier) ? identifier : undefined;
    let contractAddress = isAddress(identifier) ? getAddress(identifier) : undefined;
    let dropData: any;
    let collectionData: any;
    let contractData: any;
    let chainDetectedFromOpenSea = false;
    const upstreamErrors: string[] = [];

    if (slug) {
      const [dropResult, collectionResult] = await Promise.allSettled([
        openSeaRequest(`/drops/${encodeURIComponent(slug)}`, apiKey),
        openSeaRequest(`/collections/${encodeURIComponent(slug)}`, apiKey),
      ]);
      if (dropResult.status === "fulfilled") dropData = dropResult.value;
      else upstreamErrors.push(errorMessage(dropResult.reason));
      if (collectionResult.status === "fulfilled") collectionData = collectionResult.value;
      else upstreamErrors.push(errorMessage(collectionResult.reason));
      const contracts = extractContracts(collectionData || dropData);
      const requestedMatch = contracts.find(
        (item) => !requestedChain || resolveContractChain(item)?.chainId === requestedChain.chainId,
      );
      const selected = requestedMatch || contracts[0];
      if (selected?.address && isAddress(selected.address)) contractAddress = getAddress(selected.address);
      const detectedChain =
        resolveContractChain(selected) ||
        resolveOpenSeaChain(deepValue(dropData || collectionData, ["chain", "chain_identifier"]));
      if (detectedChain) {
        chainDetectedFromOpenSea = true;
        if (requestedChain && requestedChain.chainId !== detectedChain.chainId && !requestedMatch) {
          chainMismatch = { requested: requestedChain.key, detected: detectedChain.key };
        }
        chain = detectedChain;
      }
    }

    if (contractAddress) {
      chain ||= requireChain(body.chain || "ethereum");
      if (!chainDetectedFromOpenSea) {
        const deployedChain = await detectDeployedContractChain(contractAddress, chain);
        if (deployedChain && deployedChain.chainId !== chain.chainId) {
          chainMismatch = { requested: chain.key, detected: deployedChain.key };
          chain = deployedChain;
        }
      }
      try {
        contractData = await openSeaRequest(
          `/chain/${encodeURIComponent(chain.key)}/contract/${contractAddress}`,
          apiKey,
        );
        const discoveredCollection = collectionSlugFromOpenSea(contractData);
        if (!slug && discoveredCollection) slug = discoveredCollection;
      } catch (error) {
        upstreamErrors.push(errorMessage(error));
      }
      if (slug && !dropData) {
        try {
          dropData = await openSeaRequest(`/drops/${encodeURIComponent(String(slug))}`, apiKey);
        } catch (error) {
          upstreamErrors.push(errorMessage(error));
        }
      }
    }

    if (!dropData && !collectionData && !contractData) {
      throw new ApiError(502, upstreamErrors[0] || "OpenSea returned no drop data");
    }
    const stages = extractStages(dropData).map(normalizeStage);
    const totalSupply =
      deepValue(dropData, ["total_supply", "totalSupply", "max_supply"]) ??
      deepValue(collectionData, ["total_supply", "totalSupply"]) ??
      null;
    if (chain && contractAddress && slug) rememberOpenSeaSlug(chain, contractAddress, slug);
    res.json({
      name: deepValue(dropData || collectionData || contractData, ["name", "collection_name"]),
      slug,
      chain: chain?.key,
      requested_chain: requestedChain?.key,
      chain_mismatch: chainMismatch,
      contract_address: contractAddress,
      contractAddress,
      total_supply: totalSupply,
      totalSupply,
      stages,
      mint_limits: stages.map((stage) => ({
        stageId: stage.id,
        maxMintsPerWallet: stage.max_mints_per_wallet,
        mintLimit: stage.mint_limit,
      })),
      source: {
        drop: Boolean(dropData),
        collection: Boolean(collectionData),
        contract: Boolean(contractData),
        apiKey: keyRecord.source,
      },
      warnings: upstreamErrors.length ? upstreamErrors : undefined,
      raw: { drop: dropData, collection: collectionData, contract: contractData },
    });
  }),
);

app.post(
  "/api/simulate-mint",
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, any>;
    const wallets = Array.isArray(body.wallets) ? body.wallets : [];
    if (!wallets.length || wallets.length > MAX_WALLETS) {
      throw new ApiError(400, `wallets must contain between 1 and ${MAX_WALLETS} addresses`);
    }
    const addresses = wallets.map((value, index) => requireAddress(value, `wallets[${index}]`));
    const mode = modeFrom(body);
    const hasSignedVoucher = Boolean(body.voucher?.signature || body.signature);
    const slug = typeof body.slug === "string" ? body.slug.trim() : "";
    const stageStatus = String(body.stageStatus || "").trim().toLowerCase();
    let keyRecord: OpenSeaKeyRecord | undefined;
    let keyError: string | undefined;
    if (
      slug &&
      !hasSignedVoucher &&
      (mode === "allowlist" || (mode === "public" && stageStatus === "live"))
    ) {
      try {
        keyRecord = await resolveOpenSeaApiKey(body.openseaApiKey);
      } catch (error) {
        keyError = errorMessage(error).slice(0, 180);
      }
    }

    // OpenSea's mint-action endpoint builds the exact currently eligible stage transaction.
    // Prefer it for public and allowlist checks when a slug/key are available instead of
    // guessing stage calldata from display metadata.
    const respondWithOpenSeaAction = async (record: OpenSeaKeyRecord) => {
      const chain = requireChain(body.chain);
      const endpoints = rpcUrlsFor(chain, body);
      const results = await checkOpenSeaMintEligibility(
        slug,
        record.key,
        addresses,
        chain,
        endpoints,
        mode,
      );
      return res.json({
        chain: chain.key,
        eligibilitySource: "opensea-mint-action",
        apiKeySource: record.source,
        eligible: results.filter((item) => item.status === "eligible").map((item) => item.address),
        warnings: results
          .filter((item) => item.status === "eligible" && item.reason)
          .map((item) => ({ address: item.address, reason: item.reason })),
        notEligible: results
          .filter((item) => item.status === "notEligible")
          .map((item) => ({ address: item.address, reason: item.reason })),
        unknown: results
          .filter((item) => item.status === "unknown")
          .map((item) => ({ address: item.address, reason: item.reason })),
        transactions: results
          .filter((item) => item.transaction)
          .map((item) => ({ address: item.address, ...item.transaction })),
      });
    };

    if (slug && keyRecord && !hasSignedVoucher) {
      return respondWithOpenSeaAction(keyRecord);
    }

    if (mode === "allowlist" && !hasSignedVoucher) {
      return res.json({
        eligible: [],
        notEligible: [],
        unknown: addresses.map((address) => ({
          address,
          reason: keyError
            ? `Could not obtain an OpenSea mint action: ${keyError}`
            : "Allowlist eligibility requires an OpenSea API key or a signed mint voucher",
        })),
        isAllowlistPending: true,
      });
    }
    let builtPlan: Awaited<ReturnType<typeof buildMintPlan>>;
    try {
      builtPlan = await buildMintPlan(body);
    } catch (error) {
      if (mode === "public" && slug && !hasSignedVoucher) {
        try {
          keyRecord ||= await resolveOpenSeaApiKey(body.openseaApiKey);
          return respondWithOpenSeaAction(keyRecord);
        } catch (actionError) {
          if (IS_DEVELOPMENT) {
            logServerError("opensea-public-mint-action", actionError, {
              slug,
              chain: body.chain,
              localPlanError: errorMessage(error),
            });
          }
        }
      }
      throw error;
    }
    const { chain, endpoints, plan } = builtPlan;
    const nowSeconds = Math.floor(Date.now() / 1_000);
    if (plan.mode === "public" && plan.drop.startTime > nowSeconds) {
      const quantity = BigInt(Number(body.quantity));
      const startsAt = new Date(plan.drop.startTime * 1_000).toISOString();
      const stageReason = `Public-stage access is open to this wallet, but transaction execution cannot pass until ${startsAt}`;
      const checks = await Promise.all(
        addresses.map(async (address) => {
          try {
            const stats = await readMintStats(chain, endpoints, plan.contractAddress, address);
            if (stats.minterNumMinted + quantity > BigInt(plan.drop.maxTotalMintableByWallet)) {
              return {
                address,
                eligible: false,
                reason: `Wallet mint limit would be exceeded (${stats.minterNumMinted.toString()} already minted; limit ${plan.drop.maxTotalMintableByWallet})`,
              };
            }
            if (stats.maxSupply > 0n && stats.currentTotalSupply + quantity > stats.maxSupply) {
              return { address, eligible: false, reason: "Drop supply is exhausted" };
            }
            return { address, eligible: true, reason: stageReason };
          } catch (error) {
            if (IS_DEVELOPMENT) {
              logServerError("public-mint-stats", error, {
                address,
                chain: chain.key,
                contractAddress: plan.contractAddress,
              });
            }
            return {
              address,
              eligible: true,
              reason: `${stageReason}. Wallet-limit stats were unavailable, so recheck when the stage becomes live`,
            };
          }
        }),
      );
      const verification: SimulationResult = {
        ok: false,
        eligibilityVerified: true,
        inconclusive: true,
        reason: `Expected timing guard: stage starts at ${startsAt}. No transaction was signed or broadcast`,
      };
      return res.json({
        chain: chain.key,
        eligibilitySource: "public-stage-config-and-mint-stats",
        stageStatus: "upcoming",
        eligible: checks.filter((item) => item.eligible).map((item) => item.address),
        warnings: checks
          .filter((item) => item.eligible)
          .map((item) => ({ address: item.address, reason: item.reason })),
        notEligible: checks
          .filter((item) => !item.eligible)
          .map((item) => ({ address: item.address, reason: item.reason })),
        unknown: [],
        transactions: checks.map((item) => ({
          address: item.address,
          to: plan.to,
          data: plan.data,
          value: plan.value.toString(),
          chain: chain.key,
          chainId: chain.chainId,
          source: "local-seadrop-plan" as const,
          decoded: decodeMintTransaction(
            { to: plan.to, data: plan.data, value: plan.value },
            item.address,
          ),
          verification,
        })),
      });
    }
    const results = await Promise.all(
      addresses.map(async (address) => ({
        address,
        result: await simulateTransaction(
          chain,
          endpoints,
          { to: plan.to, data: plan.data, value: plan.value },
          address,
          plan.mode,
        ),
      })),
    );
    res.json({
      chain: chain.key,
      eligible: results.filter((item) => item.result.ok).map((item) => item.address),
      warnings: results
        .filter((item) => item.result.ok && item.result.warning)
        .map((item) => ({ address: item.address, reason: item.result.warning })),
      notEligible: results
        .filter((item) => !item.result.ok && !item.result.inconclusive)
        .map((item) => ({ address: item.address, reason: item.result.reason })),
      unknown: results
        .filter((item) => item.result.inconclusive)
        .map((item) => ({ address: item.address, reason: item.result.reason })),
      transactions: results.map((item) => ({
        address: item.address,
        to: plan.to,
        data: plan.data,
        value: plan.value.toString(),
        chain: chain.key,
        chainId: chain.chainId,
        source: "local-seadrop-plan" as const,
        decoded: decodeMintTransaction(
          { to: plan.to, data: plan.data, value: plan.value },
          item.address,
        ),
        verification: item.result,
      })),
    });
  }),
);

app.get(
  "/api/gas-price",
  asyncRoute(async (req, res) => {
    const chain = requireChain(req.query.chain);
    const endpoints = rpcUrlsFor(chain);
    const fees = await withRpcFallback(endpoints, (url) => getFeeSnapshot(providerFor(url, chain)));
    const tierEntries = ["slow", "standard", "fast"].map((name) => {
      const tier = applyFeeTier(fees, name);
      return [
        name,
        {
          maxPriorityFeePerGas: tier.maxPriorityFeePerGas.toString(),
          maxFeePerGas: tier.maxFeePerGas.toString(),
          maxPriorityFeeGwei: gwei(tier.maxPriorityFeePerGas),
          maxFeeGwei: gwei(tier.maxFeePerGas),
        },
      ];
    });
    res.setHeader("Cache-Control", "public, max-age=2");
    res.json({
      chain: chain.key,
      baseFee: fees.baseFeePerGas.toString(),
      baseFeePerGas: fees.baseFeePerGas.toString(),
      baseFeeGwei: gwei(fees.baseFeePerGas),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      maxPriorityFeeGwei: gwei(fees.maxPriorityFeePerGas),
      tiers: Object.fromEntries(tierEntries),
    });
  }),
);

app.post(
  "/api/scheduler/create",
  asyncRoute(async (req, res) => {
    const body = (req.body || {}) as Record<string, any>;
    const targetTime = parseTargetTime(body.targetTime);
    const targetBlock =
      body.targetBlock === undefined ? undefined : Number(bigintValue(body.targetBlock, "targetBlock"));
    if (targetTime === undefined && targetBlock === undefined) {
      throw new ApiError(400, "targetTime or targetBlock is required");
    }
    if (targetTime !== undefined && targetTime <= Date.now() + 250) {
      throw new ApiError(400, "targetTime must be at least 250ms in the future");
    }
    if (targetBlock !== undefined && !Number.isSafeInteger(targetBlock)) {
      throw new ApiError(400, "targetBlock must be a safe integer");
    }
    const privateKeys = privateKeysFrom(body);
    const requestedSlug = typeof body.slug === "string" ? body.slug.trim() : "";
    let chain: ChainConfig;
    let endpoints: string[];
    let plan: MintPlan | undefined;
    let openSea: SchedulerJob["openSea"];
    let contractAddress: string;
    let mode: "public" | "allowlist";
    let quantity: number;
    if (requestedSlug) {
      if (requestedSlug.length > 160 || /[\s/?#]/.test(requestedSlug)) {
        throw new ApiError(400, "slug must be a valid OpenSea collection slug");
      }
      chain = requireChain(body.chain);
      endpoints = rpcUrlsFor(chain, body);
      contractAddress = requireAddress(body.contractAddress || body.nftContract);
      mode = modeFrom(body);
      quantity = requireQuantity(body.quantity);
      const keyRecord = await resolveOpenSeaApiKey(body.openseaApiKey);
      await validateScheduledOpenSeaSource(
        requestedSlug,
        keyRecord.key,
        contractAddress,
        chain,
      );
      openSea = { slug: requestedSlug, apiKey: keyRecord.key, keySource: keyRecord.source };
    } else {
      const built = await buildMintPlan(body);
      chain = built.chain;
      endpoints = built.endpoints;
      plan = built.plan;
      contractAddress = plan.contractAddress;
      mode = plan.mode;
      quantity = requireQuantity(body.quantity);
    }
    if (targetBlock !== undefined) {
      const currentBlock = await withRpcFallback(endpoints, (url) =>
        providerFor(url, chain).getBlockNumber(),
      );
      if (targetBlock <= currentBlock) throw new ApiError(400, "targetBlock must be in the future");
    }
    const now = new Date().toISOString();
    const job: SchedulerJob = {
      id: crypto.randomUUID(),
      status: "pending",
      createdAt: now,
      updatedAt: now,
      targetTime,
      targetBlock,
      chain,
      endpoints,
      plan,
      contractAddress,
      mode,
      quantity,
      openSea,
      privateKeys,
      walletCount: privateKeys.length,
      nextArmAttemptAt: 0,
      armAttempts: 0,
      warmed: false,
      lastBlockPollAt: 0,
    };
    schedulerJobs.set(job.id, job);
    res.status(201).json({ success: true, ...schedulerPublic(job) });
  }),
);

app.get("/api/scheduler/jobs", (_req, res) => {
  const jobs = [...schedulerJobs.values()]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(schedulerPublic);
  res.json({ jobs, count: jobs.length });
});

app.delete("/api/scheduler/jobs/:id", (req, res) => {
  const job = schedulerJobs.get(req.params.id);
  if (!job) throw new ApiError(404, "Scheduler job not found");
  if (job.status !== "pending") {
    throw new ApiError(409, `Only pending jobs can be cancelled (current status: ${job.status})`);
  }
  job.status = "cancelled";
  job.privateKeys = [];
  job.signedTransactions = undefined;
  if (job.openSea) job.openSea.apiKey = "";
  job.updatedAt = new Date().toISOString();
  res.json({ success: true, job: schedulerPublic(job) });
});

app.use("/api", (_req, res) => res.status(404).json({ error: "API route not found" }));

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = error instanceof ApiError ? error.status : 500;
  const message = errorMessage(error);
  if (IS_DEVELOPMENT || status >= 500) {
    res.locals.errorLogged = true;
    logServerError("api", error, {
      requestId: res.locals.requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      query: req.query,
      body: req.body,
      details: error instanceof ApiError ? error.details : undefined,
    });
  }
  res.status(status).json({
    error: message,
    details: error instanceof ApiError ? error.details : undefined,
  });
});

let frontendInstalled = false;
async function installFrontend() {
  if (frontendInstalled) return;
  frontendInstalled = true;
  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    return;
  }
  const distPath = path.resolve(process.cwd(), "dist");
  app.use((req, res, next) => {
    if (/^\/server\.cjs(?:\.map)?$/.test(req.path)) return res.sendStatus(404);
    next();
  });
  app.use(express.static(distPath, { index: false, maxAge: "1h" }));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

let serverStarted = false;
let activeHttpServer: HttpServer | undefined;
export async function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  installProcessErrorLogging();
  database();
  await installFrontend();
  await new Promise<void>((resolve, reject) => {
    activeHttpServer = app.listen(PORT, HOST);
    const onError = (error: Error) => {
      activeHttpServer = undefined;
      reject(error);
    };
    activeHttpServer.once("error", onError);
    activeHttpServer.once("listening", () => {
      activeHttpServer?.off("error", onError);
      console.log(`NFT sniper server listening on http://${HOST}:${PORT}`);
      resolve();
    });
  });
}

if (process.env.NODE_ENV !== "test") {
  void startServer().catch((error) => {
    serverStarted = false;
    console.error(`Unable to start server: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}

export default app;
