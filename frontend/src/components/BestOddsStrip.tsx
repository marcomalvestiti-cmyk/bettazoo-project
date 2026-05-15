'use client'

import { useEffect, useState } from 'react'
import { fetchOrderBook } from '@/lib/api'

type BestOdds = [number | null, number | null, number | null]

// Module-level 30s cache — prevents duplicate requests in React Strict Mode
// and on quick navigation back to home
const CACHE = new Map<string, { data: BestOdds; ts: number }>()
const CACHE_TTL = 30_000

function getCached(id: string): BestOdds | null {
  const e = CACHE.get(id)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) { CACHE.delete(id); return null }
  return e.data
}

const LABELS = ['1', 'X', '2'] as const

export default function BestOddsStrip({ eventId }: { eventId: string }) {
  const cached = getCached(eventId)
  const [odds, setOdds]       = useState<BestOdds | null>(cached)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (getCached(eventId)) return   // already fresh — skip fetch
    let cancelled = false
    fetchOrderBook(eventId)
      .then((data) => {
        if (cancelled) return
        const orders: Array<{ outcome: number; oddsDecimal: number }> = data.orders ?? []
        const best: BestOdds = [null, null, null]
        for (const o of orders) {
          if (o.outcome >= 0 && o.outcome <= 2) {
            if (best[o.outcome] === null || o.oddsDecimal > best[o.outcome]!) {
              best[o.outcome] = o.oddsDecimal
            }
          }
        }
        CACHE.set(eventId, { data: best, ts: Date.now() })
        setOdds(best)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          const empty: BestOdds = [null, null, null]
          setOdds(empty)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [eventId])

  // ── Skeleton ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-col items-center justify-center min-w-[62px] h-[54px] rounded-xl bg-slate-800/50 animate-pulse"
          />
        ))}
      </div>
    )
  }

  // ── Bookmaker-style blocks ────────────────────────────────────────────────────
  return (
    <div className="flex gap-2">
      {LABELS.map((label, i) => {
        const val      = odds?.[i] ?? null
        const hasOdds  = val !== null

        return (
          <div
            key={label}
            className={[
              'flex flex-col items-center justify-center',
              'min-w-[62px] px-2.5 py-2 rounded-xl border',
              'select-none transition-all duration-150',
              hasOdds
                ? 'bg-[#B31A1A]/10 border-[#B31A1A]/35 group-hover:bg-[#B31A1A]/18 group-hover:border-[#B31A1A]/55'
                : 'bg-slate-950/25 border-slate-800/50 opacity-40',
            ].join(' ')}
          >
            {/* outcome label */}
            <span className={[
              'text-[9px] font-black uppercase tracking-widest leading-none mb-1.5',
              hasOdds ? 'text-red-600/80' : 'text-slate-700',
            ].join(' ')}>
              {label}
            </span>

            {/* odds value */}
            <span className={[
              'text-base font-extrabold font-mono tabular-nums leading-none',
              hasOdds ? 'text-white' : 'text-slate-600',
            ].join(' ')}>
              {hasOdds ? val.toFixed(2) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
