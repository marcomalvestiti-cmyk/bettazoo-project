'use client'

import { useTranslations } from 'next-intl'

type Props = {
  count: number
  size?: 'sm' | 'md'
}

type BadgeTier = {
  labelKey: 'whaleMaker' | 'proBookie' | 'rookiePlacer'
  icon: string
  suffix?: string
  bg: string
  border: string
  text: string
}

function getBadgeTier(count: number): BadgeTier | null {
  if (count >= 51) return {
    labelKey: 'whaleMaker',
    icon: '🥇',
    suffix: '✓',
    bg: 'bg-yellow-500/15',
    border: 'border-yellow-500/40',
    text: 'text-yellow-400',
  }
  if (count >= 11) return {
    labelKey: 'proBookie',
    icon: '🥈',
    bg: 'bg-slate-400/15',
    border: 'border-slate-400/40',
    text: 'text-slate-300',
  }
  if (count >= 1) return {
    labelKey: 'rookiePlacer',
    icon: '🥉',
    bg: 'bg-amber-700/15',
    border: 'border-amber-700/40',
    text: 'text-amber-500',
  }
  return null
}

export default function PlacerBadge({ count, size = 'sm' }: Props) {
  const t = useTranslations('Event.PlacerBadge')
  const tier = getBadgeTier(count)
  if (!tier) return null

  const sizeClass = size === 'md'
    ? 'text-xs px-2.5 py-1 gap-1.5'
    : 'text-[9px] px-1.5 py-0.5 gap-1'

  return (
    <span className={`inline-flex items-center font-bold rounded leading-none select-none whitespace-nowrap border ${tier.bg} ${tier.border} ${tier.text} ${sizeClass}`}>
      <span>{tier.icon}</span>
      <span>{t(tier.labelKey)}</span>
      {tier.suffix && <span>{tier.suffix}</span>}
    </span>
  )
}
