'use client'

import { useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { ESCROW_ABI, ERC20_ABI } from '@/lib/abis'
import { withGasBuffer } from '@/lib/gasUtils'
import type { Offer } from './OrderBook'

type Props = {
  offers: Offer[]
  stakeUsdt: number
  onClose: () => void
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`

export default function BetForm({ offers, stakeUsdt, onClose }: Props) {
  const { address }    = useAccount()
  const publicClient   = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { data: currentAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address!, ESCROW_ADDRESS],
    query: { enabled: !!address },
  })
  const [status, setStatus] = useState<'idle' | 'approving' | 'betting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const totalStakeRaw = parseUnits(stakeUsdt.toFixed(6), 6)
  const avgOdds = offers.reduce((s, o) => s + o.oddsDecimal, 0) / (offers.length || 1)
  const potentialWin = stakeUsdt * avgOdds
  const platformFee = (potentialWin - stakeUsdt) * 0.05
  const netPayout = potentialWin - platformFee

  async function handleBet() {
    if (!address) return
    const needsApprove = ((currentAllowance as bigint | undefined) ?? BigInt(0)) < totalStakeRaw
    setErrorMsg('')
    setStatus(needsApprove ? 'approving' : 'betting')
    try {
      const gas = await withGasBuffer(publicClient)
      if (needsApprove) {
        const approveTxHash = await writeContractAsync({
          address: USDT_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [ESCROW_ADDRESS, totalStakeRaw],
          ...gas,
        })
        await waitForTransactionReceipt(publicClient!, { hash: approveTxHash })
        setStatus('betting')
      }
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'acceptOffers',
        args: [offers.map((o) => BigInt(o.offerId)), totalStakeRaw],
        ...gas,
      })
      setStatus('done')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Transaction failed')
    }
  }

  const outcomeLabel = offers[0]
    ? ['Home Win', 'Draw', 'Away Win'][offers[0].outcome] ?? `Outcome ${offers[0].outcome}`
    : '—'

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-6 w-full max-w-md space-y-5 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Confirm Bet</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-800 rounded-md p-3">
            <div className="text-xs text-slate-400 mb-1">Outcome</div>
            <div className="text-sm font-semibold text-white">{outcomeLabel}</div>
          </div>
          <div className="bg-slate-800 rounded-md p-3">
            <div className="text-xs text-slate-400 mb-1">Stake</div>
            <div className="text-sm font-semibold font-mono text-white">${stakeUsdt.toFixed(2)}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3">
            <div className="text-xs text-slate-400 mb-1">Net payout</div>
            <div className="text-sm font-semibold font-mono text-green-400">${netPayout.toFixed(2)}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">–${platformFee.toFixed(2)} fee (5%)</div>
          </div>
        </div>

        {/* Offers breakdown */}
        <div className="rounded-md bg-slate-950/60 border border-slate-700 divide-y divide-slate-700/60">
          {offers.map((o) => (
            <div key={o.offerId} className="px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs text-slate-400 font-mono">
                #{o.offerId} · {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
              </span>
              <span className="font-mono text-sm font-semibold text-green-400">{o.oddsDecimal.toFixed(2)}x</span>
            </div>
          ))}
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
            {errorMsg}
          </p>
        )}

        {status === 'done' ? (
          <div className="text-center space-y-3">
            <div className="text-green-400 font-semibold">✓ Bet confirmed!</div>
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm rounded-md bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            >
              Close
            </button>
          </div>
        ) : (
          <button
            onClick={handleBet}
            disabled={status !== 'idle' && status !== 'error'}
            className="w-full py-3.5 text-sm font-semibold rounded-md bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {(status === 'approving' || status === 'betting') ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                {status === 'approving' ? '① Approving USDT…' : '② Submitting bet…'}
              </span>
            ) : `Accept Bet · $${stakeUsdt.toFixed(2)} USDT`}
          </button>
        )}
      </div>
    </div>
  )
}
