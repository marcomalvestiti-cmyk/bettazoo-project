'use client'

import { useEffect, useState } from 'react'
import { fetchOrderBook } from '@/lib/api'

type BestOdds = [number | null, number | null, number | null]

const LABELS = ['1', 'X', '2']

export default function BestOddsStrip({ eventId }: { eventId: string }) {
  const [odds, setOdds]       = useState<BestOdds | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
        setOdds(best)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setOdds([null, null, null])
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [eventId])

  if (loading) {
    return (
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[52px] h-[26px] bg-slate-800/60 rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-1.5">
      {LABELS.map((label, i) => {
        const val = odds?.[i] ?? null
        return (
          <div
            key={label}
            className={`flex items-center gap-1 rounded px-2 py-1 border transition-colors ${
              val !== null
                ? 'bg-[#B31A1A]/8 border-[#B31A1A]/25'
                : 'bg-slate-950/40 border-slate-800/60'
            }`}
          >
            <span className={`text-[9px] font-bold leading-none ${val !== null ? 'text-red-600' : 'text-slate-600'}`}>
              {label}
            </span>
            <span className={`text-xs font-bold font-mono tabular-nums leading-none ${val !== null ? 'text-red-500' : 'text-slate-600'}`}>
              {val !== null ? val.toFixed(2) : '—'}
            </span>
          </div>
        )
      })}
    </div>
  )
}
