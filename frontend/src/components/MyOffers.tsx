'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useAccount, usePublicClient, useWriteContract, useSwitchChain } from 'wagmi'
import { arbitrumSepolia } from 'wagmi/chains'
import { fetchOrderBook } from '@/lib/api'
import { ESCROW_ABI, VAULT_ABI, OUTCOMES } from '@/lib/abis'
import { useEvents } from '@/lib/useEvents'
import { withGasBuffer } from '@/lib/gasUtils'

export type Offer = {
  offerId:               number
  placer:                string
  eventId:               string
  outcome:               number
  oddsDecimal:           number
  remainingLiabilityUsdt: string
  maxBettorStakeUsdt:    string
}

const ESCROW_ADDRESS = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS ?? '0x0') as `0x${string}`

const OUTCOME_DOTS: Record<number, string> = {
  0: 'bg-sky-400',
  1: 'bg-fuchsia-400',
  2: 'bg-emerald-400',
}

interface Props {
  offers?:       Offer[]
  onRefresh?:    () => void
  compact?:      boolean
  onViewAll?:    () => void
  vaultAddress?: string
}

export default function MyOffers({ offers: externalOffers, onRefresh, compact = false, onViewAll, vaultAddress }: Props) {
  const t = useTranslations('MyOffers')
  const { events } = useEvents()
  const { address, chain } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()

  const [internalOffers, setInternalOffers] = useState<Offer[]>([])
  const [loading,     setLoading]     = useState(!externalOffers)
  const [cancelling,  setCancelling]  = useState<number | null>(null)
  const [copiedId,    setCopiedId]    = useState<number | null>(null)
  const [error,       setError]       = useState('')
  const [filterEvent, setFilterEvent] = useState('')

  const offers = externalOffers ?? internalOffers

  const loadOffers = useCallback(async () => {
    if (!address || externalOffers !== undefined) return
    setLoading(true)
    try {
      const all: Offer[] = []
      for (const event of events) {
        const data = await fetchOrderBook(event.eventId)
        const mine = (data.orders as Offer[]).filter(
          (o) => o.placer.toLowerCase() === address.toLowerCase()
        )
        all.push(...mine)
      }
      setInternalOffers(all)
    } catch {
      setInternalOffers([])
    } finally {
      setLoading(false)
    }
  }, [address, externalOffers, events])

  useEffect(() => { loadOffers() }, [loadOffers])

  async function handleCancel(offerId: number) {
    setCancelling(offerId)
    setError('')
    try {
      if (chain?.id !== arbitrumSepolia.id) {
        await switchChainAsync({ chainId: arbitrumSepolia.id })
      }
      const gas = await withGasBuffer(publicClient)
      // Once a vault places offers, Escrow.cancelOffer requires msg.sender === offer.placer
      // (the vault contract) — the owner cancels through PlacerVault.cancelOffer instead.
      if (vaultAddress) {
        await writeContractAsync({
          address: vaultAddress as `0x${string}`,
          abi: VAULT_ABI,
          functionName: 'cancelOffer',
          args: [BigInt(offerId)],
          chainId: arbitrumSepolia.id,
          ...gas,
        })
      } else {
        await writeContractAsync({
          address: ESCROW_ADDRESS,
          abi: ESCROW_ABI,
          functionName: 'cancelOffer',
          args: [BigInt(offerId)],
          chainId: arbitrumSepolia.id,
          ...gas,
        })
      }
      if (onRefresh) onRefresh()
      else await loadOffers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('cancellationError'))
    } finally {
      setCancelling(null)
    }
  }

  function handleShare(o: Offer) {
    const url = `${window.location.origin}/event/${o.eventId}?ref=${o.placer}`
    navigator.clipboard.writeText(url).catch(() => {})
    setCopiedId(o.offerId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!address) return null

  // ── COMPACT WIDGET ─────────────────────────────────────────────────────────────
  if (compact) {
    const sorted  = [...offers].sort((a, b) => b.offerId - a.offerId)
    const preview = sorted.slice(0, 5)
    const hasMore = offers.length > 5

    return (
      <div className="bg-slate-900/60 border border-blue-500/20 rounded-xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white">{t('title')}</h2>
          {!loading && (
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
              offers.length > 0
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-slate-800 border-slate-700 text-slate-500'
            }`}>
              {offers.length}
            </span>
          )}
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="ml-auto text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
            >
              ↻
            </button>
          )}
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-400/10 px-4 py-2">{error}</p>
        )}

        {/* Table */}
        {loading ? (
          <div className="space-y-1 p-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 rounded bg-slate-800/50 animate-pulse" />
            ))}
          </div>
        ) : offers.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5 text-slate-500">
            <span className="text-xl select-none">📭</span>
            <div>
              <p className="text-xs font-semibold text-slate-400">{t('noOffersYet')}</p>
              <p className="text-[10px] text-slate-600">{t('createFirstOffer')}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.event')}</th>
                  <th className="px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.outcome')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.odds')}</th>
                  <th className="px-3 py-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.liability')}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.status')}</th>
                  <th className="px-3 py-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.share')}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((o) => {
                  const event = events.find(e => e.eventId === o.eventId)
                  const dot   = OUTCOME_DOTS[o.outcome] ?? 'bg-slate-400'
                  return (
                    <tr
                      key={o.offerId}
                      className="border-b border-slate-800/40 hover:bg-slate-800/25 transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono text-slate-600 shrink-0">#{o.offerId}</span>
                          <span className="text-slate-300 truncate max-w-[100px]">{event?.name ?? o.eventId}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                          <span className="text-slate-400">{OUTCOMES[o.outcome] ?? o.outcome}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-[#FFB01F]">
                        {o.oddsDecimal.toFixed(2)}<span className="text-[10px] text-[#FFB01F]/50">x</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">
                        ${parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 whitespace-nowrap">
                          {t('active').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={() => handleShare(o)}
                          className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                            copiedId === o.offerId
                              ? 'text-emerald-400'
                              : 'text-slate-500 hover:text-[#FFB01F]'
                          }`}
                          title={t('copyChallengeLinkTooltip')}
                        >
                          {copiedId === o.offerId ? '✓' : '🔗'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && offers.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800 bg-slate-950/40">
            <span className="text-[10px] text-slate-600 font-mono">
              {hasMore ? t('showingOf', { shown: 5, total: offers.length }) : t('offerCount', { count: offers.length })}
            </span>
            {onViewAll && (
              <button
                onClick={onViewAll}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t('viewAllOffers')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── FULL MANAGEMENT VIEW ───────────────────────────────────────────────────────

  // Unique events that have offers (for filter dropdown)
  const offerEventIds = [...new Set(offers.map(o => o.eventId))]
  const filtered = filterEvent ? offers.filter(o => o.eventId === filterEvent) : offers

  return (
    <div className="bg-slate-900/60 border border-blue-500/20 shadow-md shadow-blue-900/10 rounded-xl overflow-hidden">

      {/* ── Header + filters ── */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800 flex-wrap">
        <h2 className="text-base font-bold text-white">{t('title')}</h2>
        {!loading && (
          <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
            offers.length > 0
              ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
              : 'bg-slate-800 border-slate-700 text-slate-500'
          }`}>
            {filtered.length}{filtered.length !== offers.length && `/${offers.length}`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Event filter */}
          {offerEventIds.length > 1 && (
            <select
              value={filterEvent}
              onChange={e => setFilterEvent(e.target.value)}
              className="text-xs bg-slate-800 border border-slate-700 text-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blue-500/50 cursor-pointer"
            >
              <option value="">{t('allEvents')}</option>
              {offerEventIds.map(id => {
                const ev = events.find(e => e.eventId === id)
                return <option key={id} value={id}>{ev?.name ?? id}</option>
              })}
            </select>
          )}

          {/* Status filter (placeholder — only Active available) */}
          <select
            disabled
            className="text-xs bg-slate-800 border border-slate-700 text-slate-500 rounded-md px-2.5 py-1.5 cursor-not-allowed opacity-50"
            title={t('statusFilterTooltip')}
          >
            <option>{t('active')}</option>
          </select>

          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 px-2.5 py-1.5 rounded-md transition-colors"
            >
              {t('refresh')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 border-b border-red-400/20 px-5 py-2">{error}</p>
      )}

      {/* ── Scrollable list ── */}
      <div className="overflow-y-auto max-h-[600px]">

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 p-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[88px] rounded-xl bg-slate-800/50 border border-slate-700/40 animate-pulse" />
            ))}
          </div>

        ) : filtered.length === 0 ? (
          <div className="flex items-center gap-4 px-5 py-6">
            <span className="text-2xl select-none">📭</span>
            <div>
              <p className="text-sm font-semibold text-slate-400">
                {filterEvent ? t('noOffersForEvent') : t('noOffersYet')}
              </p>
              <p className="text-xs text-slate-600">
                {filterEvent ? t('tryClearingFilter') : t('createFirstOffer')}
              </p>
            </div>
            {filterEvent && (
              <button
                onClick={() => setFilterEvent('')}
                className="ml-auto text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors"
              >
                {t('clearFilter')}
              </button>
            )}
          </div>

        ) : (
          <div className="p-4 space-y-5">
            {(() => {
              const grouped = filtered.reduce((acc, o) => {
                if (!acc.has(o.eventId)) acc.set(o.eventId, [])
                acc.get(o.eventId)!.push(o)
                return acc
              }, new Map<string, Offer[]>())

              return [...grouped.entries()].map(([eventId, eventOffers]) => {
                const event         = events.find(e => e.eventId === eventId)
                const multiPosition = eventOffers.length > 1

                return (
                  <div key={eventId} className="space-y-2">
                    {multiPosition && (
                      <div className="flex items-center gap-2 px-1 pb-2 border-b border-slate-800">
                        {event?.icon && <span className="text-base">{event.icon}</span>}
                        <span className="text-xs font-bold text-slate-300 truncate">{event?.name ?? eventId}</span>
                        <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500">
                          {t('positions', { count: eventOffers.length })}
                        </span>
                      </div>
                    )}

                    <div className={`grid gap-3 ${multiPosition ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' : 'grid-cols-1'}`}>
                      {eventOffers.map((o) => (
                        <div
                          key={o.offerId}
                          className="rounded-xl bg-slate-950/70 border border-slate-700/60 hover:border-slate-600/80 transition-colors overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-xs font-mono text-slate-600">#{o.offerId}</span>
                              {!multiPosition && (
                                <span className="text-sm font-semibold text-slate-200 truncate">
                                  {event?.name ?? o.eventId}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0 ml-2">
                              {t('active').toUpperCase()}
                            </span>
                          </div>

                          <div className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                            <div className="space-y-0.5">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.outcome')}</p>
                              <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${OUTCOME_DOTS[o.outcome] ?? 'bg-slate-400'}`} />
                                <p className="text-sm font-semibold text-slate-300">{OUTCOMES[o.outcome] ?? o.outcome}</p>
                              </div>
                            </div>

                            <div className="w-px h-8 bg-slate-800 self-stretch" />

                            <div className="space-y-0.5">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.odds')}</p>
                              <p className="text-lg font-bold font-mono text-[#FFB01F] leading-none">
                                {o.oddsDecimal.toFixed(2)}<span className="text-xs text-[#FFB01F]/60">x</span>
                              </p>
                            </div>

                            <div className="w-px h-8 bg-slate-800 self-stretch" />

                            <div className="space-y-0.5">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t('columns.liability')}</p>
                              <p className="text-base font-bold font-mono text-slate-200 leading-none">
                                ${parseFloat(o.remainingLiabilityUsdt).toFixed(2)}
                                <span className="text-xs text-slate-500 ml-1">USDT</span>
                              </p>
                            </div>

                            <div className="flex-1" />

                            <button
                              onClick={() => handleShare(o)}
                              className="shrink-0 px-2.5 py-1.5 text-xs font-bold rounded-lg bg-[#FFB01F]/10 border border-[#FFB01F]/30 text-[#FFB01F] hover:bg-[#FFB01F]/20 transition-all whitespace-nowrap"
                              title={t('copyChallengeLinkTooltip')}
                            >
                              {copiedId === o.offerId ? t('copied') : t('share')}
                            </button>

                            <button
                              onClick={() => handleCancel(o.offerId)}
                              disabled={cancelling === o.offerId}
                              className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50 transition-all whitespace-nowrap"
                            >
                              {cancelling === o.offerId ? (
                                <span className="flex items-center gap-1">
                                  <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  {t('cancelling')}
                                </span>
                              ) : t('cancel')}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>

      {/* ── Footer count ── */}
      {!loading && filtered.length > 0 && (
        <div className="px-5 py-2.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-600">
            {t('offerCount', { count: filtered.length })}
            {filterEvent && ` ${t('filtered')}`}
          </span>
          {filterEvent && (
            <button
              onClick={() => setFilterEvent('')}
              className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              {t('clearFilter')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
