import { useState, useEffect } from 'react';
import { Shield, Fingerprint, Loader2, AlertCircle } from 'lucide-react';
import { BrowserProvider } from 'ethers';

interface WalletLoginProps {
  onLogin: (address: string) => void;
}

export const WalletLogin = ({ onLogin }: WalletLoginProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if wallet is already connected and token exists on mount
  useEffect(() => {
    const checkSession = async () => {
      const token = localStorage.getItem('auth_token');
      const address = localStorage.getItem('auth_address');
      
      if (token && address) {
        // Quick session check (could validate with backend in a real scenario)
        onLogin(address);
      }
    };
    checkSession();
  }, [onLogin]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError("No Web3 provider found. Please install MetaMask or another Web3 wallet.");
      console.error("Wallet Login Error: No Web3 provider (window.ethereum) found.");
      return;
    }

    try {
      setIsConnecting(true);
      setError(null);

      const provider = new BrowserProvider(window.ethereum);
      
      // Request accounts
      const accounts = await provider.send("eth_requestAccounts", []);
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from wallet.");
      }
      
      const address = accounts[0];
      const signer = await provider.getSigner();

      // 1. Fetch Nonce
      const nonceRes = await fetch(`/api/auth/nonce?address=${address}`);
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok) {
        throw new Error(nonceData.error || "Failed to fetch nonce");
      }

      // 2. Sign Message
      const message = `Sign this message to authenticate with SeaDrop Sniper.\n\nNonce: ${nonceData.nonce}`;
      const signature = await signer.signMessage(message);

      // 3. Verify Signature
      const verifyRes = await fetch(`/api/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature })
      });
      const verifyData = await verifyRes.json();

      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Signature verification failed");
      }

      if (verifyData.success) {
        // Save to local storage for session persistence
        localStorage.setItem('auth_token', verifyData.token);
        localStorage.setItem('auth_address', address);
        onLogin(address);
      }

    } catch (err: any) {
      console.error("Wallet Connection/Auth Error:", err);
      setError(err.message || "An unknown error occurred during authentication.");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#030303] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#111] via-[#030303] to-[#030303]">
      <div className="relative flex w-full max-w-md flex-col items-center justify-center rounded-[32px] border border-white/5 bg-white/[0.02] p-10 text-center backdrop-blur-xl">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-synapse-cyan/10">
          <Shield size={40} className="text-synapse-cyan" />
        </div>
        
        <h1 className="mb-2 font-serif text-3xl font-bold tracking-tight text-white">Security Checkpoint</h1>
        <p className="mb-10 text-sm text-neutral-400">
          Connect your Web3 wallet and sign the message to verify ownership and access the Sniper dashboard.
        </p>

        {error && (
          <div className="mb-6 flex w-full items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-left text-sm text-red-400">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <p className="break-words">{error}</p>
          </div>
        )}

        <button
          onClick={connectWallet}
          disabled={isConnecting}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-xl bg-white px-6 py-4 font-mono text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-100 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isConnecting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Fingerprint size={18} className="transition-transform group-hover:scale-110" />
          )}
          {isConnecting ? "AUTHENTICATING..." : "CONNECT & SIGN"}
        </button>

        <p className="mt-6 text-xs text-neutral-500">
          This request will not trigger a blockchain transaction or cost any gas fees.
        </p>
      </div>
    </div>
  );
};
