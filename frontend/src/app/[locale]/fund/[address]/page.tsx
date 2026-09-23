'use client'

import { Link } from '@/i18n/navigation'
import { use, useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useSignTypedData, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { parseUnits, formatUnits } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { FUND_VAULT_FACTORY_ABI, FUND_VAULT_ABI, ERC20_ABI } from '@/lib/abis'
import {
  fetchFundVault, postFundVaultLPAgreement, postFundVaultLPKycRequest, fetchFundVaultLPs,
  type FundVaultData,
} from '@/lib/api'
import { FUND_AGREEMENT_VERSION, FUND_AGREEMENT_DOMAIN, FUND_AGREEMENT_TYPES, FUND_AGREEMENT_TEXT, buildFundAgreementValue } from '@/lib/fundAgreement'
import { withGasBuffer } from '@/lib/gasUtils'
import { displayMakerName, isKnownMaker } from '@/lib/formatAddress'

const FUND_VAULT_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_FUND_VAULT_FACTORY_ADDRESS ?? '0x0') as `0x${string}`
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? '0x0') as `0x${string}`
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const RECEIPT_TIMEOUT_MS = 120_000

const inputCls = 'w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm font-semibold text-white placeholder:text-slate-600 focus:outline-none focus:border-[#FFB01F] transition-colors'

