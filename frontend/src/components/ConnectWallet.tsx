'use client'

import { useAccount, useConnect, useDisconnect } from 'wagmi'

export default function ConnectWallet() {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md">
          <span className="w-2 h-2 rounded-full bg-purple-400 shadow-[0_0_6px_#c084fc] shrink-0" />
          <span className="text-xs text-zinc-300 font-mono">
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        </div>
        <button
          onClick={() => disconnect()}
          className="px-3 py-1.5 text-xs rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md text-zinc-400 hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5 transition-all"
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
      className="
        relative px-5 py-2 text-sm font-bold rounded-2xl overflow-hidden
        bg-gradient-to-br from-purple-500/30 via-fuchsia-500/15 to-[#313338]/0
        border border-purple-500/40 hover:border-purple-400/70
        border-b-4 border-b-purple-900
        text-purple-300 hover:text-white
        backdrop-blur-sm
        shadow-[0_0_20px_rgba(168,85,247,0.15),inset_0_1px_0_rgba(255,255,255,0.06)]
        hover:shadow-[0_0_28px_rgba(168,85,247,0.35),inset_0_1px_0_rgba(255,255,255,0.1)]
        active:border-b-0 active:translate-y-1
        disabled:opacity-50 disabled:border-b-0 disabled:translate-y-0
        transition-all duration-75
      "
    >
      {isPending ? 'Connecting…' : 'Connect Wallet'}
    </button>
  )
}
