'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { X, ChevronDown } from 'lucide-react'

// ── Wallet display metadata keyed by connector.id ────────────────────────────
const WALLET_META: Record<string, { name: string; icon: string; sub?: string }> = {
  injected:      { name: 'Browser Wallet', icon: '🌐', sub: 'MetaMask · Brave · any injected wallet' },
  walletConnect: { name: 'WalletConnect',  icon: '🔗', sub: 'All mobile wallets · QR code on desktop' },
  coinbaseWallet:{ name: 'Coinbase Wallet',icon: '🔵', sub: 'Coinbase Wallet app · smart accounts' },
  metaMask:      { name: 'MetaMask',       icon: '🦊', sub: 'MetaMask browser extension' },
  safe:          { name: 'Safe',           icon: '🛡️', sub: 'Safe multi-sig wallet' },
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export default function ConnectWallet() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  const [modalOpen, setModalOpen]       = useState(false)
  const [pendingId, setPendingId]       = useState<string | null>(null)
  const [showDisconnect, setShowDisconnect] = useState(false)

  const wrongNetwork = isConnected && chain?.id !== arbitrumSepolia.id

  // ── Connected state ──────────────────────────────────────────────────────────
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2">

        {/* Wrong-network banner */}
        {wrongNetwork && (
          <button
            onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
            disabled={isSwitching}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60 transition-colors whitespace-nowrap"
          >
            {isSwitching ? 'Switching…' : '⚠ Switch to Arbitrum Sepolia'}
          </button>
        )}

        {/* Address chip — tap to open disconnect menu */}
        <div className="relative">
          <button
            onClick={() => setShowDisconnect(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors ${
              wrongNetwork
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                : 'bg-[#B31A1A]/10 border-[#B31A1A]/30 text-slate-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full shrink-0 ${wrongNetwork ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
            <span className="text-xs font-mono">{shortAddress(address)}</span>
            <ChevronDown
              size={11}
              className={`shrink-0 text-slate-500 transition-transform duration-200 ${showDisconnect ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown */}
          {showDisconnect && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDisconnect(false)} />
              <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
                {wrongNetwork && (
                  <button
                    onClick={() => { switchChain({ chainId: arbitrumSepolia.id }); setShowDisconnect(false) }}
                    disabled={isSwitching}
                    className="w-full px-4 py-3 text-left text-xs font-semibold text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 border-b border-slate-800 transition-colors"
                  >
                    {isSwitching ? '⏳ Switching…' : '⚠ Switch to Arbitrum Sepolia'}
                  </button>
                )}
                <div className="px-4 py-2 border-b border-slate-800">
                  <p className="text-[10px] text-slate-600 font-mono">{address}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {chain ? chain.name : 'Unknown network'}
                  </p>
                </div>
                <button
                  onClick={() => { disconnect(); setShowDisconnect(false) }}
                  className="w-full px-4 py-3 text-left text-xs font-semibold text-red-400 hover:bg-[#B31A1A]/10 transition-colors"
                >
                  Disconnect wallet
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Disconnected state ───────────────────────────────────────────────────────
  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        disabled={isPending}
        className="px-5 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Connecting…' : 'Connect Wallet'}
      </button>

      {/* ── Wallet select modal ──────────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Connect wallet"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Panel — bottom sheet on mobile, centered card on ≥sm */}
          <div className="relative w-full sm:w-[400px] bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-xl shadow-2xl">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div>
                <h2 className="text-base font-bold text-white">Connect Wallet</h2>
                <p className="text-[10px] text-slate-500 mt-0.5">Arbitrum Sepolia testnet</p>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-md text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Wallet list */}
            <div className="p-3 space-y-2">
              {connectors.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6">
                  No wallets available in this browser.
                </p>
              )}
              {connectors.map((connector) => {
                const meta  = WALLET_META[connector.id] ?? { name: connector.name, icon: '💼' }
                const isThis = pendingId === connector.uid

                return (
                  <button
                    key={connector.uid}
                    onClick={() => {
                      setPendingId(connector.uid)
                      connect(
                        { connector },
                        {
                          onSettled: () => setPendingId(null),
                          onSuccess: () => setModalOpen(false),
                        },
                      )
                    }}
                    disabled={isPending}
                    className="w-full flex items-center gap-4 px-4 py-3.5 rounded-lg bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 hover:border-slate-500 text-left transition-colors group disabled:opacity-60"
                  >
                    <span className="text-2xl select-none w-9 text-center shrink-0" aria-hidden>
                      {meta.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">{meta.name}</p>
                      {meta.sub && (
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{meta.sub}</p>
                      )}
                    </div>
                    {isThis ? (
                      <svg className="w-4 h-4 animate-spin text-red-500 shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-lg shrink-0">→</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Error */}
            {connectError && (
              <p className="mx-3 mb-2 px-4 py-2.5 rounded-lg text-xs text-red-400 bg-red-400/10 border border-red-400/20">
                {connectError.message.length > 120
                  ? connectError.message.slice(0, 120) + '…'
                  : connectError.message}
              </p>
            )}

            {/* Footer */}
            <div className="px-5 pb-5 pt-2">
              <p className="text-[10px] text-slate-600 text-center leading-relaxed">
                By connecting you accept our{' '}
                <a href="/rules" className="text-slate-500 hover:text-slate-400 underline underline-offset-2" onClick={() => setModalOpen(false)}>
                  platform rules
                </a>.
                Your keys stay in your wallet — we never hold funds.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
