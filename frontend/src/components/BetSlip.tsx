'use client'

import { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { parseUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { ESCROW_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { withGasBuffer } from '@/lib/gasUtils'
import { saveBet } from '@/lib/betHistory'
import { postReferral } from '@/lib/api'
import type { Offer } from './OrderBook'
import { displayMakerName, isKnownMaker } from '@/lib/formatAddress'

type Props = {
  outcome: number
  offers: Offer[]
  eventName: string
  referrerAddress?: string
  onClose: () => void
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS   = (process.env.NEXT_PUBLIC_USDT_ADDRESS   ?? '0x0') as `0x${string}`
// Arbitrum Sepolia block times/RPC propagation can occasionally lag well past
// viem's default receipt-wait window — give it more room before giving up.
const RECEIPT_TIMEOUT_MS = 120_000

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

export default function BetSlip({ outcome, offers, eventName, referrerAddress, onClose }: Props) {
  const [visible, setVisible]   = useState(false)
  const [stake, setStake]       = useState('')
  const [status, setStatus]     = useState<'idle' | 'approving' | 'betting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const { address, chain }     = useAccount()
  const publicClient           = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()

  // The wallet can be on any chain regardless of what this dapp reads/writes —
  // request a switch up front so the tx isn't silently signed against the wrong
  // network (passing chainId to writeContractAsync alone only rejects the
  // mismatch, it doesn't prompt the wallet to switch).
  async function ensureArbitrumSepolia() {
    if (chain?.id !== arbitrumSepolia.id) {
      await switchChainAsync({ chainId: arbitrumSepolia.id })
    }
  }

  const { data: currentAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address!, ESCROW_ADDRESS],
    query: { enabled: !!address },
  })

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
    const totalStakeRaw  = parseUnits(stakeNum.toFixed(6), 6)
    const needsApprove   = ((currentAllowance as bigint | undefined) ?? BigInt(0)) < totalStakeRaw
    setErrorMsg('')
    setStatus(needsApprove ? 'approving' : 'betting')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      if (needsApprove) {
        const approveTxHash = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_ADDRESS, totalStakeRaw],
          chainId: arbitrumSepolia.id,
          ...gas,
        })
        await waitForTransactionReceipt(publicClient!, { hash: approveTxHash, timeout: RECEIPT_TIMEOUT_MS })
        setStatus('betting')
      }
      const betTxHash = await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'acceptOffers',
        args: [matchedOffers.map((o) => BigInt(o.offerId)), totalStakeRaw],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: betTxHash, timeout: RECEIPT_TIMEOUT_MS })
      setStatus('done')
      saveBet(address, {
        id: `${Date.now()}-${matchedOffers[0].offerId}`,
        offerId: matchedOffers[0].offerId,
        eventId: matchedOffers[0].eventId,
        eventName,
        outcome,
        oddsDecimal: avgOdds,
        stakeUsdt: stakeNum,
        potentialWinUsdt: potentialWin,
        placedAt: new Date().toISOString(),
      })
      if (referrerAddress && referrerAddress.toLowerCase() !== address.toLowerCase()) {
        postReferral({
          placer:  referrerAddress,
          bettor:  address,
          offerId: matchedOffers[0].offerId,
          eventId: matchedOffers[0].eventId,
        })
      }
    } catch (err: unknown) {
      setStatus('error')
      const msg = err instanceof Error ? err.message : 'Transaction failed'
      // A wait-timeout means we stopped watching, not that the chain rejected it —
      // the tx can still land. Don't cancel it in your wallet; check its Activity
      // tab or Arbiscan, then reopen the bet slip once it confirms.
      setErrorMsg(
        msg.toLowerCase().includes('timed out')
          ? 'Still waiting for confirmation on-chain — this can take a bit on Arbitrum Sepolia. Check your wallet’s Activity tab; do not cancel it. Reopen the bet slip once it confirms.'
          : msg
      )
    }
  }

  const color = OUTCOME_COLOR[outcome] ?? OUTCOME_COLOR[0]

  return (
    <>
      <div
        onClick={handleClose}
        className={`fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <aside
        className={`fixed inset-y-0 right-0 z-50 w-[400px] max-w-full flex flex-col bg-slate-950 border-l border-slate-800 shadow-2xl transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-[#B31A1A]" />
            <h2 className="font-bold text-white text-lg tracking-tight">Bet Slip</h2>
            <span className="text-xs text-slate-500 bg-slate-900 border border-slate-700 px-2 py-0.5 rounded font-mono">
              {offers.length} offers
            </span>
          </div>
          <button
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-slate-800 transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Event + Outcome */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <p className="text-xs text-slate-500 mb-2 truncate">{eventName}</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${color.dot}`} />
                <span className={`text-base font-semibold ${color.text}`}>
                  {OUTCOMES[outcome] ?? `Outcome ${outcome}`}
                </span>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold font-mono tabular-nums text-red-500 leading-none">
                  {bestOdds.toFixed(2)}
                  <span className="text-sm font-normal text-slate-500 ml-0.5">x</span>
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wide">best price</div>
              </div>
            </div>
          </div>

          {/* Stake input */}
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Bet Amount
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-lg select-none pointer-events-none">
                $
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-900 border border-slate-700 rounded-md pl-9 pr-16 py-3.5 text-2xl font-semibold font-mono tabular-nums text-white placeholder:text-slate-700 focus:outline-none focus:border-[#B31A1A] focus:ring-1 focus:ring-[#B31A1A]/20 transition-all"
                autoFocus
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono select-none pointer-events-none">
                USDT
              </span>
            </div>

            {/* Quick-pick */}
            <div className="grid grid-cols-4 gap-2">
              {[10, 25, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(String(v))}
                  className="py-2 min-h-[40px] text-sm font-medium font-mono rounded-md bg-slate-900 border border-slate-700 text-slate-400 hover:border-[#B31A1A]/50 hover:text-red-500 hover:bg-[#B31A1A]/5 transition-colors"
                >
                  +${v}
                </button>
              ))}
            </div>

            {/* Liquidity bar */}
            {totalAvailable > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono text-slate-600">
                  <span>Available liquidity</span>
                  <span className="font-semibold">${totalAvailable.toFixed(2)} USDT</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#B31A1A] rounded-full transition-all duration-300"
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Payout summary */}
          <div className="rounded-lg border border-slate-800 overflow-hidden text-sm">
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
              <span className="text-slate-500">Stake</span>
              <span className={`font-semibold font-mono tabular-nums ${stakeNum > 0 ? 'text-white' : 'text-slate-700'}`}>
                {stakeNum > 0 ? `$${stakeNum.toFixed(2)}` : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-3 border-b border-slate-800">
              <span className="text-slate-500">Odds</span>
              <span className="font-semibold font-mono tabular-nums text-red-500">
                {avgOdds > 0 ? `${avgOdds.toFixed(2)}x` : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center px-4 py-4 bg-slate-900/50">
              <span className="font-semibold text-white">Potential Payout</span>
              <span className={`font-semibold font-mono tabular-nums text-xl ${potentialWin > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                {potentialWin > 0 ? `$${potentialWin.toFixed(2)}` : '—'}
              </span>
            </div>
          </div>

          {/* Matched offers */}
          {matchedOffers.length > 0 && stakeNum > 0 && (
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none select-none text-xs text-slate-500 hover:text-slate-300 transition-colors py-1">
                <span className="uppercase tracking-wide font-semibold">
                  {matchedOffers.length} offer{matchedOffers.length === 1 ? '' : 's'} matched
                </span>
                <span className="group-open:rotate-180 transition-transform duration-200 text-slate-600">▾</span>
              </summary>
              <div className="mt-2 space-y-1">
                {matchedOffers.map((o) => (
                  <div
                    key={o.offerId}
                    className="flex items-center justify-between rounded-md bg-slate-900/50 border border-slate-800 px-3 py-2.5"
                  >
                    <span className={`text-xs font-mono flex items-center gap-1.5 ${isKnownMaker(o.placer) ? 'text-sky-400' : 'text-slate-500'}`}>
                      #{o.offerId} · {displayMakerName(o.placer)}
                      {isKnownMaker(o.placer) && (
                        <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/30 leading-none select-none whitespace-nowrap">
                          ✓ Official
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-semibold font-mono text-red-500 tabular-nums">
                      {o.oddsDecimal.toFixed(2)}x
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Error */}
          {status === 'error' && errorMsg && (
            <div className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-4 py-3">
              {errorMsg}
            </div>
          )}

          {/* Transaction steps */}
          {(status === 'approving' || status === 'betting') && (
            <div className="rounded-lg border border-slate-800 overflow-hidden">
              {(['approving', 'betting'] as const).map((step, i) => {
                const label    = i === 0 ? 'Approve USDT' : 'Confirm Bet'
                const isDone   = step === 'approving' && status === 'betting'
                const isActive = step === status
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 px-4 py-3 ${i < 1 ? 'border-b border-slate-800' : ''}`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                      isDone   ? 'bg-[#B31A1A] text-white'
                      : isActive ? 'border-2 border-[#B31A1A] text-red-500'
                      : 'border border-slate-700 text-slate-600'
                    }`}>
                      {isDone ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm transition-colors ${
                      isActive ? 'text-white' : isDone ? 'text-red-500' : 'text-slate-600'
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
        <div className="shrink-0 p-5 border-t border-slate-800 bg-slate-950/90 backdrop-blur-sm">
          {status === 'done' ? (
            <div className="space-y-3 text-center">
              <div className="flex items-center justify-center gap-2 text-red-500 font-semibold">
                <span className="w-6 h-6 rounded-full bg-[#B31A1A]/20 border border-[#B31A1A]/40 flex items-center justify-center text-xs">
                  ✓
                </span>
                Bet confirmed!
              </div>
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-md bg-slate-800 hover:bg-slate-700 text-white font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={!canBet}
              className="w-full py-3.5 text-base font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {status === 'approving' && 'Approving USDT…'}
              {status === 'betting'   && 'Submitting bet on-chain…'}
              {(status === 'idle' || status === 'error') && (
                stakeNum > 0 && matchedOffers.length > 0
                  ? `Confirm · $${stakeNum.toFixed(2)} USDT`
                  : 'Enter amount'
              )}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
