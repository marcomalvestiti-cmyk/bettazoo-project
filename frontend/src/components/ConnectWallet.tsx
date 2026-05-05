'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700">
          <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80]" />
          <span className="text-xs text-slate-300 font-mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-400 hover:border-red-500/60 hover:text-red-400 transition-colors"
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
      className="px-4 py-2 text-sm font-semibold rounded-lg bg-green-500 hover:bg-green-400 text-slate-900 disabled:opacity-50 transition-colors shadow-[0_0_12px_rgba(74,222,128,0.3)]"
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
