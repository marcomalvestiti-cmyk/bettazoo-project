'use client'

import { useEffect, useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { fetchOrderBook } from '@/lib/api'
import { ESCROW_ABI, MOCK_EVENTS, OUTCOMES } from '@/lib/abis'

type Offer = {
  offerId: number
  placer: string
  eventId: string
  outcome: number
  oddsDecimal: number
  remainingLiabilityUsdt: string
  maxBettorStakeUsdt: string
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`

export default function MyOffers() {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<number | null>(null)
  const [error, setError] = useState('')

  async function loadOffers() {
    if (!address) return
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
      setOffers(all)
    } catch {
      setOffers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadOffers() }, [address])

  async function handleCancel(offerId: number) {
    setCancelling(offerId)
    setError('')
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'cancelOffer',
        args: [BigInt(offerId)],
      })
      await loadOffers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cancellation error')
    } finally {
      setCancelling(null)
    }
  }

  if (!address) return null
  if (loading) return (
    <div className="text-slate-500 text-xs py-3">Loading offers…</div>
  )
  if (offers.length === 0) return (
    <div className="text-slate-600 text-xs py-3">No active offers</div>
  )

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">My Active Offers</h3>
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{error}</p>
      )}
      <div className="space-y-2">
        {offers.map((o) => (
          <div
            key={o.offerId}
            className="flex items-center justify-between rounded-md bg-slate-950/60 border border-slate-800 px-3 py-2.5"
          >
            <div className="text-xs space-y-0.5">
              <div className="text-slate-200 font-mono font-semibold">
                #{o.offerId} · {MOCK_EVENTS.find(e => e.eventId === o.eventId)?.name ?? o.eventId}
              </div>
              <div className="text-slate-500">
                {OUTCOMES[o.outcome] ?? o.outcome} ·{' '}
                <span className="text-red-500 font-semibold">{o.oddsDecimal.toFixed(2)}x</span>
              </div>
              <div className="text-slate-500">
                Remaining: <span className="font-semibold font-mono text-slate-300">{o.remainingLiabilityUsdt} USDT</span>
              </div>
            </div>
            <button
              onClick={() => handleCancel(o.offerId)}
              disabled={cancelling === o.offerId}
              className="ml-3 px-3 py-1.5 text-xs font-medium rounded-md border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              {cancelling === o.offerId ? 'Cancelling…' : 'Cancel'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
