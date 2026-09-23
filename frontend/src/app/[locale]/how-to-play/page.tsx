import type { Metadata } from 'next'
import { Link } from '@/i18n/navigation'
import { getTranslations } from 'next-intl/server'
import { Wallet, BookOpen, Lock, Trophy, Brain, Users, ShieldCheck, Video } from 'lucide-react'

type Props = {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'HowToPlay' })
  return { title: t('meta.title'), description: t('meta.description') }
}

const BETTOR_STEP_ICONS = [Wallet, BookOpen, Lock]
const PLACER_STEP_ICONS = [Trophy, Brain, ShieldCheck, Users]

function StepCard({
  step,
  total,
  Icon,
  title,
  desc,
  accent,
}: {
  step: number
  total: number
  Icon: React.ElementType
  title: string
  desc: string
  accent: 'red' | 'amber'
}) {
  const accentClass = accent === 'red'
    ? 'text-[#B31A1A] bg-[#B31A1A]/10 border-[#B31A1A]/20'
    : 'text-amber-500 bg-amber-500/10 border-amber-500/20'

  const iconClass = accent === 'red' ? 'text-[#B31A1A]' : 'text-amber-500'

  return (
    <div className="flex gap-4">
      <div className="shrink-0 flex flex-col items-center">
        <span className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold ${accentClass}`}>
          {step}
        </span>
        {step < total && <div className="w-px flex-1 mt-2 bg-slate-800" />}
      </div>
      <div className="pb-8 space-y-1.5 min-w-0">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconClass} />
          <h3 className="text-base font-semibold text-white">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  )
}

export default async function HowToPlayPage() {
  const t = await getTranslations('HowToPlay')

  const bettorSteps = BETTOR_STEP_ICONS.map((Icon, i) => ({
    step: i + 1,
    Icon,
    title: t(`bettor.steps.${i}.title`),
    desc: t(`bettor.steps.${i}.desc`),
  }))

  const placerSteps = PLACER_STEP_ICONS.map((Icon, i) => ({
    step: i + 1,
    Icon,
    title: t(`placer.steps.${i}.title`),
    desc: t(`placer.steps.${i}.desc`),
  }))

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">{t('eyebrow')}</p>
        <h1 className="text-4xl font-bold text-white">{t('heading')}</h1>
        <p className="text-slate-400 text-base max-w-xl">
          {t('intro')}
        </p>
      </div>

      {/* Two-column role sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bettor column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B31A1A]">{t('bettor.label')}</span>
            <h2 className="text-2xl font-bold text-white">{t('bettor.heading')}</h2>
            <p className="text-sm text-slate-500">{t('bettor.sub')}</p>
          </div>
          <div>
            {bettorSteps.map(s => (
              <StepCard key={s.step} {...s} total={bettorSteps.length} accent="red" />
            ))}
          </div>
          <Link
            href="/bet"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#B31A1A] hover:bg-[#9a1515] text-white text-sm font-semibold transition-colors"
          >
            {t('bettor.cta')} →
          </Link>
        </div>

        {/* Placer column */}
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-500">{t('placer.label')}</span>
            <h2 className="text-2xl font-bold text-white">{t('placer.heading')}</h2>
            <p className="text-sm text-slate-500">{t('placer.sub')}</p>
          </div>
          <div>
            {placerSteps.map(s => (
              <StepCard key={s.step} {...s} total={placerSteps.length} accent="amber" />
            ))}
          </div>
          <Link
            href="/placer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-amber-500 text-amber-500 hover:bg-amber-500/10 text-sm font-semibold transition-colors"
          >
            ✦ {t('placer.cta')} →
          </Link>
        </div>
      </div>

      {/* FAQ note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 flex items-start gap-4">
        <span className="text-2xl select-none shrink-0">💡</span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{t('faq.title')}</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            {t('faq.body')}
          </p>
        </div>
      </div>

      {/* Creator Suite */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 flex items-start gap-4">
        <Video size={22} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{t('streaming.title')}</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            {t.rich('streaming.body', {
              code1: () => <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded text-xs">/placer/[address]</code>,
              code2: () => <code className="text-sky-300 bg-slate-950 px-1.5 py-0.5 rounded text-xs">/overlay/[address]</code>,
            })}
          </p>
        </div>
      </div>

    </div>
  )
}
