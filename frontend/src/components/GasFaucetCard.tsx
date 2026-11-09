'use client'

import { useState } from 'react'
import { useBalance } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { formatEther } from 'viem'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { claimGasFaucet, fetchGasFaucetStatus, type GasFaucetStatus } from '@/lib/api'

// Step 1 of onboarding: a small amount of Arbitrum Sepolia ETH from the backend gas
// faucet (backend/src/services/gasFaucet.js), so a brand-new wallet can pay for the
// BTZ-USD claim and its first bets without hunting for a public faucet.
export default function GasFaucetCard({ address }: { address: `0x${string}` }) {
  const t = useTranslations('Faucet')
  const queryClient = useQueryClient()
  const [claiming, setClaiming] = useState(false)
  const [result, setResult] = useState<GasFaucetStatus | null>(null)

  const { data: ethBalance, refetch: refetchEth } = useBalance({ address, chainId: arbitrumSepolia.id })
  const { data: status } = useQuery({
    queryKey: ['gasFaucet', address],
    queryFn: () => fetchGasFaucetStatus(address),
  })

  async function handleClaim() {
    setClaiming(true)
    setResult(null)
    try {
      const r = await claimGasFaucet(address)
      setResult(r)
      if (r.claimed) {
        await refetchEth()
        await queryClient.invalidateQueries({ queryKey: ['gasFaucet', address] })
      }
    } catch {
      setResult({ eligible: false, reason: 'send_failed' })
    } finally {
      setClaiming(false)
    }
  }

  const formattedEth = ethBalance ? Number(formatEther(ethBalance.value)).toFixed(5) : '—'
  const amount = status?.amountEth ?? '0.0005'
  const shown = result ?? status
  const reason = shown?.reason

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-bold text-sky-400 uppercase tracking-widest">{t('gasStep')}</p>
        <p className="text-sm text-slate-400">{t('gasExplain')}</p>
      </div>

      <div className="flex items-center justify-between bg-slate-950 rounded-xl px-4 py-3 border border-slate-800">
        <span className="text-sm text-slate-400">{t('gasBalanceLabel')}</span>
        <span className="text-lg font-bold text-white font-mono">{formattedEth}</span>
      </div>

      {result?.claimed ? (
        <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-4 py-3 text-center space-y-1">
          <p className="text-emerald-400 font-semibold text-sm">{t('gasSuccess', { amount })}</p>
          {result.txHash && (
            <a
              href={`https://sepolia.arbiscan.io/tx/${result.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 underline hover:text-slate-200"
            >
              {t('gasViewTx')}
            </a>
          )}
        </div>
      ) : status?.eligible && !reason ? (
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full py-3 rounded-xl font-bold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
        >
          {claiming ? t('gasClaiming') : t('gasClaimButton', { amount })}
        </button>
      ) : reason ? (
        <div className={`rounded-lg px-4 py-3 text-center text-sm ${
          reason === 'has_balance' || reason === 'already_claimed'
            ? 'bg-emerald-900/20 border border-emerald-700/40 text-emerald-400'
            : 'bg-slate-950 border border-slate-800 text-slate-400'
        }`}>
          {t(`gasReasons.${reason}`)}
        </div>
      ) : null}
    </div>
  )
}
