"use client";

import { useState } from "react";
import { useWallet } from "@/contexts/WalletContext";

function truncateAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { publicKey, connect, disconnect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    try {
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {publicKey ? (
        <button
          type="button"
          onClick={disconnect}
          className="rounded-full border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:border-[var(--accent)]"
          title="Disconnect wallet"
        >
          {truncateAddress(publicKey)}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={isConnecting}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
      )}
      {error && <p className="max-w-64 text-xs text-red-300">{error}</p>}
    </div>
  );
}
