'use client'

import { useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { X, ChevronDown, AlertTriangle } from 'lucide-react'

const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? ''

const WALLET_META: Record<string, { name: string; icon: string; sub: string }> = {
  injected:       { name: 'Browser Wallet',  icon: '🌐', sub: 'MetaMask · Brave · any injected wallet' },
  walletConnect:  { name: 'WalletConnect',   icon: '🔗', sub: 'All mobile wallets · QR code on desktop' },
  coinbaseWallet: { name: 'Coinbase Wallet', icon: '🔵', sub: 'Coinbase Wallet app' },
  metaMask:       { name: 'MetaMask',        icon: '🦊', sub: 'MetaMask browser extension' },
  safe:           { name: 'Safe',            icon: '🛡️', sub: 'Safe multi-sig wallet' },
}

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function ConnectedChip() {
  const { address, chain } = useAccount()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const [open, setOpen] = useState(false)

  if (!address) return null
  const wrongNet = chain?.id !== arbitrumSepolia.id

  return (
    <div className="flex items-center gap-2">
      {wrongNet && (
        <button
          onClick={() => switchChain({ chainId: arbitrumSepolia.id })}
          disabled={isSwitching}
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-amber-500/10 border border-amber-500/40 text-amber-400 hover:bg-amber-500/20 disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {isSwitching ? 'Switching…' : '⚠ Switch to Arb Sepolia'}
        </button>
      )}
      <div className="relative">
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition-colors ${
            wrongNet
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              : 'bg-[#B31A1A]/10 border-[#B31A1A]/30 text-slate-300'
          }`}
        >
          <span className={`w-2 h-2 rounded-full shrink-0 ${wrongNet ? 'bg-amber-400' : 'bg-red-500 animate-pulse'}`} />
          <span className="text-xs font-mono">{shortAddress(address)}</span>
          <ChevronDown size={11} className={`shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full mt-1.5 z-50 w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
              {wrongNet && (
                <button
                  onClick={() => { switchChain({ chainId: arbitrumSepolia.id }); setOpen(false) }}
                  disabled={isSwitching}
                  className="w-full px-4 py-3 text-left text-xs font-semibold text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 border-b border-slate-800 transition-colors"
                >
                  {isSwitching ? '⏳ Switching…' : '⚠ Switch to Arbitrum Sepolia'}
                </button>
              )}
              <div className="px-4 py-2.5 border-b border-slate-800 space-y-0.5">
                <p className="text-[10px] text-slate-500 font-mono break-all">{address}</p>
                <p className="text-[10px] text-slate-600">{chain?.name ?? 'Unknown network'}</p>
              </div>
              <button
                onClick={() => { disconnect(); setOpen(false) }}
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

export default function ConnectWallet() {
  const { isConnected } = useAccount()
  const { connect, connectors, isPending, error: connectError } = useConnect()
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)

  if (isConnected) return <ConnectedChip />

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        disabled={isPending}
        className="px-5 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-50 transition-colors"
      >
        {isPending ? 'Connecting…' : 'Connect Wallet'}
      </button>

      {modalOpen && (
        /*
         * Centered overlay on ALL screen sizes.
         * The previous bottom-sheet (items-end) caused wallet buttons to
         * be pushed above the viewport on small phones, leaving only the
         * footer text visible. A centered modal avoids all such issues.
         */
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* Panel — max-h + overflow-y-auto ensures wallet list is always scrollable */}
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden"
               style={{ maxHeight: 'min(90vh, 560px)' }}>

            {/* Scrollable inner content */}
            <div className="overflow-y-auto" style={{ maxHeight: 'min(90vh, 560px)' }}>

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                <div>
                  <h2 className="text-base font-bold text-white">Connect Wallet</h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">Arbitrum Sepolia (testnet)</p>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-2 rounded-md text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Project ID warning */}
              {!WC_PROJECT_ID && (
                <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-300 leading-relaxed">
                    <strong>WalletConnect disabled</strong> — env var not set. Mobile wallets unavailable.
                  </p>
                </div>
              )}

              {/* Wallet buttons — these are the FIRST thing visible after the header */}
              <div className="p-4 space-y-2">
                {connectors.length === 0 && (
                  <p className="text-sm text-slate-500 text-center py-8">
                    No wallets detected in this browser.
                  </p>
                )}
                {connectors.map((connector) => {
                  const meta   = WALLET_META[connector.id] ?? { name: connector.name, icon: '💼', sub: '' }
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
                      className="w-full flex items-center gap-3 px-4 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 hover:border-slate-500 text-left transition-colors group disabled:opacity-60"
                    >
                      <span className="text-2xl w-9 text-center shrink-0 select-none" aria-hidden>
                        {meta.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{meta.name}</p>
                        {meta.sub && (
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{meta.sub}</p>
                        )}
                      </div>
                      {isThis ? (
                        <svg className="w-4 h-4 animate-spin text-red-400 shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                      ) : (
                        <span className="text-slate-600 group-hover:text-slate-300 transition-colors text-lg">›</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Error */}
              {connectError && (
                <div className="mx-4 mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-400/10 border border-red-400/20">
                  <AlertTriangle size={13} className="text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400 leading-relaxed break-words">
                    {connectError.message.length > 140
                      ? connectError.message.slice(0, 140) + '…'
                      : connectError.message}
                  </p>
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  )
}
