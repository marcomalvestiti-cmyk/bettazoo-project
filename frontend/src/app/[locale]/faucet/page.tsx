'use client'

import { useEffect, useState } from 'react'
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { useTranslations } from 'next-intl'
import { MOCK_USDT_ABI } from '@/lib/abis'
import { withGasBuffer } from '@/lib/gasUtils'

const CONTRACT = (process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS ?? '') as `0x${string}`
const FAUCET_AMOUNT = 1_000

function formatCooldown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function FaucetPage() {
  const t = useTranslations('Faucet')
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const [cooldownDisplay, setCooldownDisplay] = useState('')

  const enabled = isConnected && !!address && !!CONTRACT

  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACT,
    abi:     MOCK_USDT_ABI,
    functionName: 'balanceOf',
    args:    [address!],
    query:   { enabled },
  })

  const { data: claimStatus, refetch: refetchStatus } = useReadContract({
    address: CONTRACT,
    abi:     MOCK_USDT_ABI,
    functionName: 'canClaim',
    args:    [address!],
    query:   { enabled },
  })

  const canClaim    = claimStatus?.[0] ?? false
  const waitSeconds = claimStatus?.[1] !== undefined ? Number(claimStatus[1]) : 0

  useEffect(() => {
    if (waitSeconds > 0) setCooldownDisplay(formatCooldown(waitSeconds))
    else setCooldownDisplay('')
  }, [waitSeconds])

  const { writeContract, data: txHash, isPending, error: writeError, reset } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash })

  useEffect(() => {
    if (isSuccess) {
      refetchBalance()
      refetchStatus()
    }
  }, [isSuccess, refetchBalance, refetchStatus])

  async function handleClaim() {
    reset()
    const gas = await withGasBuffer(publicClient)
    writeContract({
      address: CONTRACT,
      abi:     MOCK_USDT_ABI,
      functionName: 'faucet',
      ...gas,
    })
  }

  const formattedBalance = balance !== undefined
    ? parseFloat(formatUnits(balance as bigint, 6)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'

  // 1 000 BTZ-USD at 6 decimals — enough to test the platform comfortably
  const SUFFICIENT_THRESHOLD = BigInt(1_000_000_000)
  const hasSufficientBalance = balance !== undefined && (balance as bigint) >= SUFFICIENT_THRESHOLD

  const notDeployed = !CONTRACT || CONTRACT === '0x0000000000000000000000000000000000000000'

  return (
    <div className="max-w-lg mx-auto px-4 py-16 space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-[#FFB01F]/10 border border-[#FFB01F]/30 flex items-center justify-center mx-auto text-3xl">
          🚰
        </div>
        <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
        <p className="text-sm text-slate-400">
          {t.rich('subtitle', { token: chunks => <span className="text-[#FFB01F] font-semibold">{chunks}</span> })}
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">{t('testnetOnly')}</p>
        <p className="text-sm text-slate-400">
          {t.rich('noValueInfo', { strong: chunks => <strong className="text-white">{chunks}</strong> })}
        </p>
      </div>

      {/* Main card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">

        {notDeployed ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-slate-400 text-sm">{t('notDeployed')}</p>
            <p className="text-slate-600 text-xs">{t.rich('notDeployedHint', { code: chunks => <code className="text-slate-400">{chunks}</code> })}</p>
          </div>
        ) : !isConnected ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-slate-400 text-sm">{t('connectPrompt')}</p>
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="flex items-center justify-between bg-slate-950 rounded-xl px-4 py-3 border border-slate-800">
              <span className="text-sm text-slate-400">{t('balanceLabel')}</span>
              <span className="text-lg font-bold text-white font-mono">{formattedBalance}</span>
            </div>

            {/* Claim info */}
            <div className="text-center space-y-1">
              <p className="text-4xl font-bold text-[#FFB01F]">{FAUCET_AMOUNT.toLocaleString()}</p>
              <p className="text-sm text-slate-500">{t('perClaim')}</p>
            </div>

            {/* Status messages */}
            {isSuccess && (
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-4 py-3 text-center">
                <p className="text-emerald-400 font-semibold text-sm">{t('claimSuccess', { amount: FAUCET_AMOUNT.toLocaleString() })}</p>
              </div>
            )}
            {writeError && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3">
                <p className="text-red-400 text-xs">{writeError.message.slice(0, 120)}</p>
              </div>
            )}

            {/* Claim button — hidden when wallet already has enough tokens */}
            {hasSufficientBalance ? (
              <div className="w-full rounded-xl bg-emerald-900/20 border border-emerald-700/40 px-4 py-4 text-center space-y-1">
                <p className="text-emerald-400 font-bold text-sm">{t('sufficientBalance')}</p>
                <p className="text-xs text-slate-500">
                  {t('sufficientBalanceHint', { balance: formattedBalance })}
                </p>
              </div>
            ) : (
              <>
                <button
                  onClick={handleClaim}
                  disabled={!canClaim || isPending || isConfirming}
                  className="w-full py-3 rounded-xl font-bold text-slate-950 bg-[#FFB01F] hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
                >
                  {isPending     ? t('confirmInWallet')  :
                   isConfirming  ? t('minting') :
                   !canClaim && waitSeconds > 0 ? t('availableIn', { cooldown: cooldownDisplay }) :
                   t('claimButton', { amount: FAUCET_AMOUNT.toLocaleString() })}
                </button>
                {!canClaim && waitSeconds > 0 && (
                  <p className="text-center text-xs text-slate-600">
                    {t('nextClaimIn', { cooldown: cooldownDisplay })}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Network hint */}
      <p className="text-center text-xs text-slate-600">
        {t.rich('networkHint', { network: chunks => <span className="text-slate-400">{chunks}</span> })}
      </p>
    </div>
  )
}
