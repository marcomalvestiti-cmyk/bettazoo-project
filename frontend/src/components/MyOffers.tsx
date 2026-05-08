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
      setError(err instanceof Error ? err.message : 'Errore cancellazione')
    } finally {
      setCancelling(null)
    }
  }

  if (!address) return null
  if (loading) return (
    <div className="text-zinc-500 text-xs py-3">Caricamento offerte…</div>
  )
  if (offers.length === 0) return (
    <div className="text-zinc-600 text-xs py-3">Nessuna offerta attiva</div>
  )

  return (
    <div className="bg-[#141419] border border-zinc-800 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-extrabold text-white">Le mie offerte attive</h3>
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{error}</p>
      )}
      <div className="space-y-2">
        {offers.map((o) => (
          <div
            key={o.offerId}
            className="flex items-center justify-between rounded-2xl bg-[#0f0f16]/60 border border-zinc-800 px-3 py-2.5"
          >
            <div className="text-xs space-y-0.5">
              <div className="text-zinc-200 font-mono font-bold">
                #{o.offerId} · {MOCK_EVENTS.find(e => e.eventId === o.eventId)?.name ?? o.eventId}
              </div>
              <div className="text-zinc-500">
                {OUTCOMES[o.outcome] ?? o.outcome} ·{' '}
                <span className="text-[#e05555] font-extrabold">{o.oddsDecimal.toFixed(2)}x</span>
              </div>
              <div className="text-zinc-500">
                Residua: <span className="font-extrabold font-mono text-zinc-300">{o.remainingLiabilityUsdt} USDT</span>
              </div>
            </div>
            <button
              onClick={() => handleCancel(o.offerId)}
              disabled={cancelling === o.offerId}
              className="ml-3 px-3 py-1.5 text-xs font-bold rounded-xl border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
            >
              {cancelling === o.offerId ? 'Annullamento…' : 'Cancella'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
