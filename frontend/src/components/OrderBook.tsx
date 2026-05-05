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
      {/* Summary */}
      {data?.summary && (
        <div className="grid grid-cols-3 gap-3">
          {Object.values(data.summary).map((s) => (
            <button
              key={s.outcome}
              onClick={() => setSelectedOutcome(selectedOutcome === s.outcome ? undefined : s.outcome)}
              className={`rounded-xl p-3 text-left border transition-colors ${
                selectedOutcome === s.outcome
                  ? 'border-emerald-500 bg-emerald-950/30'
                  : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
              }`}
            >
              <div className="text-xs text-zinc-400">{OUTCOMES[s.outcome] ?? `Outcome ${s.outcome}`}</div>
              <div className="text-lg font-bold text-emerald-400">{s.bestOdds.toFixed(2)}x</div>
              <div className="text-xs text-zinc-500">{s.count} offerte · ${s.totalLiquidityUsdt.toFixed(2)}</div>
            </button>
          ))}
        </div>
      )}

      {/* Stake input */}
      {onSelectOffers && (
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Importo scommessa (USDT)"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleBet}
            disabled={matchedOffers.length === 0 || stakeNum <= 0}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            Scommetti ({matchedOffers.length} offerte)
          </button>
        </div>
      )}

      {/* Orders table */}
      {loading ? (
        <div className="text-center text-zinc-500 py-8">Caricamento order book…</div>
      ) : !data || data.orders.length === 0 ? (
        <div className="text-center text-zinc-500 py-8">Nessuna offerta disponibile</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="px-4 py-2 text-left">Esito</th>
                <th className="px-4 py-2 text-right">Quota</th>
                <th className="px-4 py-2 text-right">Max stake (USDT)</th>
                <th className="px-4 py-2 text-right">Liquidità (USDT)</th>
                <th className="px-4 py-2 text-left">Placer</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o) => {
                const isMatched = matchedOffers.some((m) => m.offerId === o.offerId)
                return (
                  <tr
                    key={o.offerId}
                    className={`border-b border-zinc-800/50 transition-colors ${
                      isMatched ? 'bg-emerald-950/20' : 'hover:bg-zinc-900'
                    }`}
                  >
                    <td className="px-4 py-2 text-zinc-300">{OUTCOMES[o.outcome] ?? o.outcome}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-400">
                      {o.oddsDecimal.toFixed(2)}x
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{o.maxBettorStakeUsdt}</td>
                    <td className="px-4 py-2 text-right font-mono text-zinc-400">{o.remainingLiabilityUsdt}</td>
                    <td className="px-4 py-2 font-mono text-xs text-zinc-500">
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
