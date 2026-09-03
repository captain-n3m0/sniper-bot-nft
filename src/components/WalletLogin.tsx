import { useCallback, useEffect, useState } from 'react';
import { Shield, Fingerprint, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { BrowserProvider } from 'ethers';

interface WalletLoginProps {
  onLogin: (address: string, token: string) => void;
}

interface InjectedProvider {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  providers?: InjectedProvider[];
  isMetaMask?: boolean;
  isPhantom?: boolean;
  isCoinbaseWallet?: boolean;
  isBraveWallet?: boolean;
  [key: string]: unknown;
}

interface WalletOption {
  id: string;
  name: string;
  icon?: string;
  rdns?: string;
  provider: InjectedProvider;
}

interface Eip6963ProviderDetail {
  info: {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
  };
  provider: InjectedProvider;
}

const legacyProviderIds = new WeakMap<object, string>();
let legacyProviderCount = 0;

const getLegacyProviderId = (provider: InjectedProvider) => {
  const existing = legacyProviderIds.get(provider);
  if (existing) return existing;
  const id = `legacy-${++legacyProviderCount}`;
  legacyProviderIds.set(provider, id);
  return id;
};

const getLegacyProviderName = (provider: InjectedProvider) => {
  if (provider.isPhantom) return 'Phantom';
  if (provider.isCoinbaseWallet) return 'Coinbase Wallet';
  if (provider.isBraveWallet) return 'Brave Wallet';
  if (provider.isMetaMask) return 'MetaMask';
  return 'Browser Wallet';
};

const safeWalletIcon = (icon?: string) =>
  icon && (/^data:image\//i.test(icon) || /^https:\/\//i.test(icon)) ? icon : undefined;

export const WalletLogin = ({ onLogin }: WalletLoginProps) => {
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [connectingWalletId, setConnectingWalletId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addWallet = useCallback((wallet: WalletOption) => {
    setWallets((current) => {
      if (
        current.some(
          (item) =>
            item.provider === wallet.provider ||
            item.id === wallet.id ||
            (item.rdns && wallet.rdns && item.rdns === wallet.rdns),
        )
      ) {
        return current;
      }
      return [...current, wallet].sort((left, right) => left.name.localeCompare(right.name));
    });
  }, []);

  const requestWalletDiscovery = useCallback(() => {
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    const injected = window.ethereum as InjectedProvider | undefined;
    const legacyProviders = injected?.providers?.length ? injected.providers : injected ? [injected] : [];
    legacyProviders.forEach((provider) => {
      addWallet({
        id: getLegacyProviderId(provider),
        name: getLegacyProviderName(provider),
        provider,
      });
    });
  }, [addWallet]);

  useEffect(() => {
    const handleProviderAnnouncement = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!detail?.info || !detail.provider) return;
      const { info, provider } = detail;
      addWallet({
        id: info.uuid,
        name: info.name,
        icon: safeWalletIcon(info.icon),
        rdns: info.rdns,
        provider,
      });
    };

    window.addEventListener('eip6963:announceProvider', handleProviderAnnouncement as EventListener);
    requestWalletDiscovery();
    return () => {
      window.removeEventListener('eip6963:announceProvider', handleProviderAnnouncement as EventListener);
    };
  }, [addWallet, requestWalletDiscovery]);

  const connectWallet = async (wallet: WalletOption) => {
    try {
      setConnectingWalletId(wallet.id);
      setError(null);

      const provider = new BrowserProvider(wallet.provider, 'any');
      
      // Request accounts
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from wallet.");
      }
      
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      // 1. Fetch Nonce
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok) {
        throw new Error(nonceData.error || "Failed to fetch nonce");
      }

      // 2. Build and sign an EIP-4361 Sign-In with Ethereum message
      const network = await provider.getNetwork();
      const issuedAt = new Date();
      const expirationTime = new Date(issuedAt.getTime() + 5 * 60 * 1000);
      const domain = window.location.host;
      const message = `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to the LastLap MintGrid dashboard.\n\nURI: ${window.location.origin}\nVersion: 1\nChain ID: ${network.chainId.toString()}\nNonce: ${nonceData.nonce}\nIssued At: ${issuedAt.toISOString()}\nExpiration Time: ${expirationTime.toISOString()}`;
      const signature = await signer.signMessage(message);

      // 3. Verify Signature
      const verifyRes = await fetch(`/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, signature })
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Signature verification failed");
      }

      if (verifyData.success) {
        // Store authentication state only. Execution wallets are imported separately.
        const verifiedAddress = verifyData.address || address;
        localStorage.setItem('auth_token', verifyData.token);
        localStorage.setItem('auth_address', verifiedAddress);
        onLogin(verifiedAddress, verifyData.token);
      }

    } catch (err: any) {
      console.error("Wallet Connection/Auth Error:", err);
      const message = err?.code === 4001 || err?.info?.error?.code === 4001
        ? `${wallet.name} connection request was rejected.`
        : err.message || `Unable to connect to ${wallet.name}.`;
      setError(message);
    } finally {
      setConnectingWalletId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030303] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#111] via-[#030303] to-[#030303]">
      <div className="relative flex w-full max-w-md flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.02] p-10 text-center backdrop-blur-xl">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-synapse-cyan/10">
          <Shield size={40} className="text-synapse-cyan" />
        </div>
        
        <h1 className="mb-2 font-serif text-3xl font-bold tracking-tight text-white">Choose Your Wallet</h1>
        <p className="mb-8 text-sm text-neutral-400">
          Select a wallet and sign a message to log in. It will never be used for eligibility checks, minting, or scheduling unless you separately import it in Wallet Manager.
        </p>

        {error && (
          <div className="mb-6 flex w-full items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-left text-sm text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="break-words">{error}</p>
          </div>
        )}

        <div className="w-full space-y-3">
          {wallets.map((wallet) => {
            const isConnecting = connectingWalletId === wallet.id;
            return (
              <button
                key={wallet.id}
                onClick={() => connectWallet(wallet)}
                disabled={connectingWalletId !== null}
                className="group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-white px-5 py-4 text-left font-mono text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-100 disabled:opacity-50 disabled:hover:scale-100"
              >
                {isConnecting ? (
                  <Loader2 size={20} className="animate-spin shrink-0" />
                ) : wallet.icon ? (
                  <img src={wallet.icon} alt="" className="h-6 w-6 rounded-md shrink-0" />
                ) : (
                  <Fingerprint size={20} className="shrink-0 transition-transform group-hover:scale-110" />
                )}
                <span className="flex-1">{isConnecting ? `CONNECTING ${wallet.name.toUpperCase()}...` : wallet.name.toUpperCase()}</span>
              </button>
            );
          })}

          {wallets.length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-neutral-400">
              No Ethereum wallets detected. Install or unlock MetaMask, Phantom, or another browser wallet, then refresh the list.
            </div>
          )}

          <button
            type="button"
            onClick={requestWalletDiscovery}
            disabled={connectingWalletId !== null}
            className="mx-auto flex items-center justify-center gap-2 px-3 py-2 font-mono text-xs text-neutral-500 transition-colors hover:text-white disabled:opacity-50"
          >
            <RefreshCw size={13} />
            REFRESH WALLET LIST
          </button>
        </div>

        <p className="mt-6 text-xs text-neutral-500">
          This request will not trigger a blockchain transaction or cost any gas fees.
        </p>
      </div>
    </div>
  );
};
