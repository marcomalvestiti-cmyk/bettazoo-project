import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { ShieldCheck, Zap, Percent, RotateCcw, Scale, AlertTriangle } from 'lucide-react'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'Rules' })
  return { title: t('meta.title'), description: t('meta.description') }
}

const CONTRACT_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'

const RULE_ICONS = [ShieldCheck, Zap, Percent, RotateCcw, Scale, AlertTriangle]
const RULE_KEYS = ['security', 'payouts', 'fees', 'cancellations', 'matching', 'voidEvents'] as const

export default async function RulesPage() {
  const t = await getTranslations('Rules')

  const rules = RULE_KEYS.map((key, i) => ({
    key,
    Icon: RULE_ICONS[i],
    title: t(`items.${key}.title`),
    tag: t(`items.${key}.tag`),
    body: t(`items.${key}.body`),
  }))

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 space-y-10">

      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{t('header.overline')}</p>
        <h1 className="text-4xl font-bold text-white">{t('header.title')}</h1>
        <p className="text-slate-400 text-base max-w-xl">
          {t('header.subtitle')}
        </p>
      </div>

      {/* Rules list */}
      <div className="space-y-4">
        {rules.map(({ key, Icon, title, tag, body }) => (
          <div
            key={key}
            className="bg-slate-900 border border-slate-800 rounded-xl px-5 py-5 flex gap-4 hover:border-slate-700 transition-colors"
          >
            <div className="shrink-0 w-10 h-10 rounded-lg bg-[#B31A1A]/10 border border-[#B31A1A]/20 flex items-center justify-center">
              <Icon size={18} className="text-[#B31A1A]" />
            </div>
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-semibold text-white">{title}</h3>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                  {tag}
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Contract note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 space-y-3">
        <p className="text-sm font-semibold text-white">{t('contract.title')}</p>
        <p className="text-xs text-slate-500 font-mono break-all">
          {t('contract.addressPrefix')} {CONTRACT_ADDRESS} {t('contract.addressSuffix')}
        </p>
        <p className="text-xs text-slate-600">
          {t('contract.note')}
        </p>
      </div>

      {/* CTA */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href="/how-to-play"
          className="px-5 py-2.5 rounded-md bg-[#B31A1A] hover:bg-[#9a1515] text-white text-sm font-semibold transition-colors"
        >
          {t('cta.howToPlay')} →
        </Link>
        <Link
          href="/bet"
          className="px-5 py-2.5 rounded-md border border-slate-700 text-slate-300 hover:border-slate-600 hover:text-white text-sm font-semibold transition-colors"
        >
          {t('cta.browseEvents')}
        </Link>
      </div>

    </div>
  )
}
