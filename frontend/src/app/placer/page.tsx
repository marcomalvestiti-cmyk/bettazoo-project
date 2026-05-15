'use client'

import { useAccount } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

import CreateOfferForm      from '@/components/CreateOfferForm'
import RiskWidget           from '@/components/RiskWidget'
import OrderBook            from '@/components/OrderBook'
import MyOffers, { type Offer } from '@/components/MyOffers'
import ProfileEditor        from '@/components/ProfileEditor'
import PlacerStatsBar       from '@/components/PlacerStatsBar'
import EventSelector        from '@/components/EventSelector'

import { MOCK_EVENTS } from '@/lib/abis'
import { fetchOrderBook, fetchProfile } from '@/lib/api'

export default function PlacerDashboard() {
  const { address, isConnected } = useAccount()

  const [selectedEventId, setSelectedEventId] = useState(MOCK_EVENTS[0].eventId)
  const [offers,          setOffers]          = useState<Offer[]>([])
  const [offersLoading,   setOffersLoading]   = useState(false)

  const selectedEvent = MOCK_EVENTS.find(e => e.eventId === selectedEventId) ?? MOCK_EVENTS[0]

  // Load profile on mount and pre-select league if specialization saved
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

  // Lift offers data to feed both StatsBar and MyOffers
  const refreshOffers = useCallback(async () => {
    if (!address) return
    setOffersLoading(true)
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
    } finally {
      setOffersLoading(false)
    }
  }, [address])

  useEffect(() => { refreshOffers() }, [refreshOffers])

  // Wallet not connected gate
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

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`

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
        <Link
          href={`/placer/${address}`}
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-[#FFB01F] border border-slate-700 hover:border-[#FFB01F]/50 px-3 py-2 rounded-md transition-colors shrink-0 whitespace-nowrap"
        >
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="hidden sm:inline">Live Stream</span>
          <span>→</span>
        </Link>
      </div>

      {/* ── Stats Bar (Task 3) ── */}
      <PlacerStatsBar
        address={address as `0x${string}`}
        offers={offers}
        pnlSeed={address}
      />

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">

        {/* LEFT COLUMN — controls */}
        <div className="space-y-4">

          {/* Profile + Specialization */}
          <ProfileEditor address={address} />

          {/* Hierarchical event selector */}
          <EventSelector value={selectedEventId} onSelect={setSelectedEventId} />

          {/* Create Offer form */}
          <CreateOfferForm
            eventId={selectedEventId}
            eventName={selectedEvent.name}
            sport={selectedEvent.sport}
            teams={selectedEvent.teams}
          />

          {/* Risk Manager */}
          <RiskWidget address={address} />

          {/* My Active Offers */}
          <MyOffers
            offers={offersLoading ? undefined : offers}
            onRefresh={refreshOffers}
          />
        </div>

        {/* RIGHT COLUMN — live odds / view odds */}
        <div className="space-y-3">
          {/* Event header */}
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
    </div>
  )
}
