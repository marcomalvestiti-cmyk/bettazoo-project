'use client'

import { useEffect, useState } from 'react'
import { MOCK_EVENTS, OUTCOMES } from '@/lib/abis'
import { fetchOracleEvents, postOracleResolve, type OracleEvent } from '@/lib/api'

type ResolvingState = { eventId: string; outcome: number } | null

const OUTCOME_LABELS: Record<number, string> = {
  0: 'Home Win',
  1: 'Draw',
  2: 'Away Win',
}

const OUTCOME_COLORS: Record<number, string> = {
  0: 'bg-blue-600 hover:bg-blue-500',
  1: 'bg-amber-500 hover:bg-amber-400 text-slate-950',
  2: 'bg-rose-600 hover:bg-rose-500',
}

const OUTCOME_BADGE: Record<number, string> = {
  0: 'bg-blue-900/40 text-blue-300 border-blue-800',
  1: 'bg-amber-900/40 text-amber-300 border-amber-800',
  2: 'bg-rose-900/40 text-rose-300 border-rose-800',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) +
    ' ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

export default function AdminResolverPage() {
  const [resolvedMap, setResolvedMap]   = useState<Record<string, number>>({})
  const [resolving,   setResolving]     = useState<ResolvingState>(null)
  const [feedback,    setFeedback]      = useState<Record<string, { ok: boolean; msg: string }>>({})
  const [loading,     setLoading]       = useState(true)

  useEffect(() => {
    fetchOracleEvents()
      .then((events: OracleEvent[]) => {
        const map: Record<string, number> = {}
        events.forEach(e => {
          if (e.resolved && e.winningOutcome !== undefined) map[e.eventId] = e.winningOutcome
        })
        setResolvedMap(map)
      })
      .finally(() => setLoading(false))
  }, [])

  async function resolve(eventId: string, outcome: number) {
    setResolving({ eventId, outcome })
    setFeedback(f => { const n = { ...f }; delete n[eventId]; return n })
    try {
      await postOracleResolve({ eventId, winningOutcome: outcome })
      setResolvedMap(m => ({ ...m, [eventId]: outcome }))
      setFeedback(f => ({ ...f, [eventId]: { ok: true, msg: OUTCOME_LABELS[outcome] } }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setFeedback(f => ({ ...f, [eventId]: { ok: false, msg } }))
    } finally {
      setResolving(null)
    }
  }

  const pending  = MOCK_EVENTS.filter(e => !(e.eventId in resolvedMap))
  const resolved = MOCK_EVENTS.filter(e => e.eventId in resolvedMap)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">Admin Panel</p>
        <h1 className="text-3xl font-bold text-white">Oracle Resolver</h1>
        <p className="text-sm text-slate-400">Manually settle events for the Alpha Test. Resolution is stored in MongoDB; on-chain settlement triggers automatically when a contract is deployed.</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Events',    value: MOCK_EVENTS.length,  color: 'text-white' },
          { label: 'Pending',         value: pending.length,      color: 'text-amber-400' },
          { label: 'Resolved',        value: resolved.length,     color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Pending events */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
          Pending — awaiting resolution
        </h2>

        {loading && (
          <p className="text-sm text-slate-500 py-4">Loading resolution status…</p>
        )}

        {!loading && pending.length === 0 && (
          <p className="text-sm text-emerald-400 py-4">All events have been resolved.</p>
        )}

        <div className="space-y-2">
          {pending.map(ev => {
            const isResolving = resolving?.eventId === ev.eventId
            const fb = feedback[ev.eventId]

            return (
              <div key={ev.eventId} className="bg-slate-900 border border-slate-800 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">

                  {/* Event info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="text-xl shrink-0">{ev.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm leading-tight">{ev.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        <span className="text-[#FFB01F]">{ev.sportLabel}</span>
                        {' · '}{ev.leagueLabel}
                        {' · '}{formatTime(ev.startTime)}
                      </p>
                    </div>
                  </div>

                  {/* Teams + resolve buttons */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {ev.teams.map((team, idx) => {
                      const outcome = idx === 0 ? 0 : 2
                      return (
                        <button
                          key={team}
                          disabled={isResolving}
                          onClick={() => resolve(ev.eventId, outcome)}
                          className={`px-3 py-1.5 rounded text-xs font-bold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${OUTCOME_COLORS[outcome]}`}
                        >
                          {isResolving && resolving?.outcome === outcome ? '…' : `Win ${team}`}
                        </button>
                      )
                    })}
                    <button
                      disabled={isResolving}
                      onClick={() => resolve(ev.eventId, 1)}
                      className={`px-3 py-1.5 rounded text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${OUTCOME_COLORS[1]}`}
                    >
                      {isResolving && resolving?.outcome === 1 ? '…' : 'Draw'}
                    </button>
                  </div>
                </div>

                {/* Inline feedback */}
                {fb && (
                  <p className={`text-xs mt-2 ${fb.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fb.ok ? `✓ Resolved: ${fb.msg}` : `✗ ${fb.msg}`}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Resolved events */}
      {resolved.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
            Resolved
          </h2>
          <div className="space-y-2">
            {resolved.map(ev => {
              const outcome = resolvedMap[ev.eventId]
              return (
                <div key={ev.eventId} className="bg-slate-950 border border-slate-800/50 rounded-lg px-4 py-3 flex items-center gap-3 opacity-70">
                  <span className="text-lg shrink-0">{ev.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300 font-medium">{ev.name}</p>
                    <p className="text-xs text-slate-600">{ev.leagueLabel}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded border ${OUTCOME_BADGE[outcome]}`}>
                    {OUTCOME_LABELS[outcome]}
                  </span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
