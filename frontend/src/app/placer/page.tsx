'use client'

import { useAccount, useWatchContractEvent } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

import CreateOfferForm, { type NewOfferData } from '@/components/CreateOfferForm'
import RiskWidget       from '@/components/RiskWidget'
import OrderBook        from '@/components/OrderBook'
import { type Offer }   from '@/components/MyOffers'
import ProfileEditor    from '@/components/ProfileEditor'
import PlacerStatsBar   from '@/components/PlacerStatsBar'
import EventSelector    from '@/components/EventSelector'

import { MOCK_EVENTS, ESCROW_ABI } from '@/lib/abis'
import { fetchOrderBook, fetchProfile } from '@/lib/api'

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`

export default function PlacerDashboard() {
  const { address, isConnected } = useAccount()

  const [selectedEventId, setSelectedEventId] = useState(MOCK_EVENTS[0].eventId)
  const [offers,          setOffers]          = useState<Offer[]>([])
  const [profileOpen,     setProfileOpen]     = useState(false)

  const selectedEvent = MOCK_EVENTS.find(e => e.eventId === selectedEventId) ?? MOCK_EVENTS[0]

  // Pre-select league from saved profile specialization
  useEffect(() => {
    if (!address) return
    fetchProfile(address)
      .then(profile => {
        const league = profile.specialization?.league
        if (league) {
          const match = MOCK_EVENTS.find(e => e.league === league)
          if (match) setSelectedEventId(match.eventId)
        }
      })
      .catch(() => { /* silently ignore */ })
  }, [address])

  const refreshOffers = useCallback(async () => {
    if (!address) return
    try {
      const all: Offer[] = []
      for (const event of MOCK_EVENTS) {
        const data = await fetchOrderBook(event.eventId)
        const mine = (data.orders as Offer[]).filter(
          o => o.placer.toLowerCase() === address.toLowerCase()
        )
        all.push(...mine)
      }
      setOffers(all)
    } catch {
      setOffers([])
    }
  }, [address])

  useEffect(() => { refreshOffers() }, [refreshOffers])

  // Called by CreateOfferForm right after the createOffer tx is mined.
  // 1. Injects an optimistic offer so the UI updates instantly.
  // 2. Schedules a real refresh after 4s to replace it with the indexed data.
  const handleOfferCreated = useCallback((data: NewOfferData) => {
    if (address) {
      const optimistic = {
        offerId:               Date.now(),          // temp placeholder ID
        placer:                address,
        eventId:               data.eventId,
        outcome:               data.outcome,
        oddsDecimal:           data.oddsDecimal,
        remainingLiabilityUsdt: data.liabilityUsdt.toFixed(6),
        maxBettorStakeUsdt:    (data.liabilityUsdt / (data.oddsDecimal - 1)).toFixed(6),
      }
      setOffers(prev => [...prev, optimistic])
    }
    setTimeout(refreshOffers, 4000)
  }, [address, refreshOffers])

  // ── On-chain event listener ────────────────────────────────────────────────
  // Watches OfferCreated directly from the RPC (eth_getLogs polling, ~2s interval).
  // When an event from our wallet arrives:
  //   • Decodes args from the chain — no indexer round-trip, zero lag.
  //   • Replaces any optimistic placeholder (Date.now() IDs > 1e12) with the
  //     real offerId assigned by the smart contract.
  //   • Still schedules a delayed refreshOffers() to catch edge cases.
  useWatchContractEvent({
    address:         ESCROW_ADDRESS,
    abi:             ESCROW_ABI,
    eventName:       'OfferCreated',
    pollingInterval: 2_000,
    onLogs(logs) {
      console.log('EVENTO BLOCKCHAIN CAPTATO:', logs)
      if (!address) return

      const mine = logs.filter(
        log => log.args.placer?.toLowerCase() === address.toLowerCase()
      )
      if (mine.length === 0) return

      setOffers(prev => {
        let next = [...prev]
        for (const log of mine) {
          const { offerId, placer, eventId: evId, outcome, odds, liability } = log.args
          if (!offerId || !placer || evId === undefined || outcome === undefined || !odds || !liability) continue

          const oddsDecimal   = Number(odds) / 10_000
          const liabilityUsdt = Number(liability) / 1_000_000
          const real: Offer = {
            offerId:                Number(offerId),
            placer,
            eventId:                evId,
            outcome:                Number(outcome),
            oddsDecimal,
            remainingLiabilityUsdt: liabilityUsdt.toFixed(6),
            maxBettorStakeUsdt:     (liabilityUsdt / (oddsDecimal - 1)).toFixed(6),
          }

          // Skip if already present with the real ID
          if (next.some(o => o.offerId === real.offerId)) continue

          // Replace optimistic placeholder for this event+outcome if one exists
          // (optimistic IDs use Date.now() ≈ 1.75e12; real sequential IDs are tiny)
          next = next.filter(o =>
            !(o.offerId > 1_000_000_000 && o.eventId === evId && o.outcome === real.outcome)
          )
          next = [...next, real]
        }
        return next
      })

      // Delayed real refresh as safety net (gives indexer time to sync)
      setTimeout(refreshOffers, 3_000)
    },
  })

  if (!isConnected || !address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-[#FFB01F]/10 border border-[#FFB01F]/30 flex items-center justify-center mx-auto text-3xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold text-white">Placer Control Station</h1>
        <p className="text-slate-400">Connect your wallet to access the dashboard.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">
            ✦ Placer Area
          </p>
          <h1 className="text-3xl font-bold text-white leading-none">Control Station</h1>
          <p className="text-xs text-slate-500 font-mono truncate">{address}</p>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setProfileOpen(true)}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-3 py-2 rounded-md transition-colors whitespace-nowrap"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="hidden sm:inline">Profile</span>
          </button>
          <Link
            href={`/placer/${address}`}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-[#FFB01F] border border-slate-700 hover:border-[#FFB01F]/50 px-3 py-2 rounded-md transition-colors whitespace-nowrap"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="hidden sm:inline">Live Stream</span>
            <span>→</span>
          </Link>
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <PlacerStatsBar
        address={address as `0x${string}`}
        offers={offers}
        pnlSeed={address}
      />

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

        {/* LEFT COLUMN — controls */}
        <div className="space-y-4">
          <EventSelector value={selectedEventId} onSelect={setSelectedEventId} />
          <CreateOfferForm
            eventId={selectedEventId}
            eventName={selectedEvent.name}
            sport={selectedEvent.sport}
            teams={selectedEvent.teams}
            onOfferCreated={handleOfferCreated}
          />
          <RiskWidget address={address} />
        </div>

        {/* RIGHT COLUMN — order book */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xl">{selectedEvent.icon}</span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">
                {selectedEvent.sportLabel} · {selectedEvent.leagueLabel}
              </p>
              <h2 className="text-lg font-bold text-white leading-tight">{selectedEvent.name}</h2>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              {selectedEvent.teams.map(t => (
                <span key={t} className="text-xs font-medium bg-slate-900 border border-slate-700 px-2 py-1 rounded">
                  {t}
                </span>
              ))}
            </div>
          </div>
          <OrderBook eventId={selectedEventId} />
        </div>
      </div>

      {/* ── Profile Modal ── */}
      {profileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setProfileOpen(false)}
          />
          <div className="relative z-10 w-full max-w-md">
            <button
              onClick={() => setProfileOpen(false)}
              className="absolute -top-3 -right-3 z-20 w-7 h-7 flex items-center justify-center rounded-full bg-slate-700 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-600 transition-colors text-base font-bold leading-none"
            >
              ×
            </button>
            <ProfileEditor address={address} />
          </div>
        </div>
      )}
    </div>
  )
}
