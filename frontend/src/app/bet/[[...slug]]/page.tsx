import { MOCK_EVENTS } from '@/lib/abis'
import { filterEventsBySlug } from '@/lib/sportsData'
import SportSidebar from '@/components/SportSidebar'
import Link from 'next/link'

const EVENT_BADGES: Record<string, { label: string; emoji: string; className: string }> = {
  'evt-001': { label: 'Hot',      emoji: '🔥', className: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  'evt-002': { label: 'Featured', emoji: '⭐', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
  'evt-003': { label: 'New',      emoji: '✨', className: 'bg-sky-500/15    text-sky-400    border-sky-500/30'    },
  'evt-010': { label: 'Live',     emoji: '🔴', className: 'bg-red-500/15    text-red-400    border-red-500/30'    },
}

export default async function BetPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug = [] } = await params
  const filtered = filterEventsBySlug(MOCK_EVENTS, slug)

  let title = 'Featured Events'
  let subtitle = 'Top markets right now'

  if (slug.length >= 1) {
    title   = slug[0] === 'sports' ? 'Sports' : 'E-Sports'
    subtitle = slug[0] === 'sports' ? 'All sports markets' : 'All e-sports markets'
  }
  if (slug.length >= 2) {
    const sample = MOCK_EVENTS.find(e => e.sport === slug[1])
    title    = sample?.sportLabel ?? slug[1]
    subtitle = slug[0] === 'sports' ? 'Sports' : 'E-Sports'
  }
  if (slug.length >= 3) {
    const sample = MOCK_EVENTS.find(e => e.league === slug[2])
    title    = sample?.leagueLabel ?? slug[2]
    subtitle = sample?.sportLabel ?? slug[1]
  }

  return (
    <div className="flex min-h-[calc(100vh-64px)]">
      <SportSidebar activeSlug={slug} />

      <div className="flex-1 min-w-0 px-4 md:px-6 py-6 space-y-5">

        {/* Section header */}
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{subtitle}</p>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="text-xs text-slate-500">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''} available
          </p>
        </div>

        {/* Event list */}
        {filtered.length === 0 ? (
          <div className="rounded-lg bg-slate-900 border border-slate-800 px-6 py-16 text-center">
            <p className="text-slate-500 text-sm">No events available for this selection.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((event) => {
              const start = new Date(event.startTime)
              const badge = EVENT_BADGES[event.eventId]
              return (
                <Link
                  key={event.eventId}
                  href={`/event/${event.eventId}`}
                  className="group flex items-center justify-between bg-slate-900 border border-slate-800 hover:border-slate-700 hover:bg-slate-800 rounded-lg px-5 py-4 transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="hidden sm:flex w-10 h-10 rounded-lg bg-slate-800 group-hover:bg-slate-700 items-center justify-center text-xl select-none shrink-0 transition-colors">
                      {event.icon}
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-red-500 bg-[#B31A1A]/10 px-2 py-0.5 rounded whitespace-nowrap">
                          {event.sportLabel}
                        </span>
                        <span className="text-xs text-slate-600 font-medium hidden sm:block">
                          {event.leagueLabel}
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
                      <h3 className="text-base font-semibold text-slate-100 group-hover:text-white transition-colors truncate">
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
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-sm font-medium text-slate-500 hidden sm:block">View Odds</span>
                    <span className="text-slate-400 group-hover:text-red-500 transition-colors text-xl">→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
