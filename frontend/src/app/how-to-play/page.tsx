import type { Metadata } from 'next'
import Link from 'next/link'
import { Wallet, BookOpen, Lock, Trophy, Brain, Users } from 'lucide-react'

export const metadata: Metadata = {
  title: 'How to Play — Bettazoo',
  description: 'Learn how to bet P2P on Bettazoo as a Bettor or become a Placer and act as the bookmaker.',
}

const BETTOR_STEPS = [
  {
    step: 1,
    Icon: Wallet,
    title: 'Connect Your Wallet',
    desc: 'Link MetaMask (or any Web3 wallet) and make sure you hold USDT stablecoin. No account registration — your wallet is your identity on Bettazoo.',
  },
  {
    step: 2,
    Icon: BookOpen,
    title: 'Find the Best P2P Odds',
    desc: 'Browse Sports and E-Sports events. Compare real peer-to-peer odds set directly by Placers — no bookmaker margin, no hidden fees, full transparency.',
  },
  {
    step: 3,
    Icon: Lock,
    title: 'Bet & Get Paid Automatically',
    desc: 'Your stake is locked in the Smart Contract Escrow. When the match ends, a certified Oracle confirms the result and USDT is sent directly to your wallet — instant, trustless, and automated.',
  },
]

const PLACER_STEPS = [
  {
    step: 1,
    Icon: Trophy,
    title: 'Access the Placer Area',
    desc: 'Connect your wallet and open the Placer Dashboard. You act as the bookmaker — you set the odds and provide liquidity for bettors to match against.',
  },
  {
    step: 2,
    Icon: Brain,
    title: 'Set Odds with AI Assistance',
    desc: 'Pick any event, choose an outcome and set your custom odds. Use the built-in AI engine for data-driven odds suggestions and monitor your risk exposure in real time.',
  },
  {
    step: 3,
    Icon: Users,
    title: 'Attract Bettors & Earn the Edge',
    desc: 'Your offers appear live in the betting exchange. Share your Placer profile to build a following. Earn the margin between your quoted odds and the true probability.',
  },
]

function StepCard({
  step,
  Icon,
  title,
  desc,
  accent,
}: {
  step: number
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
        {step < 3 && <div className="w-px flex-1 mt-2 bg-slate-800" />}
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

export default function HowToPlayPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-14">

      {/* Header */}
      <div className="space-y-3">
        <p className="text-xs font-bold text-red-500 uppercase tracking-widest">Guide</p>
        <h1 className="text-4xl font-bold text-white">How to Play</h1>
        <p className="text-slate-400 text-base max-w-xl">
          Bettazoo is a peer-to-peer betting exchange on Web3. No bookmaker. Every bet is matched directly between a Bettor and a Placer, secured on-chain.
        </p>
      </div>

      {/* Two-column role sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bettor column */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-[#B31A1A]">For Bettors</span>
            <h2 className="text-2xl font-bold text-white">Place a Bet</h2>
            <p className="text-sm text-slate-500">You back an outcome at the best available odds.</p>
          </div>
          <div>
            {BETTOR_STEPS.map(s => (
              <StepCard key={s.step} {...s} accent="red" />
            ))}
          </div>
          <Link
            href="/bet"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-[#B31A1A] hover:bg-[#9a1515] text-white text-sm font-semibold transition-colors"
          >
            Browse Events →
          </Link>
        </div>

        {/* Placer column */}
        <div className="bg-slate-900 border border-amber-500/20 rounded-xl p-6 space-y-6">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-500">For Placers</span>
            <h2 className="text-2xl font-bold text-white">Be the Bookmaker</h2>
            <p className="text-sm text-slate-500">You lay an outcome and offer odds to bettors.</p>
          </div>
          <div>
            {PLACER_STEPS.map(s => (
              <StepCard key={s.step} {...s} accent="amber" />
            ))}
          </div>
          <Link
            href="/placer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md border border-amber-500 text-amber-500 hover:bg-amber-500/10 text-sm font-semibold transition-colors"
          >
            ✦ Open Placer Area →
          </Link>
        </div>
      </div>

      {/* FAQ note */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-6 py-5 flex items-start gap-4">
        <span className="text-2xl select-none shrink-0">💡</span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">What is a Placer?</p>
          <p className="text-sm text-slate-400 leading-relaxed">
            A Placer is the P2P equivalent of a bookmaker. Instead of backing an outcome to win, a Placer <em>lays</em> an outcome — meaning they profit if that outcome does NOT happen. Placers lock collateral (their maximum liability) in the Escrow to guarantee the payout to bettors.
          </p>
        </div>
      </div>

    </div>
  )
}
