import Link from 'next/link'
import { MOCK_EVENTS } from '@/lib/abis'

const EVENT_BADGES: Record<string, { label: string; emoji: string; className: string }> = {
  'evt-001': { label: 'Hot',      emoji: '🔥', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  'evt-002': { label: 'Featured', emoji: '⭐', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  'evt-003': { label: 'New',      emoji: '✨', className: 'bg-sky-500/15    text-sky-400    border-sky-500/30'    },
}

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-extrabold text-purple-400 uppercase tracking-widest">Markets</p>
        <h1 className="text-3xl font-extrabold text-white">Exchange</h1>
        <p className="text-zinc-400 text-sm">
          Scommetti peer-to-peer — nessun bookmaker, solo stablecoin USDT.
        </p>
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
              className="group flex items-center justify-between bg-[#313338] border border-zinc-700 hover:border-purple-500/50 hover:bg-[#383a40] rounded-2xl px-5 py-4 transition-all hover:scale-[1.01]"
            >
              <div className="flex items-center gap-4">
                {/* Sport icon */}
                <span className="hidden sm:flex w-10 h-10 rounded-2xl bg-[#2b2d31] items-center justify-center text-xl select-none">
                  ⚽
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-400 bg-purple-400/10 px-2 py-0.5 rounded-lg">
                      {event.sport}
                    </span>
                    {badge && (
                      <span className={`inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border leading-none select-none ${badge.className}`}>
                        {badge.emoji} {badge.label}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-500">
                      {start.toLocaleDateString('it-IT')} · {start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h2 className="text-base font-extrabold text-zinc-100 group-hover:text-white transition-colors">
                    {event.name}
                  </h2>
                  <div className="flex gap-1.5">
                    {event.teams.map((t) => (
                      <span key={t} className="text-xs font-bold bg-[#2b2d31] text-zinc-400 px-2 py-0.5 rounded-lg">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs font-bold text-zinc-500 hidden sm:block">Order book</span>
                <span className="text-zinc-400 group-hover:text-purple-400 transition-colors text-lg">→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
