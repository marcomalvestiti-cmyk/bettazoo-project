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
  onBet?: (outcome: number, offers: Offer[]) => void
}

const OUTCOME_STYLE: Record<number, {
  dot: string
  label: string
  activeBorder: string
  activeBg: string
  rowBorder: string
  topBar: string
}> = {
  0: {
    dot:          'bg-sky-400',
    label:        'text-sky-300',
    activeBorder: 'border-sky-500/70',
    activeBg:     'bg-sky-500/10',
    rowBorder:    'border-l-sky-500/60',
    topBar:       'bg-sky-400',
  },
  1: {
    dot:          'bg-fuchsia-400',
    label:        'text-fuchsia-300',
    activeBorder: 'border-fuchsia-500/70',
    activeBg:     'bg-fuchsia-500/10',
    rowBorder:    'border-l-fuchsia-500/60',
    topBar:       'bg-fuchsia-400',
  },
  2: {
    dot:          'bg-emerald-400',
    label:        'text-emerald-300',
    activeBorder: 'border-emerald-500/70',
    activeBg:     'bg-emerald-500/10',
    rowBorder:    'border-l-emerald-500/60',
    topBar:       'bg-emerald-400',
  },
}

export default function OrderBook({ eventId, onBet }: Props) {
  const [data, setData]               = useState<{ orders: Offer[]; summary: Summary } | null>(null)
  const [loading, setLoading]         = useState(true)
  const [selectedOutcome, setSelectedOutcome] = useState<number | undefined>()

  // Always load the full unfiltered order book; filter client-side
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchOrderBook(eventId)
        if (!cancelled) setData(result)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [eventId])

  // Client-side outcome filter
  const displayOrders = data
    ? selectedOutcome !== undefined
      ? data.orders.filter((o) => o.outcome === selectedOutcome)
      : data.orders
    : []

  // Best odds per outcome → drives BEST PRICE badge
  const bestOddsMap = new Map<number, number>()
  data?.orders.forEach((o) => {
    const cur = bestOddsMap.get(o.outcome) ?? 0
    if (o.oddsDecimal > cur) bestOddsMap.set(o.outcome, o.oddsDecimal)
  })

  // Max liquidity for depth bar scaling
  const maxLiquidity = Math.max(
    ...displayOrders.map((o) => parseFloat(o.remainingLiabilityUsdt)),
    1,
  )

  function handleCardClick(outcomeNum: number) {
    const isDeselect = selectedOutcome === outcomeNum
    setSelectedOutcome(isDeselect ? undefined : outcomeNum)
    if (!isDeselect && onBet && data) {
      const offersForOutcome = data.orders.filter((o) => o.outcome === outcomeNum)
      onBet(outcomeNum, offersForOutcome)
    }
  }

  function handleRowBet(outcomeNum: number) {
    if (!onBet || !data) return
    const offersForOutcome = data.orders.filter((o) => o.outcome === outcomeNum)
    onBet(outcomeNum, offersForOutcome)
  }

  const summaryList = data?.summary ? Object.values(data.summary) : []

  // ── Gamification ─────────────────────────────────────────────
  // Top placer: address with the highest total remaining liquidity
  const placerLiqMap = new Map<string, number>()
  data?.orders.forEach((o) => {
    placerLiqMap.set(o.placer, (placerLiqMap.get(o.placer) ?? 0) + parseFloat(o.remainingLiabilityUsdt))
  })
  const topPlacer = placerLiqMap.size > 0
    ? [...placerLiqMap.entries()].sort((a, b) => b[1] - a[1])[0][0]
    : null

  // Highest single odds in the entire current book
  const bestOddsInBook = data?.orders.length
    ? Math.max(...data.orders.map((o) => o.oddsDecimal))
    : 0

  // Outcome card with the best overall odds
  const bestOddsOutcome = summaryList.length
    ? summaryList.reduce((p, c) => c.bestOdds > p.bestOdds ? c : p).outcome
    : -1

  return (
    <div className="space-y-4">

      {/* ── Outcome summary cards ── */}
      {summaryList.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {summaryList.map((s) => {
            const active = selectedOutcome === s.outcome
            const st     = OUTCOME_STYLE[s.outcome] ?? OUTCOME_STYLE[0]
            return (
              <div
                key={s.outcome}
                onClick={() => handleCardClick(s.outcome)}
                className={`relative rounded-2xl border overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.04] ${
                  active
                    ? `${st.activeBorder} ${st.activeBg}`
                    : 'border-zinc-800 bg-[#313338] hover:border-zinc-700 hover:bg-[#383a40]'
                }`}
              >
                {/* Top accent line when active */}
                {active && <span className={`absolute top-0 inset-x-0 h-0.5 ${st.topBar}`} />}

                <div className="p-3 sm:p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                    <span className={`text-xs font-bold truncate ${active ? st.label : 'text-zinc-400'}`}>
                      {OUTCOMES[s.outcome] ?? `Outcome ${s.outcome}`}
                    </span>
                  </div>

                  {/* Gamification badge */}
                  {s.outcome === bestOddsOutcome && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 leading-none mb-2 select-none">
                      🏅 Miglior Quota
                    </span>
                  )}

                  <div className="tabular-nums leading-none mb-2">
                    <span className="text-2xl font-extrabold font-mono text-white">{s.bestOdds.toFixed(2)}</span>
                    <span className="text-sm text-zinc-500 font-normal ml-0.5">x</span>
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] text-zinc-500">{s.count} offerte</span>
                    <span className="text-[11px] text-zinc-500 font-mono tabular-nums font-bold">
                      ${s.totalLiquidityUsdt.toFixed(0)}
                    </span>
                  </div>

                  {/* Bet CTA — only shown when onBet is wired up */}
                  {onBet && (
                    <div className="pt-3 border-t border-zinc-700/50">
                      <span className="block w-full text-center text-xs font-extrabold text-purple-400">
                        Scommetti {s.bestOdds.toFixed(2)}x →
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Orders table ── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500 text-sm">
          <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Caricamento order book…
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-zinc-600">
          <span className="text-3xl select-none">📭</span>
          <span className="text-sm font-bold">Nessuna offerta disponibile</span>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="bg-[#2b2d31]/80 border-b border-zinc-800">
                <th className="px-4 py-3 text-left  text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Esito</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Quota</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Max Stake</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Liquidità</th>
                <th className="px-4 py-3 text-left  text-[11px] font-bold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Placer</th>
              </tr>
            </thead>
            <tbody>
              {displayOrders.map((o, idx) => {
                const isBestPrice  = bestOddsMap.get(o.outcome) === o.oddsDecimal
                const st           = OUTCOME_STYLE[o.outcome] ?? OUTCOME_STYLE[0]
                const liquidityPct = (parseFloat(o.remainingLiabilityUsdt) / maxLiquidity) * 100
                const isLast       = idx === displayOrders.length - 1

                return (
                  <tr
                    key={o.offerId}
                    className={`
                      group relative border-l-2 transition-colors hover:bg-[#383a40]
                      ${isLast ? '' : 'border-b border-zinc-800'}
                      ${st.rowBorder}
                    `}
                  >
                    {/* Esito */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                        <span className={`text-xs font-bold ${st.label}`}>
                          {OUTCOMES[o.outcome] ?? o.outcome}
                        </span>
                      </div>
                    </td>

                    {/* Quota — clickable when onBet is wired */}
                    <td
                      onClick={() => handleRowBet(o.outcome)}
                      className={`px-4 py-3.5 text-right ${onBet ? 'cursor-pointer' : ''}`}
                    >
                      <div className="flex items-center justify-end gap-2">
                        {isBestPrice && (
                          <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 uppercase tracking-widest leading-none select-none">
                            Best
                          </span>
                        )}
                        <span className="font-extrabold font-mono tabular-nums text-base leading-none text-purple-400 group-hover:text-purple-300 transition-colors">
                          {o.oddsDecimal.toFixed(2)}
                          <span className="text-xs text-zinc-500 font-normal">x</span>
                        </span>
                        {onBet && (
                          <span className="text-zinc-700 group-hover:text-purple-500/60 transition-colors text-xs select-none">
                            →
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Max Stake */}
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="font-extrabold font-mono tabular-nums text-sm text-zinc-200">
                        ${parseFloat(o.maxBettorStakeUsdt).toFixed(2)}
                      </span>
                    </td>

                    {/* Liquidità + depth bar */}
                    <td className="px-4 py-3.5 text-right relative overflow-hidden">
                      <span
                        className="absolute inset-y-0 right-0 bg-zinc-700/25 pointer-events-none"
                        style={{ width: `${liquidityPct}%` }}
                      />
                      <span className="relative font-bold font-mono tabular-nums text-sm text-zinc-400">
                        ${parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
                      </span>
                    </td>

                    {/* Placer */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-zinc-700 group-hover:text-zinc-400 transition-colors">
                          {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
                        </span>
                        {o.placer === topPlacer && (
                          <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 leading-none select-none whitespace-nowrap">
                            🏆 Top
                          </span>
                        )}
                        {o.oddsDecimal === bestOddsInBook && bestOddsInBook > 0 && (
                          <span className="inline-flex items-center text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30 leading-none select-none whitespace-nowrap">
                            ⭐ Best
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>

          {/* Table footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-zinc-800 bg-[#2b2d31]/60">
            <span className="text-xs font-bold text-zinc-600">
              {displayOrders.length} offert{displayOrders.length === 1 ? 'a' : 'e'}
              {selectedOutcome !== undefined && ` · ${OUTCOMES[selectedOutcome]}`}
            </span>
            {selectedOutcome !== undefined && (
              <button
                onClick={() => setSelectedOutcome(undefined)}
                className="text-xs font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Mostra tutti ×
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
