'use client'

import { useEffect, useState, useCallback } from 'react'
import { fetchAdminKyc, postAdminKycDecision, type AdminKycRow } from '@/lib/api'

const STATUS_BADGE: Record<AdminKycRow['kycStatus'], string> = {
  approved: 'bg-emerald-900/40 text-emerald-300 border-emerald-800',
  pending:  'bg-amber-900/40 text-amber-300 border-amber-800',
  rejected: 'bg-rose-900/40 text-rose-300 border-rose-800',
  none:     'bg-slate-800 text-slate-400 border-slate-700',
}

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminKycPage() {
  const [rows, setRows] = useState<AdminKycRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // ownerAddress currently being decided on

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAdminKyc())
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load KYC queue')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(ownerAddress: string, status: 'approved' | 'rejected' | 'none') {
    setBusy(ownerAddress)
    try {
      await postAdminKycDecision(ownerAddress, status)
      await load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save decision')
    } finally {
      setBusy(null)
    }
  }

  const pending  = rows.filter(r => r.kycStatus === 'pending')
  const other    = rows.filter(r => r.kycStatus !== 'pending')

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div className="space-y-1">
        <p className="text-xs font-bold text-[#FFB01F] uppercase tracking-widest">Admin Panel</p>
        <h1 className="text-3xl font-bold text-white">KYC Review</h1>
        <p className="text-sm text-slate-400">
          Manual stand-in for real identity verification — no Sumsub integration yet on testnet.
          Approving here lets a Placer&apos;s vault go active (see the Compliance section of their Vault panel).
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Vaults', value: rows.length, color: 'text-white' },
          { label: 'Pending Review', value: pending.length, color: 'text-amber-400' },
          { label: 'Approved', value: rows.filter(r => r.kycStatus === 'approved').length, color: 'text-emerald-400' },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-900/20 text-red-300 px-4 py-3 text-sm">✗ {error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500 py-8 text-center">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">No vaults created yet.</p>
      ) : (
        <>
          {/* Pending — awaiting review */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
              Pending Review
            </h2>
            {pending.length === 0 && <p className="text-sm text-emerald-400 py-4">Nothing waiting on review.</p>}
            <div className="space-y-2">
              {pending.map(row => (
                <div key={row.ownerAddress} className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-white truncate">{shortAddr(row.ownerAddress)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vault {shortAddr(row.vaultAddress)} · {row.agreementVersion ? 'Agreement signed' : 'Agreement NOT signed'} · {row.kycRequestedAt ? `requested ${formatTime(row.kycRequestedAt)}` : `vault created ${formatTime(row.createdAt)}`}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      disabled={busy === row.ownerAddress}
                      onClick={() => decide(row.ownerAddress, 'approved')}
                      className="px-3 py-1.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
                    >
                      {busy === row.ownerAddress ? '…' : 'Approve'}
                    </button>
                    <button
                      disabled={busy === row.ownerAddress}
                      onClick={() => decide(row.ownerAddress, 'rejected')}
                      className="px-3 py-1.5 rounded text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-40 transition-colors"
                    >
                      {busy === row.ownerAddress ? '…' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Everyone else */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-widest border-b border-slate-800 pb-2">
              All Vaults
            </h2>
            <div className="space-y-2">
              {other.map(row => (
                <div key={row.ownerAddress} className="bg-slate-950 border border-slate-800/50 rounded-lg px-4 py-3 flex items-center gap-3 opacity-90">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm text-slate-300 truncate">{shortAddr(row.ownerAddress)}</p>
                    <p className="text-xs text-slate-600">Vault {shortAddr(row.vaultAddress)} · status: {row.status}</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded border shrink-0 ${STATUS_BADGE[row.kycStatus]}`}>
                    {row.kycStatus}
                  </span>
                  {row.kycStatus !== 'none' && (
                    <button
                      disabled={busy === row.ownerAddress}
                      onClick={() => decide(row.ownerAddress, 'none')}
                      className="shrink-0 text-[10px] text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 px-2 py-1 rounded transition-colors disabled:opacity-40"
                    >
                      Reset
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
