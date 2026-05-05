'use client'

import { useEffect, useState } from 'react'
import { fetchOrderBook } from '@/lib/api'
import { MOCK_EVENTS, OUTCOMES } from '@/lib/abis'

type Offer = {
  offerId: number
  placer: string
  eventId: string
  outcome: number
  oddsDecimal: number
  remainingLiabilityUsdt: string
}

export default function PlacerUnmatchedOrders({ address }: { address: string }) {
  const [offers, setOffers] = useState<Offer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
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
    load()
  }, [address])

  if (loading) {
    return <div className="text-zinc-500 text-xs py-4 text-center">Caricamento…</div>
  }

  if (offers.length === 0) {
    return <div className="text-zinc-600 text-xs py-4 text-center">Nessuna offerta aperta</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500 border-b border-zinc-800">
            <th className="pb-2 text-left font-medium">#</th>
            <th className="pb-2 text-left font-medium">Evento</th>
            <th className="pb-2 text-left font-medium">Esito</th>
            <th className="pb-2 text-right font-medium">Quota</th>
            <th className="pb-2 text-right font-medium">Residua (USDT)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {offers.map((o) => (
            <tr key={o.offerId} className="text-zinc-300 hover:bg-zinc-800/30 transition-colors">
              <td className="py-2 font-mono text-zinc-500">#{o.offerId}</td>
              <td className="py-2 truncate max-w-[120px]">
                {MOCK_EVENTS.find((e) => e.eventId === o.eventId)?.name ?? o.eventId}
              </td>
              <td className="py-2">
                <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {OUTCOMES[o.outcome] ?? o.outcome}
                </span>
              </td>
              <td className="py-2 text-right font-mono text-emerald-400">
                {o.oddsDecimal.toFixed(2)}x
              </td>
              <td className="py-2 text-right font-mono">
                {parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
