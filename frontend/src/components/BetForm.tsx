'use client'

import { useState } from 'react'
import { useAccount, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { ESCROW_ABI, ERC20_ABI } from '@/lib/abis'
import type { Offer } from './OrderBook'

type Props = {
  offers: Offer[]
  stakeUsdt: number
  onClose: () => void
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`

export default function BetForm({ offers, stakeUsdt, onClose }: Props) {
  const { address } = useAccount()
  const { writeContractAsync } = useWriteContract()
  const [status, setStatus] = useState<'idle' | 'approving' | 'betting' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const totalStakeRaw = parseUnits(stakeUsdt.toFixed(6), 6)
  const avgOdds = offers.reduce((s, o) => s + o.oddsDecimal, 0) / (offers.length || 1)
  const potentialWin = stakeUsdt * avgOdds

  async function handleBet() {
    if (!address) return
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
        args: [offers.map((o) => BigInt(o.offerId)), totalStakeRaw],
      })
      setStatus('done')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Transazione fallita')
    }
  }

  const outcomeLabel = offers[0]
    ? ['Home Win', 'Draw', 'Away Win'][offers[0].outcome] ?? `Outcome ${offers[0].outcome}`
    : '—'

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Conferma scommessa</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Esito</div>
            <div className="text-sm font-semibold text-white">{outcomeLabel}</div>
          </div>
          <div className="bg-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Stake</div>
            <div className="text-sm font-bold font-mono text-white">${stakeUsdt.toFixed(2)}</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
            <div className="text-xs text-slate-400 mb-1">Vincita pot.</div>
            <div className="text-sm font-bold font-mono text-green-400">${potentialWin.toFixed(2)}</div>
          </div>
        </div>

        {/* Offers breakdown */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-700 divide-y divide-slate-700/60">
          {offers.map((o) => (
            <div key={o.offerId} className="px-4 py-2.5 flex justify-between items-center">
              <span className="text-xs text-slate-400 font-mono">
                #{o.offerId} · {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
              </span>
              <span className="font-mono text-sm font-bold text-green-400">{o.oddsDecimal.toFixed(2)}x</span>
            </div>
          ))}
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {errorMsg}
          </p>
        )}

        {status === 'done' ? (
          <div className="text-center space-y-3">
            <div className="text-green-400 font-semibold">✓ Scommessa confermata!</div>
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <button
            onClick={handleBet}
            disabled={status !== 'idle' && status !== 'error'}
            className="w-full py-3.5 text-sm font-bold rounded-xl bg-green-500 hover:bg-green-400 text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-[0_0_16px_rgba(74,222,128,0.3)]"
          >
            {status === 'approving' && '① Approvazione USDT in corso…'}
            {status === 'betting'   && '② Invio scommessa on-chain…'}
            {(status === 'idle' || status === 'error') && `Accetta Scommessa · $${stakeUsdt.toFixed(2)} USDT`}
          </button>
        )}
      </div>
    </div>
  )
}