// LP-facing page for a Fund Vault (Tier 3, item 2/3) — :address is the fund MANAGER's
// owner address (same URL convention as /placer/[address]), resolved to the fund vault
// contract on-chain via the factory. Deposit/redeem require this specific LP address to
// be on the manager's on-chain approvedLPs allowlist first (see FundVaultPanel.tsx).
export default function FundVaultLPPage({ params }: { params: Promise<{ address: string }> }) {
  const t = useTranslations('FundPage')
  const { address: ownerAddress } = use(params)
  const { address: myAddress, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()

  async function ensureArbitrumSepolia() {
    if (chain?.id !== arbitrumSepolia.id) await switchChainAsync({ chainId: arbitrumSepolia.id })
  }

  const { data: fundVaultOnChain } = useReadContract({
    address: FUND_VAULT_FACTORY_ADDRESS, abi: FUND_VAULT_FACTORY_ABI, functionName: 'fundVaultOf',
    args: [ownerAddress as `0x${string}`],
  })
  const vaultExists = !!fundVaultOnChain && fundVaultOnChain.toLowerCase() !== ZERO_ADDRESS
  const vaultAddress = vaultExists ? (fundVaultOnChain as `0x${string}`) : undefined

  const [vaultData, setVaultData] = useState<FundVaultData | null>(null)
  useEffect(() => { fetchFundVault(ownerAddress).then(setVaultData).catch(() => setVaultData(null)) }, [ownerAddress])

  const { data: totalAssetsRaw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'totalAssets', query: { enabled: !!vaultAddress },
  })
  const { data: totalSupplyRaw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'totalSupply', query: { enabled: !!vaultAddress },
  })
  const { data: performanceFeeRaw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'performanceFeePercent', query: { enabled: !!vaultAddress },
  })
  const { data: pausedRaw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'paused', query: { enabled: !!vaultAddress },
  })
  const { data: myApproved, refetch: refetchApproved } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'approvedLPs',
    args: myAddress ? [myAddress] : undefined, query: { enabled: !!vaultAddress && !!myAddress },
  })
  const { data: myShares, refetch: refetchMyShares } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'balanceOf',
    args: myAddress ? [myAddress] : undefined, query: { enabled: !!vaultAddress && !!myAddress },
  })
  const { data: myMaxWithdraw, refetch: refetchMaxWithdraw } = useReadContract({
    address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'maxWithdraw',
    args: myAddress ? [myAddress] : undefined, query: { enabled: !!vaultAddress && !!myAddress },
  })
  const { data: walletBalanceRaw, refetch: refetchWallet } = useReadContract({
    address: USDT_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf',
    args: myAddress ? [myAddress] : undefined, query: { enabled: !!myAddress },
  })

  const [myLpRecord, setMyLpRecord] = useState<{ kycStatus: string; agreementVersion: number | null } | null>(null)
  const loadLpRecord = useCallback(async () => {
    if (!myAddress) return
    try {
      const lps = await fetchFundVaultLPs(ownerAddress)
      const mine = lps.find(l => l.lpAddress.toLowerCase() === myAddress.toLowerCase())
      setMyLpRecord(mine ? { kycStatus: mine.kycStatus, agreementVersion: mine.agreementVersion } : { kycStatus: 'none', agreementVersion: null })
    } catch { setMyLpRecord(null) }
  }, [ownerAddress, myAddress])
  useEffect(() => { loadLpRecord() }, [loadLpRecord])

  const [agreementStatus, setAgreementStatus] = useState<'idle' | 'signing' | 'error'>('idle')
  const [kycStatus, setKycStatus] = useState<'idle' | 'requesting' | 'error'>('idle')
  const [depositAmt, setDepositAmt] = useState('')
  const [redeemAmt, setRedeemAmt] = useState('')
  const [fundStatus, setFundStatus] = useState<'idle' | 'depositing' | 'redeeming' | 'error'>('idle')
  const [fundErr, setFundErr] = useState('')

  const hasSignedFundAgreement = myLpRecord?.agreementVersion === FUND_AGREEMENT_VERSION

  async function handleSignAgreement() {
    if (!myAddress || !vaultAddress) return
    setAgreementStatus('signing')
    try {
      await ensureArbitrumSepolia()
      const timestamp = Date.now()
      const signature = await signTypedDataAsync({
        domain: FUND_AGREEMENT_DOMAIN, types: FUND_AGREEMENT_TYPES, primaryType: 'FundParticipationAgreement',
        message: buildFundAgreementValue(vaultAddress, myAddress, timestamp),
      })
      await postFundVaultLPAgreement(ownerAddress, myAddress, signature, timestamp)
      await loadLpRecord()
      setAgreementStatus('idle')
    } catch {
      setAgreementStatus('error')
    }
  }

  async function handleRequestKyc() {
    if (!myAddress) return
    setKycStatus('requesting')
    try {
      await postFundVaultLPKycRequest(ownerAddress, myAddress)
      await loadLpRecord()
      setKycStatus('idle')
    } catch {
      setKycStatus('error')
    }
  }

  async function handleDeposit() {
    const amount = parseFloat(depositAmt)
    if (!vaultAddress || !myAddress || !amount || amount <= 0) return
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
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'deposit', args: [raw, myAddress],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: depositTx, timeout: RECEIPT_TIMEOUT_MS })
      setDepositAmt('')
      setFundStatus('idle')
      await Promise.all([refetchMyShares(), refetchWallet(), refetchMaxWithdraw()])
    } catch (err: unknown) {
      setFundStatus('error')
      const raw = err instanceof Error ? err.message : 'Deposit failed'
      setFundErr(raw.includes('ExceededMaxDeposit') ? t('notApprovedError') : raw)
    }
  }

  async function handleRedeem() {
    const amount = parseFloat(redeemAmt)
    if (!vaultAddress || !myAddress || !amount || amount <= 0) return
    setFundStatus('redeeming')
    setFundErr('')
    try {
      await ensureArbitrumSepolia()
      const raw = parseUnits(amount.toFixed(6), 6)
      const gas = await withGasBuffer(publicClient)
      const tx = await writeContractAsync({
        address: vaultAddress, abi: FUND_VAULT_ABI, functionName: 'withdraw', args: [raw, myAddress, myAddress],
        chainId: arbitrumSepolia.id, ...gas,
      })
      await waitForTransactionReceipt(publicClient!, { hash: tx, timeout: RECEIPT_TIMEOUT_MS })
      setRedeemAmt('')
      setFundStatus('idle')
      await Promise.all([refetchMyShares(), refetchWallet(), refetchMaxWithdraw()])
    } catch (err: unknown) {
      setFundStatus('error')
      const raw = err instanceof Error ? err.message : 'Withdrawal failed'
      setFundErr(raw.includes('ExceededMaxWithdraw') ? t('illiquidError') : raw)
    }
  }

  const tvl = totalAssetsRaw !== undefined ? Number(formatUnits(totalAssetsRaw as bigint, 6)) : 0
  const supply = totalSupplyRaw !== undefined ? (totalSupplyRaw as bigint) : BigInt(0)
  const pricePerShare = supply > BigInt(0) && totalAssetsRaw !== undefined
    ? Number(formatUnits(totalAssetsRaw as bigint, 6)) / Number(formatUnits(supply, 6))
    : 1
  const performanceFee = performanceFeeRaw !== undefined ? Number(performanceFeeRaw) : 0
  const walletBalanceStr = walletBalanceRaw !== undefined ? formatUnits(walletBalanceRaw as bigint, 6) : '0'
  const myMaxWithdrawStr = myMaxWithdraw !== undefined ? formatUnits(myMaxWithdraw as bigint, 6) : '0'
  const myShareBalance = myShares !== undefined ? (myShares as bigint) : BigInt(0)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <Link href="/placer" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200">
        {t('back')}
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">{t('title')}</h1>
          <p className={`text-sm mt-0.5 ${isKnownMaker(ownerAddress) ? 'font-semibold text-sky-400' : 'font-mono text-slate-500'}`}>
            {t('managedBy', { name: displayMakerName(ownerAddress) })}
          </p>
        </div>
        {vaultData?.status && (
          <span className={`shrink-0 text-[9px] font-bold px-2 py-1 rounded-full border uppercase tracking-widest ${
            vaultData.status === 'active' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>{vaultData.status === 'active' ? t('keeperActive') : vaultData.status}</span>
        )}
      </div>

      {!vaultExists ? (
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 px-6 py-10 text-center">
          <p className="text-sm font-semibold text-slate-400">{t('notOpened')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{t('tvl')}</p>
              <p className="text-lg font-bold font-mono text-white">${tvl.toFixed(2)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{t('pricePerShare')}</p>
              <p className="text-lg font-bold font-mono text-slate-300">{pricePerShare.toFixed(4)}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">{t('performanceFee')}</p>
              <p className="text-lg font-bold font-mono text-amber-400">{performanceFee}%</p>
            </div>
          </div>

          {!!pausedRaw && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">
              {t('pausedNotice')}
            </p>
          )}

          {!myAddress ? (
            <p className="text-sm text-slate-500">{t('connectPrompt')}</p>
          ) : (
            <>
              {/* ── Compliance ── */}
              <div className="space-y-2.5 rounded-md border border-slate-800 bg-slate-950/40 p-3">
                <label className="text-[10px] text-slate-300 font-bold uppercase tracking-wide">{t('complianceTitle')}</label>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{t('agreementLabel')}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
                      hasSignedFundAgreement ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-red-500/10 text-red-400 border-red-500/30'
                    }`}>{hasSignedFundAgreement ? t('signed') : t('notSigned')}</span>
                  </div>
                  {!hasSignedFundAgreement && (
                    <>
                      <div className="max-h-24 overflow-y-auto rounded border border-slate-800 bg-slate-950 px-2.5 py-2 text-[10px] leading-relaxed text-slate-500 whitespace-pre-line">
                        {FUND_AGREEMENT_TEXT}
                      </div>
                      <button onClick={handleSignAgreement} disabled={agreementStatus === 'signing'}
                        className="w-full py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
                        {agreementStatus === 'signing' ? t('signing') : t('signAgreement')}
                      </button>
                    </>
                  )}
                </div>
                <div className="space-y-1.5 pt-1.5 border-t border-slate-800/60">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">{t('kycLabel')}</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
                      myLpRecord?.kycStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                      : myLpRecord?.kycStatus === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : 'bg-slate-800 text-slate-500 border-slate-700'
                    }`}>{myLpRecord?.kycStatus === 'approved' ? t('approved') : myLpRecord?.kycStatus === 'pending' ? t('pending') : t('notStarted')}</span>
                  </div>
                  {myLpRecord?.kycStatus !== 'approved' && myLpRecord?.kycStatus !== 'pending' && (
                    <button onClick={handleRequestKyc} disabled={kycStatus === 'requesting'}
                      className="w-full py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
                      {kycStatus === 'requesting' ? t('requesting') : t('requestKyc')}
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60">
                  <span className="text-xs text-slate-400">{t('onchainApprovalLabel')}</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-widest border ${
                    myApproved ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}>{myApproved ? t('approved') : t('notYetApproved')}</span>
                </div>
                {!myApproved && (
                  <p className="text-[10px] text-slate-600">
                    {t('approvalHint')}
                  </p>
                )}
                <button onClick={() => refetchApproved()} className="text-[10px] text-slate-500 hover:text-slate-300 underline">
                  {t('refreshStatus')}
                </button>
              </div>

              {/* ── Your position + funding ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>{t('yourShares')} <span className="font-mono text-slate-300">{myShareBalance.toString()}</span></span>
                  <span>{t('wallet')} <span className="font-mono text-slate-400">${parseFloat(walletBalanceStr).toFixed(2)}</span></span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex gap-1.5">
                    <input type="number" min="0" step="0.01" value={depositAmt} onChange={e => setDepositAmt(e.target.value)}
                      className={inputCls} placeholder={t('depositPlaceholder')} />
                    <button onClick={handleDeposit} disabled={fundStatus === 'depositing'}
                      className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors">
                      {fundStatus === 'depositing' ? '…' : t('deposit')}
                    </button>
                  </div>
                  <div className="flex gap-1.5">
                    <input type="number" min="0" step="0.01" value={redeemAmt} onChange={e => setRedeemAmt(e.target.value)}
                      className={inputCls} placeholder={t('withdrawPlaceholder', { amount: parseFloat(myMaxWithdrawStr).toFixed(2) })} />
                    <button onClick={handleRedeem} disabled={fundStatus === 'redeeming'}
                      className="shrink-0 px-3 py-2 text-xs font-bold rounded-md bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-600 disabled:opacity-50 transition-colors">
                      {fundStatus === 'redeeming' ? '…' : t('withdraw')}
                    </button>
                  </div>
                </div>
                {fundErr && <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-3 py-2">{fundErr}</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
