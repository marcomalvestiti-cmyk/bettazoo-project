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
  const [loading,     setLoading]     = useState(!externalOffers)
  const [cancelling,  setCancelling]  = useState<number | null>(null)
  const [error,       setError]       = useState('')

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
  if (loading) return <div className="text-slate-500 text-xs py-3">Loading offers…</div>
  if (offers.length === 0) return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center space-y-3">
      <div className="text-3xl select-none">📭</div>
      <p className="text-sm font-semibold text-slate-400">You haven&apos;t placed any bets yet.</p>
      <p className="text-xs text-slate-600">Create your first offer to start earning.</p>
      <Link
        href="/bet"
        className="inline-block px-4 py-2 text-xs font-semibold rounded-md bg-[#FFB01F]/10 border border-[#FFB01F]/30 text-amber-400 hover:bg-[#FFB01F]/20 transition-colors"
      >
        View All Bets →
      </Link>
    </div>
  )

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-bold text-white">My Active Offers</h3>
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{error}</p>
      )}
      <div className="space-y-2">
        {offers.map((o) => (
          <div
            key={o.offerId}
            className="flex items-center justify-between rounded-md bg-slate-950/60 border border-slate-800 px-3 py-2.5"
          >
            <div className="text-xs space-y-0.5 min-w-0 mr-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-slate-200 font-mono font-semibold truncate">
                  #{o.offerId} · {MOCK_EVENTS.find(e => e.eventId === o.eventId)?.name ?? o.eventId}
                </span>
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25 leading-none">
                  Active
                </span>
              </div>
              <div className="text-slate-500">
                {OUTCOMES[o.outcome] ?? o.outcome} ·{' '}
                <span className="text-[#FFB01F] font-bold">{o.oddsDecimal.toFixed(2)}x</span>
              </div>
              <div className="text-slate-500">
                Remaining: <span className="font-bold font-mono text-slate-300">{o.remainingLiabilityUsdt} USDT</span>
              </div>
            </div>
            <button
              onClick={() => handleCancel(o.offerId)}
              disabled={cancelling === o.offerId}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              {cancelling === o.offerId ? (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Cancelling…
                </span>
              ) : 'Cancel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
