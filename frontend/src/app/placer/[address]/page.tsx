'use client'

import { use } from 'react'
import { MOCK_EVENTS } from '@/lib/abis'
import StreamPlayer from '@/components/StreamPlayer'
import LiveChat from '@/components/LiveChat'
import PlacerUnmatchedOrders from '@/components/PlacerUnmatchedOrders'
import { useState } from 'react'

export default function PlacerStreamPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const [selectedEvent, setSelectedEvent] = useState(MOCK_EVENTS[0])

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`

  return (
    <div className="max-w-6xl mx-auto px-4 py-10 space-y-8">
      {/* Header */}
      <div>
        <div className="text-xs text-emerald-400 uppercase tracking-widest mb-1">Placer</div>
        <h1 className="text-2xl font-bold text-zinc-100 font-mono">{shortAddr}</h1>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: stream + chat */}
        <div className="lg:col-span-2 space-y-4">
          <StreamPlayer
            teamA={selectedEvent.teams[0] ?? 'Home'}
            teamB={selectedEvent.teams[1] ?? 'Away'}
          />
          <LiveChat room={`placer-${address}`} />
        </div>

        {/* Right column: event selector + order book filtrato per placer */}
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-zinc-400">Quote esclusive di questo placer</p>
            <div className="space-y-1">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedEvent.eventId === e.eventId
                      ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800'
                      : 'text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-zinc-200">Offerte aperte</h3>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 border border-amber-800">
                Unmatched
              </span>
            </div>
            <PlacerUnmatchedOrders address={address} />
          </div>
        </div>
      </div>
    </div>
  )
}
