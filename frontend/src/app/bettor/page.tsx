'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import Link from 'next/link'
import { loadBets, type BetRecord } from '@/lib/betHistory'
import { fetchOracleEvents } from '@/lib/api'
import { OUTCOMES } from '@/lib/abis'

type BetStatus = 'open' | 'won' | 'lost'

function getStatus(bet: BetRecord, resolved: Map<string, number>): BetStatus {
  const winning = resolved.get(bet.eventId)
  if (winning === undefined) return 'open'
  return bet.outcome === winning ? 'won' : 'lost'
}

const STATUS_STYLE: Record<BetStatus, { label: string; cls: string }> = {
  open:  { label: 'Pending',  cls: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  won:   { label: 'Won',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  lost:  { label: 'Lost',     cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
}

function EmptyState({ tab }: { tab: 'open' | 'settled' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <span className="text-4xl select-none">{tab === 'open' ? '🎯' : '📋'}</span>
      <p className="text-sm font-semibold text-slate-400">
        {tab === 'open' ? 'No open bets' : 'No settled bets yet'}
      </p>
      <p className="text-xs text-slate-600 max-w-xs">
        {tab === 'open'
          ? 'Place a bet on any event to see it here.'
          : 'Resolved bets will appear here once an event is settled.'}
      </p>
      {tab === 'open' && (
        <Link
          href="/bet"
          className="mt-1 px-5 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white transition-colors"
        >
          Browse Events →
        </Link>
      )}
    </div>
  )
}

function BetRow({ bet, status }: { bet: BetRecord; status: BetStatus }) {
  const st   = STATUS_STYLE[status]
  const date = new Date(bet.placedAt).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  const profit = status === 'won'
    ? `+$${(bet.potentialWinUsdt - bet.stakeUsdt).toFixed(2)}`
    : status === 'lost'
    ? `-$${bet.stakeUsdt.toFixed(2)}`
    : `$${bet.potentialWinUsdt.toFixed(2)}`

  const profitColor = status === 'won'
    ? 'text-emerald-400'
    : status === 'lost'
    ? 'text-red-400'
    : 'text-slate-300'

  return (
    <tr className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
      {/* Event */}
      <td className="px-4 py-3.5">
        <Link
          href={`/event/${bet.eventId}`}
          className="text-sm font-semibold text-slate-200 hover:text-white transition-colors line-clamp-1"
          onClick={(e) => e.stopPropagation()}
        >
          {bet.eventName}
        </Link>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">{date}</p>
      </td>
      {/* Outcome */}
      <td className="px-4 py-3.5">
        <span className="text-sm font-semibold text-slate-300">
          {OUTCOMES[bet.outcome] ?? `Outcome ${bet.outcome}`}
        </span>
      </td>
      {/* Stake */}
      <td className="px-4 py-3.5 text-right">
        <span className="text-sm font-mono font-semibold text-slate-200 tabular-nums">
          ${bet.stakeUsdt.toFixed(2)}
        </span>
      </td>
      {/* Odds */}
      <td className="px-4 py-3.5 text-right">
        <span className="text-sm font-mono font-bold text-red-500 tabular-nums">
          {bet.oddsDecimal.toFixed(2)}x
        </span>
      </td>
      {/* Profit/Payout */}
      <td className="px-4 py-3.5 text-right">
        <span className={`text-sm font-mono font-bold tabular-nums ${profitColor}`}>
          {profit}
        </span>
        {status === 'open' && (
          <p className="text-[10px] text-slate-600 text-right">potential</p>
        )}
      </td>
      {/* Status */}
      <td className="px-4 py-3.5 text-right">
        <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded border leading-none ${st.cls}`}>
          {st.label}
        </span>
      </td>
    </tr>
  )
}

export default function BettorDashboard() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<'open' | 'settled'>('open')
  const [bets, setBets] = useState<BetRecord[]>([])
  const [resolved, setResolved] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    if (address) setBets(loadBets(address))
  }, [address])

  useEffect(() => {
    fetchOracleEvents()
      .then((events) => {
        const map = new Map<string, number>()
        for (const e of events) {
          if (e.resolved && e.winningOutcome !== undefined) {
            map.set(e.eventId, e.winningOutcome)
          }
        }
        setResolved(map)
      })
      .catch(() => {})
  }, [])

  if (!isConnected || !address) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-[#B31A1A]/10 border border-[#B31A1A]/30 flex items-center justify-center mx-auto text-3xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold text-white">My Bets</h1>
        <p className="text-slate-400">Connect your wallet to see your bet history.</p>
      </div>
    )
  }

  const openBets    = bets.filter((b) => getStatus(b, resolved) === 'open')
  const settledBets = bets.filter((b) => getStatus(b, resolved) !== 'open')
  const wonCount    = bets.filter((b) => getStatus(b, resolved) === 'won').length
  const totalStaked = bets.reduce((s, b) => s + b.stakeUsdt, 0)
  const totalProfit = bets
    .filter((b) => getStatus(b, resolved) === 'won')
    .reduce((s, b) => s + (b.potentialWinUsdt - b.stakeUsdt), 0)
  const totalLoss = bets
    .filter((b) => getStatus(b, resolved) === 'lost')
    .reduce((s, b) => s + b.stakeUsdt, 0)
  const netPnl = totalProfit - totalLoss

  const displayBets = tab === 'open' ? openBets : settledBets

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Bettor</p>
        <h1 className="text-3xl font-bold text-white">My Bets</h1>
        <p className="text-xs font-mono text-slate-600 truncate">{address}</p>
      </div>

      {/* Stats row */}
      {bets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Bets',   value: bets.length.toString(),        sub: undefined },
            { label: 'Total Staked', value: `$${totalStaked.toFixed(2)}`,  sub: 'USDT' },
            { label: 'Win Rate',     value: bets.length > 0 ? `${Math.round((wonCount / bets.length) * 100)}%` : '—', sub: `${wonCount} won` },
            {
              label: 'Net P&L',
              value: netPnl >= 0 ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`,
              sub: 'settled only',
              positive: netPnl >= 0,
            },
          ].map(({ label, value, sub, positive }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
              <p className={`text-xl font-bold font-mono tabular-nums ${
                positive === undefined ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {value}
              </p>
              {sub && <p className="text-[10px] text-slate-600 font-mono">{sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 w-fit">
        {(['open', 'settled'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              tab === t
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'open' ? `Open Bets (${openBets.length})` : `Settled (${settledBets.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      {displayBets.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-900/80 border-b border-slate-800">
                  <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Event</th>
                  <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">Pick</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Stake</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Odds</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {tab === 'settled' ? 'P&L' : 'Payout'}
                  </th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayBets.map((bet) => (
                  <BetRow key={bet.id} bet={bet} status={getStatus(bet, resolved)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-600">
            {displayBets.length} bet{displayBets.length !== 1 ? 's' : ''}
            {tab === 'open' && openBets.length > 0 && (
              <span className="ml-2 text-slate-700">
                · ${openBets.reduce((s, b) => s + b.stakeUsdt, 0).toFixed(2)} staked
              </span>
            )}
          </div>
        </div>
      )}

      {bets.length === 0 && tab === 'open' && <EmptyState tab="open" />}
    </div>
  )
}
