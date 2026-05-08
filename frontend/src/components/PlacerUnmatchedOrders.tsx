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
    return <div className="text-slate-500 text-xs py-4 text-center">Loading…</div>
  }
  if (offers.length === 0) {
    return <div className="text-slate-600 text-xs py-4 text-center">No open offers</div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500 border-b border-slate-700">
            <th className="pb-2 text-left font-medium">#</th>
            <th className="pb-2 text-left font-medium">Event</th>
            <th className="pb-2 text-left font-medium">Outcome</th>
            <th className="pb-2 text-right font-medium">Odds</th>
            <th className="pb-2 text-right font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {offers.map((o) => (
            <tr key={o.offerId} className="text-slate-300 hover:bg-slate-700/30 transition-colors">
              <td className="py-2 font-mono text-slate-500">#{o.offerId}</td>
              <td className="py-2 truncate max-w-[110px] text-slate-400">
                {MOCK_EVENTS.find((e) => e.eventId === o.eventId)?.name ?? o.eventId}
              </td>
              <td className="py-2">
                <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                  {OUTCOMES[o.outcome] ?? o.outcome}
                </span>
              </td>
              <td className="py-2 text-right font-mono font-semibold text-red-500">
                {o.oddsDecimal.toFixed(2)}x
              </td>
              <td className="py-2 text-right font-mono text-slate-300">
                ${parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
