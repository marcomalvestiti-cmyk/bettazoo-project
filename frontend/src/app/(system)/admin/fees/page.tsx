'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAccount, usePublicClient, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { ESCROW_ABI } from '@/lib/abis'
import { fetchAdminVaults, type AdminVaultRow } from '@/lib/api'
import ConnectWallet from '@/components/ConnectWallet'
import AdminGate from '@/components/AdminGate'
import { withGasBuffer } from '@/lib/gasUtils'

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '') as `0x${string}`
const PLATFORM_DEFAULT_PCT = 5

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function shortError(msg: string): string {
  const revert = msg.match(/reverted with reason string '(.+?)'/)?.[1]
  if (revert) return revert
  return msg.split('\n')[0].slice(0, 120)
}

export default function AdminFeesPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [rows, setRows] = useState<AdminVaultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({}) // vaultAddress -> input value

  const {
    writeContract,
    data: txHash,
    isPending: isSigningTx,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({ hash: txHash })

  const [pendingVault, setPendingVault] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAdminVaults())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load vault list')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Backend indexes PlacerFeeOverrideUpdated in near-real-time, but re-fetching after
  // our own confirmed tx avoids waiting on that indexer for the row we just changed.
  useEffect(() => {
    if (isConfirmed && pendingVault) {
      load()
      setPendingVault(null)
    }
  }, [isConfirmed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (writeError) setPendingVault(null)
  }, [writeError])

  async function setOverride(vaultAddress: string) {
    const raw = drafts[vaultAddress]
    const pct = Number(raw)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      setError('Fee must be a number between 0 and 100')
      return
    }
    resetWrite()
    setError('')
    setPendingVault(vaultAddress)
    const gas = await withGasBuffer(publicClient)
    writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'setPlacerFeeOverride',
      args: [vaultAddress as `0x${string}`, BigInt(pct)],
      ...gas,
    })
  }

  async function clearOverride(vaultAddress: string) {
    resetWrite()
    setError('')
    setPendingVault(vaultAddress)
    const gas = await withGasBuffer(publicClient)
    writeContract({
      address: ESCROW_ADDRESS,
      abi: ESCROW_ABI,
      functionName: 'clearPlacerFeeOverride',
      args: [vaultAddress as `0x${string}`],
      ...gas,
    })
  }

  const isBusy = isSigningTx || isConfirming

  return (
    <AdminGate>
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">Admin Panel</p>
        <h1 className="text-3xl font-bold text-white">Vigorish per Vault</h1>
        <p className="text-sm text-slate-400">
          Overrides the global platform fee ({PLATFORM_DEFAULT_PCT}%) for a single vault — calls{' '}
          <code className="text-emerald-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
            setPlacerFeeOverride()
          </code>{' '}
          directly on-chain from your connected wallet. Your wallet must be the{' '}
          <span className="text-white font-medium">Escrow owner</span>.
        </p>
      </div>

      {/* Wallet status card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Connected Wallet</p>
          {isConnected
            ? <p className="text-sm font-mono text-emerald-400 truncate">{address}</p>
            : <p className="text-sm text-slate-400">Connect the Escrow owner wallet to set fee overrides.</p>
          }
        </div>
        <div className="shrink-0">
          <ConnectWallet />
        </div>
      </div>

      {/* TX status banner */}
      {txHash && (
        <div className={`rounded-lg border px-4 py-3 text-sm flex items-center justify-between gap-4 ${
          isConfirming
            ? 'border-amber-800 bg-amber-900/20 text-amber-300'
            : 'border-emerald-800 bg-emerald-900/20 text-emerald-300'
        }`}>
          <span>
            {isConfirming ? '⏳ Waiting for on-chain confirmation…' : '✓ Transaction confirmed!'}
          </span>
          <a
            href={`https://sepolia.arbiscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs underline opacity-75 hover:opacity-100 shrink-0"
          >
            View on Arbiscan ↗
          </a>
        </div>
      )}

      {/* Error banner */}
      {(error || writeError) && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 text-red-300 px-4 py-3 text-sm">
          ✗ {writeError ? shortError(writeError.message) : error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No vaults created yet.</p>
      ) : (
        <section className="space-y-2">
          {rows.map(row => {
            const isThisBusy = isBusy && pendingVault === row.vaultAddress
            const isOtherBusy = isBusy && pendingVault !== row.vaultAddress
            return (
              <div
                key={row.vaultAddress}
                className={`bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-opacity ${
                  isOtherBusy ? 'opacity-40' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm text-white truncate">{shortAddr(row.vaultAddress)}</p>
                  <p className="text-xs text-slate-500 mt-0.5">owner {shortAddr(row.ownerAddress)}</p>
                </div>

                <span className={`text-xs font-bold px-2 py-1 rounded border shrink-0 ${
                  row.hasFeeOverride
                    ? 'bg-amber-900/40 text-amber-300 border-amber-800'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {row.hasFeeOverride ? `${row.feeOverridePercent}% override` : `${PLATFORM_DEFAULT_PCT}% default`}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    placeholder="pct"
                    value={drafts[row.vaultAddress] ?? ''}
                    onChange={e => setDrafts(d => ({ ...d, [row.vaultAddress]: e.target.value }))}
                    disabled={!isConnected || isBusy}
                    className="w-20 bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#FFB01F] disabled:opacity-40"
                  />
                  <button
                    disabled={!isConnected || isBusy || !drafts[row.vaultAddress]}
                    onClick={() => setOverride(row.vaultAddress)}
                    className="px-3 py-1.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                  >
                    {isThisBusy ? (isSigningTx ? 'Sign…' : '⏳') : 'Set'}
                  </button>
                  {row.hasFeeOverride && (
                    <button
                      disabled={!isConnected || isBusy}
                      onClick={() => clearOverride(row.vaultAddress)}
                      className="px-3 py-1.5 rounded text-xs font-bold text-slate-300 border border-slate-700 hover:border-slate-600 disabled:opacity-40 transition-colors"
                    >
                      {isThisBusy ? (isSigningTx ? 'Sign…' : '⏳') : 'Clear'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
    </AdminGate>
  )
}
