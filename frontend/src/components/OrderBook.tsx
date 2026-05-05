'use client'

import { useEffect, useState } from 'react'
import { fetchOrderBook } from '@/lib/api'
import { OUTCOMES } from '@/lib/abis'

export type Offer = {
  offerId: number
  placer: string
  eventId: string
  outcome: number
  oddsDecimal: number
  remainingLiabilityUsdt: string
  maxBettorStakeUsdt: string
}

type Summary = Record<string, {
  outcome: number
  count: number
  totalLiquidityUsdt: number
  bestOdds: number
}>

type Props = {
  eventId: string
  onSelectOffers?: (offers: Offer[], stake: number) => void
}

function computeMultiMatch(offers: Offer[], stakeUsdt: number) {
  let remaining = stakeUsdt
  const selected: Offer[] = []
  for (const offer of offers) {
    if (remaining <= 0) break
    const avail = parseFloat(offer.maxBettorStakeUsdt)
    if (avail <= 0) continue
    selected.push(offer)
    remaining -= avail
  }
  return selected
}

export default function OrderBook({ eventId, onSelectOffers }: Props) {
  const [data, setData] = useState<{ orders: Offer[]; summary: Summary } | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedOutcome, setSelectedOutcome] = useState<number | undefined>()
  const [stake, setStake] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchOrderBook(eventId, selectedOutcome)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [eventId, selectedOutcome])

  const stakeNum = parseFloat(stake) || 0
  const matchedOffers = data ? computeMultiMatch(data.orders, stakeNum) : []

  function handleBet() {
    if (!onSelectOffers || matchedOffers.length === 0 || stakeNum <= 0) return
    onSelectOffers(matchedOffers, stakeNum)
  }

  return (
    <div className="space-y-4">

      {/* Outcome summary cards */}
      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          {Object.values(data.summary).map((s) => {
            const active = selectedOutcome === s.outcome
            return (
              <button
                key={s.outcome}
                onClick={() => setSelectedOutcome(active ? undefined : s.outcome)}
                className={`rounded-xl p-3 text-left border transition-all ${
                  active
                    ? 'border-green-500 bg-green-500/10 shadow-[0_0_12px_rgba(74,222,128,0.15)]'
                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="text-xs text-slate-400 mb-1">{OUTCOMES[s.outcome] ?? `Outcome ${s.outcome}`}</div>
                <div className="text-xl font-bold font-mono text-green-400">{s.bestOdds.toFixed(2)}x</div>
                <div className="text-xs text-slate-500 mt-0.5">{s.count} offerte · ${s.totalLiquidityUsdt.toFixed(0)}</div>
              </button>
            )
          })}
        </div>
      )}

      {/* Stake input + CTA */}
      {onSelectOffers && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Importo scommessa (USDT)"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-16 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">USDT</span>
          </div>
          <button
            onClick={handleBet}
            disabled={matchedOffers.length === 0 || stakeNum <= 0}
            className="px-4 py-2.5 text-sm font-bold rounded-lg bg-green-500 hover:bg-green-400 text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-[0_0_12px_rgba(74,222,128,0.25)] disabled:shadow-none"
          >
            Accetta Scommessa
            {matchedOffers.length > 0 && (
              <span className="ml-1.5 text-xs font-normal opacity-70">({matchedOffers.length})</span>
            )}
          </button>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <div className="text-center text-slate-500 py-12 text-sm">Caricamento order book…</div>
      ) : !data || data.orders.length === 0 ? (
        <div className="text-center text-slate-500 py-12 text-sm">Nessuna offerta disponibile</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800 border-b border-slate-700 text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Esito</th>
                <th className="px-4 py-3 text-right">Quota</th>
                <th className="px-4 py-3 text-right">Max stake</th>
                <th className="px-4 py-3 text-right">Liquidità</th>
                <th className="px-4 py-3 text-left">Placer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {data.orders.map((o) => {
                const isMatched = matchedOffers.some((m) => m.offerId === o.offerId)
                return (
                  <tr
                    key={o.offerId}
                    className={`transition-colors ${
                      isMatched
                        ? 'bg-green-500/8 border-l-2 border-l-green-500'
                        : 'hover:bg-slate-800/60'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                        {OUTCOMES[o.outcome] ?? o.outcome}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-green-400">
                      {o.oddsDecimal.toFixed(2)}x
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-200">
                      ${o.maxBettorStakeUsdt}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-400">
                      ${o.remainingLiabilityUsdt}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
