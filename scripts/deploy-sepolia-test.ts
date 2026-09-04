import "dotenv/config";

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import solc from "solc";
import {
  Contract,
  ContractFactory,
  FetchRequest,
  HDNodeWallet,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getAddress,
  parseEther,
} from "ethers";

const CHAIN = { chainId: 11_155_111, name: "sepolia" } as const;
const SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5";
const WALLET_PATH = resolve(".sepolia-test-deployer.json");
const DEPLOYMENT_PATH = resolve(process.env.TESTNET_DEPLOYMENT_PATH || "testnet/sepolia-deployment.json");
const CONTRACT_PATH = resolve("contracts/SeaDropSniperTestNFT.sol");
const MINIMUM_BALANCE = parseEther("0.01");

const PUBLIC_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://rpc.sepolia.org",
  "https://rpc2.sepolia.org",
  "https://1rpc.io/sepolia",
];

interface LocalWalletRecord {
  address: string;
  privateKey: string;
  createdAt: string;
  network: "sepolia-only";
}

interface CompilerOutput {
  contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
  errors?: Array<{ severity: string; formattedMessage: string }>;
}

function getOrCreateDeployer(): Wallet | HDNodeWallet {
  const configuredKey = process.env.SEPOLIA_TEST_PRIVATE_KEY?.trim();
  if (configuredKey) return new Wallet(configuredKey);

  if (existsSync(WALLET_PATH)) {
    const record = JSON.parse(readFileSync(WALLET_PATH, "utf8")) as LocalWalletRecord;
    const wallet = new Wallet(record.privateKey);
    if (getAddress(record.address) !== wallet.address) {
      throw new Error(`Address mismatch in ${WALLET_PATH}`);
    }
    return wallet;
  }

  const wallet = Wallet.createRandom();
  const record: LocalWalletRecord = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    createdAt: new Date().toISOString(),
    network: "sepolia-only",
  };
  writeFileSync(WALLET_PATH, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  chmodSync(WALLET_PATH, 0o600);
  console.log(`Created disposable Sepolia deployer: ${wallet.address}`);
  console.log(`Secret stored locally in ignored file: ${WALLET_PATH}`);
  return wallet;
}

function providerFor(url: string) {
  const request = new FetchRequest(url);
  request.setHeader("User-Agent", "SeaDrop-Sniper-Testnet-Deployment/1.0");
  request.setHeader("Accept", "application/json");
  return new JsonRpcProvider(request, CHAIN, { staticNetwork: true });
}

