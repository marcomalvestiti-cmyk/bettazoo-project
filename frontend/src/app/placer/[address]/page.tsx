'use client'

import { use, useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { MOCK_EVENTS, OUTCOMES } from '@/lib/abis'
import { fetchOrderBook } from '@/lib/api'
import StreamPlayer from '@/components/StreamPlayer'
import LiveChat from '@/components/LiveChat'
import BetSlip from '@/components/BetSlip'
import type { Offer } from '@/components/OrderBook'

// ── Helpers ────────────────────────────────────────────────────

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

// ── Outcome card styles ─────────────────────────────────────────

type CardStyle = { border: string; bg: string; dot: string; label: string; glow: string; btnBorder: string }

const OUTCOME_CARD: Record<number, CardStyle> = {
  0: {
    border:    'border-sky-500/25',
    bg:        'bg-sky-500/6',
    dot:       'bg-sky-400',
    label:     'text-sky-300',
    glow:      'hover:shadow-[0_0_28px_rgba(14,165,233,0.18)]',
    btnBorder: 'border-b-sky-800',
  },
  1: {
    border:    'border-fuchsia-500/25',
    bg:        'bg-fuchsia-500/6',
    dot:       'bg-fuchsia-400',
    label:     'text-fuchsia-300',
    glow:      'hover:shadow-[0_0_28px_rgba(217,70,239,0.18)]',
    btnBorder: 'border-b-fuchsia-800',
  },
  2: {
    border:    'border-emerald-500/25',
    bg:        'bg-emerald-500/6',
    dot:       'bg-emerald-400',
    label:     'text-emerald-300',
    glow:      'hover:shadow-[0_0_28px_rgba(16,185,129,0.18)]',
    btnBorder: 'border-b-emerald-800',
  },
}

type QuoteOffer = Offer & { eventName: string }

// ── Page ───────────────────────────────────────────────────────

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

      {/* ── Twitch two-column layout ── */}
      <div className="flex flex-col lg:flex-row lg:items-start max-w-[1600px] mx-auto">

        {/* LEFT — main content */}
        <div className="flex-1 min-w-0">

          {/* Video player */}
          <div className="lg:rounded-none">
            <StreamPlayer
              teamA={selectedEvent.teams[0] ?? 'Home'}
              teamB={selectedEvent.teams[1] ?? 'Away'}
            />
          </div>

          {/* Stream title bar */}
          <div className="px-4 sm:px-6 pt-4 pb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold text-white leading-tight truncate">
                {selectedEvent.name} — Live Betting
              </h1>
              <p className="text-sm text-zinc-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span className="text-[#e05555] font-extrabold">Sports Betting</span>
                <span className="text-zinc-700">·</span>
                <span className="font-mono text-xs text-zinc-500">{shortAddr}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2 h-2 rounded-full bg-[#B31A1A] animate-pulse" />
              <span className="font-extrabold text-white text-sm">1,247</span>
              <span className="text-zinc-500 text-xs hidden sm:block">spettatori</span>
            </div>
          </div>

          {/* Channel info row */}
          <div className="px-4 sm:px-6 py-4 border-t border-zinc-800 flex items-start gap-4">

            {/* Avatar */}
            <div className="relative shrink-0">
              <div className={`w-[72px] h-[72px] rounded-full bg-gradient-to-br ${gradient} p-[3px] shadow-[0_0_20px_rgba(179,26,26,0.4)]`}>
                <div className="w-full h-full rounded-full bg-[#0f0f16] flex items-center justify-center font-extrabold text-white text-2xl select-none">
                  {initials}
                </div>
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#B31A1A] rounded-full px-1.5 py-px text-[9px] font-extrabold text-white border-2 border-[#0D0D11] leading-none whitespace-nowrap tracking-wide">
                LIVE
              </span>
            </div>

            {/* Name + bio + actions */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-base font-extrabold text-white font-mono">{shortAddr}</span>
                <button className="
                  px-4 py-1.5 text-xs font-extrabold rounded-2xl
                  bg-[#B31A1A] hover:bg-[#cc2020] text-white
                  border-b-4 border-b-[#6b0d0d]
                  active:border-b-0 active:translate-y-1
                  shadow-[0_0_12px_rgba(179,26,26,0.3)]
                  transition-all duration-75
                ">
                  + Segui
                </button>
              </div>

              {/* Stats chips */}
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="bg-[#141419] border border-zinc-800 rounded-xl px-2.5 py-1 text-zinc-400 font-bold">
                  {offers.length} offerte attive
                </span>
                {avgOdds && (
                  <span className="bg-[#B31A1A]/10 border border-[#B31A1A]/30 rounded-xl px-2.5 py-1 text-[#e05555] font-extrabold">
                    Media {avgOdds.toFixed(2)}x
                  </span>
                )}
                <span className="bg-[#141419] border border-zinc-800 rounded-xl px-2.5 py-1 text-zinc-400 font-bold">
                  {MOCK_EVENTS.length} eventi
                </span>
              </div>

              <p className="text-xs text-zinc-500 italic leading-relaxed">
                &quot;Le migliori quote sul mercato, garantite. Scommetti con fiducia.&quot;
              </p>
            </div>
          </div>

          {/* Event tab switcher */}
          <div className="px-4 sm:px-6 py-3 border-t border-zinc-800">
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {MOCK_EVENTS.map((e) => (
                <button
                  key={e.eventId}
                  onClick={() => setSelectedEvent(e)}
                  className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-extrabold transition-all ${
                    selectedEvent.eventId === e.eventId
                      ? 'bg-[#B31A1A] text-white shadow-[0_0_10px_rgba(179,26,26,0.4)]'
                      : 'bg-[#141419] text-zinc-400 hover:text-zinc-200 hover:bg-[#1c1c24]'
                  }`}
                >
                  {e.name}
                </button>
              ))}
            </div>
          </div>

          {/* Quote Esclusive */}
          <div className="px-4 sm:px-6 py-6 space-y-5 border-t border-zinc-800">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-extrabold text-white">Quote Esclusive</h2>
              <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-lg bg-[#B31A1A]/15 text-[#e05555] border border-[#B31A1A]/30">
                {eventOffers.length} disponibili
              </span>
            </div>

            {loadingOffers ? (
              <div className="flex items-center justify-center gap-2 py-12 text-zinc-500 text-sm">
                <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Caricamento quote…
              </div>
            ) : eventOffers.length === 0 ? (
              <div className="text-center py-14 space-y-2">
                <div className="text-5xl select-none">📭</div>
                <p className="font-extrabold text-zinc-500">Nessuna quota disponibile per questo evento</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {eventOffers.map((o) => {
                  const c        = OUTCOME_CARD[o.outcome] ?? OUTCOME_CARD[0]
                  const maxStake = parseFloat(o.maxBettorStakeUsdt)
                  const liquidity = parseFloat(o.remainingLiabilityUsdt)

                  return (
                    <div
                      key={o.offerId}
                      className={`
                        relative rounded-2xl border ${c.border} ${c.bg}
                        p-5 space-y-5 transition-all duration-200
                        hover:scale-[1.025] ${c.glow}
                        cursor-pointer group
                      `}
                      onClick={() => isConnected && setBetSlip({ outcome: o.outcome, offers: [o] })}
                    >
                      {/* Outcome label */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                          <span className={`text-xs font-extrabold uppercase tracking-widest ${c.label}`}>
                            {OUTCOMES[o.outcome] ?? `Outcome ${o.outcome}`}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-600 font-mono">
                          #{o.offerId}
                        </span>
                      </div>

                      {/* Odds */}
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-6xl font-extrabold font-mono tabular-nums text-white leading-none group-hover:text-red-100 transition-colors">
                          {o.oddsDecimal.toFixed(2)}
                        </span>
                        <span className="text-2xl text-zinc-500 font-bold">x</span>
                      </div>

                      {/* Stats */}
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">Max stake</span>
                          <span className="font-extrabold font-mono text-zinc-300">${maxStake.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-500">Liquidità</span>
                          <span className="font-extrabold font-mono text-zinc-300">${liquidity.toFixed(2)}</span>
                        </div>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mt-1">
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
                          className={`
                            w-full py-3 text-sm font-extrabold rounded-2xl text-white
                            bg-[#B31A1A] hover:bg-[#cc2020]
                            border-b-4 ${c.btnBorder}
                            active:border-b-0 active:translate-y-1
                            shadow-[0_0_14px_rgba(179,26,26,0.3)]
                            transition-all duration-75
                          `}
                        >
                          Scommetti →
                        </button>
                      ) : (
                        <div className="w-full py-3 text-xs font-bold rounded-2xl text-center text-zinc-600 bg-zinc-800/40 border border-zinc-800">
                          Connetti wallet per scommettere
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
          border-t lg:border-t-0 lg:border-l border-zinc-800
          h-[480px] lg:h-auto
        ">
          <LiveChat room={`placer-${address}`} viewers={1247} />
        </div>
      </div>

      {/* BetSlip */}
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
