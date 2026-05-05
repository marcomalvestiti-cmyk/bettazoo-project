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
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-300 transition-colors">Exchange</Link>
        <span className="text-slate-700">/</span>
        <span className="text-slate-300">{event?.name ?? eventId}</span>
      </div>

      {/* Event header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl px-5 py-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
            {event?.sport ?? 'sport'}
          </span>
          <h1 className="text-xl font-bold text-white">{event?.name ?? eventId}</h1>
          {event && (
            <div className="flex gap-1.5">
              {event.teams.map((t) => (
                <span key={t} className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-md">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="hidden sm:flex flex-col items-end text-xs text-slate-500">
          {event && (
            <>
              <span>{new Date(event.startTime).toLocaleDateString('it-IT')}</span>
              <span>{new Date(event.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 border border-slate-700 px-4 py-3 text-sm text-slate-400">
          <span className="text-yellow-400">⚠</span>
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
