'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useSignMessage, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { parseUnits, formatUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { VAULT_FACTORY_ABI, VAULT_ABI, ERC20_ABI, OUTCOMES } from '@/lib/abis'
import { useEvents } from '@/lib/useEvents'
import { fetchVault, patchVaultConfig, buildVaultConfigMessage, type VaultData, type VaultScope } from '@/lib/api'
import { withGasBuffer } from '@/lib/gasUtils'

const VAULT_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS          = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0')          as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
// Arbitrum Sepolia block times/RPC propagation can occasionally lag well past
// viem's default receipt-wait window — give it more room before giving up.
const RECEIPT_TIMEOUT_MS = 120_000

const STRATEGIES = [
  { id: 'volume',   label: 'Volume Dominator', sub: '1.5% Margin', description: 'Best odds. Maximizes the number of incoming bets.' },
  { id: 'balanced', label: 'Balanced',         sub: '3.0% Margin', description: 'Standard house edge. Good mix of volume and profit.' },
  { id: 'safe',     label: 'Safe Bank',        sub: '5.0% Margin', description: 'Conservative odds. Lower volume, highest profit margin per bet.' },
  { id: 'custom',   label: 'Custom',           sub: 'Set your own', description: undefined },
] as const
type StrategyId = typeof STRATEGIES[number]['id']

type Props = {
  onVaultReady?: (vaultAddress: string) => void
}

const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFB01F] transition-colors'

