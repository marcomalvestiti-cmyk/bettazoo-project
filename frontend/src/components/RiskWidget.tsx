'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { waitForTransactionReceipt } from 'viem/actions'
import { fetchRiskManager } from '@/lib/api'
import { VAULT_ABI } from '@/lib/abis'
import { withGasBuffer } from '@/lib/gasUtils'

const RECEIPT_TIMEOUT_MS = 120_000

type Exposure = {
  eventId:     string
  outcome:     number
  exposureUsdt: number
}

type RiskData = {
  level:            'LOW' | 'MEDIUM' | 'HIGH'
  totalExposureUsdt: number
  exposures:        Exposure[]
  message:          string
}

const LEVEL_STYLE: Record<string, { badge: string; border: string; dot: string }> = {
  LOW:    { badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/30', border: 'border-slate-700',    dot: 'bg-emerald-400' },
  MEDIUM: { badge: 'text-amber-400  bg-amber-400/10  border-amber-500/30',    border: 'border-slate-700',    dot: 'bg-amber-400' },
  HIGH:   { badge: 'text-red-400    bg-red-400/10    border-red-500/30',      border: 'border-red-500/40',   dot: 'bg-red-400 animate-pulse' },
}

type Props = {
  address:       string
  // Optional — when the address above is a vault, passing it explicitly lets the
  // widget offer an on-chain emergency Kill-Switch (pause) alongside the risk read.
  vaultAddress?: string
}

export default function RiskWidget({ address, vaultAddress }: Props) {
  const [data,    setData]    = useState<RiskData | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Kill-Switch — same on-chain pause()/unpause() pattern as VaultPanel's own
  // "On-Chain Safety" control, surfaced here with maximum visual prominence since
  // this is the widget a placer watches while exposure is climbing. ─────────────
  const { chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const [killStatus, setKillStatus] = useState<'idle' | 'toggling' | 'error'>('idle')

  const { data: onChainPaused, refetch: refetchPaused } = useReadContract({
    address: vaultAddress as `0x${string}` | undefined,
    abi: VAULT_ABI,
    functionName: 'paused',
    query: { enabled: !!vaultAddress },
  })

  async function handleKillSwitch() {
    if (!vaultAddress) return
    setKillStatus('toggling')
    try {
      if (chain?.id !== arbitrumSepolia.id) {
        await switchChainAsync({ chainId: arbitrumSepolia.id })
      }
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress as `0x${string}`, abi: VAULT_ABI,
        functionName: onChainPaused ? 'unpause' : 'pause', args: [],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setKillStatus('idle')
      await refetchPaused()
    } catch {
      setKillStatus('error')
    }
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const result = await fetchRiskManager(address)
        if (!cancelled) setData(result as RiskData)
      } catch {
        if (!cancelled) setData(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [address])

  // Rendered ahead of (and independent from) the risk-data loading state below —
  // an emergency stop must stay reachable even while that fetch is slow or failing.
  const killSwitchButton = vaultAddress && (
    <button
      onClick={handleKillSwitch}
      disabled={killStatus === 'toggling'}
      className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-lg border-2 text-sm font-extrabold uppercase tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
        onChainPaused
          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 hover:bg-emerald-500/20'
          : 'bg-red-600 border-red-400 text-white shadow-lg shadow-red-900/50 hover:bg-red-500 animate-pulse'
      }`}
    >
      <span className="text-lg leading-none">🛑</span>
      {killStatus === 'toggling'
        ? 'Confirming on-chain…'
        : onChainPaused ? 'Resume Vault' : 'Emergency Kill-Switch'}
    </button>
  )
  const killSwitchError = killStatus === 'error' && (
    <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
      Kill-Switch transaction failed — try again.
    </p>
  )

  if (loading) return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-3">
      {killSwitchButton}
      {killSwitchError}
      <p className="text-xs text-slate-500">Loading risk data…</p>
    </div>
  )
  if (!data) return (
    <div className="rounded-lg border border-red-500/30 bg-slate-900 p-4 space-y-3">
      {killSwitchButton}
      {killSwitchError}
      <p className="text-xs text-red-400">Risk Manager unavailable</p>
    </div>
  )

  const style = LEVEL_STYLE[data.level] ?? LEVEL_STYLE.LOW
  const total = typeof data.totalExposureUsdt === 'number'
    ? data.totalExposureUsdt.toFixed(2)
    : String(data.totalExposureUsdt)

  return (
    <div className={`rounded-lg border ${style.border} bg-slate-900 p-4 space-y-3`}>
      {killSwitchButton}
      {killSwitchError}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-white">Risk Manager</span>
        <span className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded border ${style.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
          {data.level}
        </span>
      </div>

      <p className="text-xs text-slate-400">{data.message}</p>

      <div className="flex items-center justify-between text-xs border-t border-slate-800 pt-2">
        <span className="text-slate-500">Total exposure</span>
        <span className="font-bold font-mono text-white">${total} USDT</span>
      </div>

      {data.exposures?.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {data.exposures.map((e, i) => (
            <div key={i} className="flex justify-between text-xs bg-slate-950/60 rounded-md px-2.5 py-1.5">
              <span className="font-mono text-slate-400 truncate mr-2">{e.eventId} / out.{e.outcome}</span>
              <span className="font-bold font-mono text-slate-300 shrink-0">
                ${typeof e.exposureUsdt === 'number' ? e.exposureUsdt.toFixed(2) : e.exposureUsdt}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
