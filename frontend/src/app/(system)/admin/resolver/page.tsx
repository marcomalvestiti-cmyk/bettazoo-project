'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ESCROW_ABI } from '@/lib/abis'
import { useEvents } from '@/lib/useEvents'
import { fetchOracleEvents } from '@/lib/api'
import ConnectWallet from '@/components/ConnectWallet'
import AdminGate from '@/components/AdminGate'
import { withGasBuffer } from '@/lib/gasUtils'

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '') as `0x${string}`

const OUTCOME_LABELS: Record<number, string> = {
  0: 'Home Win',
  1: 'Draw',
  2: 'Away Win',
}

const OUTCOME_COLORS: Record<number, string> = {
  0: 'bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900',
  1: 'bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:bg-amber-900',
  2: 'bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900',
}

const OUTCOME_BADGE: Record<number, string> = {
  0: 'bg-blue-900/40 text-blue-300 border-blue-800',
  1: 'bg-amber-900/40 text-amber-300 border-amber-800',
  2: 'bg-rose-900/40 text-rose-300 border-rose-800',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ' ' +
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  )
}

function shortError(msg: string): string {
  // Surface the revert reason if present, otherwise first line
  const revert = msg.match(/reverted with reason string '(.+?)'/)?.[1]
  if (revert) return revert
  return msg.split('\n')[0].slice(0, 120)
}

