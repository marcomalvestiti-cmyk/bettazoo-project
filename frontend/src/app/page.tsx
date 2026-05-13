import Link from 'next/link'
import Image from 'next/image'
import { MOCK_EVENTS } from '@/lib/abis'

const FEATURED_IDS = ['evt-001', 'evt-002', 'evt-003', 'evt-010', 'evt-012']
const FEATURED = MOCK_EVENTS.filter(e => FEATURED_IDS.includes(e.eventId))

const EVENT_BADGES: Record<string, { label: string; emoji: string; className: string }> = {
  'evt-001': { label: 'Hot',      emoji: '🔥', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  'evt-002': { label: 'Featured', emoji: '⭐', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  'evt-003': { label: 'New',      emoji: '✨', className: 'bg-sky-500/15    text-sky-400    border-sky-500/30'    },
  'evt-010': { label: 'Live',     emoji: '🔴', className: 'bg-red-500/15    text-red-400    border-red-500/30'    },
}

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

      {/* Hero */}
      <div className="space-y-4">
        <Image
          src="/Logo-Bettazoo.png"
          alt="Bettazoo — Sport, Esport & Crypto Betting Platform"
          width={300}
          height={120}
          className="h-20 w-auto object-contain"
          priority
        />
        <p className="text-slate-400 text-base max-w-md">
          Bet peer-to-peer — no bookmaker, USDT stablecoin on Web3.
        </p>
      </div>

      {/* Section header */}
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-red-500 uppercase tracking-widest">Markets</p>
          <h2 className="text-3xl font-bold text-white">Featured Bets</h2>
        </div>
        <Link
          href="/bet"
          className="text-sm font-semibold text-slate-400 hover:text-red-500 transition-colors"
        >
          View All Bets →
        </Link>
      </div>

      {/* Event list */}
      <div className="space-y-2">
        {FEATURED.map((event) => {
          const start = new Date(event.startTime)
          const badge = EVENT_BADGES[event.eventId]
          return (
            <Link
              key={event.eventId}
              href={`/event/${event.eventId}`}
              className="group flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 rounded-lg px-5 py-4 transition-colors"
            >
              <div className="flex items-center gap-4">
                <span className="hidden sm:flex w-10 h-10 rounded-lg bg-slate-800 items-center justify-center text-xl select-none">
                  {event.icon}
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-wider text-red-500 bg-[#B31A1A]/10 px-2 py-0.5 rounded">
                      {event.sportLabel}
                    </span>
                    {badge && (
                      <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded border leading-none select-none ${badge.className}`}>
                        {badge.emoji} {badge.label}
                      </span>
                    )}
                    <span className="text-xs text-slate-500">
                      {start.toLocaleDateString('en-GB')} · {start.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-100 group-hover:text-white transition-colors">
                    {event.name}
                  </h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {event.teams.map((team) => (
                      <span key={team} className="text-xs font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                        {team}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium text-slate-500 hidden sm:block">Order book</span>
                <span className="text-slate-400 group-hover:text-red-500 transition-colors text-xl">→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
