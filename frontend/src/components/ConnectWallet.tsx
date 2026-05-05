'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-400 font-mono">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:border-red-500 hover:text-red-400 transition-colors"
        >
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      disabled={isPending}
      className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
