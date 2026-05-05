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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center text-slate-900 font-black text-sm">
          {address.slice(2, 4).toUpperCase()}
        </div>
        <div>
          <p className="text-xs text-green-400 uppercase tracking-widest font-medium">Placer · Live</p>
          <h1 className="text-xl font-bold text-white font-mono">{shortAddr}</h1>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Left: stream + chat */}
        <div className="lg:col-span-2 space-y-4">
          <StreamPlayer
            teamA={selectedEvent.teams[0] ?? 'Home'}
            teamB={selectedEvent.teams[1] ?? 'Away'}
          />
          <LiveChat room={`placer-${address}`} />
        </div>

        {/* Right: event selector + unmatched orders */}
        <div className="space-y-4">

          {/* Event selector */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-xs text-slate-400 font-medium">Quote di questo placer</p>
            <div className="space-y-1">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedEvent.eventId === e.eventId
                      ? 'bg-green-500/10 text-green-400 border border-green-500/40'
                      : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>

          {/* Unmatched orders */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="text-sm font-semibold text-white">Offerte aperte</h3>
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 font-semibold">
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
