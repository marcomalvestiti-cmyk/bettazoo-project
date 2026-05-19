'use client'

import Link from 'next/link'
import { useEffect, useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { fetchOrderBook } from '@/lib/api'
import { ESCROW_ABI, MOCK_EVENTS, OUTCOMES } from '@/lib/abis'
import { withGasBuffer } from '@/lib/gasUtils'

export type Offer = {
  offerId:               number
  placer:                string
  eventId:               string
  outcome:               number
  oddsDecimal:           number
  remainingLiabilityUsdt: string
  maxBettorStakeUsdt:    string
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`

interface Props {
  offers?:    Offer[]
  onRefresh?: () => void
}

export default function MyOffers({ offers: externalOffers, onRefresh }: Props) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [internalOffers, setInternalOffers] = useState<Offer[]>([])
  const [loading,    setLoading]    = useState(!externalOffers)
  const [cancelling, setCancelling] = useState<number | null>(null)
  const [error,      setError]      = useState('')

  const offers = externalOffers ?? internalOffers

  const loadOffers = useCallback(async () => {
    if (!address || externalOffers !== undefined) return
    setLoading(true)
    try {
      const all: Offer[] = []
      for (const event of MOCK_EVENTS) {
        const data = await fetchOrderBook(event.eventId)
        const mine = (data.orders as Offer[]).filter(
          (o) => o.placer.toLowerCase() === address.toLowerCase()
        )
        all.push(...mine)
      }
      setInternalOffers(all)
    } catch {
      setInternalOffers([])
    } finally {
      setLoading(false)
    }
  }, [address, externalOffers])

  useEffect(() => { loadOffers() }, [loadOffers])

  async function handleCancel(offerId: number) {
    setCancelling(offerId)
    setError('')
    try {
      const gas = await withGasBuffer(publicClient)
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'cancelOffer',
        args: [BigInt(offerId)],
        ...gas,
      })
      if (onRefresh) onRefresh()
      else await loadOffers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cancellation error')
    } finally {
      setCancelling(null)
    }
  }

  if (!address) return null

  return (
    <div className="bg-slate-900/60 border border-blue-500/20 shadow-md shadow-blue-900/10 rounded-xl p-5 space-y-4">

      {/* ── Section header ── */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-white">My Active Offers</h2>
        {!loading && (
          <span className={`px-2.5 py-0.5 text-sm font-bold rounded-full border ${
            offers.length > 0
              ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}>
            {offers.length}
          </span>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="ml-auto text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ↻ Refresh
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{error}</p>
      )}

      {/* ── Loading skeleton ── */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-[88px] rounded-xl bg-slate-800/50 border border-slate-700/40 animate-pulse" />
          ))}
        </div>

      /* ── Empty state ── */
      ) : offers.length === 0 ? (
        <div className="flex items-center gap-4 py-2">
          <span className="text-2xl select-none">📭</span>
          <div>
            <p className="text-sm font-semibold text-slate-400">No active offers yet</p>
            <p className="text-xs text-slate-600">Create your first offer using the form below.</p>
          </div>
          <Link
            href="/bet"
            className="ml-auto text-xs font-semibold text-amber-400 border border-[#FFB01F]/30 bg-[#FFB01F]/8 hover:bg-[#FFB01F]/15 px-3 py-1.5 rounded-md transition-colors whitespace-nowrap"
          >
            View All Bets →
          </Link>
        </div>

      /* ── Offer cards grouped by event ── */
      ) : (
        <div className="space-y-5">
          {(() => {
            // Group offers by eventId to show multi-outcome positions clustered together
            const grouped = offers.reduce((acc, o) => {
              if (!acc.has(o.eventId)) acc.set(o.eventId, [])
              acc.get(o.eventId)!.push(o)
              return acc
            }, new Map<string, Offer[]>())

            return [...grouped.entries()].map(([eventId, eventOffers]) => {
              const event = MOCK_EVENTS.find(e => e.eventId === eventId)
              const multiPosition = eventOffers.length > 1

              return (
                <div key={eventId} className="space-y-2">
                  {/* Group header — shown only when placer has multiple outcomes on the same event */}
                  {multiPosition && (
                    <div className="flex items-center gap-2 px-1 pb-2 border-b border-slate-800">
                      {event?.icon && <span className="text-base">{event.icon}</span>}
                      <span className="text-xs font-bold text-slate-300 truncate">{event?.name ?? eventId}</span>
                      <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500">
                        {eventOffers.length} positions
                      </span>
                    </div>
                  )}

                  {/* Cards — 2-col on lg+ when multiple positions, full-width otherwise */}
                  <div className={`grid gap-3 ${multiPosition ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
                    {eventOffers.map((o) => (
                      <div
                        key={o.offerId}
                        className="rounded-xl bg-slate-950/70 border border-slate-700/60 hover:border-slate-600/80 transition-colors overflow-hidden"
                      >
                        {/* Card header */}
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs font-mono text-slate-600">#{o.offerId}</span>
                            {!multiPosition && (
                              <span className="text-sm font-semibold text-slate-200 truncate">
                                {event?.name ?? o.eventId}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0 ml-2">
                            ACTIVE
                          </span>
                        </div>

                        {/* Card body — 3 key metrics + cancel */}
                        <div className="px-4 py-3 flex items-center gap-4 flex-wrap">

                          {/* Outcome */}
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Outcome</p>
                            <p className="text-sm font-semibold text-slate-300">{OUTCOMES[o.outcome] ?? o.outcome}</p>
                          </div>

                          <div className="w-px h-9 bg-slate-800 self-stretch" />

                          {/* Odds — hero metric */}
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Odds</p>
                            <p className="text-xl font-bold font-mono text-[#FFB01F] leading-none">
                              {o.oddsDecimal.toFixed(2)}<span className="text-sm text-[#FFB01F]/60">x</span>
                            </p>
                          </div>

                          <div className="w-px h-9 bg-slate-800 self-stretch" />

                          {/* Liability */}
                          <div className="space-y-0.5">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Liability</p>
                            <p className="text-lg font-bold font-mono text-slate-200 leading-none">
                              {o.remainingLiabilityUsdt}
                              <span className="text-xs text-slate-500 ml-1">USDT</span>
                            </p>
                          </div>

                          <div className="flex-1" />

                          {/* Cancel */}
                          <button
                            onClick={() => handleCancel(o.offerId)}
                            disabled={cancelling === o.offerId}
                            className="shrink-0 px-4 py-2 text-xs font-bold rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:border-red-500/50 hover:text-red-300 disabled:opacity-50 transition-all whitespace-nowrap"
                          >
                            {cancelling === o.offerId ? (
                              <span className="flex items-center gap-1.5">
                                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Cancelling…
                              </span>
                            ) : 'Cancel Offer'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}
    </div>
  )
}
