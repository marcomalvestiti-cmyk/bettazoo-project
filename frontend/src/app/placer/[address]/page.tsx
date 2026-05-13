'use client'

import Link from 'next/link'
import { use, useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { MOCK_EVENTS, OUTCOMES } from '@/lib/abis'
import { fetchOrderBook } from '@/lib/api'
import StreamPlayer from '@/components/StreamPlayer'
import LiveChat from '@/components/LiveChat'
import BetSlip from '@/components/BetSlip'
import type { Offer } from '@/components/OrderBook'

const AVATAR_GRADIENTS = [
  'from-red-500 to-rose-600',
  'from-sky-500 to-blue-600',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-red-600 to-red-800',
]

function getGradient(addr: string): string {
  let h = 0
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) & 0xffff
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length]
}

type CardStyle = { border: string; bg: string; dot: string; label: string }

const OUTCOME_CARD: Record<number, CardStyle> = {
  0: {
    border: 'border-sky-500/25',
    bg:     'bg-sky-500/5',
    dot:    'bg-sky-400',
    label:  'text-sky-300',
  },
  1: {
    border: 'border-fuchsia-500/25',
    bg:     'bg-fuchsia-500/5',
    dot:    'bg-fuchsia-400',
    label:  'text-fuchsia-300',
  },
  2: {
    border: 'border-emerald-500/25',
    bg:     'bg-emerald-500/5',
    dot:    'bg-emerald-400',
    label:  'text-emerald-300',
  },
}

type QuoteOffer = Offer & { eventName: string }

