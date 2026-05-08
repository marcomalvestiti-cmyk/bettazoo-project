'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#B31A1A]/10 border border-[#B31A1A]/30">
          <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
          <span className="text-xs text-slate-300 font-mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs rounded-md border border-slate-700 bg-slate-900 text-slate-400 hover:border-[#B31A1A]/50 hover:text-red-500 hover:bg-[#B31A1A]/5 transition-colors"
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
      className="px-5 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
