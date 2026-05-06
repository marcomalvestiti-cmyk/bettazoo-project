'use client'

import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { ESCROW_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { fetchSuggestOdds } from '@/lib/api'

type Props = {
  eventId: string
  eventName?: string
  teams?: string[]
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`

export default function CreateOfferForm({ eventId, eventName, teams }: Props) {
  const { writeContractAsync } = useWriteContract()
  const [outcome, setOutcome] = useState(0)
  const [oddsDecimal, setOddsDecimal] = useState('')
  const [liabilityUsdt, setLiabilityUsdt] = useState('')
  const [status, setStatus] = useState<'idle' | 'suggesting' | 'approving' | 'creating' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [aiResult, setAiResult] = useState<Record<string, number> | null>(null)

  async function handleAiSuggest() {
    setStatus('suggesting')
    setErrorMsg('')
    try {
      const result = await fetchSuggestOdds({ eventId, eventName, sport: 'football', teams, outcome })
      setAiResult(result.suggestedOdds ?? result)
      if (result.suggestedOdds?.[outcome] !== undefined) {
        setOddsDecimal(String(result.suggestedOdds[outcome]))
      }
      setStatus('idle')
    } catch {
      setErrorMsg('AI non disponibile')
      setStatus('idle')
    }
  }

  async function handleCreate() {
    const oddsNum = parseFloat(oddsDecimal)
    const liabilityNum = parseFloat(liabilityUsdt)
    if (!oddsNum || !liabilityNum || oddsNum <= 1) {
      setErrorMsg('Quota deve essere > 1.00')
      return
    }
    setStatus('approving')
    setErrorMsg('')
    try {
      const oddsRaw = BigInt(Math.round(oddsNum * 10000))
      const liabilityRaw = parseUnits(liabilityNum.toFixed(6), 6)
      await writeContractAsync({
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [ESCROW_ADDRESS, liabilityRaw],
      })
      setStatus('creating')
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: ESCROW_ABI,
        functionName: 'createOffer',
        args: [eventId, outcome, oddsRaw, liabilityRaw],
      })
      setStatus('done')
      setOddsDecimal('')
      setLiabilityUsdt('')
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Errore transazione')
    }
  }

  return (
    <div className="bg-[#313338] border border-zinc-700 rounded-2xl p-5 space-y-4">
      <h3 className="font-extrabold text-white text-sm tracking-tight">Crea offerta</h3>

      {/* Outcome selector */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`
              py-3 min-h-[44px] text-xs font-bold rounded-2xl border transition-all
              border-b-4
              active:border-b-0 active:translate-y-1
              duration-75
              ${outcome === o
                ? 'border-purple-500 border-b-purple-900 bg-purple-500/10 text-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.2)]'
                : 'border-zinc-700 border-b-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
              }
            `}
          >
            {OUTCOMES[o]}
          </button>
        ))}
      </div>

      {/* Odds + AI */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="block text-xs text-zinc-400 font-medium">Quota (es. 2.50)</label>
          <input
            type="number"
            min="1.01"
            step="0.01"
            value={oddsDecimal}
            onChange={(e) => setOddsDecimal(e.target.value)}
            className="w-full bg-[#2b2d31] border border-zinc-600 rounded-xl px-3 py-2 text-sm font-extrabold text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="2.50"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleAiSuggest}
            disabled={status === 'suggesting'}
            className="
              px-3 py-2 text-xs font-bold rounded-xl
              bg-violet-600/20 border border-violet-500/40 border-b-4 border-b-violet-900
              text-violet-300 hover:bg-violet-600/30
              active:border-b-0 active:translate-y-1
              disabled:opacity-50 disabled:border-b-0
              transition-all duration-75 whitespace-nowrap
            "
          >
            {status === 'suggesting' ? 'AI…' : '✦ AI Suggest'}
          </button>
        </div>
      </div>

      {aiResult && (
        <div className="text-xs text-zinc-400 bg-violet-500/8 border border-violet-500/20 rounded-xl p-2.5">
          <span className="text-violet-400 font-bold">AI suggerisce: </span>
          {Object.entries(aiResult).map(([k, v]) =>
            `${OUTCOMES[Number(k)] ?? k}: ${typeof v === 'number' ? v.toFixed(2) : v}`
          ).join(' · ')}
        </div>
      )}

      {/* Liability */}
      <div className="space-y-1">
        <label className="block text-xs text-zinc-400 font-medium">Liability USDT (collaterale)</label>
        <div className="relative">
          <input
            type="number"
            min="1"
            step="0.01"
            value={liabilityUsdt}
            onChange={(e) => setLiabilityUsdt(e.target.value)}
            className="w-full bg-[#2b2d31] border border-zinc-600 rounded-xl pl-3 pr-14 py-2 text-sm font-extrabold text-white placeholder:text-zinc-600 focus:outline-none focus:border-purple-500 transition-colors"
            placeholder="100.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 font-mono">USDT</span>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
          {errorMsg}
        </p>
      )}

      {status === 'done' ? (
        <div className="text-center text-purple-400 text-sm font-extrabold py-1">✓ Offerta creata!</div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={status !== 'idle' && status !== 'error'}
          className="
            w-full py-4 text-sm font-extrabold rounded-2xl
            bg-purple-600 hover:bg-purple-500 text-white
            border-b-4 border-b-purple-900
            active:border-b-0 active:translate-y-1
            disabled:opacity-50 disabled:cursor-not-allowed disabled:border-b-0 disabled:translate-y-0
            shadow-[0_0_12px_rgba(168,85,247,0.25)] disabled:shadow-none
            transition-all duration-75
          "
        >
          {status === 'approving' && '① Approvazione USDT…'}
          {status === 'creating'  && '② Creazione offerta…'}
          {(status === 'idle' || status === 'error') && 'Crea offerta'}
        </button>
      )}
    </div>
  )
}
