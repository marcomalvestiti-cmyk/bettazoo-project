'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { usePathname, useRouter } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

const LOCALE_LABELS: Record<string, string> = {
  en: 'EN',
  it: 'IT',
  es: 'ES',
  fr: 'FR',
}

export default function LocaleSwitcher() {
  const t = useTranslations('LocaleSwitcher')
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  function switchTo(nextLocale: string) {
    setOpen(false)
    router.replace(pathname, { locale: nextLocale })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t('label')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md border border-slate-700 text-slate-300 hover:border-slate-600 hover:bg-slate-900 transition-colors"
      >
        <Globe size={13} className="shrink-0 text-slate-500" />
        {LOCALE_LABELS[locale] ?? locale.toUpperCase()}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-28 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            {routing.locales.map(l => (
              <button
                key={l}
                onClick={() => switchTo(l)}
                className={`w-full px-3 py-2 text-left text-xs font-semibold transition-colors ${
                  l === locale
                    ? 'text-white bg-slate-800'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                {LOCALE_LABELS[l] ?? l.toUpperCase()}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
