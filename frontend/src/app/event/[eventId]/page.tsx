'use client'

import { useState } from 'react'
import { use } from 'react'
import { useAccount } from 'wagmi'
import OrderBook, { type Offer } from '@/components/OrderBook'
import BetSlip from '@/components/BetSlip'
import { MOCK_EVENTS } from '@/lib/abis'
import Link from 'next/link'

type BetSlipState = { outcome: number; offers: Offer[] }

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId }   = use(params)
  const { isConnected } = useAccount()
  const [betSlip, setBetSlip] = useState<BetSlipState | null>(null)

  const event = MOCK_EVENTS.find((e) => e.eventId === eventId)

  function handleBet(outcome: number, offers: Offer[]) {
    setBetSlip({ outcome, offers })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        <Link href="/" className="hover:text-zinc-300 transition-colors font-bold">Exchange</Link>
        <span className="text-zinc-700">/</span>
        <span className="text-zinc-300 font-bold">{event?.name ?? eventId}</span>
      </div>

      {/* Event header */}
      <div className="bg-[#313338] border border-zinc-700 rounded-2xl px-5 py-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-lg">
            {event?.sport ?? 'sport'}
          </span>
          <h1 className="text-xl font-extrabold text-white">{event?.name ?? eventId}</h1>
          {event && (
            <div className="flex gap-1.5">
              {event.teams.map((t) => (
                <span key={t} className="text-xs font-bold bg-[#2b2d31] text-zinc-400 px-2 py-0.5 rounded-lg">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="hidden sm:flex flex-col items-end text-xs text-zinc-500 font-bold">
          {event && (
            <>
              <span>{new Date(event.startTime).toLocaleDateString('it-IT')}</span>
              <span>{new Date(event.startTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          )}
        </div>
      </div>

      {!isConnected && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#313338] border border-zinc-700 px-4 py-3 text-sm text-zinc-400">
          <span className="text-yellow-400">⚠</span>
          Connetti il wallet per scommettere — clicca su una quota per aprire la schedina.
        </div>
      )}

      <OrderBook
        eventId={eventId}
        onBet={isConnected ? handleBet : undefined}
      />

      {betSlip && (
        <BetSlip
          outcome={betSlip.outcome}
          offers={betSlip.offers}
          eventName={event?.name ?? eventId}
          onClose={() => setBetSlip(null)}
        />
      )}
    </div>
  )
}
