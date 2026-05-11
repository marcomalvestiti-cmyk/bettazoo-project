'use client'

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { formatUnits } from 'viem'
import { MOCK_USDT_ABI } from '@/lib/abis'

const CONTRACT = (process.env.NEXT_PUBLIC_MOCK_USDT_ADDRESS ?? '') as `0x${string}`
const FAUCET_AMOUNT = 1_000

function formatCooldown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function FaucetPage() {
  const { address, isConnected } = useAccount()
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

  function handleClaim() {
    reset()
    writeContract({
      address: CONTRACT,
      abi:     MOCK_USDT_ABI,
      functionName: 'faucet',
    })
  }

  const formattedBalance = balance !== undefined
    ? parseFloat(formatUnits(balance as bigint, 6)).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : '—'

  const notDeployed = !CONTRACT || CONTRACT === '0x0000000000000000000000000000000000000000'

  return (
    <div className="max-w-lg mx-auto px-4 py-16 space-y-8">

      {/* Header */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 rounded-2xl bg-[#FFB01F]/10 border border-[#FFB01F]/30 flex items-center justify-center mx-auto text-3xl">
          🚰
        </div>
        <h1 className="text-3xl font-bold text-white">Testnet Faucet</h1>
        <p className="text-sm text-slate-400">
          Claim free <span className="text-[#FFB01F] font-semibold">BTZ-USD</span> tokens to test the Bettazoo platform.
        </p>
      </div>

      {/* Info banner */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 space-y-1">
        <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">⚠ Testnet Only</p>
        <p className="text-sm text-slate-400">
          BTZ-USD has <strong className="text-white">no real monetary value</strong>. It exists only on
          Arbitrum Sepolia testnet to let you explore the platform risk-free.
          Your mainnet funds are never touched.
        </p>
      </div>

      {/* Main card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">

        {notDeployed ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-slate-400 text-sm">Contract not deployed yet.</p>
            <p className="text-slate-600 text-xs">Set <code className="text-slate-400">NEXT_PUBLIC_MOCK_USDT_ADDRESS</code> after deploying to Arbitrum Sepolia.</p>
          </div>
        ) : !isConnected ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-slate-400 text-sm">Connect your wallet to claim tokens.</p>
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="flex items-center justify-between bg-slate-950 rounded-xl px-4 py-3 border border-slate-800">
              <span className="text-sm text-slate-400">Your BTZ-USD balance</span>
              <span className="text-lg font-bold text-white font-mono">{formattedBalance}</span>
            </div>

            {/* Claim info */}
            <div className="text-center space-y-1">
              <p className="text-4xl font-bold text-[#FFB01F]">{FAUCET_AMOUNT.toLocaleString()}</p>
              <p className="text-sm text-slate-500">BTZ-USD per claim · 24 h cooldown</p>
            </div>

            {/* Status messages */}
            {isSuccess && (
              <div className="bg-emerald-900/30 border border-emerald-700/50 rounded-lg px-4 py-3 text-center">
                <p className="text-emerald-400 font-semibold text-sm">✓ 1 000 BTZ-USD added to your wallet!</p>
              </div>
            )}
            {writeError && (
              <div className="bg-red-900/20 border border-red-800/50 rounded-lg px-4 py-3">
                <p className="text-red-400 text-xs">{writeError.message.slice(0, 120)}</p>
              </div>
            )}

            {/* Claim button */}
            <button
              onClick={handleClaim}
              disabled={!canClaim || isPending || isConfirming}
              className="w-full py-3 rounded-xl font-bold text-slate-950 bg-[#FFB01F] hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-base"
            >
              {isPending     ? 'Confirm in wallet…'  :
               isConfirming  ? 'Minting in progress…' :
               !canClaim && waitSeconds > 0 ? `Available in ${cooldownDisplay}` :
               `Claim ${FAUCET_AMOUNT.toLocaleString()} BTZ-USD`}
            </button>

            {!canClaim && waitSeconds > 0 && (
              <p className="text-center text-xs text-slate-600">
                Next claim available in {cooldownDisplay}
              </p>
            )}
          </>
        )}
      </div>

      {/* Network hint */}
      <p className="text-center text-xs text-slate-600">
        Make sure MetaMask is connected to <span className="text-slate-400">Arbitrum Sepolia</span> (Chain ID 421614)
      </p>
    </div>
  )
}
