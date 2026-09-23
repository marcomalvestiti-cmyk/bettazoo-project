'use client'

import { useState } from 'react'
import { use } from 'react'
import { useAccount } from 'wagmi'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import OrderBook, { type Offer } from '@/components/OrderBook'
import BetSlip from '@/components/BetSlip'
import { useEvents } from '@/lib/useEvents'
import { Link } from '@/i18n/navigation'

type BetSlipState = { outcome: number; offers: Offer[] }

export default function EventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const t                 = useTranslations('Event.ExchangeView')
  const { eventId }       = use(params)
  const { isConnected }   = useAccount()
  const searchParams      = useSearchParams()
  const referrerAddress   = searchParams.get('ref') ?? undefined
  const [betSlip, setBetSlip] = useState<BetSlipState | null>(null)
  const { events } = useEvents()

  const event = events.find((e) => e.eventId === eventId)

  function handleBet(outcome: number, offers: Offer[]) {
    setBetSlip({ outcome, offers })
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-slate-500 flex-wrap">
        <Link href="/bet" className="hover:text-slate-300 transition-colors font-medium">
          {t('breadcrumbBet')}
        </Link>
        {event && (
          <>
            <span className="text-slate-700">/</span>
            <Link
              href={`/bet/${event.category}`}
              className="hover:text-slate-300 transition-colors"
            >
              {event.category === 'sports' ? t('categorySports') : t('categoryEsports')}
            </Link>
            <span className="text-slate-700">/</span>
            <Link
              href={`/bet/${event.category}/${event.sport}`}
              className="hover:text-slate-300 transition-colors"
            >
              {event.sportLabel}
            </Link>
            <span className="text-slate-700">/</span>
            <Link
              href={`/bet/${event.category}/${event.sport}/${event.league}`}
              className="hover:text-slate-300 transition-colors"
            >
              {event.leagueLabel}
            </Link>
            <span className="text-slate-700">/</span>
          </>
        )}
        <span className="text-slate-300 font-medium">{event?.name ?? eventId}</span>
      </div>

      {/* Event header */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg px-5 py-4 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500 bg-[#B31A1A]/10 px-2 py-0.5 rounded">
              {event?.sportLabel ?? t('sportFallback')}
            </span>
            {event && (
              <span className="text-[10px] font-semibold text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                {event.leagueLabel}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">{event?.name ?? eventId}</h1>
          {event && (
            <div className="flex gap-1.5">
              {event.teams.map((team) => (
                <span key={team} className="text-xs font-medium bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                  {team}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="hidden sm:flex flex-col items-end text-xs text-slate-500 font-medium">
          {event && (
            <>
              <span>{new Date(event.startTime).toLocaleDateString('en-GB')}</span>
              <span>{new Date(event.startTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
            </>
          )}
        </div>
      </div>

      {referrerAddress && (
        <div className="flex items-center gap-2.5 rounded-lg bg-[#FFB01F]/8 border border-[#FFB01F]/30 px-4 py-3 text-sm">
          <span className="text-[#FFB01F] text-base select-none">🔗</span>
          <span className="text-[#FFB01F] font-semibold">{t('challengeBookie')}</span>
          <span className="text-slate-400">{t('invitedBy')}</span>
          <span className="font-mono text-xs text-slate-300">{referrerAddress.slice(0, 6)}…{referrerAddress.slice(-4)}</span>
        </div>
      )}

      {!isConnected && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-4 py-3 text-sm text-slate-400">
          <span className="text-yellow-400">⚠</span>
          {t('connectPrompt')}
        </div>
      )}

      <OrderBook
        eventId={eventId}
        onBet={isConnected ? handleBet : undefined}
      />

      {betSlip && (
        <BetSlip
          outcome={betSlip.outcome}
          offers={betSlip.offers}
          eventName={event?.name ?? eventId}
          referrerAddress={referrerAddress}
          onClose={() => setBetSlip(null)}
        />
      )}
    </div>
  )
}
