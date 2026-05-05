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
    dot:          'bg-amber-400',
    label:        'text-amber-300',
    activeBorder: 'border-amber-500/70',
    activeBg:     'bg-amber-500/10',
    rowBorder:    'border-l-amber-500/60',
    topBar:       'bg-amber-400',
  },
  2: {
    dot:          'bg-violet-400',
    label:        'text-violet-300',
    activeBorder: 'border-violet-500/70',
    activeBg:     'bg-violet-500/10',
    rowBorder:    'border-l-violet-500/60',
    topBar:       'bg-violet-400',
  },
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

  // Best odds per outcome → drives the BEST PRICE badge
  const bestOddsMap = new Map<number, number>()
  data?.orders.forEach((o) => {
    const cur = bestOddsMap.get(o.outcome) ?? 0
    if (o.oddsDecimal > cur) bestOddsMap.set(o.outcome, o.oddsDecimal)
  })

  // Max liquidity for proportional depth bar
  const maxLiquidity = Math.max(
    ...(data?.orders.map((o) => parseFloat(o.remainingLiabilityUsdt)) ?? []),
    1,
  )

  // Estimated win at average matched odds
  const avgOdds = matchedOffers.length
    ? matchedOffers.reduce((s, o) => s + o.oddsDecimal, 0) / matchedOffers.length
    : 0
  const potentialWin = stakeNum * avgOdds

  function handleBet() {
    if (!onSelectOffers || matchedOffers.length === 0 || stakeNum <= 0) return
    onSelectOffers(matchedOffers, stakeNum)
  }

  const summaryList = data?.summary ? Object.values(data.summary) : []

  return (
    <div className="space-y-4">

      {/* ── Outcome summary cards ── */}
      {summaryList.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {summaryList.map((s) => {
            const active = selectedOutcome === s.outcome
            const st = OUTCOME_STYLE[s.outcome] ?? OUTCOME_STYLE[0]
            return (
              <button
                key={s.outcome}
                onClick={() => setSelectedOutcome(active ? undefined : s.outcome)}
                className={`relative rounded-xl p-4 text-left border transition-all overflow-hidden ${
                  active
                    ? `${st.activeBorder} ${st.activeBg}`
                    : 'border-slate-800 bg-slate-800/50 hover:border-slate-700 hover:bg-slate-800'
                }`}
              >
                {/* top accent line when active */}
                {active && (
                  <span className={`absolute top-0 inset-x-0 h-0.5 ${st.topBar}`} />
                )}

                <div className="flex items-center gap-1.5 mb-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                  <span className={`text-xs font-medium ${active ? st.label : 'text-slate-400'}`}>
                    {OUTCOMES[s.outcome] ?? `Outcome ${s.outcome}`}
                  </span>
                </div>

                <div className="tabular-nums leading-none mb-2">
                  <span className="text-2xl font-bold font-mono text-white">{s.bestOdds.toFixed(2)}</span>
                  <span className="text-sm text-slate-500 font-normal ml-0.5">x</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">{s.count} offerte</span>
                  <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                    ${s.totalLiquidityUsdt.toFixed(0)}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Stake input + CTA ── */}
      {onSelectOffers && (
        <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="block text-xs font-medium text-slate-500">Importo scommessa</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 select-none">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-6 pr-14 py-2.5 text-sm text-white font-mono tabular-nums placeholder:text-slate-700 focus:outline-none focus:border-green-500 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600 font-mono select-none">USDT</span>
              </div>
            </div>

            {potentialWin > 0 && (
              <div className="shrink-0 space-y-1.5">
                <label className="block text-xs font-medium text-slate-500">Vincita pot.</label>
                <div className="px-3 py-2.5 bg-green-500/10 border border-green-500/25 rounded-lg">
                  <span className="font-bold font-mono tabular-nums text-sm text-green-400">
                    ${potentialWin.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleBet}
            disabled={matchedOffers.length === 0 || stakeNum <= 0}
            className="w-full py-3 text-sm font-bold rounded-lg bg-green-500 hover:bg-green-400 text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shadow-[0_0_16px_rgba(74,222,128,0.2)] disabled:shadow-none"
          >
            {matchedOffers.length > 0 && stakeNum > 0
              ? `Accetta Scommessa · ${matchedOffers.length} offert${matchedOffers.length === 1 ? 'a' : 'e'}`
              : 'Accetta Scommessa'}
          </button>
        </div>
      )}

      {/* ── Orders table ── */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500 text-sm">
          <svg className="w-4 h-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Caricamento order book…
        </div>
      ) : !data || data.orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-600">
          <span className="text-3xl select-none">📭</span>
          <span className="text-sm">Nessuna offerta disponibile</span>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900/80 border-b border-slate-800">
                <th className="px-4 py-3 text-left   text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Esito</th>
                <th className="px-4 py-3 text-right  text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Quota</th>
                <th className="px-4 py-3 text-right  text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Max Stake</th>
                <th className="px-4 py-3 text-right  text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Liquidità</th>
                <th className="px-4 py-3 text-left   text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Placer</th>
              </tr>
            </thead>
            <tbody>
              {data.orders.map((o, idx) => {
                const isMatched   = matchedOffers.some((m) => m.offerId === o.offerId)
                const isBestPrice = bestOddsMap.get(o.outcome) === o.oddsDecimal
                const st          = OUTCOME_STYLE[o.outcome] ?? OUTCOME_STYLE[0]
                const liquidityPct = (parseFloat(o.remainingLiabilityUsdt) / maxLiquidity) * 100
                const isLast      = idx === data.orders.length - 1

                return (
                  <tr
                    key={o.offerId}
                    className={`
                      group relative border-l-2 transition-colors
                      ${isLast ? '' : 'border-b border-slate-800'}
                      ${isMatched
                        ? `bg-green-500/6 ${st.rowBorder}`
                        : `hover:bg-slate-800/50 ${st.rowBorder}`}
                    `}
                  >
                    {/* Esito */}
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dot}`} />
                        <span className={`text-xs font-medium ${st.label}`}>
                          {OUTCOMES[o.outcome] ?? o.outcome}
                        </span>
                      </div>
                    </td>

                    {/* Quota + BEST badge */}
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isBestPrice && (
                          <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30 uppercase tracking-widest leading-none select-none">
                            Best
                          </span>
                        )}
                        <span className="font-mono font-bold tabular-nums text-base leading-none text-green-400">
                          {o.oddsDecimal.toFixed(2)}
                          <span className="text-xs text-slate-500 font-normal">x</span>
                        </span>
                      </div>
                    </td>

                    {/* Max Stake */}
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="font-mono tabular-nums text-sm text-slate-200">
                        ${parseFloat(o.maxBettorStakeUsdt).toFixed(2)}
                      </span>
                    </td>

                    {/* Liquidità + depth bar */}
                    <td className="px-4 py-3.5 text-right relative overflow-hidden">
                      {/* depth fill behind the number */}
                      <span
                        className="absolute inset-y-0 right-0 bg-slate-700/25 pointer-events-none"
                        style={{ width: `${liquidityPct}%` }}
                      />
                      <span className="relative font-mono tabular-nums text-sm text-slate-400">
                        ${parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
                      </span>
                    </td>

                    {/* Placer — fades in on hover */}
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      <span className="font-mono text-xs text-slate-700 group-hover:text-slate-400 transition-colors">
                        {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Table footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-900/60">
            <span className="text-xs text-slate-600">
              {data.orders.length} offert{data.orders.length === 1 ? 'a' : 'e'}
              {selectedOutcome !== undefined && ` · ${OUTCOMES[selectedOutcome]}`}
            </span>
            {selectedOutcome !== undefined && (
              <button
                onClick={() => setSelectedOutcome(undefined)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
