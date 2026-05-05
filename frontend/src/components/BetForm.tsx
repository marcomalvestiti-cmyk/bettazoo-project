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
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Conferma scommessa</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none">&times;</button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-zinc-400">Esito</span>
            <span className="font-medium">{outcomeLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Stake totale</span>
            <span className="font-mono font-medium">${stakeUsdt.toFixed(2)} USDT</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-400">Offerte abbinate</span>
            <span>{offers.length}</span>
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950 border border-zinc-800 divide-y divide-zinc-800">
          {offers.map((o) => (
            <div key={o.offerId} className="px-3 py-2 flex justify-between text-xs">
              <span className="text-zinc-400 font-mono">
                #{o.offerId} {o.placer.slice(0, 6)}…{o.placer.slice(-4)}
              </span>
              <span className="font-mono text-emerald-400">{o.oddsDecimal.toFixed(2)}x</span>
            </div>
          ))}
        </div>

        {status === 'error' && (
          <p className="text-xs text-red-400">{errorMsg}</p>
        )}

        {status === 'done' ? (
          <div className="text-center">
            <p className="text-emerald-400 font-medium mb-3">Scommessa confermata!</p>
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700">
              Chiudi
            </button>
          </div>
        ) : (
          <button
            onClick={handleBet}
            disabled={status !== 'idle' && status !== 'error'}
            className="w-full py-3 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {status === 'approving' && 'Approvazione USDT…'}
            {status === 'betting' && 'Invio transazione…'}
            {(status === 'idle' || status === 'error') && `Scommetti $${stakeUsdt.toFixed(2)} USDT`}
          </button>
        )}
      </div>
    </div>
  )
}
