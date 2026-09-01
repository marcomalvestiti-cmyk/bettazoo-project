'use client'

import { useAccount } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { io, type Socket } from 'socket.io-client'

import VaultPanel        from '@/components/VaultPanel'
import RiskWidget       from '@/components/RiskWidget'
import MyOffers, { type Offer } from '@/components/MyOffers'
import ProfileEditor    from '@/components/ProfileEditor'
import PlacerStatsBar   from '@/components/PlacerStatsBar'
import EventSelector    from '@/components/EventSelector'
import PlacerBadge      from '@/components/PlacerBadge'

import { MOCK_EVENTS } from '@/lib/abis'
import { fetchProfile, fetchChallengers, fetchVaultOffers, SOCKET_URL } from '@/lib/api'

// ── Influence Rewards mock-up ─────────────────────────────────────────────────
// Shows the placer an estimate of community earnings to illustrate mainnet value.
function InfluenceRewards({ challengers, address }: { challengers: number; address: string }) {
  const monthlyVolume   = challengers * 50          // $50/month assumed per challenger
  const placerShare     = monthlyVolume * 0.005      // 0.5% of volume (mock share)
  const annualEstimate  = placerShare * 12

  const tiers = [
    { label: 'Rookie Placer',  threshold: 1,  icon: '🥉', color: 'text-amber-500',  border: 'border-amber-700/30',  bg: 'bg-amber-700/8'  },
    { label: 'Pro Bookie',     threshold: 11, icon: '🥈', color: 'text-slate-300',  border: 'border-slate-400/30',  bg: 'bg-slate-400/8'  },
    { label: 'Whale Maker',    threshold: 51, icon: '🥇', color: 'text-yellow-400', border: 'border-yellow-500/30', bg: 'bg-yellow-500/8' },
  ]

  return (
    <div className="bg-slate-900/60 border border-[#FFB01F]/20 shadow-md shadow-amber-900/10 rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#FFB01F]/15 border border-[#FFB01F]/30 flex items-center justify-center text-base select-none">
          💰
        </div>
        <div>
          <h2 className="text-lg font-bold text-white leading-none">Influence Rewards</h2>
          <p className="text-xs text-slate-500 mt-0.5">Estimated earnings from your challenger community</p>
        </div>
        <span className="ml-auto text-[10px] font-bold px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-500 uppercase tracking-widest">
          Mainnet preview
        </span>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Challengers</p>
          <p className="text-2xl font-bold font-mono text-white">{challengers}</p>
          <PlacerBadge count={challengers} size="sm" />
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Est. Monthly Volume</p>
          <p className="text-2xl font-bold font-mono text-slate-300">${monthlyVolume.toFixed(0)}</p>
          <p className="text-[10px] text-slate-600 font-mono">$50/challenger assumed</p>
        </div>
        <div className="bg-slate-950/60 border border-[#FFB01F]/20 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Est. Monthly Share</p>
          <p className="text-2xl font-bold font-mono text-[#FFB01F]">${placerShare.toFixed(2)}</p>
          <p className="text-[10px] text-slate-600 font-mono">0.5% of volume</p>
        </div>
        <div className="bg-slate-950/60 border border-emerald-500/20 rounded-lg px-4 py-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Est. Annual</p>
          <p className="text-2xl font-bold font-mono text-emerald-400">${annualEstimate.toFixed(2)}</p>
          <p className="text-[10px] text-slate-600 font-mono">projected · mock data</p>
        </div>
      </div>

      {/* Badge progression */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Badge Progression</p>
        <div className="grid grid-cols-3 gap-2">
          {tiers.map(t => {
            const reached = challengers >= t.threshold
            return (
              <div key={t.label} className={`rounded-lg border px-3 py-2.5 flex items-center gap-2.5 transition-all ${reached ? `${t.bg} ${t.border}` : 'bg-slate-950/40 border-slate-800 opacity-50'}`}>
                <span className="text-xl select-none">{t.icon}</span>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${reached ? t.color : 'text-slate-600'} truncate`}>{t.label}</p>
                  <p className="text-[10px] text-slate-600 font-mono">{t.threshold}+ challengers</p>
                </div>
                {reached && <span className={`ml-auto text-base ${t.color}`}>✓</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center gap-3 rounded-lg bg-slate-950/40 border border-slate-800 px-4 py-3">
        <span className="text-slate-500 text-sm select-none">📣</span>
        <p className="text-xs text-slate-500 flex-1">
          Share your offers to attract challengers. Rewards activate on Mainnet launch.
        </p>
        <span className="text-[10px] font-mono text-slate-600 shrink-0">{address.slice(0, 6)}…{address.slice(-4)}</span>
      </div>
    </div>
  )
}

export default function PlacerDashboard() {
  const { address, isConnected } = useAccount()

  const [activeTab,         setActiveTab]         = useState<'dashboard' | 'offers'>('dashboard')
  const [selectedEventId,   setSelectedEventId]   = useState(MOCK_EVENTS[0].eventId)
  const [offers,            setOffers]            = useState<Offer[]>([])
  const [profileOpen,       setProfileOpen]       = useState(false)
  const [uniqueChallengers, setUniqueChallengers] = useState(0)
  const [vaultAddress,      setVaultAddress]      = useState<string | null>(null)

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

  // ── Offers now come from the vault, not the user's wallet ─────────────────────
  // The keeper places/cancels offers as the vault, so the source of truth is the
  // backend's vault-offers endpoint, not local optimistic state.
  const loadOffers = useCallback(async () => {
    if (!vaultAddress) { setOffers([]); return }
    try {
      const data = await fetchVaultOffers(vaultAddress, true)
      const mapped: Offer[] = data.orders.map(o => ({
        offerId:                o.offerId,
        placer:                 vaultAddress,
        eventId:                o.eventId,
        outcome:                o.outcome,
        oddsDecimal:            o.oddsDecimal,
        remainingLiabilityUsdt: o.remainingLiabilityUsdt,
        maxBettorStakeUsdt:     o.maxBettorStakeUsdt,
      }))
      setOffers(mapped)
    } catch {
      setOffers([])
    }
  }, [vaultAddress])

  useEffect(() => { loadOffers() }, [loadOffers])

  useEffect(() => {
    if (!address) return
    fetchChallengers(address)
      .then(d => setUniqueChallengers(d.uniqueChallengers))
      .catch(() => {})
  }, [address])

  // ── Real-time refresh — the keeper places offers server-side, so we listen for
  // the backend's global Socket.io broadcasts instead of polling the user's wallet.
  useEffect(() => {
    if (!vaultAddress) return
    const socket: Socket = io(SOCKET_URL)
    const onCreated = (payload: { placer?: string }) => {
      if (payload.placer?.toLowerCase() === vaultAddress.toLowerCase()) loadOffers()
    }
    const onMatched = () => loadOffers()
    socket.on('offer:created', onCreated)
    socket.on('offer:matched', onMatched)
    return () => { socket.disconnect() }
  }, [vaultAddress, loadOffers])

  if (!isConnected || !address) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-24 text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-[#FFB01F]/10 border border-[#FFB01F]/30 flex items-center justify-center mx-auto text-3xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold text-white">Placer Pit Boss Console</h1>
        <p className="text-slate-400">Connect your wallet to access the dashboard.</p>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">✦ Placer Area</p>
          <h1 className="text-3xl font-bold text-white leading-none">Pit Boss Console</h1>
          <p className="text-xs text-slate-500 font-mono truncate">{address}</p>
        </div>
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
        vaultAddress={vaultAddress ?? undefined}
        pnlSeed={address}
        uniqueChallengers={uniqueChallengers}
      />

      {/* ── Tab Navigation ── */}
      <div className="flex items-center gap-1 border-b border-slate-800">
        {([
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'offers',    label: 'Vault Strategies', badge: offers.length },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              activeTab === tab.id
                ? 'border-[#FFB01F] text-[#FFB01F]'
                : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
            }`}
          >
            {tab.label}
            {'badge' in tab && tab.badge > 0 && (
              <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded-full ${
                activeTab === tab.id
                  ? 'bg-[#FFB01F]/20 text-[#FFB01F]'
                  : 'bg-slate-800 text-slate-500'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB: DASHBOARD ══════════════════ */}
      {activeTab === 'dashboard' && (
        <div className="space-y-4">

          {/* Main grid — 3 equal columns: cash/parameters, then monitoring/rewards spanning 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Column 1 — Cassa e Parametri */}
            <div className="space-y-4">
              <EventSelector value={selectedEventId} onSelect={setSelectedEventId} />
              <VaultPanel onVaultReady={setVaultAddress} />
              <RiskWidget address={vaultAddress ?? address} vaultAddress={vaultAddress ?? undefined} />
            </div>

            {/* Columns 2-3 — Monitoraggio e Reward */}
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <h2 className="text-sm font-bold text-white tracking-wide">Live Execution Feed</h2>
                </div>
                <div className="p-3">
                  <MyOffers
                    offers={offers}
                    onRefresh={loadOffers}
                    compact
                    onViewAll={() => setActiveTab('offers')}
                    vaultAddress={vaultAddress ?? undefined}
                  />
                </div>
              </div>

              {/* Influence Rewards */}
              <InfluenceRewards challengers={uniqueChallengers} address={address} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════ TAB: MY OFFERS ══════════════════ */}
      {activeTab === 'offers' && (
        <MyOffers offers={offers} onRefresh={loadOffers} vaultAddress={vaultAddress ?? undefined} />
      )}

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
