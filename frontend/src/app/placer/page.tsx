'use client'

import { useAccount } from 'wagmi'
import CreateOfferForm from '@/components/CreateOfferForm'
import RiskWidget from '@/components/RiskWidget'
import OrderBook from '@/components/OrderBook'
import MyOffers from '@/components/MyOffers'
import { MOCK_EVENTS } from '@/lib/abis'
import { useState } from 'react'
import Link from 'next/link'

export default function PlacerDashboard() {
  const { address, isConnected } = useAccount()
  const [selectedEvent, setSelectedEvent] = useState(MOCK_EVENTS[0].eventId)

  const event = MOCK_EVENTS.find((e) => e.eventId === selectedEvent)!

  if (!isConnected || !address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-200 mb-3">Placer Dashboard</h1>
        <p className="text-zinc-400 mb-6">Connetti il wallet per accedere alla dashboard.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Placer Dashboard</h1>
          <p className="text-xs text-zinc-500 mt-1 font-mono">{address}</p>
        </div>
        <Link
          href={`/placer/${address}`}
          className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          Il tuo profilo streaming →
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: create offer + event selector */}
        <div className="lg:col-span-1 space-y-4">
          {/* Event selector */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <label className="text-xs text-zinc-400">Seleziona evento</label>
            <div className="space-y-1">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e.eventId)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedEvent === e.eventId
                      ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800'
                      : 'text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>

          <CreateOfferForm
            eventId={selectedEvent}
            eventName={event.name}
            teams={event.teams}
          />

          <RiskWidget address={address} />
          <MyOffers />
        </div>

        {/* Right: order book for the selected event */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-zinc-200">
            Order Book — {event.name}
          </h2>
          <OrderBook eventId={selectedEvent} />
        </div>
      </div>
    </div>
  )
}
