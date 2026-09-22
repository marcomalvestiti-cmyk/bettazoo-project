'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useSignMessage, useSignTypedData, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { parseUnits, formatUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { FUND_VAULT_FACTORY_ABI, FUND_VAULT_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { useEvents } from '@/lib/useEvents'
import {
  fetchFundVault, patchFundVaultConfig, postFundVaultAgreement, buildFundVaultConfigMessage,
  fetchFundVaultLPs, type FundVaultData, type FundVaultLPRow,
} from '@/lib/api'
import type { VaultScope } from '@/lib/api'
import { AGREEMENT_VERSION, AGREEMENT_DOMAIN, AGREEMENT_TYPES, AGREEMENT_TEXT, buildAgreementValue } from '@/lib/legal'
import { withGasBuffer } from '@/lib/gasUtils'

const FUND_VAULT_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FUND_VAULT_FACTORY_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const RECEIPT_TIMEOUT_MS = 120_000

const STRATEGIES = [
  { id: 'volume',   label: 'Volume Dominator', sub: '1.5% Margin', description: 'Best odds. Maximizes the number of incoming bets.' },
  { id: 'balanced', label: 'Balanced',         sub: '3.0% Margin', description: 'Standard house edge. Good mix of volume and profit.' },
  { id: 'safe',     label: 'Safe Bank',        sub: '5.0% Margin', description: 'Conservative odds. Lower volume, highest profit margin per bet.' },
  { id: 'custom',   label: 'Custom',           sub: 'Set your own', description: undefined },
] as const
type StrategyId = typeof STRATEGIES[number]['id']

const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFB01F] transition-colors'

