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
      <div className="max-w-4xl mx-auto px-4 py-24 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mx-auto text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-extrabold text-white">Placer Dashboard</h1>
        <p className="text-zinc-400">Connetti il wallet per accedere alla dashboard.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Placer</p>
          <h1 className="text-2xl font-extrabold text-white">Dashboard</h1>
          <p className="text-xs text-zinc-500 font-mono truncate max-w-[200px] sm:max-w-none">{address}</p>
        </div>
        <Link
          href={`/placer/${address}`}
          className="flex items-center gap-1.5 text-sm font-bold text-zinc-400 hover:text-fuchsia-400 border border-zinc-700 hover:border-fuchsia-500/50 px-3 py-2.5 rounded-2xl transition-all shrink-0 whitespace-nowrap"
        >
          <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-pulse" />
          <span className="hidden sm:inline">Streaming live</span>
          <span>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: controls */}
        <div className="lg:col-span-1 space-y-4">

          {/* Event selector */}
          <div className="bg-[#313338] border border-zinc-700 rounded-2xl p-4 space-y-2">
            <label className="text-xs text-zinc-400 font-extrabold uppercase tracking-wide">Seleziona evento</label>
            <div className="space-y-1">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e.eventId)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedEvent === e.eventId
                      ? 'bg-purple-500/10 text-purple-400 border border-purple-500/40'
                      : 'text-zinc-400 hover:bg-[#383a40] hover:text-zinc-200'
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

        {/* Right: order book */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-white">Order Book</h2>
            <span className="text-xs font-bold text-zinc-400 bg-[#313338] border border-zinc-700 px-2 py-0.5 rounded-lg">
              {event.name}
            </span>
          </div>
          <OrderBook eventId={selectedEvent} />
        </div>
      </div>
    </div>
  )
}
