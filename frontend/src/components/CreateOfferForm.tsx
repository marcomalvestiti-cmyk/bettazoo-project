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
      const result = await fetchSuggestOdds({
        eventId,
        eventName,
        sport: 'football',
        teams,
        outcome,
      })
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
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <h3 className="font-semibold text-zinc-200">Crea offerta</h3>

      {/* Outcome selector */}
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((o) => (
          <button
            key={o}
            onClick={() => setOutcome(o)}
            className={`py-2 text-sm rounded-lg border transition-colors ${
              outcome === o
                ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {OUTCOMES[o]}
          </button>
        ))}
      </div>

      {/* Odds */}
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-xs text-zinc-400 mb-1">Quota (es. 2.50)</label>
          <input
            type="number"
            min="1.01"
            step="0.01"
            value={oddsDecimal}
            onChange={(e) => setOddsDecimal(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
            placeholder="2.50"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleAiSuggest}
            disabled={status === 'suggesting'}
            className="px-3 py-2 text-xs rounded-lg bg-violet-700 hover:bg-violet-600 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {status === 'suggesting' ? 'AI…' : 'Chiedi all\'AI'}
          </button>
        </div>
      </div>

      {aiResult && (
        <div className="text-xs text-zinc-400 bg-zinc-950 rounded-lg p-2">
          AI suggerisce: {Object.entries(aiResult).map(([k, v]) =>
            `${OUTCOMES[Number(k)] ?? k}: ${typeof v === 'number' ? v.toFixed(2) : v}`
          ).join(' · ')}
        </div>
      )}

      {/* Liability */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1">Liability (USDT da bloccare)</label>
        <input
          type="number"
          min="1"
          step="0.01"
          value={liabilityUsdt}
          onChange={(e) => setLiabilityUsdt(e.target.value)}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
          placeholder="100.00"
        />
      </div>

      {errorMsg && <p className="text-xs text-red-400">{errorMsg}</p>}

      {status === 'done' ? (
        <div className="text-center text-emerald-400 font-medium">Offerta creata!</div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={status !== 'idle' && status !== 'error'}
          className="w-full py-3 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 transition-colors"
        >
          {status === 'approving' && 'Approvazione USDT…'}
          {status === 'creating' && 'Creazione offerta…'}
          {(status === 'idle' || status === 'error') && 'Crea offerta'}
        </button>
      )}
    </div>
  )
}