export default function FundVaultPanel() {
  const { events } = useEvents()
  const { address, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signMessageAsync } = useSignMessage()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()

  async function ensureArbitrumSepolia() {
    if (chain?.id !== arbitrumSepolia.id) await switchChainAsync({ chainId: arbitrumSepolia.id })
  }

  const { data: fundVaultOnChain, refetch: refetchFundVaultOf } = useReadContract({
    address: FUND_VAULT_FACTORY_ADDRESS,
    abi: FUND_VAULT_FACTORY_ABI,
    functionName: 'fundVaultOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const vaultExists = !!fundVaultOnChain && fundVaultOnChain.toLowerCase() !== ZERO_ADDRESS
  const vaultAddress = vaultExists ? (fundVaultOnChain as `0x${string}`) : undefined

  const [vaultData, setVaultData] = useState<FundVaultData | null>(null)
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const loadVaultData = useCallback(async () => {
    if (!address) return
    try { setVaultData(await fetchFundVault(address)) } catch { setVaultData(null) }
  }, [address])
  useEffect(() => { loadVaultData() }, [loadVaultData])

  // ── On-chain reads ──────────────────────────────────────────────────────────
  const { data: liquidBalanceRaw, refetch: refetchLiquidBalance } = useReadContract({
    address: USDT_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: vaultAddress ? [vaultAddress] : undefined, query: { enabled: !!vaultAddress },
  })
  const { data: totalAssetsRaw, refetch: refetchTotalAssets } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'totalAssets', query: { enabled: !!vaultAddress },
  })
  const { data: lockedLiabilityRaw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'lockedLiability', query: { enabled: !!vaultAddress },
  })
  const { data: myShares, refetch: refetchMyShares } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!vaultAddress && !!address },
  })
  const { data: myMaxWithdraw, refetch: refetchMaxWithdraw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'maxWithdraw',
    args: address ? [address] : undefined, query: { enabled: !!vaultAddress && !!address },
  })
  const { data: walletBalanceRaw } = useReadContract({
    address: USDT_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: address ? [address] : undefined, query: { enabled: !!address },
  })
  const { data: onChainPaused, refetch: refetchPaused } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'paused', query: { enabled: !!vaultAddress },
  })
  const { data: maxSingleLiabilityRaw, refetch: refetchMaxSingle } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'maxSingleOfferLiability', query: { enabled: !!vaultAddress },
  })
  const { data: performanceFeeRaw, refetch: refetchPerformanceFee } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'performanceFeePercent', query: { enabled: !!vaultAddress },
  })
  const hasSingleCap = !!maxSingleLiabilityRaw && (maxSingleLiabilityRaw as bigint) > BigInt(0)

  // ── Funding form ─────────────────────────────────────────────────────────────
  const [depositAmt, setDepositAmt] = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [fundStatus, setFundStatus] = useState<'idle' | 'depositing' | 'withdrawing' | 'error'>('idle')
  const [fundErr, setFundErr] = useState('')

  // ── Config form ───────────────────────────────────────────────────────────────
  const [strategy, setStrategy] = useState<StrategyId>('balanced')
  const [customMargin, setCustomMargin] = useState('3.0')
  const [scope, setScope] = useState<VaultScope[]>([])
  const [maxExposure, setMaxExposure] = useState('0')
  const [perMarketExposure, setPerMarketExposure] = useState('0')
  const [stopLoss, setStopLoss] = useState('0')
  const [minOdds, setMinOdds] = useState('1.05')
  const [maxOdds, setMaxOdds] = useState('20')
  const [liabilityIncrement, setLiabilityIncrement] = useState('25')
  const [active, setActive] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [saveErr, setSaveErr] = useState('')
  const [maxSingleInput, setMaxSingleInput] = useState('')
  const [capStatus, setCapStatus] = useState<'idle' | 'setting' | 'error'>('idle')
  const [pauseStatus, setPauseStatus] = useState<'idle' | 'toggling' | 'error'>('idle')
  const [feeInput, setFeeInput] = useState('20')
  const [feeStatus, setFeeStatus] = useState<'idle' | 'setting' | 'error'>('idle')

  // ── LP allowlist ─────────────────────────────────────────────────────────────
  const [lps, setLps] = useState<FundVaultLPRow[]>([])
  const [newLpAddress, setNewLpAddress] = useState('')
  const [lpStatus, setLpStatus] = useState<'idle' | 'working' | 'error'>('idle')

  const loadLps = useCallback(async () => {
    if (!address) return
    try { setLps(await fetchFundVaultLPs(address)) } catch { setLps([]) }
  }, [address])
  useEffect(() => { loadLps() }, [loadLps])

  // ── Manager compliance (same gate/mechanism as the single-owner vault) ────────
  const [agreementStatus, setAgreementStatus] = useState<'idle' | 'signing' | 'error'>('idle')
  const [agreementErr, setAgreementErr] = useState('')
  const [kycRequestStatus, setKycRequestStatus] = useState<'idle' | 'requesting' | 'error'>('idle')
  const hasSignedAgreement = vaultData?.agreementVersion === AGREEMENT_VERSION
  const kycStatus = vaultData?.kycStatus ?? 'none'

  useEffect(() => {
    if (!vaultData?.exists) return
    setStrategy(vaultData.strategy?.marginStrategyId ?? 'balanced')
    if (vaultData.strategy?.customMargin !== undefined) setCustomMargin(String(vaultData.strategy.customMargin * 100))
    setScope(vaultData.scope ?? [])
    setMaxExposure(String(vaultData.maxExposureUsdt ?? 0))
    setPerMarketExposure(String(vaultData.perMarketExposureUsdt ?? 0))
    setStopLoss(String(vaultData.stopLossUsdt ?? 0))
    setMinOdds(String(vaultData.minOdds ?? 1.05))
    setMaxOdds(String(vaultData.maxOdds ?? 20))
    setLiabilityIncrement(String(vaultData.liabilityIncrementUsdt ?? 25))
    setActive(vaultData.status === 'active')
  }, [vaultData])

  useEffect(() => {
    if (maxSingleLiabilityRaw !== undefined) {
      const n = Number(formatUnits(maxSingleLiabilityRaw as bigint, 6))
      setMaxSingleInput(n > 0 ? String(n) : '')
    }
  }, [maxSingleLiabilityRaw])

  useEffect(() => {
    if (performanceFeeRaw !== undefined) setFeeInput(String(performanceFeeRaw as bigint))
  }, [performanceFeeRaw])

  async function handleCreateFundVault() {
    setCreating(true)
    setCreateErr('')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      const txHash = await writeContractAsync({
        address: FUND_VAULT_FACTORY_ADDRESS, abi: FUND_VAULT_FACTORY_ABI,
        functionName: 'createFundVault', args: [],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: txHash, timeout: RECEIPT_TIMEOUT_MS })
      await refetchFundVaultOf()
      await loadVaultData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction error'
      setCreateErr(
        msg.toLowerCase().includes('timed out')
          ? 'Still waiting for confirmation on-chain — check your wallet’s Activity tab; do not cancel it. Reload once it confirms.'
          : msg
      )
    } finally {
      setCreating(false)
    }
  }

  async function refreshOnChainReads() {
    await Promise.all([refetchLiquidBalance(), refetchTotalAssets(), refetchMyShares(), refetchMaxWithdraw()])
  }

  async function handleDeposit() {
    const amount = parseFloat(depositAmt)
    if (!vaultAddress || !address || !amount || amount <= 0) return
    setFundStatus('depositing')
    setFundErr('')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const approveTx = await writeContractAsync({
        address: USDT_ADDRESS, abi: ERC20_ABI, functionName: 'approve', args: [vaultAddress, raw],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: approveTx, timeout: RECEIPT_TIMEOUT_MS })
      const depositTx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'deposit', args: [raw, address],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: depositTx, timeout: RECEIPT_TIMEOUT_MS })
      setDepositAmt('')
      setFundStatus('idle')
      await refreshOnChainReads()
    } catch (err: unknown) {
      setFundStatus('error')
      setFundErr(err instanceof Error ? err.message : 'Deposit failed')
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmt)
    if (!vaultAddress || !address || !amount || amount <= 0) return
    setFundStatus('withdrawing')
    setFundErr('')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'withdraw', args: [raw, address, address],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setWithdrawAmt('')
      setFundStatus('idle')
      await refreshOnChainReads()
    } catch (err: unknown) {
      setFundStatus('error')
      // A liquidity-capped redeem reverts with ERC4626ExceededMaxWithdraw — surface it plainly.
      const raw = err instanceof Error ? err.message : 'Withdrawal failed'
      setFundErr(raw.includes('ExceededMaxWithdraw') ? 'Not enough liquid balance right now — some capital is locked in open offers.' : raw)
    }
  }

  function toggleOutcome(eventId: string, outcome: number) {
    setScope(prev => {
      const existing = prev.find(s => s.eventId === eventId)
      if (!existing) return [...prev, { eventId, outcomes: [outcome] }]
      const has = existing.outcomes.includes(outcome)
      const nextOutcomes = has ? existing.outcomes.filter(o => o !== outcome) : [...existing.outcomes, outcome]
      if (nextOutcomes.length === 0) return prev.filter(s => s.eventId !== eventId)
      return prev.map(s => s.eventId === eventId ? { ...s, outcomes: nextOutcomes } : s)
    })
  }

  async function handleSaveConfig() {
    if (!address) return
    if (active && !hasSingleCap) {
      setSaveStatus('error')
      setSaveErr('Set a "Max Size Per Bet" cap on-chain before activating the keeper — it protects LP capital from a single oversized bet.')
      return
    }
    if (active && (!hasSignedAgreement || kycStatus !== 'approved')) {
      const missing = []
      if (!hasSignedAgreement) missing.push('sign the Liquidity Provision Agreement')
      if (kycStatus !== 'approved') missing.push('complete KYC review')
      setSaveStatus('error')
      setSaveErr(`Cannot activate the keeper yet — ${missing.join(' and ')} first.`)
      return
    }
    setSaveStatus('saving')
    setSaveErr('')
    try {
      const timestamp = Date.now()
      const message = buildFundVaultConfigMessage(address, timestamp)
      const signature = await signMessageAsync({ message })
      const data = await patchFundVaultConfig(address, signature, timestamp, {
        marginStrategyId: strategy,
        customMargin: strategy === 'custom' ? parseFloat(customMargin) / 100 : undefined,
        scope,
        maxExposureUsdt: parseFloat(maxExposure) || 0,
        perMarketExposureUsdt: parseFloat(perMarketExposure) || 0,
        stopLossUsdt: parseFloat(stopLoss) || 0,
        minOdds: parseFloat(minOdds) || 1.05,
        maxOdds: parseFloat(maxOdds) || 20,
        liabilityIncrementUsdt: parseFloat(liabilityIncrement) || 25,
        status: active ? 'active' : 'configuring',
      })
      setVaultData(data)
      setSaveStatus('done')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err: unknown) {
      setSaveStatus('error')
      setSaveErr(err instanceof Error ? err.message : 'Could not save config')
    }
  }

  async function handleSetCap() {
    if (!vaultAddress) return
    setCapStatus('setting')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits((parseFloat(maxSingleInput) || 0).toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'setMaxSingleOfferLiability', args: [raw],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setCapStatus('idle')
      await refetchMaxSingle()
    } catch {
      setCapStatus('error')
    }
  }

  async function handleSetPerformanceFee() {
    if (!vaultAddress) return
    setFeeStatus('setting')
    try {
      await ensureArbitrumSepolia()
      const pct = BigInt(Math.round(parseFloat(feeInput) || 0))
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'setPerformanceFeePercent', args: [pct],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setFeeStatus('idle')
      await refetchPerformanceFee()
    } catch {
      setFeeStatus('error')
    }
  }

  async function handleSetApprovedLP(lpAddress: string, approved: boolean) {
    if (!vaultAddress) return
    setLpStatus('working')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'setApprovedLP',
        args: [lpAddress as `0x${string}`, approved],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setLpStatus('idle')
      setNewLpAddress('')
      await loadLps()
    } catch {
      setLpStatus('error')
    }
  }

  async function handleSignAgreement() {
    if (!address) return
    setAgreementStatus('signing')
    setAgreementErr('')
    try {
      await ensureArbitrumSepolia()
      const timestamp = Date.now()
      const signature = await signTypedDataAsync({
        domain: AGREEMENT_DOMAIN, types: AGREEMENT_TYPES, primaryType: 'LiquidityProvisionAgreement',
        message: buildAgreementValue(address, timestamp),
      })
      const data = await postFundVaultAgreement(address, signature, timestamp)
      setVaultData(data)
      setAgreementStatus('idle')
    } catch (err: unknown) {
      setAgreementStatus('error')
      setAgreementErr(err instanceof Error ? err.message : 'Could not sign the agreement')
    }
  }

  async function handleRequestKyc() {
    if (!address) return
    setKycRequestStatus('requesting')
    try {
      const timestamp = Date.now()
      const message = buildFundVaultConfigMessage(address, timestamp)
      const signature = await signMessageAsync({ message })
      const data = await patchFundVaultConfig(address, signature, timestamp, { kycRequestReview: true })
      setVaultData(data)
      setKycRequestStatus('idle')
    } catch {
      setKycRequestStatus('error')
    }
  }

  async function handleTogglePause() {
    if (!vaultAddress) return
    setPauseStatus('toggling')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: onChainPaused ? 'unpause' : 'pause', args: [],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setPauseStatus('idle')
      await refetchPaused()
    } catch {
      setPauseStatus('error')
    }
  }

  const tvlStr = totalAssetsRaw !== undefined ? formatUnits(totalAssetsRaw as bigint, 6) : '0'
  const liquidStr = liquidBalanceRaw !== undefined ? formatUnits(liquidBalanceRaw as bigint, 6) : '0'
  const lockedStr = lockedLiabilityRaw !== undefined ? formatUnits(lockedLiabilityRaw as bigint, 6) : '0'
  const walletBalanceStr = walletBalanceRaw !== undefined ? formatUnits(walletBalanceRaw as bigint, 6) : '0'
  const myMaxWithdrawStr = myMaxWithdraw !== undefined ? formatUnits(myMaxWithdraw as bigint, 6) : '0'
  const myShareBalance = myShares !== undefined ? (myShares as bigint) : BigInt(0)

  if (!vaultExists) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="font-bold text-white text-sm tracking-wide">Fund Vault</h3>
        <p className="text-xs text-slate-400">
          Open your own banco to third-party capital. LPs deposit USDT and get quote-shares back;
          you run the strategy, the keeper quotes automatically, and you earn a performance fee on
          any profit — split with the platform. Your own single-owner Placer Vault (if any) is
          untouched by this.
        </p>
        {createErr && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{createErr}</p>}
        <button onClick={handleCreateFundVault} disabled={creating}
          className="w-full py-3 text-sm font-bold rounded-md bg-[#FFB01F] hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {creating ? 'Deploying fund vault…' : 'Create Your Fund Vault'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-white text-sm tracking-wide">Fund Vault</h3>
          <p className="text-[10px] font-mono text-slate-500 truncate">{vaultAddress}</p>
          {address && (
            <a href={`/fund/${address}`} target="_blank" rel="noreferrer"
              className="text-[10px] text-[#FFB01F] hover:underline">
              View public LP page ↗
            </a>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-widest ${
            onChainPaused ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          }`}>{onChainPaused ? 'Paused' : 'Live'}</span>
          <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-widest">
            {vaultData?.status ?? 'configuring'}
          </span>
        </div>
      </div>

      {/* ── TVL / liquidity ── */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">TVL</p>
          <p className="text-lg font-bold font-mono text-white">${parseFloat(tvlStr).toFixed(2)}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Liquid</p>
          <p className="text-lg font-bold font-mono text-slate-300">${parseFloat(liquidStr).toFixed(2)}</p>
        </div>
        <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Locked in Offers</p>
          <p className="text-lg font-bold font-mono text-amber-400">${parseFloat(lockedStr).toFixed(2)}</p>
        </div>
      </div>

      {/* ── Your position + funding ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Your shares: <span className="font-mono text-slate-300">{myShareBalance.toString()}</span></span>
          <span>Wallet: <span className="font-mono text-slate-400">${parseFloat(walletBalanceStr).toFixed(2)}</span></span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex gap-1.5">
            <input type="number" min="0" step="0.01" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
              className={inputCls} placeholder="Deposit USDT" />
            <button onClick={handleDeposit} disabled={fundStatus === 'depositing'}
              className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
              {fundStatus === 'depositing' ? '…' : 'Deposit'}
            </button>
          </div>
          <div className="flex gap-1.5">
            <input type="number" min="0" step="0.01" value={withdrawAmt} onChange={e => setWithdrawAmt(e.target.value)}
              className={inputCls} placeholder={`Withdraw (up to $${parseFloat(myMaxWithdrawStr).toFixed(2)})`} />
            <button onClick={handleWithdraw} disabled={fundStatus === 'withdrawing'}
              className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
              {fundStatus === 'withdrawing' ? '…' : 'Withdraw'}
            </button>
          </div>
        </div>
        {fundErr && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{fundErr}</p>}
      </div>

      {/* ── Strategy ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">Strategy</label>
        <div className="space-y-1.5">
          {STRATEGIES.map(s => (
            <button key={s.id} onClick={() => setStrategy(s.id)}
              className={`w-full flex flex-col items-start py-2 px-3 rounded-md border text-left transition-colors ${
                strategy === s.id ? 'border-[#FFB01F]/60 bg-[#FFB01F]/8' : 'border-slate-800 hover:border-slate-700'
              }`}>
              <span className="flex items-baseline gap-1.5">
                <span className={`text-xs font-bold leading-none ${strategy === s.id ? 'text-[#FFB01F]' : 'text-slate-400'}`}>{s.label}</span>
                <span className={`text-[10px] font-mono ${strategy === s.id ? 'text-[#FFB01F]/70' : 'text-slate-600'}`}>{s.sub}</span>
              </span>
              {s.description && <span className="text-xs text-slate-500 mt-0.5">{s.description}</span>}
            </button>
          ))}
        </div>
        {strategy === 'custom' && (
          <div className="flex items-center gap-2 pt-1">
            <input type="number" min="0" step="0.1" value={customMargin} onChange={e => setCustomMargin(e.target.value)}
              className={inputCls} placeholder="3.0" />
            <span className="text-xs text-slate-500 font-mono shrink-0">% margin</span>
          </div>
        )}
      </div>

      {/* ── Market scope ── */}
      <div className="space-y-1.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          Market Scope {scope.length > 0 && <span className="text-slate-600">({scope.length} events)</span>}
        </label>
        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          {events.map(ev => {
            const rowScope = scope.find(s => s.eventId === ev.eventId)
            return (
              <div key={ev.eventId} className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-md px-2.5 py-1.5">
                <span className="text-sm shrink-0">{ev.icon}</span>
                <span className="text-xs text-slate-300 truncate flex-1 min-w-0">{ev.name}</span>
                <div className="flex gap-1 shrink-0">
                  {([0, 1, 2] as const).map(o => (
                    <button key={o} onClick={() => toggleOutcome(ev.eventId, o)}
                      className={`px-1.5 py-1 text-[9px] font-bold rounded border transition-colors ${
                        rowScope?.outcomes.includes(o) ? 'border-[#FFB01F] bg-[#FFB01F]/10 text-[#FFB01F]' : 'border-slate-700 text-slate-500 hover:border-slate-600'
                      }`}>{OUTCOMES[o].split(' ')[0]}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Risk limits ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Max Exposure</label>
          <input type="number" min="0" step="1" value={maxExposure} onChange={e => setMaxExposure(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Per-Market Cap</label>
          <input type="number" min="0" step="1" value={perMarketExposure} onChange={e => setPerMarketExposure(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Stop-Loss (USDT)</label>
          <input type="number" min="0" step="1" value={stopLoss} onChange={e => setStopLoss(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Quote Size</label>
          <input type="number" min="1" step="1" value={liabilityIncrement} onChange={e => setLiabilityIncrement(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Min Odds</label>
          <input type="number" min="1.01" step="0.01" value={minOdds} onChange={e => setMinOdds(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Max Odds</label>
          <input type="number" min="1.01" step="0.01" value={maxOdds} onChange={e => setMaxOdds(e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* ── Performance fee — YOUR cut of LP profit, split with the platform on-chain ── */}
      <div className="space-y-1.5 rounded-md border border-slate-800 bg-slate-950/40 p-3">
        <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Performance Fee</label>
        <p className="text-xs text-slate-500">
          Your cut of LP profit above the high-water mark, crystallized on-chain. Platform takes a share of this fee, not a separate cost to you.
        </p>
        <div className="flex gap-1.5">
          <input type="number" min="0" max="100" step="1" value={feeInput} onChange={e => setFeeInput(e.target.value)} className={inputCls} placeholder="20" />
          <span className="self-center text-xs text-slate-500 font-mono">%</span>
          <button onClick={handleSetPerformanceFee} disabled={feeStatus === 'setting'}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
            {feeStatus === 'setting' ? '…' : 'Set Fee'}
          </button>
        </div>
      </div>

      {/* ── Max size per bet — mandatory on-chain cap ── */}
      <div className={`space-y-1.5 rounded-md border p-3 ${hasSingleCap ? 'border-slate-800 bg-slate-950/40' : 'border-red-500/40 bg-red-500/5'}`}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Max Size Per Bet (USDT)</label>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
            hasSingleCap ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>{hasSingleCap ? 'Set' : 'Required'}</span>
        </div>
        <p className="text-xs text-slate-500">Caps the liability of any single offer, enforced on-chain — protects LP capital from one oversized bet.</p>
        <div className="flex gap-1.5">
          <input type="number" min="0" step="1" value={maxSingleInput} onChange={e => setMaxSingleInput(e.target.value)} className={inputCls} placeholder="e.g. 100" />
          <button onClick={handleSetCap} disabled={capStatus === 'setting'}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
            {capStatus === 'setting' ? '…' : 'Set Cap'}
          </button>
        </div>
      </div>

      {/* ── LP allowlist — on-chain gate, revoking only blocks new deposits, never withdrawals ── */}
      <div className="space-y-2.5 rounded-md border border-slate-800 bg-slate-950/40 p-3">
        <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Approved LPs</label>
        <p className="text-xs text-slate-500">
          Only approved addresses can deposit. Revoking never blocks an existing LP from withdrawing their own position.
        </p>
        <div className="flex gap-1.5">
          <input type="text" value={newLpAddress} onChange={e => setNewLpAddress(e.target.value)} className={inputCls} placeholder="0x… LP address" />
          <button onClick={() => handleSetApprovedLP(newLpAddress.trim(), true)} disabled={lpStatus === 'working' || !newLpAddress.trim()}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
            {lpStatus === 'working' ? '…' : 'Approve'}
          </button>
        </div>
        {lps.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
            {lps.map(lp => (
              <div key={lp.lpAddress} className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-md px-2.5 py-1.5">
                <span className="text-[10px] font-mono text-slate-400 truncate">{lp.lpAddress}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
                    lp.kycStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : lp.kycStatus === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                    : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>{lp.kycStatus}</span>
                  <button onClick={() => handleSetApprovedLP(lp.lpAddress, !lp.approved)} disabled={lpStatus === 'working'}
                    className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-widest transition-colors ${
                      lp.approved ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20'
                    }`}>{lp.approved ? 'Revoke' : 'Approve'}</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Manager compliance — same mechanism as the single-owner vault ── */}
      <div className="space-y-2.5 rounded-md border border-slate-800 bg-slate-950/40 p-3">
        <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Compliance (Fund Manager)</label>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">Liquidity Provision Agreement</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
              hasSignedAgreement ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>{hasSignedAgreement ? 'Signed' : 'Not Signed'}</span>
          </div>
          {!hasSignedAgreement && (
            <>
              <div className="max-h-24 overflow-y-auto rounded border border-slate-800 bg-slate-950 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500 whitespace-pre-line">
                {AGREEMENT_TEXT}
              </div>
              <button onClick={handleSignAgreement} disabled={agreementStatus === 'signing'}
                className="w-full py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
                {agreementStatus === 'signing' ? 'Signing…' : 'Sign Agreement'}
              </button>
              {agreementErr && <p className="text-[10px] text-red-400">{agreementErr}</p>}
            </>
          )}
        </div>
        <div className="space-y-1.5 pt-1.5 border-t border-slate-800/60">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-400">KYC Review</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
              kycStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : kycStatus === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : kycStatus === 'rejected' ? 'bg-red-500/10 text-red-400 border-red-500/30'
              : 'bg-slate-800 text-slate-500 border-slate-700'
            }`}>{kycStatus === 'approved' ? 'Approved' : kycStatus === 'pending' ? 'Pending' : kycStatus === 'rejected' ? 'Rejected' : 'Not Started'}</span>
          </div>
          {kycStatus === 'approved' ? (
            <p className="text-[10px] text-slate-600">Verified — the keeper can quote once activated below.</p>
          ) : kycStatus === 'pending' ? (
            <p className="text-[10px] text-slate-600">Under manual review (testnet — no Sumsub integration yet). Check back soon.</p>
          ) : (
            <button onClick={handleRequestKyc} disabled={kycRequestStatus === 'requesting'}
              className="w-full py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
              {kycRequestStatus === 'requesting' ? 'Requesting…' : kycStatus === 'rejected' ? 'Request Review Again' : 'Request KYC Review'}
            </button>
          )}
        </div>
      </div>

      {/* ── Activate + Save ── */}
      <div className="flex items-center justify-between bg-slate-950/50 border border-slate-800 rounded-md px-3 py-2.5">
        <span className="text-xs font-semibold text-slate-300">Keeper active</span>
        <button onClick={() => setActive(a => !a)}
          className={`relative w-10 h-5 rounded-full transition-colors ${active ? 'bg-[#FFB01F]' : 'bg-slate-700'}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {saveErr && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{saveErr}</p>}

      <button onClick={handleSaveConfig} disabled={saveStatus === 'saving'}
        className="w-full py-3 text-sm font-bold rounded-md bg-[#FFB01F] hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {saveStatus === 'saving' ? 'Signing & saving…' : saveStatus === 'done' ? '✓ Saved!' : 'Save Config'}
      </button>

      <div className="border-t border-slate-800 pt-4 space-y-2.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">On-Chain Safety</label>
        <button onClick={handleTogglePause} disabled={pauseStatus === 'toggling'}
          className={`w-full py-2.5 text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
            onChainPaused ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20' : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
          }`}>
          {pauseStatus === 'toggling' ? '…' : onChainPaused ? 'Unpause Vault' : 'Pause Vault (blocks new offers + deposits, never withdrawals)'}
        </button>
      </div>
    </div>
  )
}
