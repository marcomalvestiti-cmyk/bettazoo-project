'use client'

import { useTranslations } from 'next-intl'

export default function TestnetBanner() {
  const t = useTranslations('Banners')
  return (
    <div className="w-full bg-amber-950/90 border-b border-amber-700/50 px-4 py-2 flex items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium text-amber-200">
        {t('testnet')}
      </p>
    </div>
  )
}