async function resolveProvider(): Promise<JsonRpcProvider> {
  const configured = process.env.SEPOLIA_RPC_URL?.trim();
  const candidates = configured ? [configured, ...PUBLIC_RPCS] : PUBLIC_RPCS;
  const errors: string[] = [];

  for (const url of [...new Set(candidates)]) {
    const provider = providerFor(url);
    try {
      await provider.getBlockNumber();
      const code = await provider.getCode(SEADROP_ADDRESS);
      if (code === "0x") throw new Error("canonical SeaDrop bytecode is missing");
      console.log(`Connected to Sepolia RPC: ${new URL(url).hostname}`);
      return provider;
    } catch (error) {
      provider.destroy();
      errors.push(`${new URL(url).hostname}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Every Sepolia RPC failed:\n${errors.join("\n")}`);
}

function compileFixture() {
  const source = readFileSync(CONTRACT_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: { "SeaDropSniperTestNFT.sol": { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as CompilerOutput;
  const failures = (output.errors || []).filter((item) => item.severity === "error");
  if (failures.length) throw new Error(failures.map((item) => item.formattedMessage).join("\n"));
  const artifact = output.contracts?.["SeaDropSniperTestNFT.sol"]?.SeaDropSniperTestNFT;
  if (!artifact?.evm.bytecode.object) throw new Error("Solidity compiler did not produce deployable bytecode");
  return { abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` };
}

async function main() {
  const deployer = getOrCreateDeployer();
  const provider = await resolveProvider();
  const balance = await provider.getBalance(deployer.address);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${formatEther(balance)} Sepolia ETH`);

  if (balance < MINIMUM_BALANCE) {
    console.log("\nFUNDING REQUIRED");
    console.log(`Send at least 0.01 Sepolia ETH to: ${deployer.address}`);
    console.log("Then run: npm run testnet:deploy");
    provider.destroy();
    process.exitCode = 2;
    return;
  }

  if (existsSync(DEPLOYMENT_PATH) && process.env.FORCE_TESTNET_DEPLOY !== "1") {
    const previous = JSON.parse(readFileSync(DEPLOYMENT_PATH, "utf8")) as { contractAddress?: string };
    if (previous.contractAddress) {
      const code = await provider.getCode(previous.contractAddress);
      if (code !== "0x") {
        console.log(`Existing verified test deployment: ${previous.contractAddress}`);
        console.log(`Explorer: https://sepolia.etherscan.io/address/${previous.contractAddress}`);
        provider.destroy();
        return;
      }
    }
  }

  const artifact = compileFixture();
  const signer = deployer.connect(provider);
  const factory = new ContractFactory(artifact.abi, artifact.bytecode, signer);
  console.log("Deploying SeaDrop test NFT...");
  const contract = await factory.deploy(SEADROP_ADDRESS);
  const deploymentTransaction = contract.deploymentTransaction();
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`Contract deployed: ${contractAddress}`);

  const latestBlock = await provider.getBlock("latest");
  if (!latestBlock) throw new Error("Could not read the latest Sepolia block");
  const configuredDelay = Number(process.env.TESTNET_STAGE_DELAY_SECONDS || 180);
  const startTime = latestBlock.timestamp + Math.max(30, Math.floor(configuredDelay));
  const endTime = startTime + 86_400;
  const maxPerWallet = 3;
  const mintPrice = 0n;

  console.log("Configuring free public SeaDrop stage...");
  const fixture = new Contract(contractAddress, artifact.abi, signer);
  const configurationTransaction = await fixture.configurePublicDrop(
    deployer.address,
    mintPrice,
    startTime,
    endTime,
    maxPerWallet,
  );
  await configurationTransaction.wait();

  const seaDrop = new Contract(
    SEADROP_ADDRESS,
    [
      "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
      "function getAllowedFeeRecipients(address nftContract) view returns (address[])",
    ],
    provider,
  );
  const configuredDrop = await seaDrop.getPublicDrop(contractAddress);
  const allowedRecipients = (await seaDrop.getAllowedFeeRecipients(contractAddress)) as string[];
  if (
    Number(configuredDrop.startTime) !== startTime ||
    Number(configuredDrop.endTime) !== endTime ||
    Number(configuredDrop.maxTotalMintableByWallet) !== maxPerWallet ||
    !configuredDrop.restrictFeeRecipients ||
    !allowedRecipients.some((address) => getAddress(address) === deployer.address)
  ) {
    throw new Error("On-chain verification of the configured public drop failed");
  }

  const record = {
    network: "sepolia",
    chainId: CHAIN.chainId,
    seaDropAddress: SEADROP_ADDRESS,
    contractAddress,
    deployer: deployer.address,
    deployTransactionHash: deploymentTransaction?.hash,
    configurationTransactionHash: configurationTransaction.hash,
    stage: {
      mintPrice: mintPrice.toString(),
      startsAt: new Date(startTime * 1000).toISOString(),
      endsAt: new Date(endTime * 1000).toISOString(),
      maxPerWallet,
      maxSupply: 100,
      restrictFeeRecipients: true,
    },
    explorer: `https://sepolia.etherscan.io/address/${contractAddress}`,
  };
  mkdirSync(dirname(DEPLOYMENT_PATH), { recursive: true });
  writeFileSync(DEPLOYMENT_PATH, `${JSON.stringify(record, null, 2)}\n`);

  console.log("\nSEPOLIA TEST DROP READY");
  console.log(`NFT contract: ${contractAddress}`);
  console.log(`Stage starts: ${record.stage.startsAt}`);
  console.log(`Stage ends: ${record.stage.endsAt}`);
  console.log(`Explorer: ${record.explorer}`);
  provider.destroy();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
