'use client'

import { useEffect, useState } from 'react'
import { fetchRiskManager } from '@/lib/api'

type Exposure = {
  eventId: string
  outcome: number
  exposureUsdt: number
}

type RiskData = {
  level: 'LOW' | 'MEDIUM' | 'HIGH'
  totalExposureUsdt: number
  exposures: Exposure[]
  message: string
}

const LEVEL_STYLE: Record<string, { badge: string; border: string; dot: string }> = {
  LOW:    { badge: 'text-green-400 bg-green-400/10 border-green-500/30',  border: 'border-slate-700', dot: 'bg-green-400' },
  MEDIUM: { badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30', border: 'border-slate-700', dot: 'bg-yellow-400' },
  HIGH:   { badge: 'text-red-400 bg-red-400/10 border-red-500/30',        border: 'border-red-500/40', dot: 'bg-red-400 animate-pulse' },
}

export default function RiskWidget({ address }: { address: string }) {
  const [data, setData] = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchRiskManager(address)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  if (loading) return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-xs text-slate-500">
      Caricamento rischio…
    </div>
  )
  if (!data) return (
    <div className="rounded-xl border border-red-500/30 bg-slate-800 p-4 text-xs text-red-400">
      Risk Manager non disponibile
    </div>
  )

  const style = LEVEL_STYLE[data.level] ?? LEVEL_STYLE.LOW

  return (
    <div className={`rounded-xl border ${style.border} bg-slate-800 p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Risk Manager</span>
        <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${style.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {data.level}
        </span>
      </div>

      <p className="text-xs text-slate-400">{data.message}</p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">Esposizione totale</span>
        <span className="font-mono font-semibold text-white">${data.totalExposureUsdt?.toFixed(2)} USDT</span>
      </div>

      {data.exposures?.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {data.exposures.map((e, i) => (
            <div key={i} className="flex justify-between text-xs bg-slate-900/50 rounded-lg px-2.5 py-1.5">
              <span className="font-mono text-slate-400">{e.eventId} / out.{e.outcome}</span>
              <span className="font-mono text-slate-300">${e.exposureUsdt.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
