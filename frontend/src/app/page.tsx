import Link from 'next/link'
import { MOCK_EVENTS } from '@/lib/abis'

export default function Home() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">Exchange</h1>
        <p className="text-zinc-400 mt-1 text-sm">
          Scommetti peer-to-peer — nessun bookmaker, solo stablecoin.
        </p>
      </div>

      <div className="grid gap-4">
        {MOCK_EVENTS.map((event) => {
          const start = new Date(event.startTime)
          return (
            <Link
              key={event.eventId}
              href={`/event/${event.eventId}`}
              className="block bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-600 transition-colors group"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-emerald-400 mb-1 uppercase tracking-wide">{event.sport}</div>
                  <h2 className="text-lg font-semibold text-zinc-100 group-hover:text-white">
                    {event.name}
                  </h2>
                  <div className="flex gap-2 mt-2">
                    {event.teams.map((t) => (
                      <span key={t} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  <div>{start.toLocaleDateString('it-IT')}</div>
                  <div>{start.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-500 flex items-center gap-1">
                Vedi order book →
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
