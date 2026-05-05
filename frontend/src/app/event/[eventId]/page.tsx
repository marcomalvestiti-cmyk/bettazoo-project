'use client'

import { useState } from 'react'
import { use } from 'react'
import { useAccount } from 'wagmi'
import OrderBook, { type Offer } from '@/components/OrderBook'
import BetForm from '@/components/BetForm'
import { MOCK_EVENTS } from '@/lib/abis'
import Link from 'next/link'

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = use(params)
  const { isConnected } = useAccount()
  const [selectedOffers, setSelectedOffers] = useState<Offer[] | null>(null)
  const [pendingStake, setPendingStake] = useState(0)

  const event = MOCK_EVENTS.find((e) => e.eventId === eventId)

  function handleSelectOffers(offers: Offer[], stake: number) {
    setSelectedOffers(offers)
    setPendingStake(stake)
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-6">
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-300 transition-colors">Exchange</Link>
        <span>/</span>
        <span className="text-zinc-300">{event?.name ?? eventId}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-zinc-100">{event?.name ?? eventId}</h1>
        {event && (
          <div className="flex gap-2 mt-2">
            {event.teams.map((t) => (
              <span key={t} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{t}</span>
            ))}
          </div>
        )}
      </div>

      {!isConnected && (
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-3 text-sm text-zinc-400">
          Connetti il wallet per scommettere.
        </div>
      )}

      <OrderBook
        eventId={eventId}
        onSelectOffers={isConnected ? handleSelectOffers : undefined}
      />

      {selectedOffers && (
        <BetForm
          offers={selectedOffers}
          stakeUsdt={pendingStake}
          onClose={() => setSelectedOffers(null)}
        />
      )}
    </div>
  )
}
