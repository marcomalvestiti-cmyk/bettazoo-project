'use client'

import { useAccount } from 'wagmi'
import CreateOfferForm from '@/components/CreateOfferForm'
import RiskWidget from '@/components/RiskWidget'
import OrderBook from '@/components/OrderBook'
import MyOffers from '@/components/MyOffers'
import ProfileEditor from '@/components/ProfileEditor'
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
        <div className="w-12 h-12 rounded-lg bg-[#B31A1A]/10 border border-[#B31A1A]/30 flex items-center justify-center mx-auto text-2xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold text-white">Placer Dashboard</h1>
        <p className="text-slate-400">Connect your wallet to access the dashboard.</p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-sm font-semibold text-red-500 uppercase tracking-widest">Placer</p>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-xs text-slate-500 font-mono truncate max-w-[200px] sm:max-w-none">{address}</p>
        </div>
        <Link
          href={`/placer/${address}`}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-red-500 border border-slate-700 hover:border-[#B31A1A]/50 px-3 py-2 rounded-md transition-colors shrink-0 whitespace-nowrap"
        >
          <span className="w-2 h-2 rounded-full bg-[#B31A1A] animate-pulse" />
          <span className="hidden sm:inline">Live Stream</span>
          <span>→</span>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: controls */}
        <div className="lg:col-span-1 space-y-4">

          <ProfileEditor address={address} />

          {/* Event selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
            <label className="text-xs text-slate-400 font-semibold uppercase tracking-wide">Select Event</label>
            <div className="space-y-1">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e.eventId)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    selectedEvent === e.eventId
                      ? 'bg-[#B31A1A]/10 text-red-500 border border-[#B31A1A]/40'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
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
            <h2 className="text-sm font-semibold text-white">Order Book</h2>
            <span className="text-xs font-medium text-slate-400 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded">
              {event.name}
            </span>
          </div>
          <OrderBook eventId={selectedEvent} />
        </div>
      </div>
    </div>
  )
}
