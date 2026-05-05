import Link from 'next/link'
import { MOCK_EVENTS } from '@/lib/abis'

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-green-400 uppercase tracking-widest">Markets</p>
        <h1 className="text-3xl font-bold text-white">Exchange</h1>
        <p className="text-slate-400 text-sm">
          Scommetti peer-to-peer — nessun bookmaker, solo stablecoin USDT.
        </p>
      </div>

      {/* Event list */}
      <div className="space-y-3">
        {MOCK_EVENTS.map((event) => {
          const start = new Date(event.startTime)
          return (
            <Link
              key={event.eventId}
              href={`/event/${event.eventId}`}
              className="group flex items-center justify-between bg-slate-800 border border-slate-700 hover:border-green-500/50 hover:bg-slate-800/80 rounded-xl px-5 py-4 transition-all"
            >
              <div className="flex items-center gap-4">
                {/* Sport badge */}
                <span className="hidden sm:flex w-9 h-9 rounded-lg bg-slate-700 items-center justify-center text-lg select-none">
                  ⚽
                </span>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
                      {event.sport}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {start.toLocaleDateString('it-IT')} · {start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h2 className="text-base font-semibold text-slate-100 group-hover:text-white transition-colors">
                    {event.name}
                  </h2>
                  <div className="flex gap-1.5">
                    {event.teams.map((t) => (
                      <span key={t} className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-md">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-slate-500 hidden sm:block">Order book</span>
                <span className="text-slate-400 group-hover:text-green-400 transition-colors text-lg">→</span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
