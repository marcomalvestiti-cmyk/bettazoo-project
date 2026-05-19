'use client'

import { useAccount, useWatchContractEvent } from 'wagmi'
import { useState, useEffect, useCallback, useRef } from 'react'
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

  // Refs that always hold the latest values — prevents stale closures in the
  // wagmi event callback which may be registered once and never re-created.
  const addressRef  = useRef(address)
  const refreshRef  = useRef(refreshOffers)
  useEffect(() => { addressRef.current = address },        [address])
  useEffect(() => { refreshRef.current = refreshOffers }, [refreshOffers])

  // ── On-chain event listener ────────────────────────────────────────────────
  // Polls Arbitrum Sepolia via eth_getLogs every 2s.
  // Strategy:
  //   1. Read address/refresh from refs (never stale).
  //   2. Build Offer directly from event args — zero indexer dependency.
  //   3. Replace any optimistic placeholder, add real offer → instant UI update.
  //   4. Delayed refreshOffers() as backend safety net.
  useWatchContractEvent({
    address:         ESCROW_ADDRESS,
    abi:             ESCROW_ABI,
    eventName:       'OfferCreated',
    pollingInterval: 2_000,
    onLogs(logs) {
      console.log('EVENTO BLOCKCHAIN CAPTATO:', logs)

      const addr = addressRef.current
      console.log('[bettazoo] address at event time:', addr)
      if (!addr) return

      for (const log of logs) {
        const { offerId, placer, eventId: evId, outcome, odds, liability } = log.args
        console.log('[bettazoo] event args:', { offerId, placer, evId, outcome, odds, liability })

        if (!offerId || !placer || evId === undefined || outcome === undefined || !odds || !liability) {
          console.warn('[bettazoo] skipping log — incomplete args')
          continue
        }
        if (placer.toLowerCase() !== addr.toLowerCase()) {
          console.log('[bettazoo] skipping — not our offer (placer:', placer, ')')
          continue
        }

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
        console.log('[bettazoo] injecting offer into state:', real)

        // Step 2 — direct state update (no backend round-trip)
        setOffers(prev => {
          if (prev.some(o => o.offerId === real.offerId)) {
            console.log('[bettazoo] offer already in state, skipping')
            return prev
          }
          // Remove optimistic placeholder for this event+outcome if present
          // (optimistic IDs are Date.now() ≈ 1.75e12; real IDs are sequential ints)
          const filtered = prev.filter(o =>
            !(o.offerId > 1_000_000_000 && o.eventId === evId && o.outcome === real.outcome)
          )
          const next = [...filtered, real]
          console.log('[bettazoo] setOffers →', next.length, 'offers')
          return next
        })
      }

      // Step 3 — delayed backend sync once Railway indexer has caught up
      setTimeout(() => refreshRef.current(), 3_000)
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