export default function VaultPanel({ onVaultReady }: Props) {
  const { events } = useEvents()
  const { address, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signMessageAsync } = useSignMessage()
  const { switchChainAsync } = useSwitchChain()

  // The wallet can be on any chain regardless of what this dapp reads/writes —
  // request a switch up front so the tx isn't signed against the wrong network
  // (passing chainId to writeContractAsync alone only rejects the mismatch,
  // it doesn't prompt the wallet to switch).
  async function ensureArbitrumSepolia() {
    if (chain?.id !== arbitrumSepolia.id) {
      await switchChainAsync({ chainId: arbitrumSepolia.id })
    }
  }

  const { data: vaultAddressOnChain, refetch: refetchVaultOf } = useReadContract({
    address: VAULT_FACTORY_ADDRESS,
    abi: VAULT_FACTORY_ABI,
    functionName: 'vaultOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const vaultExists = !!vaultAddressOnChain && vaultAddressOnChain.toLowerCase() !== ZERO_ADDRESS
  const vaultAddress = vaultExists ? (vaultAddressOnChain as `0x${string}`) : undefined

  const [vaultData, setVaultData] = useState<VaultData | null>(null)
  const [creating,  setCreating]  = useState(false)
  const [createErr, setCreateErr] = useState('')

  useEffect(() => {
    if (vaultAddress) onVaultReady?.(vaultAddress)
  }, [vaultAddress, onVaultReady])

  const loadVaultData = useCallback(async () => {
    if (!address) return
    try {
      const data = await fetchVault(address)
      setVaultData(data)
    } catch {
      setVaultData(null)
    }
  }, [address])

  useEffect(() => { loadVaultData() }, [loadVaultData])

  // ── On-chain reads for the funded panel ──────────────────────────────────────
  const { data: vaultBalanceRaw, refetch: refetchVaultBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: vaultAddress ? [vaultAddress] : undefined,
    query: { enabled: !!vaultAddress },
  })
  const { data: walletBalanceRaw } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })
  const { data: onChainPaused, refetch: refetchPaused } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: 'paused',
    query: { enabled: !!vaultAddress },
  })
  const { data: maxSingleLiabilityRaw, refetch: refetchMaxSingle } = useReadContract({
    address: vaultAddress,
    abi: VAULT_ABI,
    functionName: 'maxSingleOfferLiability',
    query: { enabled: !!vaultAddress },
  })
  // Whether a per-bet liability cap is actually enforced on-chain — required before
  // the keeper can go active (see handleSaveConfig).
  const hasSingleCap = !!maxSingleLiabilityRaw && (maxSingleLiabilityRaw as bigint) > BigInt(0)

  // ── Funding form state ────────────────────────────────────────────────────────
  const [depositAmt,  setDepositAmt]  = useState('')
  const [withdrawAmt, setWithdrawAmt] = useState('')
  const [fundStatus, setFundStatus]   = useState<'idle' | 'depositing' | 'withdrawing' | 'error'>('idle')
  const [fundErr, setFundErr] = useState('')

  // ── Config form state — seeded from backend once loaded ───────────────────────
  const [strategy,     setStrategy]     = useState<StrategyId>('balanced')
  const [customMargin, setCustomMargin] = useState('3.0')
  const [scope,         setScope]         = useState<VaultScope[]>([])
  const [maxExposure,   setMaxExposure]   = useState('0')
  const [perMarketExposure, setPerMarketExposure] = useState('0')
  const [stopLoss,      setStopLoss]      = useState('0')
  const [minOdds,       setMinOdds]       = useState('1.05')
  const [maxOdds,        setMaxOdds]        = useState('20')
  const [liabilityIncrement, setLiabilityIncrement] = useState('25')
  const [active, setActive] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle')
  const [saveErr, setSaveErr] = useState('')
  const [maxSingleInput, setMaxSingleInput] = useState('')
  const [capStatus, setCapStatus] = useState<'idle' | 'setting' | 'error'>('idle')
  const [pauseStatus, setPauseStatus] = useState<'idle' | 'toggling' | 'error'>('idle')

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

  async function handleCreateVault() {
    setCreating(true)
    setCreateErr('')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      const txHash = await writeContractAsync({
        address: VAULT_FACTORY_ADDRESS, abi: VAULT_FACTORY_ABI,
        functionName: 'createVault', args: [],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: txHash, timeout: RECEIPT_TIMEOUT_MS })
      await refetchVaultOf()
      await loadVaultData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction error'
      // A wait-timeout means we stopped watching, not that the chain rejected it —
      // the tx can still land. Don't cancel it in your wallet; check its Activity
      // tab or Arbiscan, then just reload this page once it confirms.
      setCreateErr(
        msg.toLowerCase().includes('timed out')
          ? 'Still waiting for confirmation on-chain — this can take a bit on Arbitrum Sepolia. Check your wallet’s Activity tab; do not cancel it. Reload this page once it confirms.'
          : msg
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleDeposit() {
    const amount = parseFloat(depositAmt)
    if (!vaultAddress || !amount || amount <= 0) return
    setFundStatus('depositing')
    setFundErr('')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const approveTx = await writeContractAsync({
        address: USDT_ADDRESS, abi: ERC20_ABI,
        functionName: 'approve', args: [vaultAddress, raw],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: approveTx, timeout: RECEIPT_TIMEOUT_MS })
      const depositTx = await writeContractAsync({
        address: vaultAddress, abi: VAULT_ABI,
        functionName: 'deposit', args: [raw],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: depositTx, timeout: RECEIPT_TIMEOUT_MS })
      setDepositAmt('')
      setFundStatus('idle')
      await refetchVaultBalance()
    } catch (err: unknown) {
      setFundStatus('error')
      setFundErr(err instanceof Error ? err.message : 'Deposit failed')
    }
  }

  async function handleWithdraw() {
    const amount = parseFloat(withdrawAmt)
    if (!vaultAddress || !amount || amount <= 0) return
    setFundStatus('withdrawing')
    setFundErr('')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: VAULT_ABI,
        functionName: 'withdraw', args: [raw],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setWithdrawAmt('')
      setFundStatus('idle')
      await refetchVaultBalance()
    } catch (err: unknown) {
      setFundStatus('error')
      setFundErr(err instanceof Error ? err.message : 'Withdrawal failed')
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
    // The margin protects the vault over time, not on a single bet — without an
    // on-chain per-offer cap, one oversized match could drain the whole balance
    // in one shot. Require it before the keeper is allowed to go active.
    if (active && !hasSingleCap) {
      setSaveStatus('error')
      setSaveErr('Set a "Max Size Per Bet" cap on-chain before activating the keeper — it protects the vault from a single oversized bet.')
      return
    }
    setSaveStatus('saving')
    setSaveErr('')
    try {
      const timestamp = Date.now()
      const message = buildVaultConfigMessage(address, timestamp)
      const signature = await signMessageAsync({ message })
      const data = await patchVaultConfig(address, signature, timestamp, {
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
      const amount = parseFloat(maxSingleInput) || 0
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: VAULT_ABI,
        functionName: 'setMaxSingleOfferLiability', args: [raw],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setCapStatus('idle')
      await refetchMaxSingle()
    } catch {
      setCapStatus('error')
    }
  }

  async function handleTogglePause() {
    if (!vaultAddress) return
    setPauseStatus('toggling')
    try {
      await ensureArbitrumSepolia()
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: VAULT_ABI,
        functionName: onChainPaused ? 'unpause' : 'pause', args: [],
        chainId: arbitrumSepolia.id,
        ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setPauseStatus('idle')
      await refetchPaused()
    } catch {
      setPauseStatus('error')
    }
  }

  const vaultBalanceStr  = vaultBalanceRaw  !== undefined ? formatUnits(vaultBalanceRaw as bigint, 6)  : '0'
  const walletBalanceStr = walletBalanceRaw !== undefined ? formatUnits(walletBalanceRaw as bigint, 6) : '0'

  // ── No vault yet ───────────────────────────────────────────────────────────────
  if (!vaultExists) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="font-bold text-white text-sm tracking-wide">Placer Vault</h3>
        <p className="text-xs text-slate-400">
          Deploy your own isolated on-chain vault. Deposit USDT, set a strategy and risk limits once,
          and the Bettazoo keeper quotes offers automatically on your behalf — funds always stay
          withdrawable to you alone.
        </p>
        {createErr && (
          <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{createErr}</p>
        )}
        <button
          onClick={handleCreateVault}
          disabled={creating}
          className="w-full py-3 text-sm font-bold rounded-md bg-[#FFB01F] hover:bg-amber-400 text-slate-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {creating ? 'Deploying vault…' : 'Create Your Vault'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-bold text-white text-sm tracking-wide">Placer Vault</h3>
          <p className="text-[10px] font-mono text-slate-500 truncate">{vaultAddress}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-widest ${
            onChainPaused
              ? 'bg-red-500/10 border-red-500/30 text-red-400'
              : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
          }`}>
            {onChainPaused ? 'Paused' : 'Live'}
          </span>
          <span className="text-[9px] font-bold px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400 uppercase tracking-widest">
            {vaultData?.status ?? 'configuring'}
          </span>
        </div>
      </div>

      {/* ── Balance & Funding ── */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Vault Balance</p>
            <p className="text-lg font-bold font-mono text-white">${parseFloat(vaultBalanceStr).toFixed(2)}</p>
          </div>
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Wallet Balance</p>
            <p className="text-lg font-bold font-mono text-slate-400">${parseFloat(walletBalanceStr).toFixed(2)}</p>
          </div>
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
              className={inputCls} placeholder="Withdraw USDT" />
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
              {s.description && (
                <span className="text-xs text-slate-500 mt-0.5">{s.description}</span>
              )}
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
                        rowScope?.outcomes.includes(o)
                          ? 'border-[#FFB01F] bg-[#FFB01F]/10 text-[#FFB01F]'
                          : 'border-slate-700 text-slate-500 hover:border-slate-600'
                      }`}>
                      {OUTCOMES[o].split(' ')[0]}
                    </button>
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

      {/* ── Max size per bet — mandatory on-chain cap. Margin protects the vault over
          many bets, not a single one: without this, one oversized match can drain
          the whole balance in one shot. ── */}
      <div className={`space-y-1.5 rounded-md border p-3 ${
        hasSingleCap ? 'border-slate-800 bg-slate-950/40' : 'border-red-500/40 bg-red-500/5'
      }`}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">Max Size Per Bet (USDT)</label>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
            hasSingleCap
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
              : 'bg-red-500/10 text-red-400 border-red-500/30'
          }`}>
            {hasSingleCap ? 'Set' : 'Required'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Caps the liability of any single offer, enforced on-chain — without it, one large enough bet can empty the vault in one shot.
        </p>
        <div className="flex gap-1.5">
          <input type="number" min="0" step="1" value={maxSingleInput} onChange={e => setMaxSingleInput(e.target.value)}
            className={inputCls} placeholder="e.g. 100" />
          <button onClick={handleSetCap} disabled={capStatus === 'setting'}
            className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
            {capStatus === 'setting' ? '…' : 'Set Cap'}
          </button>
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

      {/* ── On-chain safety controls ── */}
      <div className="border-t border-slate-800 pt-4 space-y-2.5">
        <label className="text-xs text-slate-500 font-medium uppercase tracking-wide">On-Chain Safety</label>
        <button onClick={handleTogglePause} disabled={pauseStatus === 'toggling'}
          className={`w-full py-2.5 text-xs font-bold rounded-md border transition-colors disabled:opacity-50 ${
            onChainPaused
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              : 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
          }`}>
          {pauseStatus === 'toggling' ? '…' : onChainPaused ? 'Unpause Vault' : 'Pause Vault (kill switch)'}
        </button>
      </div>
    </div>
  )
}
