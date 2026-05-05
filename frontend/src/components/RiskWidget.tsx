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

const LEVEL_COLOR: Record<string, string> = {
  LOW: 'text-emerald-400 border-emerald-800 bg-emerald-950/20',
  MEDIUM: 'text-yellow-400 border-yellow-800 bg-yellow-950/20',
  HIGH: 'text-red-400 border-red-800 bg-red-950/20',
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

  if (loading) return <div className="text-zinc-500 text-sm">Caricamento rischio…</div>
  if (!data) return <div className="text-red-400 text-sm">Risk Manager non disponibile</div>

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${LEVEL_COLOR[data.level]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Risk Manager</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${LEVEL_COLOR[data.level]}`}>
          {data.level}
        </span>
      </div>
      <p className="text-xs opacity-80">{data.message}</p>
      <div className="text-xs">
        Esposizione totale:{' '}
        <span className="font-mono font-semibold">${data.totalExposureUsdt?.toFixed(2)} USDT</span>
      </div>
      {data.exposures?.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {data.exposures.map((e, i) => (
            <div key={i} className="flex justify-between text-xs opacity-70">
              <span className="font-mono">{e.eventId} / out.{e.outcome}</span>
              <span className="font-mono">${e.exposureUsdt.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