export default function AdminResolverPage() {
  const { events } = useEvents()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const {
    writeContract,
    data: txHash,
    isPending: isSigningTx,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash })

  const [resolvedMap, setResolvedMap] = useState<Record<string, number>>({})
  const [pendingEvent, setPendingEvent] = useState<{ eventId: string; outcome: number } | null>(null)

  // Real resolved state (backend, itself synced from the on-chain EventResolved log —
  // see web3Listener.js), not just this session's memory. Without this, reloading the
  // page made an already-resolved event show up under "Pending" again — a second
  // resolve attempt would revert harmlessly ("Already resolved"), but it's confusing
  // and wastes gas on a wallet signature for nothing.
  useEffect(() => {
    fetchOracleEvents().then(list => {
      const real: Record<string, number> = {}
      for (const e of list) {
        if (e.resolved && e.winningOutcome !== undefined) real[e.eventId] = e.winningOutcome
      }
      // Merge under any optimistic update already in state from a resolve made
      // earlier in this same session, in case this fetch raced ahead of the
      // backend's own indexing of that same event.
      setResolvedMap(prev => ({ ...real, ...prev }))
    }).catch(() => { /* stay with whatever's in session state */ })
  }, [])

  // Mark resolved once the tx is confirmed on-chain
  useEffect(() => {
    if (isConfirmed && pendingEvent) {
      setResolvedMap(m => ({ ...m, [pendingEvent.eventId]: pendingEvent.outcome }))
      setPendingEvent(null)
    }
  }, [isConfirmed]) // eslint-disable-line react-hooks/exhaustive-deps

  // Clear pending event if the wallet write errored (user rejected, revert, etc.)
  useEffect(() => {
    if (writeError) setPendingEvent(null)
  }, [writeError])

  async function resolve(eventId: string, outcome: number) {
    resetWrite()
    setPendingEvent({ eventId, outcome })
    const gas = await withGasBuffer(publicClient)
    writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'resolveEvent',
      args: [eventId, outcome],
      ...gas,
    })
  }

  const pending  = events.filter(e => !(e.eventId in resolvedMap))
  const resolved = events.filter(e =>   e.eventId in resolvedMap)
  const isBusy   = isSigningTx || isConfirming

  return (
    <AdminGate>
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">Admin Panel</p>
        <h1 className="text-3xl font-bold text-white">Oracle Resolver</h1>
        <p className="text-sm text-slate-400">
          Calls{' '}
          <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
            resolveEvent()
          </code>{' '}
          directly on-chain from your connected wallet.
          Your wallet must be the <span className="text-white font-medium">Oracle address</span> set in the contract.
        </p>
      </div>

      {/* Wallet status card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Connected Wallet</p>
          {isConnected
            ? <p className="text-sm font-mono text-emerald-400 truncate">{address}</p>
            : <p className="text-sm text-slate-400">Connect your oracle wallet to resolve events.</p>
          }
        </div>
        <div className="shrink-0">
          <ConnectWallet />
        </div>
      </div>

      {/* TX status banner */}
      {txHash && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between gap-4 ${
          isConfirming
            ? 'border-amber-800 bg-amber-900/20 text-amber-300'
            : 'border-emerald-800 bg-emerald-900/20 text-emerald-300'
        }`}>
          <span>
            {isConfirming ? '⏳ Waiting for on-chain confirmation…' : '✓ Transaction confirmed!'}
          </span>
          <a
            href={`https://sepolia.arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline opacity-75 hover:opacity-100 shrink-0"
          >
            View on Arbiscan ↗
          </a>
        </div>
      )}

      {/* Write error banner */}
      {writeError && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 text-red-300 px-4 py-3 text-sm">
          ✗ {shortError(writeError.message)}
        </div>
      )}

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Events', value: events.length, color: 'text-white'       },
          { label: 'Pending',      value: pending.length,     color: 'text-amber-400'   },
          { label: 'Resolved',     value: resolved.length,    color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending events */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
          Pending — awaiting resolution
        </h2>

        {pending.length === 0 && (
          <p className="text-sm text-emerald-400 py-4">All events have been resolved.</p>
        )}

        <div className="space-y-2">
          {pending.map(ev => {
            const isThisResolving =
              pendingEvent?.eventId === ev.eventId && isBusy
            const isOtherResolving =
              pendingEvent?.eventId !== ev.eventId && isBusy

            return (
              <div
                key={ev.eventId}
                className={`bg-slate-900 border rounded-lg p-4 transition-opacity ${
                  isOtherResolving ? 'border-slate-800 opacity-40' : 'border-slate-800'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">

                  {/* Event info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xl shrink-0">{ev.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm leading-tight">{ev.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="text-[#FFB01F]">{ev.sportLabel}</span>
                        {' · '}{ev.leagueLabel}
                        {' · '}{formatTime(ev.startTime)}
                      </p>
                    </div>
                  </div>

                  {/* Resolve buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {ev.teams.map((team, idx) => {
                      const outcome = idx === 0 ? 0 : 2
                      const isThisBtn = isThisResolving && pendingEvent?.outcome === outcome
                      return (
                        <button
                          key={team}
                          disabled={!isConnected || isBusy}
                          onClick={() => resolve(ev.eventId, outcome)}
                          className={`px-3 py-1.5 rounded text-xs font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${OUTCOME_COLORS[outcome]}`}
                        >
                          {isThisBtn
                            ? (isSigningTx ? 'Sign in wallet…' : '⏳ Confirming…')
                            : `Win: ${team}`}
                        </button>
                      )
                    })}
                    {/* Draw only for sports with 3 outcomes (not tennis) */}
                    {ev.teams.length === 2 && ev.sport !== 'tennis' && (
                      <button
                        disabled={!isConnected || isBusy}
                        onClick={() => resolve(ev.eventId, 1)}
                        className={`px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${OUTCOME_COLORS[1]}`}
                      >
                        {isThisResolving && pendingEvent?.outcome === 1
                          ? (isSigningTx ? 'Sign in wallet…' : '⏳ Confirming…')
                          : 'Draw'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Not connected hint */}
                {!isConnected && (
                  <p className="text-xs text-slate-500 mt-2">Connect wallet to resolve.</p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Resolved events */}
      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
            Resolved
          </h2>
          <div className="space-y-2">
            {resolved.map(ev => {
              const outcome = resolvedMap[ev.eventId]
              return (
                <div
                  key={ev.eventId}
                  className="bg-slate-950 border border-slate-800/50 rounded-lg px-4 py-3 flex items-center gap-3 opacity-70"
                >
                  <span className="text-lg shrink-0">{ev.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300 font-medium">{ev.name}</p>
                    <p className="text-xs text-slate-600">{ev.leagueLabel}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${OUTCOME_BADGE[outcome]}`}>
                    {OUTCOME_LABELS[outcome]}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
    </AdminGate>
  )
}
