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

  useEffect(() => {
    loadOffers()
  }, [address])

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
      setError(err instanceof Error ? err.message : 'Errore cancellazione')
    } finally {
      setCancelling(null)
    }
  }

  if (!address) return null
  if (loading) return <div className="text-zinc-500 text-sm py-2">Caricamento offerte…</div>
  if (offers.length === 0) return (
    <div className="text-zinc-600 text-sm py-2">Nessuna offerta attiva</div>
  )

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-zinc-200">Le mie offerte attive</h3>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="space-y-2">
        {offers.map((o) => (
          <div
            key={o.offerId}
            className="flex items-center justify-between rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2"
          >
            <div className="text-xs space-y-0.5">
              <div className="text-zinc-300 font-mono">
                #{o.offerId} · {MOCK_EVENTS.find(e => e.eventId === o.eventId)?.name ?? o.eventId}
              </div>
              <div className="text-zinc-500">
                {OUTCOMES[o.outcome] ?? o.outcome} · {o.oddsDecimal.toFixed(2)}x
              </div>
              <div className="text-zinc-400">
                Residua: <span className="font-mono">{o.remainingLiabilityUsdt} USDT</span>
              </div>
            </div>
            <button
              onClick={() => handleCancel(o.offerId)}
              disabled={cancelling === o.offerId}
              className="ml-3 px-3 py-1.5 text-xs rounded-lg border border-red-800 text-red-400 hover:bg-red-950/30 disabled:opacity-50 transition-colors"
            >
              {cancelling === o.offerId ? 'Annullamento…' : 'Cancella'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