export default function PlacerStreamPage({ params }: { params: Promise<{ address: string }> }) {
  const { address }     = use(params)
  const { isConnected } = useAccount()

  const [selectedEvent, setSelectedEvent] = useState(MOCK_EVENTS[0])
  const [offers, setOffers]               = useState<QuoteOffer[]>([])
  const [loadingOffers, setLoadingOffers] = useState(true)
  const [betSlip, setBetSlip]             = useState<{ outcome: number; offers: Offer[] } | null>(null)

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`
  const initials  = address.slice(2, 4).toUpperCase()
  const gradient  = getGradient(address)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoadingOffers(true)
      const all: QuoteOffer[] = []
      for (const event of MOCK_EVENTS) {
        try {
          const data = await fetchOrderBook(event.eventId)
          const mine = (data.orders as Offer[]).filter(
            (o) => o.placer.toLowerCase() === address.toLowerCase()
          )
          mine.forEach((o) => all.push({ ...o, eventName: event.name }))
        } catch { /* skip */ }
      }
      if (!cancelled) { setOffers(all); setLoadingOffers(false) }
    }
    load()
    return () => { cancelled = true }
  }, [address])

  const eventOffers = offers.filter((o) => o.eventId === selectedEvent.eventId)
  const avgOdds     = offers.length
    ? offers.reduce((s, o) => s + o.oddsDecimal, 0) / offers.length
    : null

  return (
    <div className="min-h-screen">

      <div className="flex flex-col lg:flex-row lg:items-start max-w-[1600px] mx-auto">

        {/* LEFT — main content */}
        <div className="flex-1 min-w-0">

          <div className="lg:rounded-none">
            <StreamPlayer
              teamA={selectedEvent.teams[0] ?? 'Home'}
              teamB={selectedEvent.teams[1] ?? 'Away'}
            />
          </div>

          {/* Back navigation */}
          <div className="px-4 sm:px-6 py-3 border-b border-slate-800">
            <Link
              href="/placer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 hover:border-slate-500 text-white font-semibold text-sm shadow-sm hover:shadow-md transition-all"
            >
              ← Back to Control Station
            </Link>
          </div>

          {/* Stream title bar */}
          <div className="px-4 sm:px-6 pt-4 pb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white leading-tight truncate">
                {selectedEvent.name} — Live Betting
              </h1>
              <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="text-red-500 font-semibold">Sports Betting</span>
                <span className="text-slate-700">·</span>
                <span className="font-mono text-xs text-slate-500">{shortAddr}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#B31A1A] animate-pulse" />
              <span className="font-semibold text-white text-sm">1,247</span>
              <span className="text-slate-500 text-xs hidden sm:block">viewers</span>
            </div>
          </div>

          {/* Channel info row */}
          <div className="px-4 sm:px-6 py-4 border-t border-slate-800 flex items-start gap-4">

            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${gradient} p-[3px]`}>
                <div className="w-full h-full rounded-full bg-slate-950 flex items-center justify-center font-bold text-white text-xl select-none">
                  {initials}
                </div>
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#B31A1A] rounded px-1.5 py-px text-[9px] font-bold text-white border-2 border-slate-950 leading-none whitespace-nowrap tracking-wide">
                LIVE
              </span>
            </div>

            {/* Name + bio + actions */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-semibold text-white font-mono">{shortAddr}</span>
                <button className="px-4 py-1.5 text-xs font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white transition-colors">
                  + Follow
                </button>
              </div>

              {/* Stats chips */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-400 font-medium">
                  {offers.length} active offers
                </span>
                {avgOdds && (
                  <span className="bg-[#B31A1A]/10 border border-[#B31A1A]/30 rounded px-2.5 py-1 text-red-500 font-semibold">
                    Avg {avgOdds.toFixed(2)}x
                  </span>
                )}
                <span className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-slate-400 font-medium">
                  {MOCK_EVENTS.length} events
                </span>
              </div>

              <p className="text-xs text-slate-500 italic leading-relaxed">
                &quot;The best odds on the market, guaranteed. Bet with confidence.&quot;
              </p>
            </div>
          </div>

          {/* Event tab switcher */}
          <div className="px-4 sm:px-6 py-3 border-t border-slate-800">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e)}
                  className={`shrink-0 px-4 py-2 rounded-md text-xs font-semibold transition-colors ${
                    selectedEvent.eventId === e.eventId
                      ? 'bg-[#B31A1A] text-white'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>

          {/* My Offers on This Event */}
          <div className="px-4 sm:px-6 py-5 space-y-3 border-t border-slate-800">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-base font-semibold text-white">Placer&apos;s Offers</h2>
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                {selectedEvent.name}
              </span>
            </div>

            {loadingOffers ? (
              <div className="flex items-center gap-2 py-6 text-slate-500 text-sm">
                <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Loading…
              </div>
            ) : eventOffers.length === 0 ? (
              <div className="rounded-lg bg-slate-900/50 border border-slate-800 px-6 py-10 text-center space-y-3">
                <div className="text-3xl select-none">📋</div>
                <p className="text-sm font-semibold text-slate-400">You haven&apos;t placed any bets yet.</p>
                <p className="text-xs text-slate-600">This placer hasn&apos;t posted any offers for {selectedEvent.name} yet.</p>
                <Link
                  href="/bet"
                  className="inline-block mt-1 px-4 py-2 text-xs font-semibold rounded-md bg-[#B31A1A]/10 border border-[#B31A1A]/30 text-red-400 hover:bg-[#B31A1A]/20 transition-colors"
                >
                  View All Bets →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {eventOffers.map((o) => {
                  const c = OUTCOME_CARD[o.outcome] ?? OUTCOME_CARD[0]
                  return (
                    <div
                      key={o.offerId}
                      className="flex items-center justify-between rounded-lg bg-slate-900/60 border border-slate-800 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                        <div className="min-w-0 space-y-0.5">
                          <p className="text-xs font-semibold text-slate-200">
                            {OUTCOMES[o.outcome] ?? `Outcome ${o.outcome}`}
                          </p>
                          <p className="text-[11px] text-slate-600 font-mono">#{o.offerId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-bold font-mono text-white">{o.oddsDecimal.toFixed(2)}x</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/25">
                          Active
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Exclusive Odds */}
          <div className="px-4 sm:px-6 py-6 space-y-5 border-t border-slate-800">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-white">Exclusive Odds</h2>
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded bg-[#B31A1A]/15 text-red-500 border border-[#B31A1A]/30">
                {eventOffers.length} available
              </span>
            </div>

            {loadingOffers ? (
              <div className="flex items-center justify-center gap-2 py-12 text-slate-500 text-sm">
                <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Loading offers…
              </div>
            ) : eventOffers.length === 0 ? (
              <div className="text-center py-14 space-y-2">
                <div className="text-5xl select-none">📭</div>
                <p className="font-semibold text-slate-500">No offers available for this event</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {eventOffers.map((o) => {
                  const c        = OUTCOME_CARD[o.outcome] ?? OUTCOME_CARD[0]
                  const maxStake = parseFloat(o.maxBettorStakeUsdt)
                  const liquidity = parseFloat(o.remainingLiabilityUsdt)

                  return (
                    <div
                      key={o.offerId}
                      className={`relative rounded-lg border ${c.border} ${c.bg} p-5 space-y-4 transition-colors hover:bg-slate-800/30 cursor-pointer`}
                      onClick={() => isConnected && setBetSlip({ outcome: o.outcome, offers: [o] })}
                    >
                      {/* Outcome label */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                          <span className={`text-xs font-semibold uppercase tracking-wider ${c.label}`}>
                            {OUTCOMES[o.outcome] ?? `Outcome ${o.outcome}`}
                          </span>
                        </div>
                        <span className="text-[10px] font-medium text-slate-600 font-mono">
                          #{o.offerId}
                        </span>
                      </div>

                      {/* Odds */}
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-4xl font-semibold font-mono tabular-nums text-white leading-none">
                          {o.oddsDecimal.toFixed(2)}
                        </span>
                        <span className="text-lg text-slate-500 font-medium">x</span>
                      </div>

                      {/* Stats */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Max stake</span>
                          <span className="font-semibold font-mono text-slate-300">${maxStake.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-500">Liquidity</span>
                          <span className="font-semibold font-mono text-slate-300">${liquidity.toFixed(2)}</span>
                        </div>
                        <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-[#B31A1A] rounded-full"
                            style={{ width: `${Math.min((maxStake / Math.max(liquidity, 1)) * 100, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* CTA */}
                      {isConnected ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setBetSlip({ outcome: o.outcome, offers: [o] })
                          }}
                          className="w-full py-2.5 text-sm font-semibold rounded-md text-white bg-[#B31A1A] hover:bg-red-600 transition-colors"
                        >
                          Bet →
                        </button>
                      ) : (
                        <div className="w-full py-2.5 text-xs font-medium rounded-md text-center text-slate-500 bg-slate-800/40 border border-slate-800">
                          Connect wallet to bet
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="h-6 lg:hidden" />
        </div>

        {/* RIGHT — sticky chat sidebar */}
        <div className="
          lg:w-[340px] lg:min-w-[340px]
          lg:h-[calc(100vh-64px)] lg:sticky lg:top-16
          border-t lg:border-t-0 lg:border-l border-slate-800
          h-[480px] lg:h-auto
        ">
          <LiveChat room={`placer-${address}`} viewers={1247} />
        </div>
      </div>

      {betSlip && (
        <BetSlip
          outcome={betSlip.outcome}
          offers={betSlip.offers}
          eventName={selectedEvent.name}
          onClose={() => setBetSlip(null)}
        />
      )}
    </div>
  )
}
