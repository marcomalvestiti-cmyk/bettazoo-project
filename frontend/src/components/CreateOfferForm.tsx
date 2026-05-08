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
      setErrorMsg('AI unavailable')
      setStatus('idle')
    }
  }

  async function handleCreate() {
    const oddsNum = parseFloat(oddsDecimal)
    const liabilityNum = parseFloat(liabilityUsdt)
    if (!oddsNum || !liabilityNum || oddsNum <= 1) {
      setErrorMsg('Odds must be > 1.00')
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
      setErrorMsg(err instanceof Error ? err.message : 'Transaction error')
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      <h3 className="font-semibold text-white text-sm">Create Offer</h3>

      {/* Outcome selector */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`py-2.5 min-h-[40px] text-xs font-medium rounded-md border transition-colors ${
              outcome === o
                ? 'border-[#B31A1A] bg-[#B31A1A]/10 text-red-500'
                : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            {OUTCOMES[o]}
          </button>
        ))}
      </div>

      {/* Odds + AI */}
      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <label className="block text-xs text-slate-400 font-medium">Odds (e.g. 2.50)</label>
          <input
            type="number"
            min="1.01"
            step="0.01"
            value={oddsDecimal}
            onChange={(e) => setOddsDecimal(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#B31A1A] transition-colors"
            placeholder="2.50"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleAiSuggest}
            disabled={status === 'suggesting'}
            className="px-3 py-2 text-xs font-medium rounded-md bg-[#B31A1A]/10 border border-[#B31A1A]/40 text-red-500 hover:bg-[#B31A1A]/20 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {status === 'suggesting' ? 'AI…' : '✦ AI Suggest'}
          </button>
        </div>
      </div>

      {aiResult && (
        <div className="text-xs text-slate-400 bg-[#B31A1A]/5 border border-[#B31A1A]/20 rounded-md p-2.5">
          <span className="text-red-500 font-semibold">AI suggests: </span>
          {Object.entries(aiResult).map(([k, v]) =>
            `${OUTCOMES[Number(k)] ?? k}: ${typeof v === 'number' ? v.toFixed(2) : v}`
          ).join(' · ')}
        </div>
      )}

      {/* Liability */}
      <div className="space-y-1">
        <label className="block text-xs text-slate-400 font-medium">Liability USDT (collateral)</label>
        <div className="relative">
          <input
            type="number"
            min="1"
            step="0.01"
            value={liabilityUsdt}
            onChange={(e) => setLiabilityUsdt(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-md pl-3 pr-14 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#B31A1A] transition-colors"
            placeholder="100.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">USDT</span>
        </div>
      </div>

      {errorMsg && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
          {errorMsg}
        </p>
      )}

      {status === 'done' ? (
        <div className="text-center text-red-500 text-sm font-semibold py-1">✓ Offer created!</div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={status !== 'idle' && status !== 'error'}
          className="w-full py-3 text-sm font-semibold rounded-md bg-[#B31A1A] hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'approving' && '① Approving USDT…'}
          {status === 'creating'  && '② Creating offer…'}
          {(status === 'idle' || status === 'error') && 'Create Offer'}
        </button>
      )}
    </div>
  )
}
