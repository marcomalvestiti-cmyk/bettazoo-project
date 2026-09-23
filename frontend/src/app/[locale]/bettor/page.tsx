'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useTranslations, useLocale } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { fetchBettorBets, type BettorBet } from '@/lib/api'
import { useEvents } from '@/lib/useEvents'
import { OUTCOMES } from '@/lib/abis'

type BetStatus = 'open' | 'won' | 'lost'

function getStatus(bet: BettorBet): BetStatus {
  if (!bet.settled || bet.settledOutcome === null) return 'open'
  return bet.outcome === bet.settledOutcome ? 'won' : 'lost'
}

function EmptyState({ tab }: { tab: 'open' | 'settled' }) {
  const t = useTranslations('Bettor')
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
      <span className="text-4xl select-none">{tab === 'open' ? '🎯' : '📋'}</span>
      <p className="text-sm font-semibold text-slate-400">
        {tab === 'open' ? t('empty.noOpenBets') : t('empty.noSettledBets')}
      </p>
      <p className="text-xs text-slate-600 max-w-xs">
        {tab === 'open' ? t('empty.openHint') : t('empty.settledHint')}
      </p>
      {tab === 'open' && (
        <Link
          href="/bet"
          className="mt-1 px-5 py-2 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white transition-colors"
        >
          {t('empty.browseEvents')}
        </Link>
      )}
    </div>
  )
}

const PLATFORM_FEE = 0.05

function netPayout(gross: number, stake: number) {
  return gross - (gross - stake) * PLATFORM_FEE
}

// Gross payout = stake × decimal odds (includes the stake itself) — the standard
// decimal-odds formula, same one the contract's payout math is built on.
function grossPayout(bet: BettorBet) {
  return bet.stakeUsdt * bet.oddsDecimal
}

const STATUS_CLS: Record<BetStatus, string> = {
  open:  'bg-sky-500/10 text-sky-400 border-sky-500/30',
  won:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  lost:  'bg-red-500/10 text-red-400 border-red-500/30',
}

const DATE_LOCALE: Record<string, string> = { en: 'en-GB', it: 'it-IT', es: 'es-ES', fr: 'fr-FR' }

function BetRow({ bet, status, eventName }: { bet: BettorBet; status: BetStatus; eventName: string }) {
  const t = useTranslations('Bettor')
  const locale = useLocale()
  const statusLabel = t(`status.${status === 'open' ? 'pending' : status}`)
  const date = new Date(bet.placedAt).toLocaleDateString(DATE_LOCALE[locale] ?? 'en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  })

  const gross = grossPayout(bet)
  const net = netPayout(gross, bet.stakeUsdt)
  const profit = status === 'won'
    ? `+$${(net - bet.stakeUsdt).toFixed(2)}`
    : status === 'lost'
    ? `-$${bet.stakeUsdt.toFixed(2)}`
    : `$${net.toFixed(2)}`

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
          {eventName}
        </Link>
        <p className="text-[10px] text-slate-600 font-mono mt-0.5">{date}</p>
      </td>
      {/* Outcome */}
      <td className="px-4 py-3.5">
        <span className="text-sm font-semibold text-slate-300">
          {OUTCOMES[bet.outcome] ?? t('table.outcomeFallback', { n: bet.outcome })}
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
        <p className="text-[10px] text-slate-600 text-right">
          {status === 'open' ? t('table.netOfFee') : status === 'won' ? t('table.afterFee') : ''}
        </p>
      </td>
      {/* Status */}
      <td className="px-4 py-3.5 text-right">
        <span className={`inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded border leading-none ${STATUS_CLS[status]}`}>
          {statusLabel}
        </span>
      </td>
    </tr>
  )
}

export default function BettorDashboard() {
  const t = useTranslations('Bettor')
  const { address, isConnected } = useAccount()
  const { events } = useEvents()
  const [tab, setTab] = useState<'open' | 'settled'>('open')
  const [bets, setBets] = useState<BettorBet[]>([])

  useEffect(() => {
    if (address) fetchBettorBets(address).then(setBets)
  }, [address])

  if (!isConnected || !address) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-[#B31A1A]/10 border border-[#B31A1A]/30 flex items-center justify-center mx-auto text-3xl">
          🔒
        </div>
        <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
        <p className="text-slate-400">{t('connectPrompt')}</p>
      </div>
    )
  }

  const openBets    = bets.filter((b) => getStatus(b) === 'open')
  const settledBets = bets.filter((b) => getStatus(b) !== 'open')
  const wonCount    = bets.filter((b) => getStatus(b) === 'won').length
  const totalStaked = bets.reduce((s, b) => s + b.stakeUsdt, 0)
  const totalProfit = bets
    .filter((b) => getStatus(b) === 'won')
    .reduce((s, b) => s + (netPayout(grossPayout(b), b.stakeUsdt) - b.stakeUsdt), 0)
  const totalLoss = bets
    .filter((b) => getStatus(b) === 'lost')
    .reduce((s, b) => s + b.stakeUsdt, 0)
  const netPnl = totalProfit - totalLoss

  const displayBets = tab === 'open' ? openBets : settledBets

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{t('eyebrow')}</p>
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-xs font-mono text-slate-600 truncate">{address}</p>
      </div>

      {/* Stats row */}
      {bets.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('stats.totalBets'),   value: bets.length.toString(),        sub: undefined },
            { label: t('stats.totalStaked'), value: `$${totalStaked.toFixed(2)}`,  sub: 'USDT' },
            { label: t('stats.winRate'),     value: bets.length > 0 ? `${Math.round((wonCount / bets.length) * 100)}%` : '—', sub: t('stats.wonSuffix', { count: wonCount }) },
            {
              label: t('stats.netPnl'),
              value: netPnl >= 0 ? `+$${netPnl.toFixed(2)}` : `-$${Math.abs(netPnl).toFixed(2)}`,
              sub: t('stats.settledOnly'),
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
        {(['open', 'settled'] as const).map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              tab === tabKey
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {tabKey === 'open' ? t('tabs.open', { count: openBets.length }) : t('tabs.settled', { count: settledBets.length })}
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
                  <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('table.event')}</th>
                  <th className="px-4 py-3 text-left   text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('table.pick')}</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('table.stake')}</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('table.odds')}</th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {tab === 'settled' ? t('table.pnl') : t('table.payout')}
                  </th>
                  <th className="px-4 py-3 text-right  text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {displayBets.map((bet) => (
                  <BetRow
                    key={bet.matchId}
                    bet={bet}
                    status={getStatus(bet)}
                    eventName={events.find((e) => e.eventId === bet.eventId)?.name ?? bet.eventId}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-950/60 text-xs text-slate-600">
            {t('footer.betCount', { count: displayBets.length })}
            {tab === 'open' && openBets.length > 0 && (
              <span className="ml-2 text-slate-700">
                {t('footer.staked', { amount: openBets.reduce((s, b) => s + b.stakeUsdt, 0).toFixed(2) })}
              </span>
            )}
          </div>
        </div>
      )}

      {bets.length === 0 && tab === 'open' && <EmptyState tab="open" />}
    </div>
  )
}
