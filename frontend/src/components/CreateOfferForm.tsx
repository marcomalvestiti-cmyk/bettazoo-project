'use client'

import { useState, useEffect } from 'react'
import { usePublicClient, useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { ESCROW_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { fetchSuggestOdds, fetchOrderBook } from '@/lib/api'
import { withGasBuffer } from '@/lib/gasUtils'

type Props = {
  eventId:          string
  eventName?:       string
  sport?:           string
  teams?:           string[]
  onOfferCreated?:  () => void
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS   = (process.env.NEXT_PUBLIC_USDT_ADDRESS   ?? '0x0') as `0x${string}`

const OUTCOME_KEYS = ['home', 'draw', 'away'] as const

// ── Task 1: Strategy definitions ──────────────────────────────────────────────
const STRATEGIES = [
  { id: 'volume',   label: 'Volume Dominator', sub: '1.5% Margin', margin: 0.015 },
  { id: 'balanced', label: 'Balanced',         sub: '3.0% Margin', margin: 0.030 },
  { id: 'safe',     label: 'Safe Bank',        sub: '5.0% Margin', margin: 0.050 },
] as const
type StrategyId = typeof STRATEGIES[number]['id']

const BOOKIE_MARGIN = 0.08 // mirrored from backend for local recalc

export default function CreateOfferForm({ eventId, eventName, sport, teams, onOfferCreated }: Props) {
  const publicClient       = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [outcome,       setOutcome]       = useState(0)
  const [oddsDecimal,   setOddsDecimal]   = useState('')
  const [liabilityUsdt, setLiabilityUsdt] = useState('')
  const [status, setStatus] = useState<'idle' | 'approving' | 'creating' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // AI state — kept separate from form status so the Create Offer button
  // remains usable while the AI suggestion is loading
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')
  const [strategy,   setStrategy]   = useState<StrategyId>('balanced')
  const [trueBase,   setTrueBase]   = useState<Record<string, number> | null>(null)
  const [bookieOdds, setBookieOdds] = useState<Record<string, number> | null>(null)
  const [aiResult,   setAiResult]   = useState<Record<string, number> | null>(null)
  const [aiSource,   setAiSource]   = useState<string>('')

  // Auto-reset to idle 2s after successful offer creation so the form is immediately reusable
  useEffect(() => {
    if (status !== 'done') return
    const t = setTimeout(() => setStatus('idle'), 2000)
    return () => clearTimeout(t)
  }, [status])

  // ── Task 2: Real-time recalculation on strategy / outcome change ──────────
  useEffect(() => {
    if (!trueBase) return
    const margin = STRATEGIES.find(s => s.id === strategy)!.margin
    const recalc: Record<string, number> = {}
    for (const key of OUTCOME_KEYS) {
      recalc[key] = +(trueBase[key] / (1 + margin)).toFixed(2)
    }
    setAiResult(recalc)
    const key = OUTCOME_KEYS[outcome]
    if (recalc[key] !== undefined) setOddsDecimal(String(recalc[key]))
  }, [strategy, trueBase, outcome])

  async function handleAiSuggest() {
    setAiLoading(true)
    setAiError('')
    setAiResult(null)
    setTrueBase(null)
    setBookieOdds(null)
    try {
      // 1. Fetch live event odds from orderbook
      let currentMarketOdds: number[] | undefined
      try {
        const ob = await fetchOrderBook(eventId)
        const orders: Array<{ outcome: number; oddsDecimal: number }> = ob.orders ?? []
        const byOutcome = ([0, 1, 2] as const).map(o => {
          const matching = orders.filter(r => r.outcome === o)
          return matching.length > 0 ? Math.max(...matching.map(r => r.oddsDecimal)) : 0
        })
        if (byOutcome.some(v => v > 0)) currentMarketOdds = byOutcome
      } catch { /* backend uses defaults */ }

      // 2. Call AI endpoint with selected margin
      const selectedMargin = STRATEGIES.find(s => s.id === strategy)!.margin
      const result = await fetchSuggestOdds({
        eventId, eventName, sport, teams, outcome, currentMarketOdds,
        margin: selectedMargin,
      })

      // 3. Store reference data for local recalc on strategy switch
      setTrueBase(result.trueBase ?? result.suggestedOdds)
      setBookieOdds(result.bookieOdds ?? null)
      setAiResult(result.suggestedOdds ?? {})
      setAiSource(result.source ?? '')

      const key = OUTCOME_KEYS[outcome]
      if (result.suggestedOdds?.[key] !== undefined) {
        setOddsDecimal(String(result.suggestedOdds[key]))
      }
    } catch {
      setAiError('AI temporarily offline — enter odds manually')
    } finally {
      setAiLoading(false)
    }
  }

  async function handleCreate() {
    const oddsNum      = parseFloat(oddsDecimal)
    const liabilityNum = parseFloat(liabilityUsdt)
    if (!oddsNum || !liabilityNum || oddsNum <= 1) {
      setErrorMsg('Odds must be > 1.00')
      return
    }
    setStatus('approving')
    setErrorMsg('')
    try {
      const oddsRaw      = BigInt(Math.round(oddsNum * 10000))
      const liabilityRaw = parseUnits(liabilityNum.toFixed(6), 6)
      const gas          = await withGasBuffer(publicClient)
      const approveTxHash = await writeContractAsync({
        address: USDT_ADDRESS, abi: ERC20_ABI,
        functionName: 'approve', args: [ESCROW_ADDRESS, liabilityRaw],
        ...gas,
      })
      // Wait for approve to be mined — createOffer uses safeTransferFrom
      // which would revert if allowance is still 0 on-chain.
      await waitForTransactionReceipt(publicClient!, { hash: approveTxHash })
      setStatus('creating')
      await writeContractAsync({
        address: ESCROW_ADDRESS, abi: ESCROW_ABI,
        functionName: 'createOffer', args: [eventId, outcome, oddsRaw, liabilityRaw],
        ...gas,
      })
      setStatus('done')
      setOddsDecimal('')
      setLiabilityUsdt('')
      setAiResult(null)
      setTrueBase(null)
      setBookieOdds(null)
      onOfferCreated?.()  // immediately refresh parent stats + offers list
    } catch (err: unknown) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Transaction error')
    }
  }

  const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFB01F] transition-colors'

  // ── Task 3: Event Edge data for the selected outcome ───────────────────────
  const activeKey     = OUTCOME_KEYS[outcome]
  const bettazooOdd   = aiResult?.[activeKey]
  const bookieOdd     = bookieOdds?.[activeKey]
  const showEdge      = bettazooOdd !== undefined && bookieOdd !== undefined
  const edgePct       = showEdge
    ? +((bettazooOdd - bookieOdd) / bookieOdd * 100).toFixed(1)
    : 0
  const currentStrategy = STRATEGIES.find(s => s.id === strategy)!

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
      <h3 className="font-bold text-white text-sm tracking-wide">Create Offer</h3>

      {/* ── Outcome selector ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Outcome</label>
        <div className="grid grid-cols-3 gap-2">
          {([0, 1, 2] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOutcome(o)}
              className={`py-2.5 min-h-[40px] text-xs font-semibold rounded-md border transition-colors ${
                outcome === o
                  ? 'border-[#FFB01F] bg-[#FFB01F]/10 text-[#FFB01F]'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
              }`}
            >
              {OUTCOMES[o]}
            </button>
          ))}
        </div>
      </div>

      {/* ── Task 1: Strategy selector ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Strategy</label>
        <div className="grid grid-cols-3 gap-1.5">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStrategy(s.id)}
              className={`flex flex-col items-center py-2.5 px-1 rounded-md border text-center transition-colors ${
                strategy === s.id
                  ? 'border-[#FFB01F]/60 bg-[#FFB01F]/8 text-[#FFB01F]'
                  : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
              }`}
            >
              <span className={`text-[10px] font-bold leading-none ${strategy === s.id ? 'text-[#FFB01F]' : ''}`}>
                {s.label}
              </span>
              <span className={`text-[9px] mt-0.5 font-mono ${strategy === s.id ? 'text-[#FFB01F]/70' : 'text-slate-600'}`}>
                {s.sub}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Odds input + AI Suggest ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Odds</label>
        <div className="flex gap-2">
          <input
            type="number"
            min="1.01"
            step="0.01"
            value={oddsDecimal}
            onChange={(e) => setOddsDecimal(e.target.value)}
            className={inputCls}
            placeholder="2.50"
          />
          <button
            onClick={handleAiSuggest}
            disabled={aiLoading}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-[#FFB01F]/10 border border-[#FFB01F]/40 text-[#FFB01F] hover:bg-[#FFB01F]/20 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {aiLoading ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                AI…
              </span>
            ) : '✦ AI Suggest'}
          </button>
        </div>
      </div>

      {/* ── Task 3: Event Edge panel ── */}
      {showEdge && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/70 p-3.5 space-y-2.5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
              Event Edge — {OUTCOMES[outcome]}
            </span>
            <span className="text-[9px] font-mono text-slate-600 uppercase">{aiSource}</span>
          </div>

          {/* Comparison rows */}
          <div className="space-y-1.5">
            {/* Traditional bookie */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600 line-through">
                Bookmaker Odds
              </span>
              <span className="text-xs font-mono font-semibold text-slate-600 line-through">
                {bookieOdd?.toFixed(2)}x
              </span>
            </div>

            {/* Bettazoo optimal */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#FFB01F]">
                Your Optimal Odd
              </span>
              <span className="text-sm font-bold font-mono text-[#FFB01F]">
                {bettazooOdd?.toFixed(2)}x
              </span>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800" />

            {/* Edge vs bookmaker */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-400 font-semibold">
                Your Mathematical Edge
              </span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                +{edgePct}%
              </span>
            </div>

            {/* Guaranteed margin footnote */}
            <div className="flex items-center justify-between pt-0.5">
              <span className="text-[10px] text-slate-600">
                Guaranteed Margin ({currentStrategy.sub})
              </span>
              <span className="text-[10px] font-mono text-slate-600">
                {(currentStrategy.margin * 100).toFixed(1)}% built-in
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── All-outcome odds grid (when AI has run) ── */}
      {aiResult && (
        <div className="space-y-1.5">
          <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">
            Optimal Odds — All Outcomes
          </label>
          <div className="grid grid-cols-3 gap-2">
            {OUTCOME_KEYS.map((key, i) => (
              <button
                key={key}
                onClick={() => { setOutcome(i); setOddsDecimal(String(aiResult[key] ?? '')) }}
                className={`text-center py-2 rounded-md border transition-colors ${
                  i === outcome
                    ? 'border-[#FFB01F]/50 bg-[#FFB01F]/8'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">{OUTCOMES[i]}</div>
                <div className="font-bold font-mono text-sm text-slate-200 mt-0.5">
                  {(aiResult[key] ?? 0).toFixed(2)}
                  <span className="text-slate-500 text-xs">x</span>
                </div>
                {bookieOdds && (
                  <div className="text-[9px] text-slate-700 line-through font-mono mt-0.5">
                    {(bookieOdds[key] ?? 0).toFixed(2)}x
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Liability ── */}
      <div className="space-y-1.5">
        <label className="block text-xs text-slate-500 font-medium uppercase tracking-wide">
          Liability (collateral)
        </label>
        <div className="relative">
          <input
            type="number"
            min="1"
            step="0.01"
            value={liabilityUsdt}
            onChange={(e) => setLiabilityUsdt(e.target.value)}
            className={`${inputCls} pr-14`}
            placeholder="100.00"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 font-mono">USDT</span>
        </div>
      </div>

      {aiError && (
        <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-md px-3 py-2">
          {aiError}
        </p>
      )}

      {errorMsg && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
          {errorMsg}
        </p>
      )}

      {status === 'done' ? (
        <div className="flex items-center justify-between bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">✓</span>
            <span className="text-sm font-bold text-emerald-400">Offer created!</span>
          </div>
          <button
            onClick={() => setStatus('idle')}
            className="text-xs font-semibold text-emerald-400/70 hover:text-emerald-300 transition-colors"
          >
            + New Offer
          </button>
        </div>
      ) : (
        <button
          onClick={handleCreate}
          disabled={status !== 'idle' && status !== 'error'}
          className="w-full py-3 text-sm font-bold rounded-md bg-[#FFB01F] hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {(status === 'approving' || status === 'creating') ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {status === 'approving' ? '① Approving USDT…' : '② Creating offer…'}
            </span>
          ) : 'Create Offer'}
        </button>
      )}
    </div>
  )
}
