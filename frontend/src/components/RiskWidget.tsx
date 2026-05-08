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
  LOW:    { badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30', border: 'border-zinc-700', dot: 'bg-emerald-400' },
  MEDIUM: { badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/30',   border: 'border-zinc-700', dot: 'bg-yellow-400' },
  HIGH:   { badge: 'text-red-400 bg-red-400/10 border-red-500/30',             border: 'border-red-500/40', dot: 'bg-red-400 animate-pulse' },
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
    <div className="rounded-2xl border border-zinc-700 bg-[#141419] p-4 text-xs text-zinc-500">
      Caricamento rischio…
    </div>
  )
  if (!data) return (
    <div className="rounded-2xl border border-red-500/30 bg-[#141419] p-4 text-xs text-red-400">
      Risk Manager non disponibile
    </div>
  )

  const style = LEVEL_STYLE[data.level] ?? LEVEL_STYLE.LOW

  return (
    <div className={`rounded-2xl border ${style.border} bg-[#141419] p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-extrabold text-white">Risk Manager</span>
        <span className={`flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full border ${style.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {data.level}
        </span>
      </div>

      <p className="text-xs text-zinc-400">{data.message}</p>

      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">Esposizione totale</span>
        <span className="font-extrabold font-mono text-white">${data.totalExposureUsdt?.toFixed(2)} USDT</span>
      </div>

      {data.exposures?.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {data.exposures.map((e, i) => (
            <div key={i} className="flex justify-between text-xs bg-[#0f0f16]/60 rounded-xl px-2.5 py-1.5">
              <span className="font-mono text-zinc-400">{e.eventId} / out.{e.outcome}</span>
              <span className="font-extrabold font-mono text-zinc-300">${e.exposureUsdt.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
