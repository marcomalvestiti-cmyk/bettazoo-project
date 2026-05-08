'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { ESCROW_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import type { Offer } from './OrderBook'

type Props = {
  outcome: number
  offers: Offer[]
  eventName: string
  onClose: () => void
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS   = (process.env.NEXT_PUBLIC_USDT_ADDRESS   ?? '0x0') as `0x${string}`

const OUTCOME_COLOR: Record<number, { dot: string; text: string }> = {
  0: { dot: 'bg-sky-400',     text: 'text-sky-300'     },
  1: { dot: 'bg-fuchsia-400', text: 'text-fuchsia-300' },
  2: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
}

function computeMatch(offers: Offer[], stakeUsdt: number) {
  let remaining = stakeUsdt
  const matched: Offer[] = []
  for (const offer of offers) {
    if (remaining <= 0) break
    const avail = parseFloat(offer.maxBettorStakeUsdt)
    if (avail <= 0) continue
    matched.push(offer)
    remaining -= avail
  }
  return matched
}

export default function BetSlip({ outcome, offers, eventName, onClose }: Props) {
  const [visible, setVisible]   = useState(false)
  const [stake, setStake]       = useState('')
  const [status, setStatus]     = useState<'idle' | 'approving' | 'betting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const { address }             = useAccount()
  const { writeContractAsync }  = useWriteContract()

  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(id)
  }, [])

  function handleClose() {
    setVisible(false)
    setTimeout(onClose, 300)
  }

  const stakeNum       = parseFloat(stake) || 0
  const matchedOffers  = computeMatch(offers, stakeNum)
  const totalAvailable = offers.reduce((s, o) => s + parseFloat(o.maxBettorStakeUsdt), 0)
  const avgOdds        = matchedOffers.length
    ? matchedOffers.reduce((s, o) => s + o.oddsDecimal, 0) / matchedOffers.length
    : offers[0]?.oddsDecimal ?? 0
  const potentialWin   = stakeNum * avgOdds
  const bestOdds       = offers[0]?.oddsDecimal ?? 0
  const fillPct        = totalAvailable > 0 ? Math.min((stakeNum / totalAvailable) * 100, 100) : 0
  const canBet         = matchedOffers.length > 0 && stakeNum > 0 && (status === 'idle' || status === 'error')

  async function handleConfirm() {
    if (!address || !canBet) return
    const totalStakeRaw = parseUnits(stakeNum.toFixed(6), 6)
    setStatus('approving')
    setErrorMsg('')
    try {
      await writeContractAsync({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, totalStakeRaw],
      })
      setStatus('betting')
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'acceptOffers',
        args: [matchedOffers.map((o) => BigInt(o.offerId)), totalStakeRaw],
      })
      setStatus('done')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Transazione fallita')
    }
  }

  const color = OUTCOME_COLOR[outcome] ?? OUTCOME_COLOR[0]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-[#0D0D11]/80 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Sidebar panel */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[400px] max-w-full flex flex-col bg-[#0f0f16] border-l border-zinc-800 shadow-2xl transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#B31A1A] shadow-[0_0_8px_rgba(179,26,26,0.8)]" />
            <h2 className="font-extrabold text-white text-xl tracking-tight">Bet Slip</h2>
            <span className="text-xs text-zinc-500 bg-[#141419] border border-zinc-800 px-2 py-0.5 rounded-xl font-mono">
              {offers.length} offerte
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-10 h-10 flex items-center justify-center rounded-2xl text-zinc-500 hover:text-white hover:bg-[#141419] transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Event + Outcome */}
          <div className="bg-[#141419] border border-zinc-800 rounded-2xl p-4">
            <p className="text-xs text-zinc-500 mb-2 truncate">{eventName}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full shrink-0 ${color.dot}`} />
                <span className={`text-base font-bold ${color.text}`}>
                  {OUTCOMES[outcome] ?? `Outcome ${outcome}`}
                </span>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold font-mono tabular-nums text-[#e05555] leading-none">
                  {bestOdds.toFixed(2)}
                  <span className="text-sm font-normal text-zinc-500 ml-0.5">x</span>
                </div>
                <div className="text-[10px] text-zinc-600 mt-0.5 uppercase tracking-wide">best price</div>
              </div>
            </div>
          </div>

          {/* Stake input */}
          <div className="space-y-3">
            <label className="block text-sm font-bold text-zinc-400 uppercase tracking-wider">
              Importo scommessa
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-lg select-none pointer-events-none">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="0.00"
                className="w-full bg-[#141419] border border-zinc-800 rounded-2xl pl-9 pr-16 py-4 text-3xl font-extrabold font-mono tabular-nums text-white placeholder:text-zinc-700 focus:outline-none focus:border-[#B31A1A] focus:ring-1 focus:ring-[#B31A1A]/20 transition-all"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono select-none pointer-events-none">
                USDT
              </span>
            </div>

            {/* Quick-pick */}
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(String(v))}
                  className="
                    py-3 min-h-[44px] text-sm font-bold font-mono rounded-2xl
                    bg-[#141419] border border-zinc-800 text-zinc-400
                    border-b-4 border-b-zinc-900
                    hover:border-[#B31A1A]/50 hover:text-[#e05555] hover:bg-[#B31A1A]/5
                    active:border-b-0 active:translate-y-1
                    transition-all duration-75
                  "
                >
                  +${v}
                </button>
              ))}
            </div>

            {/* Liquidity bar */}
            {totalAvailable > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-zinc-600">
                  <span>Liquidità disponibile</span>
                  <span className="font-extrabold">${totalAvailable.toFixed(2)} USDT</span>
                </div>
                <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B31A1A] rounded-full transition-all duration-300"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payout summary */}
          <div className="rounded-2xl border border-zinc-800 overflow-hidden text-sm">
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
              <span className="text-zinc-500">Stake</span>
              <span className={`font-extrabold font-mono tabular-nums ${stakeNum > 0 ? 'text-white' : 'text-zinc-700'}`}>
                {stakeNum > 0 ? `$${stakeNum.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-zinc-800">
              <span className="text-zinc-500">Quota</span>
              <span className="font-extrabold font-mono tabular-nums text-[#e05555]">
                {avgOdds > 0 ? `${avgOdds.toFixed(2)}x` : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-4 bg-[#141419]/50">
              <span className="font-bold text-white">Vincita potenziale</span>
              <span className={`font-extrabold font-mono tabular-nums text-2xl ${potentialWin > 0 ? 'text-[#e05555]' : 'text-zinc-700'}`}>
                {potentialWin > 0 ? `$${potentialWin.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          {/* Matched offers */}
          {matchedOffers.length > 0 && stakeNum > 0 && (
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none select-none text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1">
                <span className="uppercase tracking-wide font-bold">
                  {matchedOffers.length} offert{matchedOffers.length === 1 ? 'a' : 'e'} abbinate
                </span>
                <span className="group-open:rotate-180 transition-transform duration-200 text-zinc-600">▾</span>
              </summary>
              <div className="mt-2 space-y-1">
                {matchedOffers.map((o) => (
                  <div
                    key={o.offerId}
                    className="flex items-center justify-between rounded-2xl bg-[#141419]/50 border border-zinc-800 px-3 py-2.5"
                  >
                    <span className="text-xs font-mono text-zinc-500">
                      #{o.offerId} · {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
                    </span>
                    <span className="text-xs font-extrabold font-mono text-[#e05555] tabular-nums">
                      {o.oddsDecimal.toFixed(2)}x
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-2xl px-4 py-3">
              {errorMsg}
            </div>
          )}

          {/* Transaction steps */}
          {(status === 'approving' || status === 'betting') && (
            <div className="rounded-2xl border border-zinc-800 overflow-hidden">
              {(['approving', 'betting'] as const).map((step, i) => {
                const label    = i === 0 ? 'Approvazione USDT' : 'Conferma scommessa'
                const isDone   = step === 'approving' && status === 'betting'
                const isActive = step === status
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 px-4 py-3 ${i < 1 ? 'border-b border-zinc-800' : ''}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
                      isDone   ? 'bg-[#B31A1A] text-white'
                      : isActive ? 'border-2 border-[#B31A1A] text-[#e05555]'
                      : 'border border-zinc-700 text-zinc-600'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm transition-colors ${
                      isActive ? 'text-white' : isDone ? 'text-[#e05555]' : 'text-zinc-600'
                    }`}>
                      {label}
                    </span>
                    {isActive && (
                      <svg className="w-4 h-4 animate-spin ml-auto text-[#B31A1A] shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer CTA */}
        <div className="shrink-0 p-5 border-t border-zinc-800 bg-[#0f0f16]/90 backdrop-blur-sm">
          {status === 'done' ? (
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-[#e05555] font-bold">
                <span className="w-6 h-6 rounded-full bg-[#B31A1A]/20 border border-[#B31A1A]/40 flex items-center justify-center text-xs">
                  ✓
                </span>
                Scommessa confermata!
              </div>
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-2xl bg-[#141419] hover:bg-[#1c1c24] text-white font-bold transition-colors"
              >
                Chiudi
              </button>
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={!canBet}
              className="
                w-full py-4 text-xl font-extrabold rounded-2xl
                bg-[#B31A1A] hover:bg-[#cc2020] text-white
                border-b-4 border-b-[#6b0d0d]
                active:border-b-0 active:translate-y-1
                disabled:opacity-30 disabled:cursor-not-allowed disabled:border-b-0 disabled:translate-y-0
                shadow-[0_0_24px_rgba(179,26,26,0.3)] disabled:shadow-none
                transition-all duration-75
              "
            >
              {status === 'approving' && 'Approvazione USDT…'}
              {status === 'betting'   && 'Invio scommessa on-chain…'}
              {(status === 'idle' || status === 'error') && (
                stakeNum > 0 && matchedOffers.length > 0
                  ? `Conferma · $${stakeNum.toFixed(2)} USDT`
                  : 'Inserisci importo'
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
