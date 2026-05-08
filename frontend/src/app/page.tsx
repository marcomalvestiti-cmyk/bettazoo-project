import Link from 'next/link'
import Image from 'next/image'
import { MOCK_EVENTS } from '@/lib/abis'

const EVENT_BADGES: Record<string, { label: string; emoji: string; className: string }> = {
  'evt-001': { label: 'Hot',      emoji: '🔥', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  'evt-002': { label: 'Featured', emoji: '⭐', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  'evt-003': { label: 'New',      emoji: '✨', className: 'bg-sky-500/15    text-sky-400    border-sky-500/30'    },
}

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-10">

      {/* Hero */}
      <div className="space-y-4">
        <Image
          src="/Banner - Bettazoo.png"
          alt="Bettazoo — Sport, Esport & Crypto Betting Platform"
          width={600}
          height={300}
          className="h-36 w-auto object-contain"
          priority
        />
        <p className="text-zinc-400 text-base max-w-md">
          Scommetti peer-to-peer — nessun bookmaker, solo stablecoin USDT su Web3.
        </p>
      </div>

      {/* Section header */}
      <div className="space-y-1">
        <p className="text-sm font-extrabold text-[#e05555] uppercase tracking-widest">Markets</p>
        <h2 className="text-4xl font-extrabold text-white">Exchange</h2>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {MOCK_EVENTS.map((event) => {
          const start = new Date(event.startTime)
          const badge = EVENT_BADGES[event.eventId]
          return (
            <Link
              key={event.eventId}
              href={`/event/${event.eventId}`}
              className="group flex items-center justify-between bg-[#141419] border border-zinc-800 hover:border-[#B31A1A]/50 hover:bg-[#1c1c24] rounded-2xl px-5 py-5 transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center gap-4">
                <span className="hidden sm:flex w-12 h-12 rounded-2xl bg-[#0f0f16] items-center justify-center text-2xl select-none">
                  ⚽
                </span>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#e05555] bg-[#B31A1A]/10 px-2 py-0.5 rounded-lg">
                      {event.sport}
                    </span>
                    {badge && (
                      <span className={`inline-flex items-center gap-0.5 text-xs font-extrabold px-2 py-0.5 rounded-full border leading-none select-none ${badge.className}`}>
                        {badge.emoji} {badge.label}
                      </span>
                    )}
                    <span className="text-xs text-zinc-500">
                      {start.toLocaleDateString('it-IT')} · {start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="text-xl font-extrabold text-zinc-100 group-hover:text-white transition-colors">
                    {event.name}
                  </h3>
                  <div className="flex gap-1.5 flex-wrap">
                    {event.teams.map((t) => (
                      <span key={t} className="text-sm font-bold bg-[#0f0f16] text-zinc-400 px-2.5 py-0.5 rounded-lg">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-bold text-zinc-500 hidden sm:block">Order book</span>
                <span className="text-zinc-400 group-hover:text-[#e05555] transition-colors text-2xl">→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
