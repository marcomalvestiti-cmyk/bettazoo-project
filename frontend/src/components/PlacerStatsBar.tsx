'use client'

import { useReadContract } from 'wagmi'
import { formatUnits } from 'viem'
import { ERC20_ABI, MOCK_EVENTS } from '@/lib/abis'
import PlacerBadge from './PlacerBadge'

const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`

type Offer = {
  offerId: number
  placer: string
  eventId: string
  outcome: number
  oddsDecimal: number
  remainingLiabilityUsdt: string
}

interface Props {
  address: `0x${string}`
  offers: Offer[]
  pnlSeed?: string
  uniqueChallengers?: number
}

function deterministicPnL(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xfffff
  return ((h % 401) - 150) * 0.73
}

function StatCard({
  label,
  value,
  sub,
  positive,
}: {
  label: string
  value: string
  sub?: string
  positive?: boolean
}) {
  const valueColor =
    positive === undefined
      ? 'text-white'
      : positive
      ? 'text-emerald-400'
      : 'text-red-400'

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 space-y-1.5 min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">{label}</p>
      <p className={`text-xl font-bold font-mono tabular-nums truncate ${valueColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-600 font-mono">{sub}</p>}
    </div>
  )
}

export default function PlacerStatsBar({ address, offers, pnlSeed, uniqueChallengers = 0 }: Props) {
  const { data: rawBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  })

  const committed = offers.reduce((s, o) => s + parseFloat(o.remainingLiabilityUsdt || '0'), 0)
  const activeEvents = new Set(offers.map(o => o.eventId)).size

  const pnl = deterministicPnL(pnlSeed ?? address)
  const pnlPositive = pnl >= 0
  const pnlStr = pnlPositive ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`

  const liquidityStr = rawBalance !== undefined
    ? `$${parseFloat(formatUnits(rawBalance as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
      <StatCard
        label="Available Liquidity"
        value={liquidityStr}
        sub="USDT · wallet balance"
      />
      <StatCard
        label="Committed Credit"
        value={`$${committed.toFixed(2)}`}
        sub="USDT locked as collateral"
      />
      <StatCard
        label="Active Offers"
        value={offers.length.toString()}
        sub={`across ${activeEvents} event${activeEvents !== 1 ? 's' : ''}`}
      />
      <StatCard
        label="Active Events"
        value={activeEvents.toString()}
        sub={`of ${MOCK_EVENTS.length} total`}
      />
      <StatCard
        label="24h P&L"
        value={pnlStr}
        sub="simulated · connect oracle for live"
        positive={pnlPositive}
      />
      <div className="bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 space-y-1.5 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">Unique Challengers</p>
        <p className="text-xl font-bold font-mono tabular-nums truncate text-white">{uniqueChallengers}</p>
        <PlacerBadge count={uniqueChallengers} size="sm" />
        {uniqueChallengers === 0 && (
          <p className="text-[10px] text-slate-600 font-mono">Share offers to gain challengers</p>
        )}
      </div>
    </div>
  )
}
