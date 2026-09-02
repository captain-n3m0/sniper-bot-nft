// Chain registry — everything chain-specific lives here so adding a new
// network is a single entry instead of hunting for hardcoded values.
//
// `key` is the identifier used in three places, and they must match:
//   1. the OpenSea GraphQL `chain` field (opensea-api.ts)
//   2. the `--chain` CLI option
//   3. the `CHAIN` env var
//
// OpenSea confirmed support for Robinhood Chain (opensea.io/discover/chain/robinhood),
// so the existing OpenSea-based mint flow works on it unchanged — only the RPC
// (in .env) and the explorer links (resolved here) differ from Base.

export interface ChainProfile {
  key: string;          // OpenSea id + --chain value + CHAIN env value
  chainId: number;      // EVM network chain id
  name: string;         // human label
  explorer: string;     // block explorer base URL, NO trailing slash
  nativeSymbol: string;
  rpc: {
    alchemyHost?: string; // Alchemy host for this network (docs/reference)
    public: string[];     // public RPC + sequencer endpoints
  };
}

export const CHAINS: ChainProfile[] = [
  {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    explorer: "https://etherscan.io",
    nativeSymbol: "ETH",
    rpc: {
      alchemyHost: "eth-mainnet.g.alchemy.com",
      public: [
        "https://eth.llamarpc.com",
        "https://ethereum-rpc.publicnode.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://1rpc.io/eth",
      ],
    },
  },
  {
    key: "base",
    chainId: 8453,
    name: "Base",
    explorer: "https://basescan.org",
    nativeSymbol: "ETH",
    rpc: {
      alchemyHost: "base-mainnet.g.alchemy.com",
      public: [
        "https://mainnet.base.org",
        "https://base.llamarpc.com",
        "https://base-rpc.publicnode.com",
        "https://1rpc.io/base",
      ],
    },
  },
  {
    key: "polygon",
    chainId: 137,
    name: "Polygon",
    explorer: "https://polygonscan.com",
    nativeSymbol: "POL",
    rpc: {
      alchemyHost: "polygon-mainnet.g.alchemy.com",
      public: [
        "https://polygon-rpc.com",
        "https://polygon.llamarpc.com",
        "https://rpc.ankr.com/polygon",
        "https://1rpc.io/matic",
      ],
    },
  },
  {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    explorer: "https://arbiscan.io",
    nativeSymbol: "ETH",
    rpc: {
      alchemyHost: "arb-mainnet.g.alchemy.com",
      public: [
        "https://arb1.arbitrum.io/rpc",
        "https://arbitrum.llamarpc.com",
        "https://rpc.ankr.com/arbitrum",
      ],
    },
  },
  {
    key: "apechain",
    chainId: 33139,
    name: "ApeChain",
    explorer: "https://apescan.io",
    nativeSymbol: "APE",
    rpc: {
      public: [
        "https://rpc.apechain.com",
      ],
    },
  },
  {
    key: "berachain",
    chainId: 80084,
    name: "Berachain (bArtio)",
    explorer: "https://bartio.beratrail.io",
    nativeSymbol: "BERA",
    rpc: {
      public: [
        "https://bartio.rpc.berachain.com",
      ],
    },
  },
  {
    key: "monad",
    chainId: 10143,
    name: "Monad (Testnet)",
    explorer: "https://testnet.monadexplorer.com",
    nativeSymbol: "MON",
    rpc: {
      public: [
        "https://testnet-rpc.monad.xyz",
      ],
    },
  },
  {
    key: "optimism",
    chainId: 10,
    name: "Optimism",
    explorer: "https://optimistic.etherscan.io",
    nativeSymbol: "ETH",
    rpc: {
      alchemyHost: "opt-mainnet.g.alchemy.com",
      public: [
        "https://mainnet.optimism.io",
      ],
    },
  },
  {
    key: "bsc",
    chainId: 56,
    name: "BNB Smart Chain",
    explorer: "https://bscscan.com",
    nativeSymbol: "BNB",
    rpc: {
      public: [
        "https://bsc-dataseed.binance.org",
      ],
    },
  },
  {
    key: "avalanche",
    chainId: 43114,
    name: "Avalanche C-Chain",
    explorer: "https://snowtrace.io",
    nativeSymbol: "AVAX",
    rpc: {
      public: [
        "https://api.avax.network/ext/bc/C/rpc",
      ],
    },
  },
  {
    key: "blast",
    chainId: 81457,
    name: "Blast",
    explorer: "https://blastscan.io",
    nativeSymbol: "ETH",
    rpc: {
      public: [
        "https://rpc.blast.io",
      ],
    },
  },
  {
    key: "zora",
    chainId: 7777777,
    name: "Zora",
    explorer: "https://explorer.zora.energy",
    nativeSymbol: "ETH",
    rpc: {
      public: [
        "https://rpc.zora.energy",
      ],
    },
  },
  {
    key: "linea",
    chainId: 59144,
    name: "Linea",
    explorer: "https://lineascan.build",
    nativeSymbol: "ETH",
    rpc: {
      public: [
        "https://rpc.linea.build",
      ],
    },
  },
  {
    key: "scroll",
    chainId: 534352,
    name: "Scroll",
    explorer: "https://scrollscan.com",
    nativeSymbol: "ETH",
    rpc: {
      public: [
        "https://rpc.scroll.io",
      ],
    },
  },
  {
    key: "zksync",
    chainId: 324,
    name: "zkSync Era",
    explorer: "https://explorer.zksync.io",
    nativeSymbol: "ETH",
    rpc: {
      public: [
        "https://mainnet.era.zksync.io",
      ],
    },
  },
  {
    key: "fantom",
    chainId: 250,
    name: "Fantom Opera",
    explorer: "https://ftmscan.com",
    nativeSymbol: "FTM",
    rpc: {
      public: [
        "https://rpc.ftm.tools",
      ],
    },
  },
  {
    key: "mantle",
    chainId: 5000,
    name: "Mantle",
    explorer: "https://explorer.mantle.xyz",
    nativeSymbol: "MNT",
    rpc: {
      public: [
        "https://rpc.mantle.xyz",
      ],
    },
  },
  {
    key: "celo",
    chainId: 42220,
    name: "Celo",
    explorer: "https://celoscan.io",
    nativeSymbol: "CELO",
    rpc: {
      public: [
        "https://forno.celo.org",
      ],
    },
  },
  {
    key: "cronos",
    chainId: 25,
    name: "Cronos",
    explorer: "https://cronoscan.com",
    nativeSymbol: "CRO",
    rpc: {
      public: [
        "https://evm.cronos.org",
      ],
    },
  },
  {
    key: "robinhood",
    chainId: 4663,
    name: "Robinhood Chain",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeSymbol: "ETH",
    rpc: {
      alchemyHost: "robinhood-mainnet.g.alchemy.com",
      public: [
        "https://rpc.mainnet.chain.robinhood.com",
        "https://sequencer.mainnet.chain.robinhood.com",
      ],
    },
  },
];

const DEFAULT_EXPLORER = "https://basescan.org";

// Resolve a chain by its numeric chainId (from the live network) or by its
// string key (--chain / CHAIN). Returns undefined for unknown chains.
export function resolveChain(
  idOrKey: string | number | bigint | null | undefined
): ChainProfile | undefined {
  if (idOrKey === null || idOrKey === undefined) return undefined;
  if (typeof idOrKey === "string") {
    const key = idOrKey.trim().toLowerCase();
    return CHAINS.find((c) => c.key === key);
  }
  const id = Number(idOrKey);
  return CHAINS.find((c) => c.chainId === id);
}

// Build a block-explorer tx URL for whatever chain we're on. Accepts either the
// numeric chainId (preferred — it's authoritative) or the chain key. Falls back
// to Basescan for unknown chains so links are never broken silently.
export function explorerTx(
  idOrKey: string | number | bigint | null | undefined,
  txHash: string
): string {
  const profile = resolveChain(idOrKey);
  const base = profile?.explorer ?? DEFAULT_EXPLORER;
  return `${base}/tx/${txHash}`;
}
