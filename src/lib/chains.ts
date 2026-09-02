export interface ChainProfile {
  key: string;
  chainId: number;
  name: string;
  explorer: string;
  nativeSymbol: string;
}

export const CHAINS: ChainProfile[] = [
  {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    explorer: "https://etherscan.io",
    nativeSymbol: "ETH",
  },
  {
    key: "base",
    chainId: 8453,
    name: "Base",
    explorer: "https://basescan.org",
    nativeSymbol: "ETH",
  },
  {
    key: "polygon",
    chainId: 137,
    name: "Polygon",
    explorer: "https://polygonscan.com",
    nativeSymbol: "POL",
  },
  {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum One",
    explorer: "https://arbiscan.io",
    nativeSymbol: "ETH",
  },
  {
    key: "optimism",
    chainId: 10,
    name: "Optimism",
    explorer: "https://optimistic.etherscan.io",
    nativeSymbol: "ETH",
  },
  {
    key: "robinhood",
    chainId: 4663,
    name: "Robinhood Chain",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeSymbol: "ETH",
  },
  {
    key: "sepolia",
    chainId: 11155111,
    name: "Sepolia",
    explorer: "https://sepolia.etherscan.io",
    nativeSymbol: "ETH",
  },
];

export function resolveChain(value: string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && !/^\d+$/.test(value.trim())) {
    return CHAINS.find((chain) => chain.key === value.trim().toLowerCase());
  }
  return CHAINS.find((chain) => chain.chainId === Number(value));
}

export function explorerTx(
  value: string | number | bigint | null | undefined,
  txHash: string,
) {
  return `${resolveChain(value)?.explorer || CHAINS[0].explorer}/tx/${txHash}`;
}
